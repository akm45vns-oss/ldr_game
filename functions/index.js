const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// Helper to hash an invitation code with SHA-256
function hashInviteCode(code) {
  const normalized = String(code).trim().toUpperCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// Generate a cryptographically secure 8-character uppercase alphanumeric code
function generateSecureCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous 0/O, 1/I
  const bytes = crypto.randomBytes(8);
  let result = "PH-";
  for (let i = 0; i < 4; i++) {
    result += chars[bytes[i] % chars.length];
  }
  result += "-";
  for (let i = 4; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * createCouple Callable Function
 * Creates a new couple record with caller as Member 1.
 */
exports.createCouple = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to create a couple."
    );
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email || "";
  const displayName = context.auth.token.name || email.split("@")[0] || "Hero";

  // Check if caller already belongs to an active couple
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists && userSnap.data().coupleId) {
    const existingCoupleId = userSnap.data().coupleId;
    const coupleSnap = await db.collection("couples").doc(existingCoupleId).get();
    if (coupleSnap.exists && (coupleSnap.data().members || []).includes(uid)) {
      return { success: true, coupleId: existingCoupleId, alreadyMember: true };
    }
  }

  const coupleId = crypto.randomUUID();
  const coupleRef = db.collection("couples").doc(coupleId);

  const coupleData = {
    coupleId: coupleId,
    members: [uid],
    memberProfiles: {
      [uid]: {
        uid: uid,
        email: email,
        displayName: displayName,
        joinedAt: Date.now()
      }
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    activeInvite: null,
    sharedSaveRevision: 1,
    resetGeneration: 1
  };

  const batch = db.batch();
  batch.set(coupleRef, coupleData);
  batch.set(
    userRef,
    {
      uid: uid,
      email: email,
      displayName: displayName,
      coupleId: coupleId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();

  return { success: true, coupleId: coupleId };
});

/**
 * createCoupleInvite Callable Function
 * Generates an encrypted/hashed invitation code for the couple.
 */
exports.createCoupleInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to generate an invitation."
    );
  }

  const uid = context.auth.uid;

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists || !userSnap.data().coupleId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You must create a couple before generating an invitation."
    );
  }

  const coupleId = userSnap.data().coupleId;
  const coupleRef = db.collection("couples").doc(coupleId);
  const coupleSnap = await coupleRef.get();

  if (!coupleSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Couple record not found.");
  }

  const couple = coupleSnap.data();
  if (!couple.members || !couple.members.includes(uid)) {
    throw new functions.https.HttpsError("permission-denied", "You are not a member of this couple.");
  }

  if (couple.members.length >= 2) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your couple already has 2 members linked!"
    );
  }

  // Generate code and compute hash
  const rawCode = generateSecureCode();
  const inviteHash = hashInviteCode(rawCode);
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours expiry

  const inviteRef = db.collection("invites").doc(inviteHash);

  const batch = db.batch();
  batch.set(inviteRef, {
    hash: inviteHash,
    coupleId: coupleId,
    createdBy: uid,
    expiresAt: expiresAt,
    redeemed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  batch.update(coupleRef, {
    activeInvite: {
      codeSnippet: rawCode.slice(-4),
      expiresAt: expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  return {
    success: true,
    inviteCode: rawCode,
    expiresAt: expiresAt
  };
});

/**
 * redeemCoupleInvite Callable Function
 * Atomically verifies and redeems an invitation code.
 */
exports.redeemCoupleInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to join a couple."
    );
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email || "";
  const displayName = context.auth.token.name || email.split("@")[0] || "Partner";

  const rawCode = (data && data.inviteCode ? String(data.inviteCode) : "").trim().toUpperCase();
  if (!rawCode || rawCode.length < 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please enter a valid invitation code."
    );
  }

  const inviteHash = hashInviteCode(rawCode);
  const inviteRef = db.collection("invites").doc(inviteHash);
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (transaction) => {
    const inviteDoc = await transaction.get(inviteRef);
    if (!inviteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Invalid invitation code. Please check and try again."
      );
    }

    const inviteData = inviteDoc.data();
    if (inviteData.redeemed) {
      throw new functions.https.HttpsError(
        "already-exists",
        "This invitation code has already been redeemed."
      );
    }

    if (Date.now() > inviteData.expiresAt) {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "This invitation code has expired. Please ask your partner to generate a new code."
      );
    }

    const coupleId = inviteData.coupleId;
    const coupleRef = db.collection("couples").doc(coupleId);
    const coupleDoc = await transaction.get(coupleRef);

    if (!coupleDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Couple record no longer exists.");
    }

    const coupleData = coupleDoc.data();
    const members = coupleData.members || [];

    if (members.includes(uid)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "You are already a member of this couple!"
      );
    }

    if (members.length >= 2) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This couple already has two connected members."
      );
    }

    // Atomically execute redemption
    transaction.update(inviteRef, {
      redeemed: true,
      redeemedBy: uid,
      redeemedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    transaction.update(coupleRef, {
      members: admin.firestore.FieldValue.arrayUnion(uid),
      [`memberProfiles.${uid}`]: {
        uid: uid,
        email: email,
        displayName: displayName,
        joinedAt: Date.now()
      },
      activeInvite: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    transaction.set(
      userRef,
      {
        uid: uid,
        email: email,
        displayName: displayName,
        coupleId: coupleId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      success: true,
      coupleId: coupleId,
      partnerUid: members[0] || null
    };
  });
});

/**
 * leaveCouple Callable Function
 * Safely unlinks a player from their couple without deleting shared history.
 */
exports.leaveCouple = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = context.auth.uid;
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists || !userSnap.data().coupleId) {
    return { success: true, unlinked: true };
  }

  const coupleId = userSnap.data().coupleId;
  const coupleRef = db.collection("couples").doc(coupleId);

  await db.runTransaction(async (transaction) => {
    const coupleDoc = await transaction.get(coupleRef);
    if (coupleDoc.exists) {
      transaction.update(coupleRef, {
        members: admin.firestore.FieldValue.arrayRemove(uid),
        [`memberProfiles.${uid}`]: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    transaction.update(userRef, {
      coupleId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

/**
 * syncCoupleToRTDB Trigger Function
 * Authoritatively mirrors Firestore couple membership into Realtime Database
 * at `/rooms/{coupleId}/members` using Admin SDK privileges.
 */
exports.syncCoupleToRTDB = functions.firestore
  .document("couples/{coupleId}")
  .onWrite(async (change, context) => {
    const coupleId = context.params.coupleId;
    try {
      const rtdb = admin.database();
      if (!change.after.exists) {
        await rtdb.ref(`rooms/${coupleId}`).remove();
        return;
      }
      const data = change.after.data();
      const members = data.members || [];
      const membersObj = {};
      members.forEach((uid) => {
        membersObj[uid] = true;
      });
      await rtdb.ref(`rooms/${coupleId}/members`).set(membersObj);
    } catch (err) {
      console.warn(`[syncCoupleToRTDB] Error mirroring room ${coupleId}:`, err.message);
    }
  });

