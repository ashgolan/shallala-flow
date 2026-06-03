const admin = require('firebase-admin');

let db       = null;
let storage  = null;
let initialized = false;

const initFirebase = () => {
  if (initialized || admin.apps.length > 0) return;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const serviceAccount = {
    type:                        'service_account',
    project_id:                  process.env.FIREBASE_PROJECT_ID,
    private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key:                 privateKey,
    client_email:                process.env.FIREBASE_CLIENT_EMAIL,
    client_id:                   process.env.FIREBASE_CLIENT_ID,
    auth_uri:                    'https://accounts.google.com/o/oauth2/auth',
    token_uri:                   'https://oauth2.googleapis.com/token',
  };

  admin.initializeApp({
    credential:    admin.credential.cert(serviceAccount),
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
  });

  initialized = true;
  console.log(`✅ Firebase initialized — project: ${process.env.FIREBASE_PROJECT_ID}`);
};

const getDb = () => {
  if (!db) { initFirebase(); db = admin.firestore(); }
  return db;
};

const getStorage = () => {
  if (!storage) { initFirebase(); storage = admin.storage(); }
  return storage;
};

module.exports = { initFirebase, getDb, getStorage };
