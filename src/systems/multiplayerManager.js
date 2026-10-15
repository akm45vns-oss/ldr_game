import { ref, set, onValue, push, serverTimestamp } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { rtdb, functions } from '../firebase/firebase.js';
import { getCurrentUser } from '../firebase/auth.js';
import { PresenceManager } from './presenceManager.js';
import { PlayerSync } from './playerSync.js';
import { Actor } from '../entities/actor.js';
import { TILE_SIZE } from '../core/constants.js';

export class MultiplayerManager {
  constructor(app) {
    this.app = app;
    this.mode = "solo"; // "solo" | "coop"
    this.coupleId = null;
    this.localUid = null;
    this.partnerUid = null;
    this.sessionId = null;

    this.presence = new PresenceManager(app);
    this.sync = new PlayerSync(app);

    this.remoteActor = null;
    this.isPartnerInSameZone = false;
    this.remotePlateActive = false;

    this.eventsRef = null;
    this.coopStateRef = null;
    this.eventsUnsubscribe = null;
    this.coopStateUnsubscribe = null;

    this.listeners = new Set();
    this.processedEventIds = new Set();

    // Hook presence events
    this.presence.onPartnerStatusChange((status) => {
      this.handlePartnerStatusChange(status);
    });
  }

  onChange(callback) {
    this.listeners.add(callback);
    callback(this);
    return () => this.listeners.delete(callback);
  }

  notifyChange() {
    this.listeners.forEach((cb) => {
      try {
        cb(this);
      } catch (e) {
        console.error("[MultiplayerManager] Listener error:", e);
      }
    });
  }

  get isCoopActive() {
    return this.mode === "coop" && this.presence.inRoom;
  }

  get isPartnerConnected() {
    return this.isCoopActive && this.presence.partnerStatus.online && this.presence.partnerStatus.inRoom;
  }

  /**
   * Determine current zone ID based on local actor's world X coordinate
   */
  getCurrentZoneId() {
    const x = this.app.ayush ? this.app.ayush.x : 0;
    if (x < 65 * TILE_SIZE) return "oakvale_village";
    if (x < 140 * TILE_SIZE) return "whispering_forest";
    return "starlight_sanctuary";
  }

  getZoneDisplayName(zoneId) {
    switch (zoneId) {
      case "whispering_forest":
        return "Whispering Forest";
      case "starlight_sanctuary":
        return "Starlight Sanctuary";
      case "oakvale_village":
      default:
        return "Oakvale Village";
    }
  }

  /**
   * Play Solo mode: switches to offline-first local play with AI companion
   */
  playSolo() {
    if (this.mode === "solo") return;
    this.mode = "solo";
    this.leaveRoom();

    // Re-enable local AI companion
    if (this.app.partner) {
      this.app.partner.visible = true;
    }

    if (this.app.showQuestToast) {
      this.app.showQuestToast("SOLO MODE ACTIVE", "Playing with local companion AI.");
    }

    this.notifyChange();
  }

  /**
   * Play Together mode: enters the authenticated couple room via RTDB
   */
  async playTogether() {
    const user = getCurrentUser();
    if (!user) {
      if (this.app.authModal) this.app.authModal.open("login");
      return { success: false, reason: "unauthenticated" };
    }

    const couple = this.app.couple;
    if (!couple || !couple.coupleId || !couple.isLinked) {
      if (this.app.coupleModal) this.app.coupleModal.open();
      return { success: false, reason: "not_linked" };
    }

    this.coupleId = couple.coupleId;
    this.localUid = user.uid;
    this.partnerUid = couple.members.find((m) => m !== user.uid) || null;
    this.sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.mode = "coop";

    // 1. Authoritatively establish RTDB membership mirror via trusted server verification
    if (functions) {
      try {
        const authorizeRoomFn = httpsCallable(functions, "authorizeRoomAccess");
        await authorizeRoomFn({ coupleId: this.coupleId });
      } catch (err) {
        console.warn("[MultiplayerManager] Server room authorization call:", err.message);
      }
    }

    const currentZone = this.getCurrentZoneId();
    const localName = user.displayName || (user.email ? user.email.split("@")[0] : "Hero");

    // 2. Initialize Presence
    await this.presence.joinRoom(
      this.coupleId,
      this.localUid,
      this.partnerUid,
      this.sessionId,
      currentZone,
      localName
    );

    // 3. Initialize Player Sync
    const partnerName = couple.partnerProfile ? couple.partnerProfile.displayName : (this.app.partnerName || "Partner");
    this.sync.init(
      this.coupleId,
      this.localUid,
      this.partnerUid,
      this.sessionId,
      localName,
      "ayush"
    );

    // 4. Create remote actor entity for rendering partner
    this.createRemoteActor(partnerName);

    // 5. Subscribe to transient room events & co-op state
    this.subscribeEvents();

    if (this.app.showQuestToast) {
      this.app.showQuestToast("PLAY TOGETHER ACTIVE ♥", `Connected to room for ${partnerName}!`);
    }

    this.notifyChange();
    return { success: true };
  }

