/**
 * Firebase Admin SDK service for server-side operations
 * Replaces Supabase service for book orders
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin SDK
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return; // Already initialized
  }

  try {
    const initFromServiceAccountObject = (serviceAccount, sourceLabel) => {
      if (serviceAccount.private_key) {
        let pk = serviceAccount.private_key;
        if (typeof pk !== 'string') pk = String(pk);
        pk = pk.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!pk.includes('BEGIN PRIVATE KEY') || !pk.includes('END PRIVATE KEY')) {
          throw new Error('Private key format is invalid - missing BEGIN/END markers');
        }
        serviceAccount.private_key = pk;
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log(`✅ Firebase Admin SDK initialized from ${sourceLabel}`);
    };

    // Option 1: Base64-encoded full JSON (best for Vercel — no quoting issues)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.trim(), 'base64').toString('utf8');
        const serviceAccount = JSON.parse(json);
        initFromServiceAccountObject(serviceAccount, 'FIREBASE_SERVICE_ACCOUNT_BASE64');
        return;
      } catch (e) {
        console.error('❌ Error decoding FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
      }
    }

    // Option 2: Service account JSON string from env (single-line JSON; escape private_key newlines as \n)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        const serviceAccount = JSON.parse(raw);
        initFromServiceAccountObject(serviceAccount, 'FIREBASE_SERVICE_ACCOUNT (env string)');
        return;
      } catch (parseError) {
        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT JSON:', parseError.message);
      }
    }

    // Option 3: Service account key file path (local dev only; not for Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
      try {
        // Resolve path - handle absolute paths (Unix and Windows) and relative paths
        let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
        // Check if it's an absolute path (Unix / or Windows C:)
        const isAbsolutePath = serviceAccountPath.startsWith('/') || /^[A-Za-z]:/.test(serviceAccountPath);
        
        if (!isAbsolutePath) {
          // Relative path - resolve from server directory
          serviceAccountPath = join(__dirname, '..', serviceAccountPath);
        }
        
        const fileContent = readFileSync(serviceAccountPath, 'utf8');
        let serviceAccount = JSON.parse(fileContent);
        
        // Normalize the private key - handle both escaped \n and actual newlines
        if (serviceAccount.private_key) {
          let privateKey = serviceAccount.private_key;
          
          // If it has literal \n (escaped), replace with actual newlines
          if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
          }
          
          // Remove any carriage returns (Windows line endings)
          privateKey = privateKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          
          // Trim whitespace but preserve the structure
          privateKey = privateKey.trim();
          
          // Validate private key format
          if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
            throw new Error('Private key format is invalid - missing BEGIN/END markers');
          }
          
          // Update the service account with normalized private key
          serviceAccount = {
            ...serviceAccount,
            private_key: privateKey
          };
        }
        
        // Initialize Firebase Admin SDK
        try {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          console.log('✅ Firebase Admin SDK initialized from service account file:', serviceAccountPath);
          return;
        } catch (initError) {
          // If full service account fails, try with minimal config
          console.warn('⚠️  Full service account init failed, trying minimal config...');
          console.warn('   Error:', initError.message);
          try {
            admin.initializeApp({
              credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: serviceAccount.private_key,
              }),
            });
            console.log('✅ Firebase Admin SDK initialized with minimal config');
            return;
          } catch (minError) {
            throw new Error(`Failed to initialize Firebase: ${minError.message}`);
          }
        }
      } catch (fileError) {
        console.error('❌ Error reading service account file:', fileError.message);
        // Fall through to try other options
      }
    }

    // Option 4: Individual credentials (also works well on Vercel)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      // Handle all possible escaping scenarios
      privateKey = privateKey.replace(/\\n/g, '\n');
      // Strip surrounding quotes if dotenv didn't remove them
      privateKey = privateKey.replace(/^["']|["']$/g, '');
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log('✅ Firebase Admin SDK initialized from individual credentials');
      return;
    }
    
    // No credentials found
    console.warn('⚠️  Firebase Admin SDK not initialized - missing credentials');
    console.warn('   Set FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_SERVICE_ACCOUNT, FIREBASE_* split vars, or FIREBASE_SERVICE_ACCOUNT_KEY_PATH');
    console.warn('   Current env vars:', {
      hasKeyPath: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH,
      hasServiceAccountB64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
    });
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Initialize immediately when module loads (after dotenv.config() in index.js)
initializeFirebase();

// Get Firestore instance (only if Firebase is initialized)
const getDb = () => {
  if (!admin.apps.length) {
    // Try to initialize one more time (in case env vars were loaded late)
    initializeFirebase();
    if (!admin.apps.length) {
      throw new Error('Firebase Admin SDK is not initialized. Please set Firebase credentials in .env');
    }
  }
  return admin.firestore();
};

/**
 * Update book order status
 */
