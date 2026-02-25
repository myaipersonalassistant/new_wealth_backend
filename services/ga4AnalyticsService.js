/**
 * GA4 Analytics Data API - fetch reports for Admin dashboard.
 * Requires: GA4_PROPERTY_ID (numeric), GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY_PATH
 * Grant the service account "Viewer" on the GA4 property.
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCredentialsPath() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (!path) return null;
  const isAbsolute = path.startsWith('/') || /^[A-Za-z]:/.test(path);
  return isAbsolute ? path : join(__dirname, '..', path);
}

let client = null;

function getClient() {
  if (client) return client;
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID is not set');
  const credPath = getCredentialsPath();
  if (credPath) {
    try {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    } catch (e) {
      console.warn('GA4: Could not set credentials path', e.message);
    }
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  }
  client = new BetaAnalyticsDataClient();
  return client;
}

function getDateRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, Math.min(365, days)));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Fetch GA4 report data for Admin analytics dashboard.
 * @param {number} days - Last N days
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function getGA4Report(days = 30) {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return { success: false, error: 'GA4_PROPERTY_ID not configured' };
  }

  try {
    const analyticsDataClient = getClient();
    const property = `properties/${propertyId}`;
    const { startDate, endDate } = getDateRange(days);

    // 1) Overview: total users, sessions, page views
    const [overviewResponse] = await analyticsDataClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    });

    let totalUsers = 0, totalSessions = 0, totalPageViews = 0, avgSessionSec = 0, engagementRate = 0;
    if (overviewResponse.rows && overviewResponse.rows.length > 0) {
      const r = overviewResponse.rows[0];
      totalUsers = Number(r.metricValues?.[0]?.value || 0);
      totalSessions = Number(r.metricValues?.[1]?.value || 0);
      totalPageViews = Number(r.metricValues?.[2]?.value || 0);
      avgSessionSec = Number(r.metricValues?.[3]?.value || 0);
      engagementRate = Number(r.metricValues?.[4]?.value || 0) * 100;
    }

    // 2) Top pages (pagePath + screenPageViews)
    const [pagesResponse] = await analyticsDataClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      limit: 20,
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    });

    const topPages = (pagesResponse.rows || []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || '',
      title: row.dimensionValues?.[1]?.value || '',
      views: Number(row.metricValues?.[0]?.value || 0),
      users: Number(row.metricValues?.[1]?.value || 0),
    }));

    // 3) Location (country + city, users)
    const [locationResponse] = await analyticsDataClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'country' }, { name: 'city' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 15,
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    });

    const locations = (locationResponse.rows || []).map((row) => ({
      country: row.dimensionValues?.[0]?.value || '',
      city: row.dimensionValues?.[1]?.value || '',
      users: Number(row.metricValues?.[0]?.value || 0),
    }));

    // 4) Device category
    const [deviceResponse] = await analyticsDataClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    });

    const devices = (deviceResponse.rows || []).map((row) => ({
      category: row.dimensionValues?.[0]?.value || 'unknown',
      users: Number(row.metricValues?.[0]?.value || 0),
      sessions: Number(row.metricValues?.[1]?.value || 0),
    }));

    // 5) Users per day (last 14 for chart)
    const chartDays = Math.min(14, days);
    const chartEnd = new Date();
    const chartStart = new Date();
    chartStart.setDate(chartStart.getDate() - chartDays);
    const [dailyResponse] = await analyticsDataClient.runReport({
      property,
      dateRanges: [{
        startDate: chartStart.toISOString().slice(0, 10),
        endDate: chartEnd.toISOString().slice(0, 10),
      }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    const dailyData = (dailyResponse.rows || []).map((row) => {
      const d = row.dimensionValues?.[0]?.value || '';
      return {
        date: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '',
        users: Number(row.metricValues?.[0]?.value || 0),
        views: Number(row.metricValues?.[1]?.value || 0),
      };
    });

    return {
      success: true,
      data: {
        dateRange: { startDate, endDate, days },
        overview: {
          totalUsers,
          totalSessions,
          totalPageViews,
          avgSessionSeconds: avgSessionSec,
          engagementRate,
        },
        topPages,
        locations,
        devices,
        dailyData,
      },
    };
  } catch (err) {
    console.error('GA4 report error:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch GA4 report',
    };
  }
}

/** Alias for admin invoke */
export async function getGA4DashboardReport(days = 30) {
  const result = await getGA4Report(days);
  return result.success ? result.data : null;
}
