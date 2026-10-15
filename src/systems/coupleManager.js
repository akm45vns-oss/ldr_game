import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, functions, isFirebaseConfigured } from '../firebase/firebase.js';
import { getCurrentUser } from '../firebase/auth.js';

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

  async createCouple() {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to create a couple.");
    if (!functions) throw new Error("Firebase Functions not available.");

    const createFn = httpsCallable(functions, "createCouple");
    const result = await createFn();
    const data = result.data || {};

    if (data.coupleId) {
      this.coupleId = data.coupleId;
      this.listenToCouple(data.coupleId);
      return data;
    }
    throw new Error("Could not create couple record.");
  }

  async createInvite() {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to invite a partner.");
    if (!this.coupleId) throw new Error("Create or join a couple first.");
    if (!functions) throw new Error("Firebase Functions not available.");

    const inviteFn = httpsCallable(functions, "createCoupleInvite");
    const result = await inviteFn();
    const data = result.data || {};

    if (data.inviteCode) {
      this.activeInvite = {
        code: data.inviteCode,
        expiresAt: data.expiresAt
      };
      this.notifyChange();
      return data;
    }
    throw new Error("Could not generate invitation code.");
  }

  async redeemInvite(inviteCode) {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in to join a couple.");
    if (!functions) throw new Error("Firebase Functions not available.");

    const redeemFn = httpsCallable(functions, "redeemCoupleInvite");
    const result = await redeemFn({ inviteCode });
    const data = result.data || {};

    if (data.coupleId) {
      this.coupleId = data.coupleId;
      this.listenToCouple(data.coupleId);
      return data;
    }
    throw new Error("Could not redeem invitation code.");
  }

  async leaveCouple() {
    if (!functions || !this.coupleId) return;
    const leaveFn = httpsCallable(functions, "leaveCouple");
    await leaveFn();
    this.cleanup();
  }
}
