// ============================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ============================================

// Firebase configuration - UPDATE THESE VALUES
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForDemoPurpose123456",
  authDomain: "inventory-management-system.firebaseapp.com",
  projectId: "inventory-management-system",
  storageBucket: "inventory-management-system.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789jkl",
  measurementId: "G-ABC123DEF4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Services
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Enable offline persistence for Firestore
db.enablePersistence({ synchronizeTabs: true })
  .then(() => {
    console.log("✅ Offline persistence enabled successfully");
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("⚠️ Multiple tabs open, persistence disabled");
    } else if (err.code === 'unimplemented') {
      console.warn("⚠️ Browser doesn't support offline persistence");
    }
  });

// Firestore Settings for better performance
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  merge: true
});

// Export instances globally
window.db = db;
window.storage = storage;
window.auth = auth;

// Test Firebase Connection
async function testFirebaseConnection() {
  try {
    await db.collection('_test_connection').doc('test').set({
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Firebase connected successfully");
  } catch (error) {
    console.error("❌ Firebase connection failed:", error);
  }
}

testFirebaseConnection();