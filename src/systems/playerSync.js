import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../firebase/firebase.js';

const PROTOCOL_VERSION = 1;
const DEFAULT_PUBLISH_INTERVAL_MS = 66; // ~15 updates per second
const INTERPOLATION_DELAY_MS = 90; // ~90ms render delay for silky-smooth interpolation buffer
const MAX_EXTRAPOLATION_MS = 400; // Cap extrapolation when updates cease
const SNAPSHOT_BUFFER_CAPACITY = 10;

/**
 * PlayerSync handles throttled publishing of local actor state to RTDB
 * and smooth snapshot interpolation of remote partner state for 60 FPS rendering.
 */
export class PlayerSync {
  constructor(app) {
    this.app = app;
    this.coupleId = null;
    this.localUid = null;
    this.partnerUid = null;
    this.sessionId = null;
    this.displayName = "Player";
    this.avatar = "ayush";

    this.localPlayerRef = null;
    this.partnerPlayerRef = null;
    this.partnerUnsubscribe = null;

    // Publish throttling & dirty-checking
    this.publishIntervalMs = DEFAULT_PUBLISH_INTERVAL_MS;
    this.lastPublishTime = 0;
    this.lastPublishedState = null;

    // Remote snapshot buffer
    this.snapshotBuffer = [];
    this.lastReceivedTimestamp = 0;

    // Current interpolated state for remote partner
    this.remoteState = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1, // 1 = right, -1 = left
      facingStr: "right",
      animState: "idle",
      grounded: true,
      zoneId: "oakvale_village",
      displayName: "Partner",
      avatar: "partner",
      updatedAt: 0,
      active: false
    };

