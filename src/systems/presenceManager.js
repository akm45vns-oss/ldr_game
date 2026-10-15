import {
  ref,
  onValue,
  set,
  update,
  onDisconnect,
  serverTimestamp
} from 'firebase/database';
import { rtdb } from '../firebase/firebase.js';

/**
 * PresenceManager handles low-latency live connection status, heartbeat,
 * onDisconnect hooks, mobile visibility change, and partner presence tracking.
 */
export class PresenceManager {
  constructor(app) {
    this.app = app;
    this.coupleId = null;
    this.localUid = null;
    this.sessionId = null;
    this.partnerUid = null;

    this.connectedRef = null;
    this.localPresenceRef = null;
    this.localPlayerRef = null;
    this.partnerPresenceRef = null;

    this.connectedUnsubscribe = null;
    this.partnerUnsubscribe = null;

    this.isConnected = false;
    this.inRoom = false;
    this.currentZoneId = "oakvale_village";
    this.partnerStatus = {
      online: false,
      inRoom: false,
      zoneId: null,
      displayName: "Partner",
      status: "offline",
      lastSeen: 0
    };

    this.listeners = new Set();
    this.heartbeatTimer = null;
    this.staleCheckTimer = null;
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
    this.boundBeforeUnloadHandler = this.handleBeforeUnload.bind(this);
  }

  onPartnerStatusChange(callback) {
    this.listeners.add(callback);
    callback(this.partnerStatus);
    return () => this.listeners.delete(callback);
  }

