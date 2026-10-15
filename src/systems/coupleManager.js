import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  runTransaction,
  arrayUnion,
  arrayRemove,
  deleteField,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebase.js';
import { getCurrentUser } from '../firebase/auth.js';

// Cryptographically secure invitation code hashing using Web Cryptography API
async function hashInviteCode(code) {
  const normalized = String(code).trim().toUpperCase();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for simple testing environments
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return "hash_" + Math.abs(hash).toString(16);
}

// Generate an unambiguous 8-character code formatted as PH-XXXX-XXXX
function generateSecureCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const array = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 8; i++) array[i] = Math.floor(Math.random() * 256);
  }
  let res = "PH-";
  for (let i = 0; i < 4; i++) res += chars[array[i] % chars.length];
  res += "-";
  for (let i = 4; i < 8; i++) res += chars[array[i] % chars.length];
  return res;
}

export class CoupleManager {
  constructor(app) {
    this.app = app;
    this.coupleId = null;
    this.members = [];
    this.memberProfiles = {};
    this.partnerProfile = null;
    this.isLinked = false;
    this.activeInvite = null;
    this.unsubscribeSnapshot = null;
    this.listeners = new Set();
  }

  getCoupleState() {
    return {
      isLinked: Boolean(this.isLinked),
      coupleId: this.coupleId,
      members: this.members,
      partnerProfile: this.partnerProfile
    };
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyChange() {
    this.listeners.forEach((cb) => {
      try {
        cb(this);
      } catch (e) {
        console.error("[CoupleManager] Listener error:", e);
      }
    });
  }

  async init(user) {
    this.cleanup();
    if (!user || !db) return;

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().coupleId) {
        const cid = userSnap.data().coupleId;
        this.coupleId = cid;
        this.listenToCouple(cid);
      } else {
        this.notifyChange();
      }
    } catch (err) {
      console.warn("[CoupleManager] Init error:", err.message);
    }
  }

  cleanup() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.coupleId = null;
    this.members = [];
    this.memberProfiles = {};
    this.partnerProfile = null;
    this.isLinked = false;
    this.activeInvite = null;
    this.notifyChange();
  }

  listenToCouple(coupleId) {
    if (!db || !coupleId) return;
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }

    const coupleRef = doc(db, "couples", coupleId);
    this.unsubscribeSnapshot = onSnapshot(
      coupleRef,
      (snap) => {
        if (!snap.exists()) {
          this.coupleId = null;
          this.members = [];
          this.partnerProfile = null;
          this.isLinked = false;
          this.notifyChange();
          return;
        }

        const data = snap.data();
        this.coupleId = coupleId;
        this.members = data.members || [];
        this.memberProfiles = data.memberProfiles || {};

        const currentUid = getCurrentUser() ? getCurrentUser().uid : null;
        const partnerUid = this.members.find((m) => m !== currentUid);
        this.partnerProfile = partnerUid && this.memberProfiles[partnerUid] ? this.memberProfiles[partnerUid] : null;

        const previouslyLinked = this.isLinked;
        this.isLinked = this.members.length === 2 && Boolean(this.partnerProfile);

        if (!previouslyLinked && this.isLinked) {
          if (this.app && this.app.showQuestToast) {
            const partnerName = this.partnerProfile.displayName || "Partner";
            this.app.showQuestToast("♥ PARTNER CONNECTED!", `${partnerName} has joined your couple adventure!`);
          }
        }

        this.notifyChange();
      },
      (err) => {
        console.warn("[CoupleManager] Snapshot listen error:", err.message);
      }
    );
  }

  // Create Couple: Works seamlessly on both Free Spark Plan & Blaze Plan
  async createCouple() {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to create a couple.");
    if (!db) throw new Error("Firebase Firestore not available.");

    // Check if user already belongs to an active couple
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().coupleId) {
      const existingCid = userSnap.data().coupleId;
      const coupleSnap = await getDoc(doc(db, "couples", existingCid));
      if (coupleSnap.exists() && (coupleSnap.data().members || []).includes(user.uid)) {
        this.coupleId = existingCid;
        this.listenToCouple(existingCid);
        return { success: true, coupleId: existingCid };
      }
    }

    const coupleId = "c_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
    const coupleRef = doc(db, "couples", coupleId);
    const displayName = user.displayName || (user.email ? user.email.split("@")[0] : "Hero");

    const batch = writeBatch(db);
    batch.set(coupleRef, {
      coupleId: coupleId,
      members: [user.uid],
      memberProfiles: {
        [user.uid]: {
          uid: user.uid,
          email: user.email || "",
          displayName: displayName,
          joinedAt: Date.now()
        }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      activeInvite: null,
      sharedSaveRevision: 1,
      resetGeneration: 1
    });

    batch.set(
      userRef,
      {
        uid: user.uid,
        email: user.email || "",
        displayName: displayName,
        coupleId: coupleId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    await batch.commit();

    this.coupleId = coupleId;
    this.listenToCouple(coupleId);
    return { success: true, coupleId };
  }

  // Create Invitation Code: Generates secure alphanumeric code & stores SHA-256 hash
  async createInvite() {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to invite a partner.");
    if (!this.coupleId) throw new Error("Create or join a couple first.");
    if (!db) throw new Error("Firebase Firestore not available.");

    const rawCode = generateSecureCode();
    const inviteHash = await hashInviteCode(rawCode);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const inviteRef = doc(db, "invites", inviteHash);
    const coupleRef = doc(db, "couples", this.coupleId);

    const batch = writeBatch(db);
    batch.set(inviteRef, {
      hash: inviteHash,
      coupleId: this.coupleId,
      createdBy: user.uid,
      expiresAt: expiresAt,
      redeemed: false,
      createdAt: serverTimestamp()
    });

    batch.update(coupleRef, {
      activeInvite: {
        codeSnippet: rawCode.slice(-4),
        expiresAt: expiresAt,
        createdAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    this.activeInvite = {
      code: rawCode,
      expiresAt: expiresAt
    };
    this.notifyChange();

    return {
      success: true,
      inviteCode: rawCode,
      expiresAt: expiresAt
    };
  }

  // Redeem Invitation Code: Atomically checks single-use and joins couple via Firestore Transaction
  async redeemInvite(rawCode) {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to join a couple.");
    if (!db) throw new Error("Firebase Firestore not available.");

    const cleanCode = String(rawCode || "").trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 6) {
      throw new Error("Please enter a valid invitation code.");
    }

    const inviteHash = await hashInviteCode(cleanCode);
    const inviteRef = doc(db, "invites", inviteHash);
    const userRef = doc(db, "users", user.uid);
    const displayName = user.displayName || (user.email ? user.email.split("@")[0] : "Partner");

    return runTransaction(db, async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error("Invalid invitation code. Please check and try again.");
      }

      const inviteData = inviteSnap.data();
      if (inviteData.redeemed) {
        throw new Error("This invitation code has already been redeemed.");
      }

      if (Date.now() > inviteData.expiresAt) {
        throw new Error("This invitation code has expired. Please ask your partner for a new code.");
      }

      const coupleId = inviteData.coupleId;
      const coupleRef = doc(db, "couples", coupleId);
      const coupleSnap = await transaction.get(coupleRef);

      if (!coupleSnap.exists()) {
        throw new Error("Couple record not found.");
      }

      const coupleData = coupleSnap.data();
      const members = coupleData.members || [];

      if (members.includes(user.uid)) {
        throw new Error("You are already a member of this couple!");
      }

      if (members.length >= 2) {
        throw new Error("This couple already has two connected members.");
      }

      // Atomically mark invite as redeemed
      transaction.update(inviteRef, {
        redeemed: true,
        redeemedBy: user.uid,
        redeemedAt: serverTimestamp()
      });

      // Add user to couple
      transaction.update(coupleRef, {
        members: arrayUnion(user.uid),
        [`memberProfiles.${user.uid}`]: {
          uid: user.uid,
          email: user.email || "",
          displayName: displayName,
          joinedAt: Date.now()
        },
        activeInvite: null,
        updatedAt: serverTimestamp()
      });

      // Update user profile with coupleId
      transaction.set(
        userRef,
        {
          uid: user.uid,
          email: user.email || "",
          displayName: displayName,
          coupleId: coupleId,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      return { success: true, coupleId };
    }).then((res) => {
      this.coupleId = res.coupleId;
      this.listenToCouple(res.coupleId);
      return res;
    });
  }

  // Unlink Couple: Leaves current couple safely
  async leaveCouple() {
    const user = getCurrentUser();
    if (!user || !this.coupleId || !db) return;

    const coupleRef = doc(db, "couples", this.coupleId);
    const userRef = doc(db, "users", user.uid);

    await runTransaction(db, async (transaction) => {
      const coupleSnap = await transaction.get(coupleRef);
      if (coupleSnap.exists()) {
        transaction.update(coupleRef, {
          members: arrayRemove(user.uid),
          [`memberProfiles.${user.uid}`]: deleteField(),
          updatedAt: serverTimestamp()
        });
      }
      transaction.update(userRef, {
        coupleId: null,
        updatedAt: serverTimestamp()
      });
    });

    this.cleanup();
  }
}
