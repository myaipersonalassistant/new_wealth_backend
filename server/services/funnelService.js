/**
 * Funnel service - email automation funnels (Firestore-backed)
 * Collections: email_funnels, email_funnel_steps, email_funnel_enrollments
 */

import admin from 'firebase-admin';
import { getFirestoreDb } from './firebaseService.js';
import { sendEmail } from './emailService.js';
import { getCampaignRecipients } from './campaignService.js';

const toStr = (v) => (v ? String(v) : '');
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

/** List all funnels */
export async function listFunnels() {
  const db = getFirestoreDb();
  const snap = await db.collection('email_funnels').orderBy('created_at', 'desc').get();
  const funnels = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || '',
      description: data.description || '',
      trigger_on: data.trigger_on || 'manual',
      trigger_filter: data.trigger_filter || 'all_active',
      is_active: data.is_active !== false,
      created_at: toStr(data.created_at?.toDate?.()?.toISOString?.() ?? data.created_at),
      updated_at: toStr(data.updated_at?.toDate?.()?.toISOString?.() ?? data.updated_at),
      last_processed_at: data.last_processed_at || null,
      chain_to_funnel_id: data.chain_to_funnel_id || null,
      step_count: 0,
      enrollments: { active: 0, completed: 0, unsubscribed: 0, total: 0 },
      sends: { sent: 0, opened: 0 },
    };
  });
  for (const f of funnels) {
    const stepsSnap = await db.collection('email_funnel_steps').where('funnel_id', '==', f.id).get();
    f.step_count = stepsSnap.size;
    const enrollSnap = await db.collection('email_funnel_enrollments').where('funnel_id', '==', f.id).get();
    let active = 0, completed = 0, unsub = 0;
    enrollSnap.docs.forEach((doc) => {
      const s = doc.data().status;
      if (s === 'unsubscribed') unsub++;
      else if (s === 'completed') completed++;
      else active++;
    });
    f.enrollments = { active, completed, unsubscribed: unsub, total: enrollSnap.size };
    let sent = 0;
    enrollSnap.docs.forEach((doc) => { sent += doc.data().emails_sent || 0; });
    f.sends = { sent, opened: 0 };
  }
  return { success: true, funnels };
}

/** Get steps for a funnel */
export async function getSteps(funnelId) {
  const db = getFirestoreDb();
  const snap = await db.collection('email_funnel_steps').where('funnel_id', '==', funnelId).orderBy('step_number').get();
  const steps = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      funnel_id: data.funnel_id,
      step_number: data.step_number || 0,
      subject: data.subject || '',
      html_body: data.html_body || '',
      delay_days: data.delay_days || 0,
      delay_hours: data.delay_hours || 0,
      step_purpose: data.step_purpose || '',
      cta_url: data.cta_url || '',
      cta_label: data.cta_label || '',
      sender_name: data.sender_name || 'Chris Ifonlaja',
      sender_email: data.sender_email || 'noreply@buildwealththroughproperty.com',
      is_active: data.is_active !== false,
    };
  });
  return { success: true, steps };
}

/** Create funnel */
export async function createFunnel({ name, description, trigger_on, trigger_filter }) {
  const db = getFirestoreDb();
  const ref = db.collection('email_funnels').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    name: name || 'New Funnel',
    description: description || '',
    trigger_on: trigger_on || 'manual',
    trigger_filter: trigger_filter || 'all_active',
    is_active: true,
    created_at: now,
    updated_at: now,
    last_processed_at: null,
    chain_to_funnel_id: null,
  });
  return { success: true, funnel: { id: ref.id, name: name || 'New Funnel' } };
}

/** Update funnel */
export async function updateFunnel(funnelId, updates) {
  const db = getFirestoreDb();
  const ref = db.collection('email_funnels').doc(funnelId);
  const data = { ...updates, updated_at: admin.firestore.FieldValue.serverTimestamp() };
  await ref.update(data);
  return { success: true };
}

/** Delete funnel and related data */
export async function deleteFunnel(funnelId) {
  const db = getFirestoreDb();
  const batch = db.batch();
  const stepsSnap = await db.collection('email_funnel_steps').where('funnel_id', '==', funnelId).get();
  stepsSnap.docs.forEach((d) => batch.delete(d.ref));
  const enrollSnap = await db.collection('email_funnel_enrollments').where('funnel_id', '==', funnelId).get();
  enrollSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection('email_funnels').doc(funnelId));
  await batch.commit();
  return { success: true };
}

