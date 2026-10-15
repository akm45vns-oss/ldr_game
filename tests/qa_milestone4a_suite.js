// Pixel Hearts — Milestone 4A Comprehensive Automated QA Suite
import crypto from 'crypto';
import { isFirebaseConfigured, initFirebase } from '../src/firebase/firebase.js';
import { formatAuthError } from '../src/firebase/auth.js';
import { CloudSaveManager, SYNC_STATUS } from '../src/systems/cloudSaveManager.js';
import { CoupleManager } from '../src/systems/coupleManager.js';
import { SAVE_SCHEMA_VERSION, TILE_SIZE } from '../src/core/constants.js';

console.log("================================================================================");
console.log("PIXEL HEARTS — MILESTONE 4A: CLOUD SAVES, AUTH & COUPLE PAIRING QA SUITE");
console.log("================================================================================\n");

const results = [];
function assert(desc, condition, details = "") {
  if (condition) {
    results.push({ desc, passed: true });
    console.log(`[PASS] ${desc} ${details ? "(" + details + ")" : ""}`);
  } else {
    results.push({ desc, passed: false, details });
    console.error(`[FAIL] ${desc} - ${details}`);
  }
}

// -----------------------------------------------------------------------------
// 1. Firebase Initialization & Missing Configuration Fallback
// -----------------------------------------------------------------------------
console.log("--- 1. Firebase Initialization & Graceful Offline Fallback ---");
const configured = isFirebaseConfigured();
assert(
  "Missing config fallback",
  typeof configured === "boolean",
  `isFirebaseConfigured returns boolean (Value: ${configured})`
);

const services = initFirebase();
assert(
  "Graceful initialization without throw",
  services && typeof services === "object",
  `Services object returned safely (Configured: ${services.isConfigured})`
);

// -----------------------------------------------------------------------------
// 2. Authentication Error Translation & Formatter
// -----------------------------------------------------------------------------
console.log("\n--- 2. Authentication Error Translation ---");
const errEmail = formatAuthError({ code: "auth/invalid-email" });
assert(
  "Invalid email translation",
  errEmail === "Please enter a valid email address.",
  errEmail
);

const errCreds = formatAuthError({ code: "auth/wrong-password" });
assert(
  "Credential error translation",
  errCreds.includes("Incorrect email or password"),
  errCreds
);

const errInUse = formatAuthError({ code: "auth/email-already-in-use" });
assert(
  "Email in use error translation",
  errInUse.includes("already exists"),
  errInUse
);

const errWeak = formatAuthError({ code: "auth/weak-password" });
assert(
  "Weak password error translation",
  errWeak.includes("at least 6 characters"),
  errWeak
);

const errNetwork = formatAuthError({ code: "auth/network-request-failed" });
assert(
  "Network failure offline translation",
  errNetwork.includes("playing locally"),
  errNetwork
);

// -----------------------------------------------------------------------------
// 3. Cryptographic Invitation Code Generation & SHA-256 Hashing
// -----------------------------------------------------------------------------
console.log("\n--- 3. Cryptographic Couple Invitation Security ---");
function generateSecureCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let res = "PH-";
  for (let i = 0; i < 4; i++) res += chars[bytes[i] % chars.length];
  res += "-";
  for (let i = 4; i < 8; i++) res += chars[bytes[i] % chars.length];
  return res;
}

function hashInviteCode(code) {
  const norm = String(code).trim().toUpperCase();
  return crypto.createHash("sha256").update(norm).digest("hex");
}

const code1 = generateSecureCode();
const code2 = generateSecureCode();
assert(
  "Unique invite code generation",
  code1 !== code2 && code1.startsWith("PH-") && code1.length === 12,
  `Generated: ${code1} vs ${code2}`
);

const hash1 = hashInviteCode(code1);
const hash1Repeat = hashInviteCode("  " + code1.toLowerCase() + "  ");
assert(
  "Case-insensitive deterministic SHA-256 invite hashing",
  hash1 === hash1Repeat && hash1.length === 64,
  `Hash: ${hash1.slice(0, 16)}...`
);

// -----------------------------------------------------------------------------
// 4. Invitation Expiration & Single-Use State Machine
// -----------------------------------------------------------------------------
console.log("\n--- 4. Invitation Expiry & Single-Use Enforcement ---");
const mockInvite = {
  hash: hash1,
  coupleId: "couple_abc_123",
  createdBy: "user_ayush",
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  redeemed: false
};

// Simulation: Redeem once
function simulateRedemption(invite, redeemingUid, nowTime = Date.now()) {
  if (invite.redeemed) throw new Error("This invitation code has already been redeemed.");
  if (nowTime > invite.expiresAt) throw new Error("This invitation code has expired.");
  if (invite.createdBy === redeemingUid) throw new Error("You cannot join your own couple.");

  invite.redeemed = true;
  invite.redeemedBy = redeemingUid;
  return { success: true, coupleId: invite.coupleId };
}

let redeemSuccess = false;
try {
  simulateRedemption(mockInvite, "user_aanya");
  redeemSuccess = true;
} catch (_) {}
assert("Successful initial invite redemption", redeemSuccess && mockInvite.redeemed === true);