  createRemoteActor(partnerName) {
    // Partner frames use the pink cloak / partner palette
    const frames = this.app.partnerFrames || this.app.ayushFrames;
    this.remoteActor = new Actor(partnerName, 6 * TILE_SIZE, 12 * TILE_SIZE, frames);
    this.remoteActor.isRemotePlayer = true;
    this.remoteActor.visible = false;
  }

  subscribeEvents() {
    if (!rtdb || !this.coupleId) return;

    this.eventsRef = ref(rtdb, `rooms/${this.coupleId}/events`);
    this.coopStateRef = ref(rtdb, `rooms/${this.coupleId}/coopState`);

    // Listen to real-time transient events (e.g. collectible pickups, emote bursts)
    this.eventsUnsubscribe = onValue(this.eventsRef, (snap) => {
      const data = snap.val();
      if (!data) return;

      Object.entries(data).forEach(([eventId, evt]) => {
        if (this.processedEventIds.has(eventId)) return;
        this.processedEventIds.add(eventId);

        // Keep processed set bounded
        if (this.processedEventIds.size > 200) {
          const first = this.processedEventIds.values().next().value;
          this.processedEventIds.delete(first);
        }

        // Only handle events originating from the other player
        if (evt.senderUid && evt.senderUid === this.localUid) return;

        this.handleRemoteEvent(evt);
      });
    });

    // Listen to live co-op puzzle state (pressure plate)
    this.coopStateUnsubscribe = onValue(this.coopStateRef, (snap) => {
      const data = snap.val();
      if (!data) {
        this.remotePlateActive = false;
        return;
      }

      if (data.pressurePlate) {
        const isPressed = Boolean(data.pressurePlate.pressed);
        const pressedBy = data.pressurePlate.pressedBy;
        this.remotePlateActive = isPressed && pressedBy !== this.localUid;
      }
    });
  }

  handleRemoteEvent(evt) {
    if (!evt || !evt.type) return;

    if (evt.type === "collectible_pickup") {
      const { itemId, itemType } = evt.payload || {};
      if (itemId && this.app.world && this.app.world.collectibles) {
        const item = this.app.world.collectibles.find((c) => c.id === itemId);
        if (item && !item.collected) {
          item.collected = true;
          if (this.app.spawnHeartBurst) this.app.spawnHeartBurst(item.x, item.y);
          if (this.app.sound && this.app.sound.playGem) this.app.sound.playGem();
          if (this.app.updateStatsUI) this.app.updateStatsUI();
          if (this.app.missionManager && this.app.missionManager.checkObjectives) {
            this.app.missionManager.checkObjectives();
          }
          if (this.app.cloudSave && this.app.cloudSave.triggerAutoSave) {
            this.app.cloudSave.triggerAutoSave();
          }
        }
      }
    } else if (evt.type === "heart_burst") {
      const { x, y } = evt.payload || {};
      if (typeof x === "number" && typeof y === "number" && this.app.spawnHeartBurst) {
        this.app.spawnHeartBurst(x, y);
      }
    } else if (evt.type === "bridge_repaired") {
      if (this.app.world && !this.app.world.bridgeUnlockedPermanently) {
        this.app.world.bridgeUnlockedPermanently = true;
        if (this.app.storyFlags) this.app.storyFlags.bridgeUnlockedPermanently = true;
        if (this.app.sound && this.app.sound.playBridgeUnlock) this.app.sound.playBridgeUnlock();
        if (this.app.updateStatsUI) this.app.updateStatsUI();
        if (this.app.missionManager && this.app.missionManager.checkObjectives) {
          this.app.missionManager.checkObjectives();
        }
        if (this.app.showQuestToast) {
          this.app.showQuestToast("BRIDGE REPAIRED BY PARTNER!", "The Astral Starlight Bridge is open!");
        }
      }
    }
  }

  broadcastEvent(type, payload = {}) {
    if (!rtdb || !this.coupleId || !this.isCoopActive) return;

    // Ensure payload conforms to strict schema
    const safePayload = {
      x: Math.round(this.app.ayush ? this.app.ayush.x : 0),
      y: Math.round(this.app.ayush ? this.app.ayush.y : 0),
      ...payload
    };

    try {
      const newEvtRef = push(ref(rtdb, `rooms/${this.coupleId}/events`));
      set(newEvtRef, {
        type: type,
        senderUid: this.localUid,
        payload: safePayload,
        timestamp: Date.now()
      }).catch((e) => console.warn("[MultiplayerManager] Broadcast error:", e.message));
    } catch (err) {
      console.warn("[MultiplayerManager] Failed to broadcast event:", err.message);
    }
  }

