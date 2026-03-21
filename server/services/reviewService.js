/**
 * Firestore-based book reviews service
 * Stores reviews in book_reviews collection with aggregate metadata in book_reviews_meta
 */

import admin from 'firebase-admin';
import { getFirestoreDb } from './firebaseService.js';

const META_DOC_ID = 'aggregate';
const PER_PAGE = 5;

/**
 * Get aggregate stats (total, average, distribution)
 */
async function getAggregate() {
  const db = getFirestoreDb();
  const metaRef = db.collection('book_reviews_meta').doc(META_DOC_ID);
  const metaSnap = await metaRef.get();

  if (!metaSnap.exists) {
    return {
      total_reviews: 0,
      average_rating: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const data = metaSnap.data();
  return {
    total_reviews: data.total_reviews || 0,
    average_rating: data.average_rating || 0,
    distribution: data.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}

/**
 * Update aggregate metadata when a review is added or changed
 */
async function updateAggregate(changeType, oldRating, newRating) {
  const db = getFirestoreDb();
  const metaRef = db.collection('book_reviews_meta').doc(META_DOC_ID);

  return db.runTransaction(async (transaction) => {
    const metaSnap = await transaction.get(metaRef);
    let total = 0;
    let sum = 0;
    let distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (metaSnap.exists) {
      const data = metaSnap.data();
      total = data.total_reviews || 0;
      distribution = { ...(data.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) };
      sum = (data.average_rating || 0) * total;
    }

    if (changeType === 'add') {
      total += 1;
      sum += newRating;
      distribution[newRating] = (distribution[newRating] || 0) + 1;
    } else if (changeType === 'update') {
      sum = sum - oldRating + newRating;
      distribution[oldRating] = Math.max(0, (distribution[oldRating] || 0) - 1);
      distribution[newRating] = (distribution[newRating] || 0) + 1;
    } else if (changeType === 'delete') {
      total = Math.max(0, total - 1);
      sum = Math.max(0, sum - oldRating);
      distribution[oldRating] = Math.max(0, (distribution[oldRating] || 0) - 1);
    }

    const average_rating = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

    transaction.set(metaRef, {
      total_reviews: total,
      average_rating,
      distribution,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { total_reviews: total, average_rating, distribution };
  });
}

/**
 * Get paginated reviews
 */
export async function getReviews(page = 1, perPage = PER_PAGE) {
  const db = getFirestoreDb();
  const reviewsRef = db.collection('book_reviews');
  const aggregate = await getAggregate();
  const total = aggregate.total_reviews;
  const total_pages = Math.max(1, Math.ceil(total / perPage));

  let query = reviewsRef
    .orderBy('created_at', 'desc')
    .limit(perPage);

  if (page > 1) {
    const offset = (page - 1) * perPage;
    const skipQuery = reviewsRef
      .orderBy('created_at', 'desc')
      .limit(offset);
    const skipSnap = await skipQuery.get();
    if (skipSnap.empty || skipSnap.docs.length < offset) {
      return { reviews: [], aggregate, pagination: { page, per_page: perPage, total, total_pages } };
    }
    const lastDoc = skipSnap.docs[skipSnap.docs.length - 1];
    query = reviewsRef
      .orderBy('created_at', 'desc')
      .startAfter(lastDoc)
      .limit(perPage);
  }

  const snapshot = await query.get();
  const reviews = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      user_id: d.user_id,
      display_name: d.display_name || 'Anonymous',
      rating: d.rating,
      review_text: d.review_text,
      created_at: d.created_at?.toDate?.()?.toISOString?.() || d.created_at,
    };
  });

  return {
    reviews,
    aggregate,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages,
    },
  };
}

/**
 * Check if user has an existing review
 */
export async function getUserReview(userId) {
  if (!userId) return null;

  const db = getFirestoreDb();
  const snapshot = await db
    .collection('book_reviews')
    .where('user_id', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const d = doc.data();
  return {
    id: doc.id,
    user_id: d.user_id,
    display_name: d.display_name || 'Anonymous',
    rating: d.rating,
    review_text: d.review_text,
    created_at: d.created_at?.toDate?.()?.toISOString?.() || d.created_at,
  };
}

/**
 * Submit or update a review
 */
export async function submitReview(userId, { rating, review_text, display_name }) {
  if (!userId) {
    throw new Error('Please sign in to submit a review.');
  }

  const db = getFirestoreDb();
  const reviewsRef = db.collection('book_reviews');

  const normalizedDisplayName = (display_name || 'Anonymous').trim().slice(0, 50);
  const normalizedText = (review_text || '').trim();
  const r = parseInt(rating, 10);
  if (r < 1 || r > 5) throw new Error('Rating must be between 1 and 5.');
  if (normalizedText.length < 10) throw new Error('Review must be at least 10 characters.');
  if (normalizedText.length > 2000) throw new Error('Review must be under 2,000 characters.');

  const existing = await getUserReview(userId);

  if (existing) {
    await db.runTransaction(async (transaction) => {
      const docRef = reviewsRef.doc(existing.id);
      transaction.update(docRef, {
        rating: r,
        review_text: normalizedText,
        display_name: normalizedDisplayName,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      await updateAggregate('update', existing.rating, r);
    });

    const updated = await getUserReview(userId);
    return { success: true, message: 'Review updated successfully.', review: updated };
  }

  const newRef = reviewsRef.doc();
  await db.runTransaction(async (transaction) => {
    transaction.set(newRef, {
      user_id: userId,
      display_name: normalizedDisplayName,
      rating: r,
      review_text: normalizedText,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await updateAggregate('add', null, r);
  });

  const created = await getUserReview(userId);
  return { success: true, message: 'Review submitted successfully.', review: created };
}
