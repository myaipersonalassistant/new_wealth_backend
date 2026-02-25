/**
 * Campaign service - get recipients from Firestore and send campaigns
 * Recipients from: email_subscriptions, foundation_orders, user_profiles
 */

import admin from 'firebase-admin';
import { getFirestoreDb } from './firebaseService.js';
import { sendEmail } from './emailService.js';

/** Get unique recipient emails from course_enrollments by courseId */
async function getCourseEnrolledEmails(db, courseId, withNames) {
  const snap = await db.collection('course_enrollments')
    .where('course_id', '==', courseId)
    .where('status', '==', 'active')
    .get();
  const result = [];
  const seen = new Set();
  for (const doc of snap.docs) {
    const d = doc.data();
    const email = (d.email || '').trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      if (withNames) result.push({ email, firstName: email.split('@')[0] });
    }
  }
  return withNames ? result : Array.from(seen);
}

/** Get unique recipient emails (and optionally first names) based on filter */
export async function getCampaignRecipients(recipientFilter, withNames = false) {
  const db = getFirestoreDb();
  const seen = new Set();
  const result = [];

  // Course-enrolled filter: course_enrolled:courseId
  if (recipientFilter && recipientFilter.startsWith('course_enrolled:')) {
    const courseId = recipientFilter.replace('course_enrolled:', '').trim();
    if (courseId) return getCourseEnrolledEmails(db, courseId, withNames);
  }

  // 1. email_subscriptions
  const subsSnap = await db.collection('email_subscriptions').get();
  for (const doc of subsSnap.docs) {
    const d = doc.data();
    if (!d.email) continue;
    const status = (d.status || 'subscribed').toLowerCase();
    if (status === 'unsubscribed' || status === 'bounced') continue;

    // Apply filters
    if (recipientFilter === 'confirmed_only') {
      if (status !== 'subscribed' && status !== 'active') continue;
    }
    if (recipientFilter === 'recent_7d' || recipientFilter === 'recent_30d') {
      const subAt = d.subscribed_at?.toDate?.() || new Date(d.subscribed_at);
      const days = recipientFilter === 'recent_7d' ? 7 : 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      if (!subAt || subAt < cutoff) continue;
    }
    if (recipientFilter.startsWith('source:')) {
      const wantSource = recipientFilter.replace('source:', '').trim().toLowerCase();
      const source = (d.source || '').trim().toLowerCase();
      const matches =
        wantSource === 'free-chapter' ? source.includes('free') || source.includes('chapter') || source === 'starter-pack'
        : wantSource === 'starter-pack' ? source.includes('starter') || source === 'starter-pack'
        : wantSource === 'calculator' ? source.includes('calculator')
        : wantSource === 'homepage' ? source.includes('homepage') || source.includes('home')
        : source.includes(wantSource);
      if (!matches) continue;
    }

    const email = d.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const firstName = d.firstName || d.first_name || (withNames ? email.split('@')[0] : null);
    if (withNames) result.push({ email, firstName: firstName || email.split('@')[0] });
  }

  // 2. foundation_orders - customer_email (only when not filtering by source)
  if (!recipientFilter.startsWith('source:')) {
    const foundationSnap = await db.collection('foundation_orders').get();
    for (const doc of foundationSnap.docs) {
      const d = doc.data();
      const email = (d.customer_email || d.email || '').trim().toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        if (withNames) result.push({ email, firstName: d.customer_name || d.name || email.split('@')[0] });
      }
    }
  }

  // 3. user_profiles - email (only when not filtering by source)
  if (!recipientFilter.startsWith('source:')) {
    const profilesSnap = await db.collection('user_profiles').get();
    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const email = (d.email || '').trim().toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        if (withNames) result.push({ email, firstName: d.full_name?.split(' ')[0] || email.split('@')[0] });
      }
    }
  }

  if (withNames) return result;
  return Array.from(seen);
}

/** Send campaign to recipients and store record */
export async function sendCampaign({ subject, htmlBody, plainText, recipientFilter, selectedEmails, singleEmail, senderEmail, senderName }) {
  let recipients;
  if (singleEmail && typeof singleEmail === 'string') {
    const email = singleEmail.trim().toLowerCase();
    recipients = email ? [email] : [];
  } else if (Array.isArray(selectedEmails) && selectedEmails.length > 0) {
    const seen = new Set();
    recipients = selectedEmails
      .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
      .filter((e) => e && !seen.has(e) && seen.add(e));
  } else {
    recipients = await getCampaignRecipients(recipientFilter || 'all_active');
  }
  const db = getFirestoreDb();
  const campaignRef = db.collection('campaigns').doc();
  const now = new Date().toISOString();

  const displayFilter = singleEmail ? 'individual' : (Array.isArray(selectedEmails) && selectedEmails.length > 0 ? 'selected' : (recipientFilter || 'all_active'));
  const campaign = {
    id: campaignRef.id,
    subject,
    html_body: htmlBody,
    plain_text: plainText,
    recipient_filter: displayFilter,
    recipient_count: recipients.length,
    sent_count: 0,
    failed_count: 0,
    open_count: 0,
    click_count: 0,
    status: 'sending',
    created_at: now,
    sent_at: now,
    completed_at: null,
    error_message: null,
    sender_email: senderEmail,
    sender_name: senderName,
  };

  await campaignRef.set({ ...campaign, created_at: admin.firestore.FieldValue.serverTimestamp() });

  let sentCount = 0;
  let failedCount = 0;

  for (const to of recipients) {
    try {
      await sendEmail({
        to,
        subject,
        html: htmlBody,
        text: plainText,
      });
      sentCount++;
    } catch (err) {
      console.error('Campaign send failed to', to, err.message);
      failedCount++;
    }
  }

  await campaignRef.update({
    sent_count: sentCount,
    failed_count: failedCount,
    status: failedCount > 0 && sentCount > 0 ? 'partial' : failedCount === recipients.length ? 'failed' : 'sent',
    completed_at: new Date().toISOString(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    sentCount,
    failedCount,
    recipientCount: recipients.length,
  };
}

/** List campaigns with pagination */
export async function listCampaigns(page = 1, perPage = 10) {
  const db = getFirestoreDb();
  const snap = await db.collection('campaigns').orderBy('created_at', 'desc').get();
  const all = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      subject: data.subject,
      html_body: data.html_body,
      plain_text: data.plain_text,
      recipient_filter: data.recipient_filter,
      recipient_count: data.recipient_count || 0,
      sent_count: data.sent_count || 0,
      failed_count: data.failed_count || 0,
      open_count: data.open_count || 0,
      click_count: data.click_count || 0,
      status: data.status || 'draft',
      created_at: data.created_at?.toDate?.()?.toISOString?.() || data.created_at,
      sent_at: data.sent_at,
      completed_at: data.completed_at,
      error_message: data.error_message,
      sender_email: data.sender_email,
      sender_name: data.sender_name,
    };
  });

  const total = all.length;
  const start = (page - 1) * perPage;
  const campaigns = all.slice(start, start + perPage);
  const totalPages = Math.ceil(total / perPage) || 1;

  return { campaigns, total, totalPages };
}

/** Delete campaign */
export async function deleteCampaign(campaignId) {
  const db = getFirestoreDb();
  await db.collection('campaigns').doc(campaignId).delete();
  return { success: true };
}
