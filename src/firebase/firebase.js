import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Retrieve Vite environment variables
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || ""
};

let app = null;
let auth = null;
let db = null;
let functions = null;
let isConfigured = false;
let emulatorConnected = false;

// Determine if required Firebase configuration keys are present
export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.trim().length > 5 &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId.trim().length > 2
  );
}

// Initialize Firebase services with safe fallback for local/offline play
export function initFirebase() {
  if (app) {
    return { app, auth, db, functions, isConfigured };
  }

  if (!isFirebaseConfigured()) {
    isConfigured = false;
    return { app: null, auth: null, db: null, functions: null, isConfigured: false };
  }

  try {
    const existingApps = getApps();
    app = existingApps.length > 0 ? existingApps[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
    isConfigured = true;

    // Optional Emulator Suite integration
    const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true' || env.VITE_USE_FIREBASE_EMULATORS === true;
    if (useEmulators && !emulatorConnected) {
      const authHost = env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
      const firestoreHost = env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
      const firestorePort = parseInt(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080', 10);
      const functionsHost = env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1';
      const functionsPort = parseInt(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || '5001', 10);

      try {
        connectAuthEmulator(auth, authHost, { disableWarnings: true });
        connectFirestoreEmulator(db, firestoreHost, firestorePort);
        connectFunctionsEmulator(functions, functionsHost, functionsPort);
        emulatorConnected = true;
        console.log('[Pixel Hearts Firebase] Connected to Local Firebase Emulator Suite');
      } catch (emuErr) {
        console.warn('[Pixel Hearts Firebase] Emulator connection warning:', emuErr.message);
      }
    }
  } catch (err) {
    console.error('[Pixel Hearts Firebase] Initialization error:', err);
    isConfigured = false;
  }

  return { app, auth, db, functions, isConfigured };
}

// Export pre-initialized references (or null if unconfigured)
const services = initFirebase();
export { auth, db, functions };
export default app;
