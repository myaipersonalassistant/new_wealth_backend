/**
 * Shared email subscription logic - used by Express and api/subscribe-email.js
 */
import admin from 'firebase-admin';
import { sendEmail } from './emailService.js';
import { getFirestoreDb } from './firebaseService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export async function handleSubscribeEmail({ email, source, referrer, firstName, phone }) {
  if (!email || !source) {
    return { statusCode: 400, body: { success: false, error: 'Email and source are required' } };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    return { statusCode: 400, body: { success: false, error: 'Invalid email address' } };
  }

  const db = getFirestoreDb();
  const subscriptionsRef = db.collection('email_subscriptions');

  const existingQuery = await subscriptionsRef
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  let inUserProfiles = false;
  if (source === 'free-chapter' && existingQuery.empty) {
    const profilesSnap = await db.collection('user_profiles')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    inUserProfiles = !profilesSnap.empty;
  }

  if (!existingQuery.empty) {
    const existingDoc = existingQuery.docs[0];
    const existingData = existingDoc.data();

    if (source === 'starter-pack' && !existingData.starter_pack_claimed) {
      await existingDoc.ref.update({
        starter_pack_claimed: true,
        starter_pack_claimed_at: admin.firestore.FieldValue.serverTimestamp(),
        ...(firstName && { firstName: firstName.trim() }),
        ...(phone && { phone: phone.trim() }),
      });
      const dashboardUrl = process.env.STARTER_PACK_DOWNLOAD_URL ||
        `${FRONTEND_URL}/auth?redirect=${encodeURIComponent('/dashboard?tab=starter-pack')}`;
      try {
        await sendEmail({
          to: normalizedEmail,
          template: 'starterPackWelcome',
          templateData: {
            name: firstName?.trim() || existingData.firstName || normalizedEmail.split('@')[0],
            downloadUrl: dashboardUrl,
          },
        });
        console.log(`✅ Starter Pack welcome email sent to existing subscriber: ${normalizedEmail}`);
      } catch (emailErr) {
        console.error('Failed to send starter pack email to existing subscriber:', emailErr.message);
      }
      return { statusCode: 200, body: { success: true, message: 'Successfully subscribed!' } };
    }
    if (source === 'starter-pack' && existingData.starter_pack_claimed) {
      return { statusCode: 200, body: { success: true, message: 'You already have access!' } };
    }

    if (source === 'free-chapter') {
      const pdfUrl = process.env.FREE_CHAPTER_PDF_URL || `${FRONTEND_URL}/free-chapter`;
      try {
        await sendEmail({
          to: normalizedEmail,
          template: 'freeChapterWelcome',
          templateData: {
            name: firstName?.trim() || existingData.firstName || normalizedEmail.split('@')[0],
            pdfUrl,
          },
        });
        console.log(`✅ Free chapter email re-sent to ${normalizedEmail}`);
      } catch (emailErr) {
        console.error('Failed to re-send free chapter email:', emailErr.message);
      }
      return { statusCode: 200, body: { success: true, message: 'Check your inbox for the download link!', pdfUrl } };
    }

    if (existingData.status === 'unsubscribed') {
      return { statusCode: 200, body: { success: true, message: 'Welcome back! You have been re-subscribed.' } };
    }

    return { statusCode: 200, body: { success: true, message: 'You are already subscribed!' } };
  }

  if (source === 'free-chapter' && inUserProfiles) {
    const pdfUrl = process.env.FREE_CHAPTER_PDF_URL || `${FRONTEND_URL}/free-chapter`;
    try {
      await sendEmail({
        to: normalizedEmail,
        template: 'freeChapterWelcome',
        templateData: {
          name: firstName?.trim() || normalizedEmail.split('@')[0],
          pdfUrl,
        },
      });
      console.log(`✅ Free chapter email sent to existing user_profiles: ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('Failed to send free chapter email to user_profiles:', emailErr.message);
    }
    return { statusCode: 200, body: { success: true, message: 'Check your inbox for the download link!', pdfUrl } };
  }

  const subscriptionData = {
    email: normalizedEmail,
    source: source,
    referrer: referrer || 'unknown',
    subscribed_at: admin.firestore.FieldValue.serverTimestamp(),
    status: 'subscribed',
    confirmed: false,
    ...(source === 'starter-pack' && { starter_pack_claimed: true }),
  };
  if (firstName) subscriptionData.firstName = firstName.trim();
  if (phone) subscriptionData.phone = phone.trim();

  await subscriptionsRef.add(subscriptionData);
  console.log(`✅ Email subscription created: ${normalizedEmail} (source: ${source})`);

  if (source === 'starter-pack') {
    try {
      const dashboardUrl = process.env.STARTER_PACK_DOWNLOAD_URL ||
        `${FRONTEND_URL}/auth?redirect=${encodeURIComponent('/dashboard?tab=starter-pack')}`;
      await sendEmail({
        to: normalizedEmail,
        template: 'starterPackWelcome',
        templateData: {
          name: firstName?.trim() || normalizedEmail.split('@')[0],
          downloadUrl: dashboardUrl,
        },
      });
      console.log(`✅ Starter Pack welcome email sent to ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('Failed to send starter pack email (subscription still saved):', emailErr.message);
    }
  }

  if (source === 'free-chapter') {
    const pdfUrl = process.env.FREE_CHAPTER_PDF_URL || `${FRONTEND_URL}/free-chapter`;
    try {
      await sendEmail({
        to: normalizedEmail,
        template: 'freeChapterWelcome',
        templateData: {
          name: firstName?.trim() || normalizedEmail.split('@')[0],
          pdfUrl,
        },
      });
      console.log(`✅ Free chapter email sent to ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('Failed to send free chapter email (subscription still saved):', emailErr.message);
    }
    return { statusCode: 200, body: { success: true, message: 'Successfully subscribed! Check your inbox.', pdfUrl } };
  }

  return { statusCode: 200, body: { success: true, message: 'Successfully subscribed!' } };
}
