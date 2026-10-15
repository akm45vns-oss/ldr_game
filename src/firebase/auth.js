import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase.js';

// Human-friendly error translation for neon-fantasy UI
export function formatAuthError(err) {
  if (!err) return "An unexpected error occurred.";
  const code = err.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been temporarily disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password. Please check your credentials.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists. Try signing in.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment before trying again.";
    case "auth/network-request-failed":
      return "Network connection issue. You can continue playing locally!";
    default:
      if (err.message && err.message.includes("Firebase:")) {
        return err.message.replace(/^Firebase:\s*/, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "");
      }
      return err.message || "Authentication failed. Please try again.";
  }
}

// Check if authentication service is ready
export function isAuthReady() {
  return isFirebaseConfigured() && Boolean(auth);
}

// Current logged in user object or null
export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

// Register a new player account with email, password, and optional display name
export function signUp(email, password, displayName = "") {
  if (!isAuthReady()) {
    return Promise.reject(new Error("Firebase is not configured. Playing in local offline mode."));
  }

  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");
  const cleanName = String(displayName || "").trim() || cleanEmail.split("@")[0] || "Hero";

  if (!cleanEmail || !cleanPassword) {
    return Promise.reject(new Error("Email and password are required."));
  }

  return createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword)
    .then(async (userCredential) => {
      const user = userCredential.user;
      try {
        await updateProfile(user, { displayName: cleanName });
      } catch (_) {}

      // Initialize user record in Firestore
      if (db) {
        try {
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
            uid: user.uid,
            email: cleanEmail,
            displayName: cleanName,
            coupleId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[Auth] Could not create Firestore user document:", dbErr.message);
        }
      }

      return user;
    });
}

// Sign in with email and password
export function signIn(email, password) {
  if (!isAuthReady()) {
    return Promise.reject(new Error("Firebase is not configured. Playing in local offline mode."));
  }

  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");

  if (!cleanEmail || !cleanPassword) {
    return Promise.reject(new Error("Email and password are required."));
  }

  return signInWithEmailAndPassword(auth, cleanEmail, cleanPassword)
    .then((userCredential) => userCredential.user);
}

// Sign out current user
export function signOutUser() {
  if (!isAuthReady()) {
    return Promise.resolve();
  }
  return signOut(auth);
}

// Send password reset email
export function resetPassword(email) {
  if (!isAuthReady()) {
    return Promise.reject(new Error("Firebase is not configured."));
  }
  const cleanEmail = String(email || "").trim();
  if (!cleanEmail) {
    return Promise.reject(new Error("Please enter your account email address."));
  }
  return sendPasswordResetEmail(auth, cleanEmail);
}

// Subscribe to authentication state changes
export function onAuthChange(callback) {
  if (!isAuthReady()) {
    // Notify with null user if Firebase is not active
    setTimeout(() => callback(null), 0);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// Fetch user profile from Firestore
export async function getUserProfile(uid) {
  if (!db || !uid) return null;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("[Auth] Failed to load user profile:", err.message);
    return null;
  }
}
