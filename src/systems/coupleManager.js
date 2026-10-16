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

export const ONLINE_COUPLE_STATUS = {
  LOADING: "loading",
  UNAUTHENTICATED: "unauthenticated",
  AUTHENTICATED_UNLINKED: "authenticated_unlinked",
  AUTHENTICATED_LINKED: "authenticated_linked",
  OFFLINE: "offline",
  ERROR: "error"
};

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

    // Explicit typed status lifecycle for Milestone 5.1
    this.currentUser = getCurrentUser() || null;
    this.onlineStatus = this.currentUser ? ONLINE_COUPLE_STATUS.LOADING : ONLINE_COUPLE_STATUS.UNAUTHENTICATED;
    this.statusMessage = this.currentUser
      ? "Checking online couple status..."
      : "🔒 Login or Link Couple Required to Play Online";
    this.statusRequestId = 0;
  }

  getCoupleState() {
    return {
      isLinked: Boolean(this.isLinked),
      coupleId: this.coupleId,
      members: this.members,
      partnerProfile: this.partnerProfile,
      onlineStatus: this.onlineStatus,
      statusMessage: this.statusMessage
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
    const requestId = ++this.statusRequestId;
    this.cleanup(false); // Clean previous couple without triggering redundant notify

    this.currentUser = user || null;

    // 1. Immediately resolve unauthenticated state when user is null (no network delay)
    if (!user) {
      this.onlineStatus = ONLINE_COUPLE_STATUS.UNAUTHENTICATED;
      this.statusMessage = "🔒 Login or Link Couple Required to Play Online";
      this.notifyChange();
      return;
    }

    // 2. Immediate offline check
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.onlineStatus = ONLINE_COUPLE_STATUS.OFFLINE;
      this.statusMessage = "📡 Network offline: Solo Adventure ready";
      this.notifyChange();
      return;
    }

    // 3. Database configuration check
    if (!db) {
      this.onlineStatus = ONLINE_COUPLE_STATUS.OFFLINE;
      this.statusMessage = "🔒 Local offline mode (Database inactive)";
      this.notifyChange();
      return;
    }

    // 4. Set loading with a bounded timeout
    this.onlineStatus = ONLINE_COUPLE_STATUS.LOADING;
    this.statusMessage = "Checking online couple status...";
    this.notifyChange();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("status_timeout")), 4000)
      );

      const fetchPromise = (async () => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        return userSnap;
      })();

      const userSnap = await Promise.race([fetchPromise, timeoutPromise]);

      // Guard against race conditions where another auth change occurred while awaiting
      if (this.statusRequestId !== requestId) return;

      if (userSnap && userSnap.exists() && userSnap.data().coupleId) {
        const cid = userSnap.data().coupleId;
        this.coupleId = cid;
        this.onlineStatus = ONLINE_COUPLE_STATUS.AUTHENTICATED_LINKED;
        this.statusMessage = `✓ Linked with partner in couple ${cid}! Ready for Co-Op.`;
        this.listenToCouple(cid);
      } else {
        this.onlineStatus = ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED;
        this.statusMessage = "⚠️ Account signed in. Link with your partner to start Co-Op!";
      }
    } catch (err) {
      if (this.statusRequestId !== requestId) return;
      console.warn("[CoupleManager] Init error:", err.message);

      if (err.message === "status_timeout" || (typeof navigator !== "undefined" && !navigator.onLine)) {
        this.onlineStatus = ONLINE_COUPLE_STATUS.OFFLINE;
        this.statusMessage = "📡 Network connection slow or offline. Solo Adventure ready.";
      } else {
        this.onlineStatus = ONLINE_COUPLE_STATUS.ERROR;
        this.statusMessage = "⚠️ Online couple service unavailable. Please retry.";
      }
    }

    this.notifyChange();
  }

  cleanup(notify = true) {
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
    this.onlineStatus = this.currentUser ? ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED : ONLINE_COUPLE_STATUS.UNAUTHENTICATED;
    this.statusMessage = this.currentUser
      ? "⚠️ Account signed in. Link with your partner to start Co-Op!"
      : "🔒 Login or Link Couple Required to Play Online";
    if (notify) {
      this.notifyChange();
    }
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
          this.onlineStatus = ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED;
          this.statusMessage = "⚠️ Couple pairing revoked or dissolved. Link partner to resume.";
          this.notifyChange();
          return;
        }

        const data = snap.data();
        this.coupleId = coupleId;
        this.members = data.members || [];
        this.memberProfiles = data.memberProfiles || {};

        const currentUid = this.currentUser ? this.currentUser.uid : (getCurrentUser() ? getCurrentUser().uid : null);
        const partnerUid = this.members.find((m) => m !== currentUid);
        this.partnerProfile = partnerUid && this.memberProfiles[partnerUid] ? this.memberProfiles[partnerUid] : null;

        const previouslyLinked = this.isLinked;
        this.isLinked = this.members.length === 2 && Boolean(this.partnerProfile);

        if (this.isLinked) {
          this.onlineStatus = ONLINE_COUPLE_STATUS.AUTHENTICATED_LINKED;
          const partnerName = this.partnerProfile.displayName || "Partner";
          this.statusMessage = `✓ Linked with partner in couple ${coupleId}! Ready for Co-Op.`;
        } else {
          this.onlineStatus = ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED;
          this.statusMessage = "⚠️ Waiting for partner to accept invite...";
        }

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
        this.onlineStatus = ONLINE_COUPLE_STATUS.ERROR;
        this.statusMessage = "⚠️ Couple connection lost. Solo mode available.";
        this.notifyChange();
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