export const updateBookOrder = async (orderId, updates) => {
  try {
    const db = getDb();
    const orderRef = db.collection('book_orders').doc(orderId);
    
    // If email_sent_type is being set and email_sent_at is not already set, set it to server timestamp
    const firestoreUpdates = { ...updates };
    if (firestoreUpdates.email_sent_type && !firestoreUpdates.email_sent_at) {
      firestoreUpdates.email_sent_at = admin.firestore.FieldValue.serverTimestamp();
    }
    
    await orderRef.update({
      ...firestoreUpdates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updatedOrder = await orderRef.get();
    return { id: updatedOrder.id, ...updatedOrder.data() };
  } catch (error) {
    console.error('Error updating book order:', error);
    throw error;
  }
};

/**
 * Find book order by Stripe session ID
 */
export const findOrderBySessionId = async (sessionId) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('book_orders')
      .where('stripe_session_id', '==', sessionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error finding order by session ID:', error);
    throw error;
  }
};

/**
 * Find book order by customer email and status
 */
export const findOrderByEmail = async (email, status = 'pending') => {
  try {
    const db = getDb();
    const snapshot = await db.collection('book_orders')
      .where('customer_email', '==', email.toLowerCase())
      .where('status', '==', status)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error finding order by email:', error);
    throw error;
  }
};

/**
 * Create a new book order
 */
export const createBookOrder = async (orderData) => {
  try {
    const db = getDb();
    const orderRef = db.collection('book_orders').doc();
    const order = {
      ...orderData,
      id: orderRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await orderRef.set(order);
    return { id: orderRef.id, ...order };
  } catch (error) {
    console.error('Error creating book order:', error);
    throw error;
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (orderId) => {
  try {
    const db = getDb();
    const orderDoc = await db.collection('book_orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return null;
    }

    return { id: orderDoc.id, ...orderDoc.data() };
  } catch (error) {
    console.error('Error getting order by ID:', error);
    throw error;
  }
};

/**
 * Get Firestore database instance
 * Exported for use in other server modules
 */
export const getFirestoreDb = () => {
  return getDb();
};

// --- Foundation orders ---

export const updateFoundationOrder = async (orderId, updates) => {
  try {
    const db = getDb();
    const orderRef = db.collection('foundation_orders').doc(orderId);
    const firestoreUpdates = { ...updates };
    if (firestoreUpdates.email_sent_type && !firestoreUpdates.email_sent_at) {
      firestoreUpdates.email_sent_at = admin.firestore.FieldValue.serverTimestamp();
    }
    await orderRef.update({
      ...firestoreUpdates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    const updatedOrder = await orderRef.get();
    return { id: updatedOrder.id, ...updatedOrder.data() };
  } catch (error) {
    console.error('Error updating foundation order:', error);
    throw error;
  }
};

export const findFoundationOrderBySessionId = async (sessionId) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('foundation_orders')
      .where('stripe_session_id', '==', sessionId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error finding foundation order by session ID:', error);
    throw error;
  }
};

export const getFoundationOrderById = async (orderId) => {
  try {
    const db = getDb();
    const orderDoc = await db.collection('foundation_orders').doc(orderId).get();
    if (!orderDoc.exists) return null;
    return { id: orderDoc.id, ...orderDoc.data() };
  } catch (error) {
    console.error('Error getting foundation order:', error);
    throw error;
  }
};

export const createFoundationOrder = async (orderData) => {
  try {
    const db = getDb();
    const orderRef = db.collection('foundation_orders').doc();
    const order = {
      ...orderData,
      id: orderRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await orderRef.set(order);
    return { id: orderRef.id, ...order };
  } catch (error) {
    console.error('Error creating foundation order:', error);
    throw error;
  }
};

// --- Seminar orders ---

export const createSeminarOrder = async (orderData) => {
  try {
    const db = getDb();
    const orderRef = db.collection('seminar_orders').doc();
    const order = {
      ...orderData,
      id: orderRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await orderRef.set(order);
    return { id: orderRef.id, ...order };
  } catch (error) {
    console.error('Error creating seminar order:', error);
    throw error;
  }
};

export const updateSeminarOrder = async (orderId, updates) => {
  try {
    const db = getDb();
    const orderRef = db.collection('seminar_orders').doc(orderId);
    const firestoreUpdates = { ...updates };
    if (firestoreUpdates.email_sent_type && !firestoreUpdates.email_sent_at) {
      firestoreUpdates.email_sent_at = admin.firestore.FieldValue.serverTimestamp();
    }
    await orderRef.update({
      ...firestoreUpdates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    const updatedOrder = await orderRef.get();
    return { id: updatedOrder.id, ...updatedOrder.data() };
  } catch (error) {
    console.error('Error updating seminar order:', error);
    throw error;
  }
};

export const findSeminarOrderBySessionId = async (sessionId) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('seminar_orders')
      .where('stripe_session_id', '==', sessionId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error finding seminar order by session ID:', error);
    throw error;
  }
};

export const getSeminarOrderById = async (orderId) => {
  try {
    const db = getDb();
    const orderDoc = await db.collection('seminar_orders').doc(orderId).get();
    if (!orderDoc.exists) return null;
    return { id: orderDoc.id, ...orderDoc.data() };
  } catch (error) {
    console.error('Error getting seminar order by ID:', error);
    throw error;
  }
};

export const incrementFoundationStats = async (amount, quantity = 1) => {
  try {
    const db = getDb();
    const statsRef = db.collection('foundation_stats').doc('main');
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(statsRef);
      const current = doc.exists ? doc.data() : { copiesSold: 0, totalRaised: 0 };
      transaction.set(statsRef, {
        copiesSold: (current.copiesSold || 0) + quantity,
        totalRaised: (current.totalRaised || 0) + amount,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    console.error('Error incrementing foundation stats:', error);
    // Non-fatal - don't throw
  }
};

/** Course enrollments - create enrollment (used after Stripe payment or coupon redemption) */
export const createCourseEnrollment = async ({ userId, courseId, email, source = 'stripe', stripeSessionId }) => {
  const db = getDb();
  const id = `${userId}_${courseId}`;
  const ref = db.collection('course_enrollments').doc(id);
  await ref.set({
    user_id: userId,
    course_id: courseId,
    email: email?.toLowerCase() || '',
    status: 'active',
    source,
    stripe_session_id: stripeSessionId || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id };
};

/** Check if user is enrolled */
export const isCourseEnrolled = async (userId, courseId) => {
  const db = getDb();
  const doc = await db.collection('course_enrollments').doc(`${userId}_${courseId}`).get();
  return doc.exists && doc.data().status === 'active';
};

/** Course coupons - validate and optionally increment used_count */
export const validateCourseCoupon = async (courseId, code) => {
  const db = getDb();
  const codeUpper = (code || '').trim().toUpperCase();
  const snapshot = await db.collection('course_coupons')
    .where('course_id', '==', courseId)
    .where('code', '==', codeUpper)
    .limit(1)
    .get();
  if (snapshot.empty) return { valid: false, error: 'Invalid coupon code' };
  const doc = snapshot.docs[0];
  const data = doc.data();
  if (data.max_uses > 0 && (data.used_count || 0) >= data.max_uses) {
    return { valid: false, error: 'Coupon has reached maximum uses' };
  }
  if (data.expires_at && data.expires_at.toDate && data.expires_at.toDate() < new Date()) {
    return { valid: false, error: 'Coupon has expired' };
  }
  return {
    valid: true,
    couponId: doc.id,
    discount_type: data.discount_type || 'percent',
    discount_value: data.discount_value || 0,
  };
};

/** Redeem coupon - increment used_count */
export const redeemCourseCoupon = async (couponId) => {
  const db = getDb();
  const ref = db.collection('course_coupons').doc(couponId);
  await ref.update({
    used_count: admin.firestore.FieldValue.increment(1),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
};

/** Get course setting by ID */
export const getCourseSetting = async (courseId) => {
  const db = getDb();
  const snapshot = await db.collection('course_settings').where('course_id', '==', courseId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};
