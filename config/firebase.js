const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let db, admin;

// Load service account key (optional for development)
let serviceAccount;
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
let firebaseAvailable = false;

try {
  serviceAccount = require(serviceAccountPath);
  firebaseAvailable = true;
} catch (err) {
  console.warn('⚠️  Firebase serviceAccountKey.json not found');
  console.warn('Running in mock mode - Firebase features will use in-memory storage');
}

// Initialize Firebase if credentials available
if (firebaseAvailable && process.env.FIREBASE_DATABASE_URL) {
  const admin_sdk = require('firebase-admin');
  try {
    admin_sdk.initializeApp({
      credential: admin_sdk.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    db = admin_sdk.database();
    admin = admin_sdk;
    console.log('✓ Firebase Admin SDK initialized');
  } catch (initErr) {
    console.error('❌ Firebase initialization failed:', initErr.message);
    console.error('⚠️  Falling back to mock mode');
    firebaseAvailable = false;
  }
}

// If Firebase not available, create mock objects for development
if (!firebaseAvailable) {
  console.log('ℹ️  Using mock Firebase database for localhost development');
  
  // Simple in-memory database for mock mode
  const mockData = {};

  // Helper to get nested data
  const getNestedData = (path) => {
    const keys = path.split('/').filter(k => k);
    let data = mockData;
    for (const key of keys) {
      data = data[key] || {};
    }
    return data;
  };

  // Helper to set nested data
  const setNestedData = (path, value) => {
    const keys = path.split('/').filter(k => k);
    let data = mockData;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!data[keys[i]]) data[keys[i]] = {};
      data = data[keys[i]];
    }
    data[keys[keys.length - 1]] = value;
  };

  // Helper to search by field
  const searchByField = (basePath, field, value) => {
    const baseData = getNestedData(basePath);
    const results = {};
    for (const [key, record] of Object.entries(baseData)) {
      if (record && record[field] === value) {
        results[key] = record;
      }
    }
    return results;
  };

  // Mock Firebase Database reference
  const createMockRef = (path) => {
    return {
      path: path,
      once: async (event) => {
        const data = getNestedData(path);
        return {
          val: () => Object.keys(data).length > 0 ? data : null,
          exists: () => Object.keys(data).length > 0,
        };
      },
      set: async (value) => {
        setNestedData(path, value);
        return Promise.resolve();
      },
      update: async (updates) => {
        const data = getNestedData(path);
        for (const [key, val] of Object.entries(updates)) {
          data[key] = val;
        }
        return Promise.resolve();
      },
      remove: async () => {
        const keys = path.split('/').filter(k => k);
        if (keys.length > 0) {
          const parentPath = keys.slice(0, -1).join('/');
          const lastKey = keys[keys.length - 1];
          const parent = getNestedData(parentPath);
          delete parent[lastKey];
        }
        return Promise.resolve();
      },
      orderByChild: (field) => ({
        equalTo: (value) => ({
          once: async () => {
            const results = searchByField(path, field, value);
            return {
              val: () => Object.keys(results).length > 0 ? results : null,
              exists: () => Object.keys(results).length > 0,
            };
          },
        }),
      }),
      push: () => ({
        key: 'usr_' + Math.random().toString(36).substr(2, 9),
      }),
    };
  };

  db = {
    ref: (path) => createMockRef(path),
  };

  admin = {
    database: {
      ServerValue: {
        TIMESTAMP: Date.now(),
      },
    },
    credential: {
      cert: () => ({}),
    },
  };
}

module.exports = { db, admin };