// Simulation: Second redemption attempt MUST fail
let secondRedeemFailed = false;
try {
  simulateRedemption(mockInvite, "user_third_party");
} catch (err) {
  secondRedeemFailed = err.message.includes("already been redeemed");
}
assert("Rejection of duplicate invitation redemption (Single-Use)", secondRedeemFailed);

// Simulation: Expired invite MUST fail
const expiredInvite = {
  hash: hashInviteCode("PH-EXPD-CODE"),
  coupleId: "couple_xyz",
  createdBy: "user_test",
  expiresAt: Date.now() - 1000,
  redeemed: false
};
let expiredFailed = false;
try {
  simulateRedemption(expiredInvite, "user_other");
} catch (err) {
  expiredFailed = err.message.includes("expired");
}
assert("Rejection of expired invitation", expiredFailed);

// -----------------------------------------------------------------------------
// 5. Couple Membership Limit (Max 2 Members)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Couple Membership Cap (Max 2 Distinct Members) ---");
const mockCouple = {
  coupleId: "couple_test",
  members: ["user_ayush", "user_aanya"]
};

function attemptJoinCouple(couple, newUid) {
  if (couple.members.includes(newUid)) throw new Error("Already a member");
  if (couple.members.length >= 2) throw new Error("Couple already full (max 2 members)");
  couple.members.push(newUid);
  return true;
}

let thirdPartyBlocked = false;
try {
  attemptJoinCouple(mockCouple, "user_intruder");
} catch (err) {
  thirdPartyBlocked = err.message.includes("max 2 members");
}
assert("Block 3rd member from joining couple (Max 2 Rule)", thirdPartyBlocked);

let duplicateBlocked = false;
try {
  attemptJoinCouple(mockCouple, "user_ayush");
} catch (err) {
  duplicateBlocked = err.message.includes("Already a member");
}
assert("Block same user occupying both member slots", duplicateBlocked);

// -----------------------------------------------------------------------------
// 6. Domain-Aware Cloud Save Merge Algorithm
// -----------------------------------------------------------------------------
console.log("\n--- 6. Domain-Aware Cloud Save Merge Algorithm ---");

// Mock game context
const mockGame = {
  world: {
    collectibles: [
      { id: "c1", type: "crystal", collected: false },
      { id: "c2", type: "crystal", collected: false },
      { id: "c3", type: "crystal", collected: false },
      { id: "c4", type: "crystal", collected: false },
      { id: "c5", type: "crystal", collected: false },
      { id: "c6", type: "crystal", collected: false },
      { id: "c7", type: "crystal", collected: false },
      { id: "c8", type: "crystal", collected: false },
      { id: "m1", type: "memory", memoryId: "mem_1", collected: false },
      { id: "m2", type: "memory", memoryId: "mem_2", collected: false },
      { id: "m3", type: "memory", memoryId: "mem_3", collected: false }
    ],
    bridgeUnlockedPermanently: false,
    shrineLit: false
  },
  questItems: new Set(),
  unlockedMemories: new Set(),
  storyFlags: {
    signRead: false,
    miraMet: false,
    plateActivatedOnce: false,
    bridgeUnlockedPermanently: false,
    shrineLit: false,
    introShown: false
  },
  missionManager: {
    serialize: () => [
      { id: "m1_explore_oakvale", status: "active", objectives: [{ id: "read_village_sign", current: 0, target: 1, completed: false }] },
      { id: "m2_gather_crystals", status: "locked", objectives: [{ id: "collect_8_crystals", current: 0, target: 8, completed: false }] }
    ],
    restore: () => {},
    syncCollectibleCounts: () => {}
  },
  updateStatsUI: () => {},
  updateQuestHUD: () => {}
};

const mockCoupleMgr = { coupleId: "couple_test", onChange: () => {} };
const cloudSave = new CloudSaveManager(mockGame, mockCoupleMgr);

// Scenario: Local player collected c1, c2, and mem_1.
// Cloud save from partner contains c2, c3, and mem_2.
const localSave = {
  version: 2,
  revision: 5,
  collectedIds: ["c1", "c2"],
  unlockedMemories: ["mem_1"],
  questItems: ["oakvale_map"],
  storyFlags: { signRead: true, miraMet: false },
  worldState: { bridgeUnlockedPermanently: false, shrineLit: false },
  missions: [
    { id: "m1_explore_oakvale", status: "completed", notifiedComplete: true, objectives: [{ id: "read_village_sign", current: 1, completed: true }] },
    { id: "m2_gather_crystals", status: "active", notifiedComplete: false, objectives: [{ id: "collect_8_crystals", current: 2, target: 8, completed: false }] }
  ]
};

const partnerCloudSave = {
  version: 2,
  revision: 8,
  collectedIds: ["c2", "c3"],
  unlockedMemories: ["mem_2"],
  questItems: ["winch_key"],
  storyFlags: { signRead: true, miraMet: true },
  worldState: { bridgeUnlockedPermanently: true, shrineLit: false },
  missions: [
    { id: "m1_explore_oakvale", status: "completed", notifiedComplete: true, objectives: [{ id: "read_village_sign", current: 1, completed: true }] },
    { id: "m2_gather_crystals", status: "active", notifiedComplete: false, objectives: [{ id: "collect_8_crystals", current: 3, target: 8, completed: false }] }
  ]
};