/** Save step */
export async function saveStep({ funnelId, stepId, step_number, subject, html_body, delay_days, delay_hours, step_purpose, cta_url, cta_label, sender_name, sender_email, is_active }) {
  const db = getFirestoreDb();
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (stepId) {
    await db.collection('email_funnel_steps').doc(stepId).update({
      step_number: step_number || 0,
      subject: subject || '',
      html_body: html_body || '',
      delay_days: delay_days ?? 0,
      delay_hours: delay_hours ?? 0,
      step_purpose: step_purpose || '',
      cta_url: cta_url || '',
      cta_label: cta_label || '',
      sender_name: sender_name || 'Chris Ifonlaja',
      sender_email: sender_email || 'noreply@buildwealththroughproperty.com',
      is_active: is_active !== false,
      updated_at: now,
    });
    return { success: true };
  }
  const ref = db.collection('email_funnel_steps').doc();
  await ref.set({
    funnel_id: funnelId,
    step_number: step_number || 0,
    subject: subject || '',
    html_body: html_body || '',
    delay_days: delay_days ?? 0,
    delay_hours: delay_hours ?? 0,
    step_purpose: step_purpose || '',
    cta_url: cta_url || '',
    cta_label: cta_label || '',
    sender_name: sender_name || 'Chris Ifonlaja',
    sender_email: sender_email || 'noreply@buildwealththroughproperty.com',
    is_active: is_active !== false,
    created_at: now,
    updated_at: now,
  });
  return { success: true };
}

/** Delete step */
export async function deleteStep(stepId) {
  const db = getFirestoreDb();
  await db.collection('email_funnel_steps').doc(stepId).delete();
  return { success: true };
}

/** Enroll subscribers into funnel */
export async function enrollSubscribers(funnelId, recipientFilter) {
  const db = getFirestoreDb();
  const raw = await getCampaignRecipients(recipientFilter || 'all_active', true);
  const list = Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0].email
    ? raw
    : (Array.isArray(raw) ? raw : []).map((e) => ({ email: typeof e === 'string' ? e : e?.email, firstName: e?.firstName || null }));
  let enrolled = 0, alreadyEnrolled = 0;
  for (const { email, firstName } of list) {
    const existing = await db.collection('email_funnel_enrollments')
      .where('funnel_id', '==', funnelId)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    if (!existing.empty) {
      alreadyEnrolled++;
      continue;
    }
    await db.collection('email_funnel_enrollments').add({
      funnel_id: funnelId,
      email: (email || '').toString().toLowerCase(),
      first_name: firstName || null,
      current_step: 0,
      enrolled_at: admin.firestore.FieldValue.serverTimestamp(),
      last_sent_at: null,
      emails_sent: 0,
      status: 'active',
    });
    enrolled++;
  }
  return { success: true, enrolled, alreadyEnrolled, message: enrolled === 0 ? 'No new subscribers to enroll.' : null };
}