  notifyPartnerStatus() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.partnerStatus);
      } catch (err) {
        console.error("[PresenceManager] Listener error:", err);
      }
    });
  }

  /**
   * Initialize presence for an authenticated session in a couple room
   */
  async joinRoom(coupleId, localUid, partnerUid, sessionId, initialZoneId = "oakvale_village", displayName = "Player") {
    this.leaveRoom();

    if (!rtdb || !coupleId || !localUid) {
      console.warn("[PresenceManager] RTDB not configured or invalid credentials");
      return false;
    }

    this.coupleId = coupleId;
    this.localUid = localUid;
    this.partnerUid = partnerUid;
    this.sessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentZoneId = initialZoneId;
    this.inRoom = true;

    this.localPresenceRef = ref(rtdb, `rooms/${coupleId}/presence/${localUid}`);
    this.localPlayerRef = ref(rtdb, `rooms/${coupleId}/players/${localUid}`);
    this.connectedRef = ref(rtdb, '.info/connected');

    // Attach lifecycle event listeners for mobile backgrounding & page closes
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", this.boundVisibilityHandler);
      window.addEventListener("beforeunload", this.boundBeforeUnloadHandler);
      window.addEventListener("pagehide", this.boundBeforeUnloadHandler);
    }

    // Monitor Firebase RTDB connection state
    this.connectedUnsubscribe = onValue(this.connectedRef, async (snap) => {
      const connected = Boolean(snap.val());
      this.isConnected = connected;

      if (connected && this.inRoom) {
        try {
          // Set up server-side onDisconnect hooks FIRST before declaring online
          const disconnectPresence = onDisconnect(this.localPresenceRef);
          await disconnectPresence.set({
            online: false,
            inRoom: false,
            zoneId: this.currentZoneId,
            displayName: displayName,
            sessionId: this.sessionId,
            disconnectedAt: Date.now()
          });

          // Mark player slice as offline on unexpected disconnect
          const disconnectPlayer = onDisconnect(this.localPlayerRef);
          await disconnectPlayer.update({
            grounded: true,
            animState: "idle",
            updatedAt: Date.now()
          });

          // Write active online presence
          await set(this.localPresenceRef, {
            online: true,
            inRoom: true,
            zoneId: this.currentZoneId,
            displayName: displayName,
            sessionId: this.sessionId,
            updatedAt: Date.now()
          });

          console.log(`[PresenceManager] Connected to room ${coupleId} as ${displayName} (${localUid})`);
        } catch (err) {
          console.warn("[PresenceManager] Error establishing presence:", err.message);
        }
      }
    });

    // Listen to partner presence if partner UID is known
    if (this.partnerUid) {
      this.subscribePartnerPresence(this.partnerUid);
    }

    // Start periodic heartbeat to keep presence fresh and detect stale states
    this.startHeartbeat(displayName);

    return true;
  }

  subscribePartnerPresence(partnerUid) {
    if (!rtdb || !this.coupleId || !partnerUid) return;
    this.partnerUid = partnerUid;
    this.partnerPresenceRef = ref(rtdb, `rooms/${this.coupleId}/presence/${partnerUid}`);

    this.partnerUnsubscribe = onValue(this.partnerPresenceRef, (snap) => {
      const data = snap.val();
      const now = Date.now();

      if (!data || !data.online || !data.inRoom) {
        this.partnerStatus = {
          online: false,
          inRoom: false,
          zoneId: data ? data.zoneId : null,
          displayName: data ? data.displayName : "Partner",
          status: "offline",
          lastSeen: data && (data.disconnectedAt || data.updatedAt) ? (data.disconnectedAt || data.updatedAt) : 0
        };
      } else {
        // Check if data is stale (> 30s without update)
        const age = now - (data.updatedAt || 0);
        const isStale = age > 30000;

        let status = "online_in_zone";
        if (isStale) {
          status = "reconnecting";
        } else if (data.zoneId && data.zoneId !== this.currentZoneId) {
          status = "online_other_zone";
        }

        this.partnerStatus = {
          online: !isStale,
          inRoom: !isStale,
          zoneId: data.zoneId,
          displayName: data.displayName || "Partner",
          status: status,
          lastSeen: data.updatedAt || now
        };
      }

      this.notifyPartnerStatus();
    });
  }

  setZone(zoneId) {
    this.currentZoneId = zoneId;
    if (this.localPresenceRef && this.inRoom) {
      update(this.localPresenceRef, {
        zoneId: zoneId,
        updatedAt: Date.now()
      }).catch(() => {});
    }

    // Re-evaluate partner zone relative status
    if (this.partnerStatus && this.partnerStatus.online) {
      this.partnerStatus.status =
        this.partnerStatus.zoneId === zoneId ? "online_in_zone" : "online_other_zone";
      this.notifyPartnerStatus();
    }
  }

  startHeartbeat(displayName) {
    this.stopHeartbeat();
    // Periodic heartbeat every 8 seconds
    this.heartbeatTimer = setInterval(() => {
      if (this.localPresenceRef && this.inRoom && this.isConnected) {
        update(this.localPresenceRef, {
          updatedAt: Date.now(),
          zoneId: this.currentZoneId
        }).catch(() => {});
      }
    }, 8000);

    // Stale check every 5 seconds to catch silent partner disconnections
    this.staleCheckTimer = setInterval(() => {
      if (this.partnerStatus && this.partnerStatus.online) {
        const age = Date.now() - (this.partnerStatus.lastSeen || 0);
        if (age > 25000 && this.partnerStatus.status !== "offline") {
          this.partnerStatus.status = "reconnecting";
          this.notifyPartnerStatus();
        } else if (age > 45000 && this.partnerStatus.online) {
          this.partnerStatus.online = false;
          this.partnerStatus.inRoom = false;
          this.partnerStatus.status = "offline";
          this.notifyPartnerStatus();
        }
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
  }

  handleVisibilityChange() {
    if (typeof document === "undefined" || !this.localPresenceRef || !this.inRoom) return;

    if (document.hidden) {
      // User switched tabs or backgrounded app on mobile
      update(this.localPresenceRef, {
        appHidden: true,
        updatedAt: Date.now()
      }).catch(() => {});
    } else {
      // User returned
      update(this.localPresenceRef, {
        appHidden: false,
        online: true,
        inRoom: true,
        updatedAt: Date.now()
      }).catch(() => {});
    }
  }

  handleBeforeUnload() {
    if (this.localPresenceRef && this.inRoom) {
      // Best-effort immediate write on unload
      try {
        set(this.localPresenceRef, {
          online: false,
          inRoom: false,
          zoneId: this.currentZoneId,
          disconnectedAt: Date.now()
        });
      } catch (e) {}
    }
  }

  leaveRoom() {
    this.stopHeartbeat();

    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
      window.removeEventListener("beforeunload", this.boundBeforeUnloadHandler);
      window.removeEventListener("pagehide", this.boundBeforeUnloadHandler);
    }

    if (this.connectedUnsubscribe) {
      this.connectedUnsubscribe();
      this.connectedUnsubscribe = null;
    }

    if (this.partnerUnsubscribe) {
      this.partnerUnsubscribe();
      this.partnerUnsubscribe = null;
    }

    if (this.localPresenceRef && this.inRoom) {
      try {
        onDisconnect(this.localPresenceRef).cancel();
        if (this.localPlayerRef) {
          onDisconnect(this.localPlayerRef).cancel();
        }
        set(this.localPresenceRef, {
          online: false,
          inRoom: false,
          zoneId: this.currentZoneId,
          disconnectedAt: Date.now()
        }).catch(() => {});
      } catch (err) {
        console.warn("[PresenceManager] Error during leaveRoom cleanup:", err.message);
      }
    }

    this.inRoom = false;
    this.coupleId = null;
    this.localUid = null;
    this.partnerUid = null;
    this.partnerStatus = {
      online: false,
      inRoom: false,
      zoneId: null,
      displayName: "Partner",
      status: "offline",
      lastSeen: 0
    };
    this.notifyPartnerStatus();
  }
}