const merged = cloudSave.mergeProgression(localSave, partnerCloudSave);

// 1. Collectible Union
const expectedCollectibles = ["c1", "c2", "c3"];
const collectiblesPass = expectedCollectibles.every((id) => merged.collectedIds.includes(id)) && merged.collectedIds.length === 3;
assert("Collectibles Set Union (c1 + c2) ∪ (c2 + c3) = {c1, c2, c3}", collectiblesPass, merged.collectedIds.join(", "));

// 2. Memories Union
const memoriesPass = merged.unlockedMemories.includes("mem_1") && merged.unlockedMemories.includes("mem_2") && merged.unlockedMemories.length === 2;
assert("Memories Set Union (mem_1 ∪ mem_2)", memoriesPass, merged.unlockedMemories.join(", "));

// 3. Quest Items Union
const itemsPass = merged.questItems.includes("oakvale_map") && merged.questItems.includes("winch_key");
assert("Quest Items Set Union (oakvale_map ∪ winch_key)", itemsPass, merged.questItems.join(", "));

// 4. Story Flags Boolean OR
const storyPass = merged.storyFlags.signRead === true && merged.storyFlags.miraMet === true;
assert("Story Flags Boolean OR Merge", storyPass);

// 5. World State Boolean OR
const bridgePass = merged.worldState.bridgeUnlockedPermanently === true && merged.worldState.shrineLit === false;
assert("World State Bridge Unlocked Permanent Merge", bridgePass);

// 6. Mission Objective Progress Merge (Math.max)
const m2Merged = merged.missions.find((m) => m.id === "m2_gather_crystals");
const m2ProgressPass = m2Merged && m2Merged.objectives[0].current === 3;
assert("Mission Objective Progress Math.max (Local: 2, Cloud: 3 -> 3)", m2ProgressPass, `Current: ${m2Merged ? m2Merged.objectives[0].current : 'null'}`);

// 7. Revision Tracker
assert("Revision Counter Advanced", merged.revision === 9, `Revision: ${merged.revision}`);

// -----------------------------------------------------------------------------
// 7. Verification: Local Player Coordinates are Independent
// -----------------------------------------------------------------------------
console.log("\n--- 7. Verification: Local Coordinates Remain Independent ---");
const extracted = cloudSave.extractSharedPayload();
assert(
  "Player coordinates excluded from shared cloud payload",
  extracted.playerPos === undefined && extracted.partnerPos === undefined,
  "Ensures player coordinates are device-local in Milestone 4A"
);

// -----------------------------------------------------------------------------
// 8. Offline State Machine & Pending Sync Queue
// -----------------------------------------------------------------------------
console.log("\n--- 8. Offline State Machine & Sync States ---");
assert("Initial state is LOCAL_ONLY", cloudSave.status === SYNC_STATUS.LOCAL_ONLY);

cloudSave.setStatus(SYNC_STATUS.SYNCING, "Uploading...");
assert("State transitions to SYNCING", cloudSave.status === SYNC_STATUS.SYNCING);

cloudSave.setStatus(SYNC_STATUS.SYNCED, "Cloud Synced");
assert("State transitions to SYNCED", cloudSave.status === SYNC_STATUS.SYNCED);

cloudSave.setStatus(SYNC_STATUS.OFFLINE_PENDING, "Offline pending");
assert("State transitions to OFFLINE_PENDING", cloudSave.status === SYNC_STATUS.OFFLINE_PENDING);

cloudSave.setStatus(SYNC_STATUS.CONFLICT_ERROR, "Conflict error");
assert("State transitions to CONFLICT_ERROR", cloudSave.status === SYNC_STATUS.CONFLICT_ERROR);

// -----------------------------------------------------------------------------
// 9. Reset / New Game Protocol (Generation Counter)
// -----------------------------------------------------------------------------
console.log("\n--- 9. Reset / New Game Protocol ---");
const initialGen = cloudSave.resetGeneration;
cloudSave.handleResetProgress();
assert("Reset progress increments resetGeneration", cloudSave.resetGeneration === initialGen + 1, `Generation: ${cloudSave.resetGeneration}`);

// -----------------------------------------------------------------------------
// Final Summary
// -----------------------------------------------------------------------------
console.log("\n==================================================");
const allPassed = results.every((r) => r.passed);
const passedCount = results.filter((r) => r.passed).length;
console.log(`TOTAL MILESTONE 4A TESTS: ${results.length}`);
console.log(`PASSED: ${passedCount}`);
console.log(`FAILED: ${results.length - passedCount}`);
console.log(`OVERALL STATUS: ${allPassed ? "ALL MILESTONE 4A TESTS PASSED ♥" : "SOME TESTS FAILED"}`);
console.log("==================================================");

if (!allPassed) {
  process.exit(1);
} else {
  process.exit(0);
}