/** Process funnel - send next step to enrolled users who are due */
export async function processFunnel(funnelId) {
  const db = getFirestoreDb();
  const funnelRef = db.collection('email_funnels').doc(funnelId);
  const funnelSnap = await funnelRef.get();
  if (!funnelSnap.exists || !funnelSnap.data().is_active) {
    return { success: true, sentCount: 0, failedCount: 0, message: 'Funnel not found or paused.' };
  }

  const stepsSnap = await db.collection('email_funnel_steps').where('funnel_id', '==', funnelId).orderBy('step_number').get();
  const steps = stepsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (steps.length === 0) {
    return { success: true, sentCount: 0, failedCount: 0, message: 'No steps in funnel.' };
  }

  const enrollSnap = await db.collection('email_funnel_enrollments')
    .where('funnel_id', '==', funnelId)
    .where('status', '==', 'active')
    .get();

  let sentCount = 0, failedCount = 0;
  const now = Date.now();

  for (const doc of enrollSnap.docs) {
    const enr = doc.data();
    const currentStep = enr.current_step || 0;
    if (currentStep >= steps.length) {
      await doc.ref.update({ status: 'completed', updated_at: admin.firestore.FieldValue.serverTimestamp() });
      continue;
    }

    const step = steps[currentStep];
    const delayMs = (step.delay_days || 0) * 24 * 60 * 60 * 1000 + (step.delay_hours || 0) * 60 * 60 * 1000;
    const lastSent = enr.last_sent_at?.toDate?.()?.getTime?.() || 0;
    const dueAt = lastSent + delayMs;
    if (currentStep > 0 && now < dueAt) continue;

    const firstName = String(enr.first_name || enr.email?.split('@')[0] || 'there').trim() || 'there';
    let html = (step.html_body || '').replace(/\{first_name\}/g, firstName).replace(/\{\{first_name\}\}/g, firstName);
    html = html.replace(/\{\{cta_url\}\}/g, step.cta_url || '#').replace(/{{cta_url}}/g, step.cta_url || '#');
    html = html.replace(/\{\{cta_label\}\}/g, step.cta_label || '').replace(/{{cta_label}}/g, step.cta_label || '');

    try {
      await sendEmail({
        to: enr.email,
        subject: step.subject || `Step ${currentStep + 1}`,
        html,
        text: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      });
      await doc.ref.update({
        current_step: currentStep + 1,
        last_sent_at: admin.firestore.FieldValue.serverTimestamp(),
        emails_sent: (enr.emails_sent || 0) + 1,
        status: currentStep + 1 >= steps.length ? 'completed' : 'active',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      sentCount++;
    } catch (err) {
      console.error('Funnel send failed:', enr.email, err.message);
      failedCount++;
    }
  }

  await funnelRef.update({
    last_processed_at: new Date().toISOString(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, sentCount, failedCount, message: sentCount === 0 ? 'No emails due to send right now.' : null };
}

/** Process all funnels */
export async function processAllFunnels() {
  const db = getFirestoreDb();
  const snap = await db.collection('email_funnels').where('is_active', '==', true).get();
  let totalSent = 0, totalFailed = 0, funnelsProcessed = 0;
  for (const doc of snap.docs) {
    const result = await processFunnel(doc.id);
    totalSent += result.sentCount || 0;
    totalFailed += result.failedCount || 0;
    funnelsProcessed++;
  }
  return { success: true, totalEmailsSent: totalSent, totalEmailsFailed: totalFailed, funnelsProcessed };
}

/** Funnel analytics */
export async function getFunnelAnalytics(funnelId) {
  const db = getFirestoreDb();
  const enrollSnap = await db.collection('email_funnel_enrollments').where('funnel_id', '==', funnelId).get();
  let totalEnrolled = enrollSnap.size, activeEnrolled = 0, completedEnrolled = 0, unsubscribedEnrolled = 0, totalSent = 0;
  enrollSnap.docs.forEach((d) => {
    const s = d.data().status;
    if (s === 'active') activeEnrolled++;
    else if (s === 'completed') completedEnrolled++;
    else if (s === 'unsubscribed') unsubscribedEnrolled++;
    totalSent += d.data().emails_sent || 0;
  });
  const funnelSnap = await db.collection('email_funnels').doc(funnelId).get();
  const funnel = funnelSnap.exists ? funnelSnap.data() : {};
  return {
    success: true,
    overview: {
      totalEnrolled,
      activeEnrolled,
      completedEnrolled,
      unsubscribedEnrolled,
      unsubscribeRate: totalEnrolled > 0 ? ((unsubscribedEnrolled / totalEnrolled) * 100).toFixed(1) + '%' : '0%',
      totalSent,
      totalOpened: 0,
      completionRate: totalEnrolled > 0 ? ((completedEnrolled / totalEnrolled) * 100).toFixed(1) + '%' : '0%',
      openRate: totalSent > 0 ? '0%' : '0%',
    },
    funnel: { ...funnel, id: funnelId, last_processed_at: funnel.last_processed_at },
  };
}

/** Processor status */
export async function getProcessorStatus() {
  const db = getFirestoreDb();
  const funnelsSnap = await db.collection('email_funnels').get();
  const funnelTimestamps = funnelsSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name || '',
    isActive: d.data().is_active !== false,
    lastProcessedAt: d.data().last_processed_at || null,
  }));
  let pendingEmails = 0;
  const enrollSnap = await db.collection('email_funnel_enrollments').where('status', '==', 'active').get();
  pendingEmails = enrollSnap.size;
  return {
    success: true,
    lastRun: null,
    recentRuns: [],
    funnelTimestamps,
    pendingEmails,
    nextScheduledRun: '—',
  };
}
