/**
 * Analytics service - derive metrics from campaigns, funnels, subscribers
 */

import { getFirestoreDb } from './firebaseService.js';

export async function getAnalyticsOverview(days = 30) {
  const db = getFirestoreDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const campaignsSnap = await db.collection('campaigns').get();
  let totalEmailsSent = 0, totalOpens = 0, totalClicks = 0, totalFailed = 0;
  const campaignPerformance = [];
  campaignsSnap.docs.forEach((d) => {
    const c = d.data();
    const sent = c.sent_count || 0;
    const failed = c.failed_count || 0;
    const opens = c.open_count || 0;
    const clicks = c.click_count || 0;
    totalEmailsSent += sent;
    totalFailed += failed;
    totalOpens += opens;
    totalClicks += clicks;
    const created = c.created_at?.toDate?.() || new Date(c.created_at);
    if (created >= cutoff) {
      campaignPerformance.push({
        id: d.id,
        subject: c.subject || '',
        sentAt: c.sent_at || c.created_at,
        recipients: c.recipient_count || 0,
        sent,
        failed,
        opens,
        clicks,
        bounces: 0,
        unsubscribes: 0,
        delivered: sent - failed,
        spamReports: 0,
        openRate: sent > 0 ? ((opens / sent) * 100).toFixed(1) : 0,
        clickRate: sent > 0 ? ((clicks / sent) * 100).toFixed(1) : 0,
        bounceRate: sent > 0 ? 0 : 0,
        deliveryRate: sent > 0 ? (((sent - failed) / sent) * 100).toFixed(1) : 100,
        unsubRate: sent > 0 ? 0 : 0,
      });
    }
  });

  const funnelEnrollSnap = await db.collection('email_funnel_enrollments').get();
  let funnelSent = 0, funnelOpened = 0;
  funnelEnrollSnap.docs.forEach((d) => {
    funnelSent += d.data().emails_sent || 0;
  });

  const subsSnap = await db.collection('email_subscriptions').get();
  let totalSubs = subsSnap.size, activeSubs = 0, unsubs = 0;
  subsSnap.docs.forEach((d) => {
    if (d.data().status === 'unsubscribed') unsubs++;
    else activeSubs++;
  });

  const totalDelivered = totalEmailsSent - totalFailed + funnelSent;
  const totalOpenRate = totalDelivered > 0 ? ((totalOpens / totalDelivered) * 100).toFixed(1) : 0;
  const totalClickRate = totalDelivered > 0 ? ((totalClicks / totalDelivered) * 100).toFixed(1) : 0;
  const overallUnsubRate = totalSubs > 0 ? ((unsubs / totalSubs) * 100).toFixed(1) : 0;

  const funnelsSnap = await db.collection('email_funnels').get();
  let totalFunnelEnrolled = 0, activeFunnelEnrolled = 0;
  funnelEnrollSnap.docs.forEach((d) => {
    totalFunnelEnrolled++;
    if (d.data().status === 'active') activeFunnelEnrolled++;
  });

  const timeSeries = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    timeSeries.push({
      date: d.toISOString().split('T')[0],
      campaignsSent: 0,
      funnelSent: 0,
      funnelFailed: 0,
      campaignOpens: 0,
      campaignClicks: 0,
      funnelOpened: 0,
    });
  }
  campaignsSnap.docs.forEach((d) => {
    const c = d.data();
    const sentAt = c.sent_at || c.created_at;
    if (!sentAt) return;
    const date = new Date(sentAt).toISOString().split('T')[0];
    const ts = timeSeries.find((t) => t.date === date);
    if (ts) {
      ts.campaignsSent += c.sent_count || 0;
      ts.campaignOpens += c.open_count || 0;
      ts.campaignClicks += c.click_count || 0;
    }
  });

  return {
    success: true,
    overview: {
      totalEmailsSent: totalEmailsSent + funnelSent,
      totalOpens,
      totalClicks,
      totalFailed,
      totalBounces: 0,
      totalDelivered,
      totalUnsubscribes: unsubs,
      totalOpenRate,
      totalClickRate,
      totalBounceRate: 0,
      totalDeliveryRate: totalEmailsSent + funnelSent > 0 ? ((totalDelivered / (totalEmailsSent + funnelSent)) * 100).toFixed(1) : 100,
      overallUnsubRate,
    },
    campaigns: {
      total: campaignPerformance.length,
      sent: campaignPerformance.filter((c) => c.sent > 0).length,
      totalSent: totalEmailsSent,
      totalOpens,
      totalClicks,
      totalFailed,
      totalBounces: 0,
      totalDelivered: totalEmailsSent - totalFailed,
      totalUnsubscribes: 0,
      totalSpamReports: 0,
      openRate: totalEmailsSent > 0 ? ((totalOpens / totalEmailsSent) * 100).toFixed(1) : 0,
      clickRate: totalEmailsSent > 0 ? ((totalClicks / totalEmailsSent) * 100).toFixed(1) : 0,
      bounceRate: 0,
      deliveryRate: totalEmailsSent > 0 ? (((totalEmailsSent - totalFailed) / totalEmailsSent) * 100).toFixed(1) : 100,
      unsubRate: 0,
      performance: campaignPerformance.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '')),
    },
    funnels: {
      totalSent: funnelSent,
      totalOpened: funnelOpened,
      totalClicked: 0,
      totalFailed: 0,
      totalBounced: 0,
      totalDelivered: funnelSent,
      openRate: funnelSent > 0 ? 0 : 0,
      clickRate: funnelSent > 0 ? 0 : 0,
      bounceRate: 0,
      totalEnrolled: totalFunnelEnrolled,
      activeEnrolled: activeFunnelEnrolled,
    },
    subscribers: { total: totalSubs, active: activeSubs },
    webhook: { configured: false, url: '' },
    timeSeries,
  };
}
