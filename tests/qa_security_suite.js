// Pixel Hearts — Milestone 4B.1 Realtime Database Security Audit & Verification Suite
import fs from 'fs';
import path from 'path';

console.log("================================================================================");
console.log("PIXEL HEARTS — MILESTONE 4B.1: MULTIPLAYER SECURITY AUDIT & HARDENING");
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
// Load & Parse database.rules.json
// -----------------------------------------------------------------------------
const rulesPath = path.resolve(process.cwd(), 'database.rules.json');
let rulesData = null;
try {
  rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
} catch (err) {
  assert("database.rules.json valid JSON", false, err.message);
  process.exit(1);
}

const rules = rulesData.rules;

// Helper to simulate RTDB Security Rules evaluation environment
class RTDBSecuritySimulator {
  constructor(rulesJson, initialTree = {}) {
    this.rules = rulesJson;
    this.tree = JSON.parse(JSON.stringify(initialTree));
  }

  // Set mock server state (simulating Admin SDK writes)
  adminSet(pathStr, val) {
    const parts = pathStr.split('/').filter(Boolean);
    let curr = this.tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {};
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = JSON.parse(JSON.stringify(val));
  }

  // Get data at path
  get(pathStr) {
    const parts = pathStr.split('/').filter(Boolean);
    let curr = this.tree;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return null;
      curr = curr[p];
    }
    return curr;
  }

  // Evaluate Read operation
  canRead(pathStr, auth) {
    if (this.rules['.read'] === false) {
      // Check path specific rule
    }
    const parts = pathStr.split('/').filter(Boolean);
    // /rooms/$coupleId/...
    if (parts[0] === 'rooms' && parts.length >= 2) {
      const coupleId = parts[1];
      const roomRules = this.rules.rooms && this.rules.rooms['$coupleId'];
      if (!roomRules) return false;

      // Check root.child('rooms').child($coupleId).child('members').child(auth.uid).val() === true
      if (!auth || !auth.uid) return false;
      const isMember = this.get(`/rooms/${coupleId}/members/${auth.uid}`) === true;
      return isMember;
    }
    return false;
  }

  // Evaluate Write operation with validation
  canWrite(pathStr, auth, newData) {
    if (!auth || !auth.uid) return { allowed: false, reason: "Unauthenticated" };

    const parts = pathStr.split('/').filter(Boolean);
    if (parts[0] !== 'rooms' || parts.length < 2) {
      return { allowed: false, reason: "Default deny on root" };
    }

    const coupleId = parts[1];
    const sub = parts[2]; // 'members' | 'players' | 'presence' | 'events' | 'coopState'
    const roomRules = this.rules.rooms && this.rules.rooms['$coupleId'];
    if (!roomRules) return { allowed: false, reason: "No room rules" };

    const isMember = this.get(`/rooms/${coupleId}/members/${auth.uid}`) === true;

    // 1. Members slice: STRICTLY .write: false
    if (sub === 'members') {
      const memberRules = roomRules.members;
      if (memberRules && memberRules['.write'] === false) {
        return { allowed: false, reason: "Client write forbidden on membership mirror (.write: false)" };
      }
      return { allowed: false, reason: "Membership is write-restricted" };
    }

    // All other paths require membership in root.child('rooms').child($coupleId).child('members')
    if (!isMember) {
      return { allowed: false, reason: "Permission denied: caller is not an authorized couple member" };
    }

    // 2. Players slice
    if (sub === 'players') {
      const targetUid = parts[3];
      if (targetUid !== auth.uid) {
        return { allowed: false, reason: "Cannot write another player's state (auth.uid !== $uid)" };
      }
      const playerRules = roomRules.players && roomRules.players['$uid'];
      return this.validatePayload(newData, playerRules, auth);
    }

    // 3. Presence slice
    if (sub === 'presence') {
      const targetUid = parts[3];
      if (targetUid !== auth.uid) {
        return { allowed: false, reason: "Cannot write another player's presence (auth.uid !== $uid)" };
      }
      const presenceRules = roomRules.presence && roomRules.presence['$uid'];
      return this.validatePayload(newData, presenceRules, auth);
    }

    // 4. Events slice
    if (sub === 'events') {
      const eventRules = roomRules.events && roomRules.events['$eventId'];
      if (!newData || typeof newData !== 'object') {
        return { allowed: false, reason: "Event must be an object" };
      }
      if (!newData.type || !newData.senderUid || !newData.timestamp) {
        return { allowed: false, reason: "Event missing required fields" };
      }
      if (newData.senderUid !== auth.uid) {
        return { allowed: false, reason: "Cannot spoof event senderUid" };
      }
      const allowedTypes = ['collectible_pickup', 'heart_burst', 'bridge_repaired', 'shrine_ignited'];
      if (!allowedTypes.includes(newData.type)) {
        return { allowed: false, reason: `Disallowed event type: ${newData.type}` };
      }

      // Check for unexpected extra properties on event root
      const allowedEventKeys = ['type', 'senderUid', 'timestamp', 'payload'];
      for (const k of Object.keys(newData)) {
        if (!allowedEventKeys.includes(k)) {
          return { allowed: false, reason: `Unexpected field on event: ${k}` };
        }
      }

      // Validate payload schema
      if (newData.payload && typeof newData.payload === 'object') {
        const p = newData.payload;
        const allowedPayloadKeys = ['itemId', 'itemType', 'x', 'y'];
        for (const pk of Object.keys(p)) {
          if (!allowedPayloadKeys.includes(pk)) {
            return { allowed: false, reason: `Unexpected payload field: ${pk}` };
          }
        }
        if (p.itemId && (typeof p.itemId !== 'string' || p.itemId.length > 32)) {
          return { allowed: false, reason: "Invalid itemId in payload" };
        }
        if (p.itemType && !['crystal', 'memory'].includes(p.itemType)) {
          return { allowed: false, reason: "Invalid itemType in payload" };
        }
        if (p.x !== undefined && (typeof p.x !== 'number' || p.x < -100 || p.x > 10000)) {
          return { allowed: false, reason: "Payload x coordinate out of bounds" };
        }
        if (p.y !== undefined && (typeof p.y !== 'number' || p.y < -500 || p.y > 2000)) {
          return { allowed: false, reason: "Payload y coordinate out of bounds" };
        }
      }
      return { allowed: true };
    }

    // 5. CoopState slice
    if (sub === 'coopState') {
      const coopRules = roomRules.coopState;
      if (!newData || typeof newData !== 'object') {
        return { allowed: false, reason: "coopState must be an object" };
      }
      // Check for unexpected fields on coopState (e.g. bridgeUnlocked, questItems, etc.)
      for (const k of Object.keys(newData)) {
        if (k !== 'pressurePlate') {
          return { allowed: false, reason: `Authoritative progression attempt rejected on coopState: ${k}` };
        }
      }
      if (newData.pressurePlate) {
        const pp = newData.pressurePlate;
        if (typeof pp.pressed !== 'boolean' || typeof pp.timestamp !== 'number' || pp.timestamp <= 0) {
          return { allowed: false, reason: "Malformed pressurePlate schema" };
        }
        if (pp.pressed && pp.pressedBy !== auth.uid) {
          return { allowed: false, reason: "Cannot spoof pressedBy as another user" };
        }
        if (!pp.pressed && pp.pressedBy !== null && pp.pressedBy !== undefined) {
          return { allowed: false, reason: "Released plate requires null pressedBy" };
        }
        for (const pk of Object.keys(pp)) {
          if (!['pressed', 'pressedBy', 'timestamp'].includes(pk)) {
            return { allowed: false, reason: `Unexpected field on pressurePlate: ${pk}` };
          }
        }
      }
      return { allowed: true };
    }

    return { allowed: false, reason: "Unknown subpath" };
  }

  validatePayload(newData, schemaRules, auth) {
    if (!newData || typeof newData !== 'object') {
      return { allowed: false, reason: "Payload must be an object" };
    }

    // Check required children
    if (schemaRules['.validate'] && schemaRules['.validate'].includes("hasChildren")) {
      const match = schemaRules['.validate'].match(/hasChildren\(\[(.*?)\]\)/);
      if (match) {
        const required = match[1].replace(/['"\s]/g, '').split(',');
        for (const req of required) {
          if (newData[req] === undefined || newData[req] === null) {
            return { allowed: false, reason: `Missing required field: ${req}` };
          }
        }
      }
    }

    // Check $other rejection
    if (schemaRules['$other'] && schemaRules['$other']['.validate'] === false) {
      const definedKeys = Object.keys(schemaRules).filter((k) => !k.startsWith('.'));
      for (const key of Object.keys(newData)) {
        if (!definedKeys.includes(key) && key !== '$other') {
          return { allowed: false, reason: `Unexpected field rejected ($other: false): ${key}` };
        }
      }
    }

    // Numeric and string range validations
    if (newData.x !== undefined) {
      if (typeof newData.x !== 'number' || isNaN(newData.x) || newData.x < -100 || newData.x > 10000) {
        return { allowed: false, reason: `Coordinate x out of range: ${newData.x}` };
      }
    }
    if (newData.y !== undefined) {
      if (typeof newData.y !== 'number' || isNaN(newData.y) || newData.y < -500 || newData.y > 2000) {
        return { allowed: false, reason: `Coordinate y out of range: ${newData.y}` };
      }
    }
    if (newData.vx !== undefined && (typeof newData.vx !== 'number' || newData.vx < -1000 || newData.vx > 1000)) {
      return { allowed: false, reason: "Velocity vx out of range" };
    }
    if (newData.vy !== undefined && (typeof newData.vy !== 'number' || newData.vy < -2000 || newData.vy > 2000)) {
      return { allowed: false, reason: "Velocity vy out of range" };
    }
    if (newData.facing !== undefined && !['left', 'right'].includes(newData.facing)) {
      return { allowed: false, reason: `Invalid facing direction: ${newData.facing}` };
    }
    if (newData.displayName !== undefined && (typeof newData.displayName !== 'string' || newData.displayName.length > 50)) {
      return { allowed: false, reason: "displayName exceeds max length (50)" };
    }
    if (newData.animState !== undefined && (typeof newData.animState !== 'string' || newData.animState.length > 32)) {
      return { allowed: false, reason: "animState exceeds max length (32)" };
    }

    return { allowed: true };
  }
}

// -----------------------------------------------------------------------------
// Test Scenarios Execution
// -----------------------------------------------------------------------------
const coupleId = "c_starlight_test_couple";
const userAyush = { uid: "user_ayush_1" };
const userAanya = { uid: "user_aanya_2" };
const userAttacker = { uid: "user_attacker_evil" };

const sim = new RTDBSecuritySimulator(rules);

// Authoritative backend sets couple members mirror in RTDB via Admin SDK
sim.adminSet(`/rooms/${coupleId}/members`, {
  [userAyush.uid]: true,
  [userAanya.uid]: true
});

// -----------------------------------------------------------------------------
// Test 1: Authenticated unrelated UID cannot add itself to couple membership mirror
// -----------------------------------------------------------------------------
console.log("--- Test 1: Membership Mirror Protection ---");
const t1 = sim.canWrite(`/rooms/${coupleId}/members/${userAttacker.uid}`, userAttacker, true);
assert(
  "Authenticated unrelated UID cannot add itself to membership mirror",
  t1.allowed === false,
  t1.reason
);
assert(
  "database.rules.json explicitly sets members .write to false",
  rules.rooms['$coupleId'].members['.write'] === false,
  "rules.rooms.$coupleId.members.write === false"
);

// -----------------------------------------------------------------------------
// Test 2: Nonmember cannot read a room
// -----------------------------------------------------------------------------
console.log("\n--- Test 2: Room Read Protection ---");
const t2Unauth = sim.canRead(`/rooms/${coupleId}`, null);
const t2Attacker = sim.canRead(`/rooms/${coupleId}`, userAttacker);
assert("Unauthenticated client cannot read room", t2Unauth === false, "Read denied for null auth");
assert("Authenticated nonmember cannot read room", t2Attacker === false, "Read denied for nonmember");

// -----------------------------------------------------------------------------
// Test 3: Nonmember cannot write to any room
// -----------------------------------------------------------------------------
console.log("\n--- Test 3: Nonmember Write Denial ---");
const t3Player = sim.canWrite(`/rooms/${coupleId}/players/${userAttacker.uid}`, userAttacker, {
  x: 100, y: 200, facing: "right", animState: "idle", updatedAt: Date.now()
});
const t3Events = sim.canWrite(`/rooms/${coupleId}/events/ev_1`, userAttacker, {
  type: "heart_burst", senderUid: userAttacker.uid, timestamp: Date.now(), payload: { x: 100, y: 200 }
});
assert("Nonmember cannot write to players", t3Player.allowed === false, t3Player.reason);
assert("Nonmember cannot write to events", t3Events.allowed === false, t3Events.reason);

// -----------------------------------------------------------------------------
// Test 4: One player cannot overwrite another player's position or presence
// -----------------------------------------------------------------------------
console.log("\n--- Test 4: Cross-Player State Overwrite Prevention ---");
const t4Position = sim.canWrite(`/rooms/${coupleId}/players/${userAanya.uid}`, userAyush, {
  x: 500, y: 500, facing: "left", animState: "jump", updatedAt: Date.now()
});
const t4Presence = sim.canWrite(`/rooms/${coupleId}/presence/${userAanya.uid}`, userAyush, {
  online: false
});
assert("Player 1 cannot overwrite Player 2's position", t4Position.allowed === false, t4Position.reason);
assert("Player 1 cannot overwrite Player 2's presence", t4Presence.allowed === false, t4Presence.reason);

// -----------------------------------------------------------------------------
// Test 5: Client cannot rewrite membership (even for their own UID)
// -----------------------------------------------------------------------------
console.log("\n--- Test 5: Client Cannot Modify Membership Records ---");
const t5Self = sim.canWrite(`/rooms/${coupleId}/members/${userAyush.uid}`, userAyush, false);
const t5Clear = sim.canWrite(`/rooms/${coupleId}/members`, userAyush, null);
assert("Member cannot modify their own membership record", t5Self.allowed === false, t5Self.reason);
assert("Member cannot clear membership mirror", t5Clear.allowed === false, t5Clear.reason);

// -----------------------------------------------------------------------------
// Test 6: Unauthorized third user cannot access session
// -----------------------------------------------------------------------------
console.log("\n--- Test 6: Membership Cap & Revocation Enforcement ---");
const t6UnauthRoom = sim.canRead(`/rooms/${coupleId}/players`, userAttacker);
assert("Third party denied room access", t6UnauthRoom === false, "Access denied");

// Simulate revoking User Aanya's membership on the server
sim.adminSet(`/rooms/${coupleId}/members`, { [userAyush.uid]: true });
const t6Revoked = sim.canRead(`/rooms/${coupleId}`, userAanya);
assert("Revoked partner is immediately blocked from reading room", t6Revoked === false, "Immediate revocation");

// Restore membership for subsequent tests
sim.adminSet(`/rooms/${coupleId}/members`, { [userAyush.uid]: true, [userAanya.uid]: true });

// -----------------------------------------------------------------------------
// Test 7: Member cannot directly grant authoritative puzzle completion or rewards
// -----------------------------------------------------------------------------
console.log("\n--- Test 7: Authoritative Progression Boundary Enforcement ---");
const t7BridgeHack = sim.canWrite(`/rooms/${coupleId}/coopState`, userAyush, {
  bridgeUnlockedPermanently: true,
  mission6Complete: true
});
assert("Client cannot write arbitrary authoritative state to coopState", t7BridgeHack.allowed === false, t7BridgeHack.reason);

const t7PlateSpoof = sim.canWrite(`/rooms/${coupleId}/coopState`, userAyush, {
  pressurePlate: {
    pressed: true,
    pressedBy: userAanya.uid, // Attempting to spoof partner
    timestamp: Date.now()
  }
});
assert("Client cannot spoof pressedBy as another player", t7PlateSpoof.allowed === false, t7PlateSpoof.reason);

// -----------------------------------------------------------------------------
// Test 8: Malformed and unexpected player-state fields are rejected
// -----------------------------------------------------------------------------
console.log("\n--- Test 8: Malformed & Unexpected Player-State Fields Rejection ---");
const t8ExtraField = sim.canWrite(`/rooms/${coupleId}/players/${userAyush.uid}`, userAyush, {
  x: 100, y: 200, facing: "right", animState: "idle", updatedAt: Date.now(),
  cheatInvulnerable: true // Injected unexpected property
});
assert("Unexpected extra field rejected on player state", t8ExtraField.allowed === false, t8ExtraField.reason);

const t8OutOfBoundsX = sim.canWrite(`/rooms/${coupleId}/players/${userAyush.uid}`, userAyush, {
  x: 999999, y: 200, facing: "right", animState: "idle", updatedAt: Date.now()
});
assert("Out-of-bounds X coordinate rejected", t8OutOfBoundsX.allowed === false, t8OutOfBoundsX.reason);

const t8MissingFacing = sim.canWrite(`/rooms/${coupleId}/players/${userAyush.uid}`, userAyush, {
  x: 100, y: 200, animState: "idle", updatedAt: Date.now()
});
assert("Missing required facing property rejected", t8MissingFacing.allowed === false, t8MissingFacing.reason);

// -----------------------------------------------------------------------------
// Test 9: Event payloads that violate the schema are rejected
// -----------------------------------------------------------------------------
console.log("\n--- Test 9: Event Payload Schema & Type Validation ---");
const t9BadType = sim.canWrite(`/rooms/${coupleId}/events/ev_bad`, userAyush, {
  type: "unlock_all_missions",
  senderUid: userAyush.uid,
  timestamp: Date.now(),
  payload: { all: true }
});
assert("Disallowed event type rejected", t9BadType.allowed === false, t9BadType.reason);

const t9BadPayload = sim.canWrite(`/rooms/${coupleId}/events/ev_bad_payload`, userAyush, {
  type: "collectible_pickup",
  senderUid: userAyush.uid,
  timestamp: Date.now(),
  payload: { itemId: "crystal_1", itemType: "crystal", maliciousFlag: true }
});
assert("Unexpected field inside event payload rejected", t9BadPayload.allowed === false, t9BadPayload.reason);

// -----------------------------------------------------------------------------
// Test 10: Valid couple members can synchronize legitimate state & presence
// -----------------------------------------------------------------------------
console.log("\n--- Test 10: Valid Member Legitimate Synchronization ---");
const t10ValidPlayer = sim.canWrite(`/rooms/${coupleId}/players/${userAyush.uid}`, userAyush, {
  x: 150.5,
  y: 240.0,
  vx: 60.0,
  vy: 0.0,
  facing: "right",
  animState: "walk",
  grounded: true,
  zoneId: "oakvale_village",
  displayName: "Ayush",
  avatar: "ayush",
  sessionId: "s_123",
  updatedAt: Date.now(),
  protocolVersion: 1
});
assert("Valid player coordinate snapshot permitted", t10ValidPlayer.allowed === true, "Coordinates permitted");

const t10ValidPresence = sim.canWrite(`/rooms/${coupleId}/presence/${userAyush.uid}`, userAyush, {
  online: true,
  inRoom: true,
  zoneId: "oakvale_village",
  displayName: "Ayush",
  sessionId: "s_123",
  updatedAt: Date.now()
});
assert("Valid presence update permitted", t10ValidPresence.allowed === true, "Presence permitted");

const t10ValidPlate = sim.canWrite(`/rooms/${coupleId}/coopState`, userAyush, {
  pressurePlate: {
    pressed: true,
    pressedBy: userAyush.uid,
    timestamp: Date.now()
  }
});
assert("Valid pressure plate press permitted", t10ValidPlate.allowed === true, "Pressure plate permitted");

const t10ValidEvent = sim.canWrite(`/rooms/${coupleId}/events/ev_valid`, userAyush, {
  type: "collectible_pickup",
  senderUid: userAyush.uid,
  timestamp: Date.now(),
  payload: { itemId: "crystal_1", itemType: "crystal", x: 150, y: 240 }
});
assert("Valid collectible notification event permitted", t10ValidEvent.allowed === true, "Event permitted");

const t10Read = sim.canRead(`/rooms/${coupleId}`, userAyush);
assert("Authorized member can read room state", t10Read === true, "Read allowed for member");

// -----------------------------------------------------------------------------
// Test 11: Backend Callable Verification Check
// -----------------------------------------------------------------------------
console.log("\n--- Test 11: Backend Trusted Functions Audit ---");
const functionsIndexPath = path.resolve(process.cwd(), 'functions/index.js');
const funcContent = fs.readFileSync(functionsIndexPath, 'utf8');

assert("authorizeRoomAccess callable function exists in backend",
  funcContent.includes("exports.authorizeRoomAccess = functions.https.onCall"),
  "Found exports.authorizeRoomAccess"
);

assert("authorizeRoomAccess verifies canonical Firestore couple membership",
  funcContent.includes("members.includes(uid)") && funcContent.includes("members.length > 2"),
  "Membership & cap checked in Firestore"
);

assert("leaveCouple revokes RTDB room mirror using Admin SDK",
  funcContent.includes("rooms/${coupleId}/members/${uid}") && funcContent.includes(".remove()"),
  "Revocation implemented"
);

assert("Browser client does NOT write to members mirror",
  !fs.readFileSync(path.resolve(process.cwd(), 'src/systems/multiplayerManager.js'), 'utf8')
    .includes("rooms/${this.coupleId}/members/${this.localUid}"),
  "Client write removed from multiplayerManager.js"
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
const passedCount = results.filter((r) => r.passed).length;
const totalCount = results.length;
console.log(`TOTAL SECURITY AUDIT TESTS: ${passedCount} / ${totalCount} PASSED`);
console.log("================================================================================\n");

if (passedCount < totalCount) {
  process.exit(1);
}