    this.isRunning = false;
  }

  init(coupleId, localUid, partnerUid, sessionId, displayName = "Player", avatar = "ayush") {
    this.stop();

    if (!rtdb || !coupleId || !localUid) return;

    this.coupleId = coupleId;
    this.localUid = localUid;
    this.partnerUid = partnerUid;
    this.sessionId = sessionId || `sess_${Date.now()}`;
    this.displayName = displayName;
    this.avatar = avatar;

    this.localPlayerRef = ref(rtdb, `rooms/${coupleId}/players/${localUid}`);
    this.isRunning = true;

    if (this.partnerUid) {
      this.subscribePartner(this.partnerUid);
    }
  }

  subscribePartner(partnerUid) {
    if (!rtdb || !this.coupleId || !partnerUid) return;
    this.partnerUid = partnerUid;
    this.partnerPlayerRef = ref(rtdb, `rooms/${this.coupleId}/players/${partnerUid}`);

    this.partnerUnsubscribe = onValue(this.partnerPlayerRef, (snap) => {
      const data = snap.val();
      if (!data) return;

      this.receiveRemoteSnapshot(data);
    });
  }

  /**
   * Validate and enqueue incoming remote snapshot
   */
  receiveRemoteSnapshot(raw) {
    // Basic structural & type validation
    if (!raw || typeof raw !== "object") return;
    if (typeof raw.x !== "number" || isNaN(raw.x) || typeof raw.y !== "number" || isNaN(raw.y)) return;
    if (raw.x < -100 || raw.x > 10000 || raw.y < -500 || raw.y > 2000) return;

    const timestamp = typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now();

    // Reject out-of-order or duplicate stale updates
    if (timestamp <= this.lastReceivedTimestamp) {
      return;
    }
    this.lastReceivedTimestamp = timestamp;

    const snapshot = {
      x: raw.x,
      y: raw.y,
      vx: typeof raw.vx === "number" ? raw.vx : 0,
      vy: typeof raw.vy === "number" ? raw.vy : 0,
      facing: raw.facing === "left" ? -1 : 1,
      facingStr: raw.facing === "left" ? "left" : "right",
      animState: typeof raw.animState === "string" ? raw.animState : "idle",
      grounded: Boolean(raw.grounded),
      zoneId: typeof raw.zoneId === "string" ? raw.zoneId : "oakvale_village",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "Partner",
      avatar: typeof raw.avatar === "string" ? raw.avatar : "partner",
      timestamp: timestamp,
      clientReceiveTime: performance.now()
    };

    this.snapshotBuffer.push(snapshot);
    if (this.snapshotBuffer.length > SNAPSHOT_BUFFER_CAPACITY) {
      this.snapshotBuffer.shift();
    }

    // Immediately update non-position presentation properties
    this.remoteState.animState = snapshot.animState;
    this.remoteState.facing = snapshot.facing;
    this.remoteState.facingStr = snapshot.facingStr;
    this.remoteState.grounded = snapshot.grounded;
    this.remoteState.zoneId = snapshot.zoneId;
    this.remoteState.displayName = snapshot.displayName;
    this.remoteState.avatar = snapshot.avatar;
    this.remoteState.active = true;

    // If this is the very first snapshot, initialize position immediately to prevent flying in
    if (this.snapshotBuffer.length === 1) {
      this.remoteState.x = snapshot.x;
      this.remoteState.y = snapshot.y;
      this.remoteState.vx = snapshot.vx;
      this.remoteState.vy = snapshot.vy;
    }
  }

  /**
   * Publish local actor state to RTDB with dirty checking & rate limiting
   */
  publishLocalState(actor, currentZoneId, now = performance.now()) {
    if (!this.isRunning || !this.localPlayerRef || !actor) return;

    // Rate-limiting check
    if (now - this.lastPublishTime < this.publishIntervalMs) {
      return;
    }

    const x = Math.round(actor.x * 10) / 10;
    const y = Math.round(actor.y * 10) / 10;
    const vx = Math.round((actor.vx || 0) * 10) / 10;
    const vy = Math.round((actor.vy || 0) * 10) / 10;
    const facingStr = actor.facing < 0 ? "left" : "right";
    const grounded = Boolean(actor.onGround);

    let animState = "idle";
    if (!grounded) {
      animState = vy < -20 ? "jump" : "fall";
    } else if (Math.abs(vx) > 10) {
      animState = "walk";
    }

    // Dirty check: only publish if state changed meaningfully or heartbeat elapsed (1000ms)
    const timeSinceLastPublish = now - this.lastPublishTime;
    const isHeartbeat = timeSinceLastPublish >= 1000;

    if (!isHeartbeat && this.lastPublishedState) {
      const prev = this.lastPublishedState;
      const moved = Math.abs(x - prev.x) > 0.4 || Math.abs(y - prev.y) > 0.4;
      const velChanged = Math.abs(vx - prev.vx) > 3 || Math.abs(vy - prev.vy) > 6;
      const facingChanged = facingStr !== prev.facing;
      const animChanged = animState !== prev.animState;
      const groundedChanged = grounded !== prev.grounded;
      const zoneChanged = currentZoneId !== prev.zoneId;

      if (!moved && !velChanged && !facingChanged && !animChanged && !groundedChanged && !zoneChanged) {
        return; // Skip duplicate unchanged frame
      }
    }

    const payload = {
      x,
      y,
      vx,
      vy,
      facing: facingStr,
      animState,
      grounded,
      zoneId: currentZoneId || "oakvale_village",
      displayName: this.displayName,
      avatar: this.avatar,
      sessionId: this.sessionId,
      updatedAt: Date.now(),
      protocolVersion: PROTOCOL_VERSION
    };

    this.lastPublishTime = now;
    this.lastPublishedState = { x, y, vx, vy, facing: facingStr, animState, grounded, zoneId: currentZoneId };

    set(this.localPlayerRef, payload).catch((err) => {
      console.warn("[PlayerSync] Publish error:", err.message);
    });
  }

  /**
   * Interpolate remote player state for 60 FPS rendering
   * Called every frame in the game render/update loop.
   */
  updateRemoteInterpolation(dt, now = performance.now()) {
    if (!this.remoteState.active || this.snapshotBuffer.length === 0) return;

    const renderTime = now - INTERPOLATION_DELAY_MS;
    const buffer = this.snapshotBuffer;

    // If buffer only has 1 snapshot or renderTime is older than our oldest snapshot
    if (buffer.length === 1 || renderTime <= buffer[0].clientReceiveTime) {
      const target = buffer[0];
      this.remoteState.x += (target.x - this.remoteState.x) * Math.min(1, dt * 14);
      this.remoteState.y += (target.y - this.remoteState.y) * Math.min(1, dt * 14);
      this.remoteState.vx = target.vx;
      this.remoteState.vy = target.vy;
      return;
    }

    // If renderTime is ahead of our newest snapshot (extrapolation window)
    const latest = buffer[buffer.length - 1];
    if (renderTime > latest.clientReceiveTime) {
      const timeSinceLatest = renderTime - latest.clientReceiveTime;
      if (timeSinceLatest > MAX_EXTRAPOLATION_MS) {
        // Stop extrapolation completely when updates cease
        this.remoteState.vx *= 0.85;
        this.remoteState.vy *= 0.85;
        this.remoteState.animState = "idle";
      } else {
        // Small extrapolation based on latest velocity
        const damp = Math.max(0, 1 - timeSinceLatest / MAX_EXTRAPOLATION_MS);
        this.remoteState.x += (latest.vx * damp * dt);
        this.remoteState.y += (latest.vy * damp * dt);
        this.remoteState.vx = latest.vx * damp;
        this.remoteState.vy = latest.vy * damp;
      }
      return;
    }

    // Find the two snapshots surrounding renderTime
    let older = buffer[0];
    let newer = buffer[buffer.length - 1];

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].clientReceiveTime <= renderTime && renderTime <= buffer[i + 1].clientReceiveTime) {
        older = buffer[i];
        newer = buffer[i + 1];
        break;
      }
    }

    const span = newer.clientReceiveTime - older.clientReceiveTime;
    const fraction = span > 0 ? (renderTime - older.clientReceiveTime) / span : 1;
    const t = Math.max(0, Math.min(1, fraction));

    // Linear interpolation between the two snapshots
    this.remoteState.x = older.x + (newer.x - older.x) * t;
    this.remoteState.y = older.y + (newer.y - older.y) * t;
    this.remoteState.vx = older.vx + (newer.vx - older.vx) * t;
    this.remoteState.vy = older.vy + (newer.vy - older.vy) * t;

    // Facing & animation take newer snapshot
    this.remoteState.facing = newer.facing;
    this.remoteState.facingStr = newer.facingStr;
    this.remoteState.animState = newer.animState;
    this.remoteState.grounded = newer.grounded;
    this.remoteState.zoneId = newer.zoneId;
  }

  stop() {
    this.isRunning = false;
    if (this.partnerUnsubscribe) {
      this.partnerUnsubscribe();
      this.partnerUnsubscribe = null;
    }
    this.snapshotBuffer = [];
    this.lastPublishedState = null;
    this.lastReceivedTimestamp = 0;
    this.remoteState.active = false;
  }
}
