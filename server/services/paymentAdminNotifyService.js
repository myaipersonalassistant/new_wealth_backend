import admin from 'firebase-admin';
import { sendEmail } from './emailService.js';
import { getFirestoreDb } from './firebaseService.js';

export const ADMIN_PAYMENT_EMAIL =
  process.env.ADMIN_PAYMENT_EMAIL || 'Chris.ifonlaja@placeofvictoryni.org';

const PRODUCT_LABELS = {
  book: 'Book order',
  foundation: 'Foundation edition',
  seminar: 'Seminar ticket',
  course: 'Course purchase',
};

const DEFAULT_PRODUCT_NAMES = {
  book: 'Build Wealth Through Property — Book',
  foundation: 'Build Wealth Through Property — Foundation Edition',
  seminar: 'Property Investment Seminar — 7 Reasons Why',
  course: 'Online course',
};

function escapeHtml(value) {
  if (value == null || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount) {
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function formatPaidAt(session) {
  const ts = session?.created ? session.created * 1000 : Date.now();
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildShippingBlock(order, session) {
  const ship = session?.shipping_details;
  const addr = ship?.address || session?.customer_details?.address;
  const lines = [];

  if (order?.shipping_address) {
    lines.push(escapeHtml(order.shipping_address));
    if (order.shipping_city) lines.push(escapeHtml(order.shipping_city));
    if (order.shipping_postcode) lines.push(escapeHtml(order.shipping_postcode));
  } else if (addr) {
    if (addr.line1) lines.push(escapeHtml(addr.line1));
    if (addr.line2) lines.push(escapeHtml(addr.line2));
    if (addr.city) lines.push(escapeHtml(addr.city));
    if (addr.postal_code) lines.push(escapeHtml(addr.postal_code));
    if (addr.country) lines.push(escapeHtml(addr.country));
  }

  if (ship?.name && !order?.customer_name) {
    lines.unshift(escapeHtml(ship.name));
  }

  return lines.length ? lines.join('<br>') : '';
}

function fulfillmentNotes(productType) {
  switch (productType) {
    case 'book':
      return 'Dispatch the book to the shipping address above within 1–3 business days. Customer has been told they will receive tracking when shipped.';
    case 'foundation':
      return 'Dispatch the Foundation Edition to the shipping address above within 1–3 business days.';
    case 'seminar':
      return 'No shipping required. Customer has seminar date, time, and venue in their confirmation email. They may show this admin alert or their confirmation at the door.';
    case 'course':
      return 'Digital fulfilment only — access is granted on their dashboard. No physical shipment.';
    default:
      return '';
  }
}

/**
 * Build template payload for admin payment alert.
 */
export function buildAdminPaymentTemplateData({
  session,
  order,
  productType,
  productName,
  courseTitle,
  courseId,
  userId,
}) {
  const meta = session?.metadata || {};
  const pt = productType || meta.productType || 'book';
  const label = PRODUCT_LABELS[pt] || 'Order';
  const defaultName = DEFAULT_PRODUCT_NAMES[pt] || 'Purchase';
  const resolvedProductName =
    productName ||
    courseTitle ||
    (pt === 'course' && meta.courseId ? `Course: ${meta.courseId}` : defaultName);

  const customerDetails = session?.customer_details;
  const customerName =
    escapeHtml(
      order?.customer_name ||
        customerDetails?.name ||
        meta.customerName ||
        'Customer'
    ) || 'Customer';
  const customerEmail = escapeHtml(
    (
      session?.customer_email ||
      order?.customer_email ||
      customerDetails?.email ||
      meta.customerEmail ||
      ''
    ).toLowerCase()
  );
  const customerPhone = escapeHtml(
    order?.customer_phone || customerDetails?.phone || meta.customerPhone || ''
  );

  const quantity =
    order?.quantity ?? parseInt(meta.quantity || '1', 10) || 1;
  const unitPrice = order?.unit_price ?? meta.bookPrice;
  const amountFromSession = session?.amount_total
    ? session.amount_total / 100
    : null;
  const totalAmount =
    order?.total_amount ?? amountFromSession ?? (unitPrice ? unitPrice * quantity : null);

  const shippingBlock = buildShippingBlock(order, session);
  const needsShipping = pt === 'book' || pt === 'foundation';

  const resolvedCourseId = courseId || meta.courseId || '';
  const resolvedCourseTitle = courseTitle || (pt === 'course' ? resolvedProductName : '');

  const templateData = {
    subject: `[New paid order] ${label} — ${customerName}${totalAmount != null ? ` — £${formatMoney(totalAmount)}` : ''}`,
    productLabel: label,
    productName: escapeHtml(resolvedProductName),
    customerName,
    customerEmail,
    customerPhone: customerPhone || '—',
    quantity,
    unitPrice: unitPrice != null ? formatMoney(Number(unitPrice)) : '',
    amountPaid: totalAmount != null ? formatMoney(Number(totalAmount)) : '',
    paidAt: formatPaidAt(session),
    orderId: escapeHtml(order?.id || meta.orderId || '—'),
    stripeSessionId: escapeHtml(session?.id || order?.stripe_session_id || '—'),
    transactionId: escapeHtml(
      (typeof session?.payment_intent === 'string'
        ? session.payment_intent
        : session?.payment_intent?.id) ||
        order?.stripe_payment_intent_id ||
        '—'
    ),
    userId: userId || meta.userId ? escapeHtml(userId || meta.userId) : '',
    shippingBlock: needsShipping && shippingBlock ? shippingBlock : '',
    courseBlock: pt === 'course',
    courseId: escapeHtml(resolvedCourseId),
    courseTitle: escapeHtml(resolvedCourseTitle),
    fulfillmentNotes: fulfillmentNotes(pt),
  };

  return templateData;
}

async function claimAdminNotification(dedupKey) {
  if (!dedupKey) return false;
  try {
    const db = getFirestoreDb();
    const ref = db.collection('admin_payment_alerts').doc(dedupKey);
    const claimed = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (doc.exists) return false;
      transaction.set(ref, {
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        dedup_key: dedupKey,
      });
      return true;
    });
    return claimed;
  } catch (error) {
    console.error('Admin payment alert dedup error:', error);
    return true;
  }
}

/**
 * Email the site admin when a payment succeeds. Deduped per Stripe session (or payment intent).
 */
export async function notifyAdminOfSuccessfulPayment({
  session,
  order = null,
  productType,
  productName,
  courseTitle,
  courseId,
  userId,
}) {
  const dedupKey =
    session?.id ||
    order?.stripe_session_id ||
    (typeof session?.payment_intent === 'string'
      ? session.payment_intent
      : session?.payment_intent?.id) ||
    order?.stripe_payment_intent_id;

  if (!dedupKey) {
    console.warn('Admin payment notify: no dedup key, skipping');
    return { sent: false, skipped: true };
  }

  const claimed = await claimAdminNotification(dedupKey);
  if (!claimed) {
    console.log('Admin payment alert already sent for:', dedupKey);
    return { sent: false, skipped: true };
  }

  const templateData = buildAdminPaymentTemplateData({
    session,
    order,
    productType,
    productName,
    courseTitle,
    courseId,
    userId,
  });

  await sendEmail({
    to: ADMIN_PAYMENT_EMAIL,
    template: 'adminPaymentNotification',
    templateData,
  });

  console.log('Admin payment notification sent to:', ADMIN_PAYMENT_EMAIL, dedupKey);
  return { sent: true };
}