  setPressurePlateCoop(pressed) {
    if (!rtdb || !this.coupleId || !this.isCoopActive) return;

    try {
      const plateRef = ref(rtdb, `rooms/${this.coupleId}/coopState/pressurePlate`);
      set(plateRef, {
        pressed: Boolean(pressed),
        pressedBy: pressed ? this.localUid : null,
        timestamp: Date.now()
      }).catch(() => {});
    } catch (e) {}
  }

  handlePartnerStatusChange(status) {
    const isOnline = status.online && status.inRoom;
    const currentZone = this.getCurrentZoneId();
    this.isPartnerInSameZone = isOnline && status.zoneId === currentZone;

    if (this.remoteActor) {
      this.remoteActor.name = status.displayName || "Partner";
      this.remoteActor.visible = this.isPartnerInSameZone;
    }

    // Explicit Companion Behavior Decision (Requirement 5):
    // In co-op mode, if remote human partner is online in the room:
    // hide the AI companion so it does not duplicate or impersonate the remote human partner!
    // If partner is offline or in another zone, keep companion available or cleanly positioned.
    if (this.mode === "coop" && this.app.partner) {
      if (isOnline) {
        // Human partner is present; suppress AI companion
        this.app.partner.visible = false;
      } else {
        // Partner disconnected or offline; companion re-engages seamlessly
        this.app.partner.visible = true;
      }
    }

    this.notifyChange();
  }

  /**
   * Main per-frame update integrated into PixelHeartsGame.update(dt)
   */
  update(dt, now = performance.now()) {
    if (!this.isCoopActive) return;

    const currentZone = this.getCurrentZoneId();

    // 1. Publish local player state to RTDB
    if (this.app.ayush) {
      this.sync.publishLocalState(this.app.ayush, currentZone, now);
    }

    // 2. Interpolate received remote snapshots
    this.sync.updateRemoteInterpolation(dt, now);

    // 3. Update remote actor presentation
    const remote = this.sync.remoteState;
    if (this.remoteActor && remote.active) {
      this.remoteActor.x = remote.x;
      this.remoteActor.y = remote.y;
      this.remoteActor.vx = remote.vx;
      this.remoteActor.vy = remote.vy;
      this.remoteActor.facing = remote.facing;
      this.remoteActor.onGround = remote.grounded;
      this.remoteActor.name = remote.displayName || "Partner";

      this.isPartnerInSameZone = remote.zoneId === currentZone && this.presence.partnerStatus.online;
      this.remoteActor.visible = this.isPartnerInSameZone;

      // Update character frame animation counters based on network movement
      if (Math.abs(remote.vx) > 10) {
        this.remoteActor.walkTimer = (this.remoteActor.walkTimer || 0) + dt * 10;
        this.remoteActor.frame = Math.floor(this.remoteActor.walkTimer) % 4;
      } else {
        this.remoteActor.frame = 0;
      }
    }

    // 4. Update zone in presence if changed
    if (this.presence.currentZoneId !== currentZone) {
      this.presence.setZone(currentZone);
    }

    // 5. Co-op pressure plate evaluation
    const plateX = 145 * TILE_SIZE;
    const ayushOnPlate = Math.abs(this.app.ayush.x - plateX) < 20 && this.app.ayush.onGround;
    const remotePartnerOnPlate =
      this.remoteActor &&
      this.remoteActor.visible &&
      Math.abs(this.remoteActor.x - plateX) < 22 &&
      this.remoteActor.onGround;

    const platePressed = ayushOnPlate || remotePartnerOnPlate || this.remotePlateActive;
    if (platePressed !== this.app.world.platePressed) {
      this.app.world.platePressed = platePressed || this.app.world.bridgeUnlockedPermanently;
      if (ayushOnPlate) {
        this.setPressurePlateCoop(true);
      }
    }
  }

  leaveRoom() {
    this.presence.leaveRoom();
    this.sync.stop();

    if (this.eventsUnsubscribe) {
      this.eventsUnsubscribe();
      this.eventsUnsubscribe = null;
    }

    if (this.coopStateUnsubscribe) {
      this.coopStateUnsubscribe();
      this.coopStateUnsubscribe = null;
    }

    if (this.remoteActor) {
      this.remoteActor.visible = false;
      this.remoteActor = null;
    }

    // Seamlessly restore local AI companion
    if (this.app.partner) {
      this.app.partner.visible = true;
    }

    this.remotePlateActive = false;
    this.isPartnerInSameZone = false;
  }
}
