/**
 * Pixel Hearts — Milestone 5.1 QA Verification Suite:
 * Production Status Machine, Continue Journey State, Build Identification & Resilience
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ONLINE_COUPLE_STATUS, CoupleManager } from '../src/systems/coupleManager.js';
import { SaveManager } from '../src/systems/save.js';
import { SAVE_STORAGE_KEY } from '../src/core/constants.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName} ${details ? "(" + details + ")" : ""}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName} ${details ? "(" + details + ")" : ""}`);
  }
}

console.log("\n================================================================");
console.log("  PIXEL HEARTS — MILESTONE 5.1 QA VERIFICATION SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// SECTION 1: Online Couple Status State Machine
// -----------------------------------------------------------------------------
console.log("--- 1. Online Couple Status State Machine ---");

assert(ONLINE_COUPLE_STATUS.LOADING === "loading", "Status: loading defined");
assert(ONLINE_COUPLE_STATUS.UNAUTHENTICATED === "unauthenticated", "Status: unauthenticated defined");
assert(ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED === "authenticated_unlinked", "Status: authenticated_unlinked defined");
assert(ONLINE_COUPLE_STATUS.AUTHENTICATED_LINKED === "authenticated_linked", "Status: authenticated_linked defined");
assert(ONLINE_COUPLE_STATUS.OFFLINE === "offline", "Status: offline defined");
assert(ONLINE_COUPLE_STATUS.ERROR === "error", "Status: error defined");

// Test initial state without user
const mockApp = { showQuestToast: () => {} };
const cm = new CoupleManager(mockApp);
assert(
  cm.onlineStatus === ONLINE_COUPLE_STATUS.UNAUTHENTICATED,
  "Initial status without user is immediately unauthenticated (no frozen loading)",
  cm.onlineStatus
);

// Simulate immediate resolution when no user is signed in
cm.init(null);
assert(cm.onlineStatus === ONLINE_COUPLE_STATUS.UNAUTHENTICATED, "Resolves immediately to unauthenticated when user is null", cm.onlineStatus);
assert(cm.statusMessage.includes("Login or Link"), "Status message prompts login/link", cm.statusMessage);

// Test cleanup resets status correctly
cm.cleanup();
assert(cm.onlineStatus === ONLINE_COUPLE_STATUS.UNAUTHENTICATED, "Cleanup maintains unauthenticated when no user", cm.onlineStatus);

// Test offline handling
const originalOnLine = global.navigator ? global.navigator.onLine : true;
try {
  Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });
} catch (_) {}
cm.init({ uid: "user_test_123" });
assert(cm.onlineStatus === ONLINE_COUPLE_STATUS.OFFLINE, "Resolves immediately to offline when navigator.onLine is false", cm.onlineStatus);
assert(cm.statusMessage.includes("offline"), "Status message reflects offline mode", cm.statusMessage);
try {
  Object.defineProperty(global.navigator, 'onLine', { value: originalOnLine, configurable: true });
} catch (_) {}

// -----------------------------------------------------------------------------
// SECTION 2: Request ID & Race Condition Guard & Listener Cleanup
// -----------------------------------------------------------------------------
console.log("\n--- 2. Request ID, Race Conditions & Listener Lifecycle ---");
const cmRace = new CoupleManager(mockApp);
const req1 = ++cmRace.statusRequestId;
cmRace.init(null);
assert(cmRace.statusRequestId > req1, "init increments statusRequestId to invalidate stale in-flight promises");
assert(cmRace.onlineStatus === ONLINE_COUPLE_STATUS.UNAUTHENTICATED, "Current status reflects latest auth state");

// Test listener registration and cleanup
let listenerFired = 0;
const unsubscribe = cmRace.onChange(() => {
  listenerFired++;
});
cmRace.notifyChange();
assert(listenerFired === 1, "onChange listener fires when notifyChange is called");
unsubscribe();
cmRace.notifyChange();
assert(listenerFired === 1, "Unsubscribed listener is cleanly removed and does not fire");

// -----------------------------------------------------------------------------
// SECTION 3: Continue Journey Save Button & Profile Audit
// -----------------------------------------------------------------------------
console.log("\n--- 3. Continue Journey Save Button & Profile Audit ---");
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};
global.window = global;

// 1. In a truly empty profile:
localStorage.clear();
assert(SaveManager.hasValidSave() === false, "Empty storage profile has NO valid save");
const emptySummary = SaveManager.getSaveSummary();
assert(emptySummary.exists === false, "Empty storage summary returns exists: false");

// 2. Corrupt save in storage:
localStorage.setItem(SAVE_STORAGE_KEY, "{ invalid json corrupt content !!!");
assert(SaveManager.hasValidSave() === false, "Corrupted JSON does not crash and returns false");
assert(localStorage.getItem(SAVE_STORAGE_KEY) !== null, "Corrupted save is preserved and not silently deleted");

// 3. Valid save in storage:
const validPayload = {
  version: 2,
  playerName: "Bhoot",
  partnerName: "Kida",
  selectedCharacter: "male",
  playerPos: { x: 300, y: 220 },
  collectedIds: ["c1", "c2", "c3"],
  unlockedMemories: ["mem_1"],
  worldState: { bridgeUnlockedPermanently: false, shrineLit: false },
  missions: []
};
localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(validPayload));
assert(SaveManager.hasValidSave() === true, "Valid save recognized by hasValidSave()");
const validSummary = SaveManager.getSaveSummary();
assert(validSummary.exists === true, "Valid summary returns exists: true");
assert(validSummary.crystals === 3, "Summary accurately counts 3 crystals", `${validSummary.crystals}/8`);

// 4. Starting a new game from empty profile
localStorage.clear();
const mockGame = {
  ayush: { x: 0, y: 0, vx: 0, vy: 0, facing: 1, onGround: true },
  partner: { x: 0, y: 0, vx: 0, vy: 0, facing: 1, onGround: true, visible: true },
  world: {
    collectibles: [
      { id: "c1", collected: false },
      { id: "c2", collected: false }
    ],
    bridgeUnlockedPermanently: false,
    shrineLit: false
  },
  missionManager: {
    missions: [
      { id: "m1", status: "active", progress: 0 }
    ],
    serialize: () => []
  },
  questItems: new Set(),
  unlockedMemories: new Set(),
  memories: [],
  storyFlags: {},
  scrapbookPhotos: [],
  companionHoldMode: false,
  playerName: "Bhoot",
  partnerName: "Kida",
  selectedCharacter: "male"
};
SaveManager.saveGame(mockGame);
assert(SaveManager.hasValidSave() === true, "New game initialization writes a valid schema v2 save payload");

// -----------------------------------------------------------------------------
// SECTION 4: Build Identifier, Service Worker & DOM Verification
// -----------------------------------------------------------------------------
console.log("\n--- 4. Build Identifier, Service Worker & DOM Verification ---");
const __dirname_mod = path.dirname(fileURLToPath(import.meta.url));
const htmlContent = fs.readFileSync(path.join(__dirname_mod, '..', 'index.html'), 'utf-8');
const titleScreenContent = fs.readFileSync(path.join(__dirname_mod, '..', 'src', 'ui', 'titleScreen.js'), 'utf-8');
const styleContent = fs.readFileSync(path.join(__dirname_mod, '..', 'src', 'style.css'), 'utf-8');
const viteContent = fs.readFileSync(path.join(__dirname_mod, '..', 'vite.config.js'), 'utf-8');
const swContent = fs.readFileSync(path.join(__dirname_mod, '..', 'sw.js'), 'utf-8');

assert(htmlContent.includes('id="title-build-badge"'), "index.html defines title-build-badge element");
assert(htmlContent.includes('id="btn-mode-retry-status"'), "index.html defines btn-mode-retry-status button");
assert(viteContent.includes('__APP_VERSION__') && viteContent.includes('__BUILD_COMMIT__'), "vite.config.js injects __APP_VERSION__ and __BUILD_COMMIT__ defines");
assert(titleScreenContent.includes('title-build-badge'), "titleScreen.js populates build badge from build definitions");
assert(styleContent.includes('.btn-title-continue.disabled') || styleContent.includes('.btn-title-continue:disabled'), "style.css defines explicit disabled styling for continue button");
assert(titleScreenContent.includes('btn-mode-retry-status'), "titleScreen.js binds retry status button handler");
assert(swContent.includes('request.mode === "navigate"'), "sw.js uses Network-First for HTML navigation to prevent stale chunks");
assert(swContent.includes('BYPASS_HOST_KEYWORDS'), "sw.js bypasses Firebase Auth/RTDB/Firestore network calls");

// -----------------------------------------------------------------------------
// Final Results
// -----------------------------------------------------------------------------
console.log("\n================================================================");
console.log(`  MILESTONE 5.1 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log("================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
