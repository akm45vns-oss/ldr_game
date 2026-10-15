import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/firebase.js';
import { getCurrentUser } from '../firebase/auth.js';
import { SaveManager } from './save.js';
import { safeStorageGet, safeStorageSet } from '../core/storage.js';
import { SAVE_SCHEMA_VERSION, QUEST_ITEM_CATALOG } from '../core/constants.js';

export const SYNC_STATUS = {
  LOCAL_ONLY: "local_only",
  SYNCING: "syncing",
  SYNCED: "synced",
  OFFLINE_PENDING: "offline_pending",
  CONFLICT_ERROR: "conflict_error"
};

export class CloudSaveManager {
  constructor(app, coupleManager) {
    this.app = app;
    this.coupleManager = coupleManager;

    this.status = SYNC_STATUS.LOCAL_ONLY;
    this.statusMessage = "Local Offline Play";
    this.lastSyncedAt = Number(safeStorageGet("ph_last_synced_at", 0)) || null;
    this.localRevision = Number(safeStorageGet("ph_local_revision", 0)) || 0;
    this.resetGeneration = Number(safeStorageGet("ph_reset_generation", 1)) || 1;
    this.pendingSync = safeStorageGet("ph_pending_cloud_sync", "false") === "true";

    this.unsubscribeCloudSave = null;
    this.statusListeners = new Set();
    this.isApplyingRemoteChange = false;

    // Listen for online events to automatically sync pending changes
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkOnline());
    }
  }

  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback(this.status, this.statusMessage, this.lastSyncedAt);
    return () => this.statusListeners.delete(callback);
  }

  setStatus(status, message = "") {
    this.status = status;
    this.statusMessage = message;
    this.statusListeners.forEach((cb) => {
      try {
        cb(status, message, this.lastSyncedAt);
      } catch (_) {}
    });
    if (this.app && this.app.hud && typeof this.app.hud.updateCloudSyncPill === "function") {
      this.app.hud.updateCloudSyncPill(status, message);
    }
  }

  init() {
    this.coupleManager.onChange((cm) => {
      if (cm.coupleId) {
        this.listenToCloudSave(cm.coupleId);
        if (this.pendingSync) {
          this.uploadLocalSave();
        }
      } else {
        this.cleanup();
        this.setStatus(SYNC_STATUS.LOCAL_ONLY, "Playing locally (No couple linked)");
      }
    });

    if (this.coupleManager.coupleId) {
      this.listenToCloudSave(this.coupleManager.coupleId);
    } else {
      this.setStatus(SYNC_STATUS.LOCAL_ONLY, "Playing locally");
    }
  }

  cleanup() {
    if (this.unsubscribeCloudSave) {
      this.unsubscribeCloudSave();
      this.unsubscribeCloudSave = null;
    }
  }

  handleNetworkOnline() {
    if (this.pendingSync && this.coupleManager.coupleId) {
      console.log("[CloudSave] Connectivity restored, syncing pending changes...");
      this.uploadLocalSave();
    }
  }

  // Domain-Aware Merge: Merges a cloud payload with the active local game state
  mergeProgression(localData, cloudData) {
    if (!cloudData || typeof cloudData !== "object") return localData;

    // 1. Collectibles: Set union of collected IDs
    const localCollected = new Set(Array.isArray(localData.collectedIds) ? localData.collectedIds : []);
    const cloudCollected = new Set(Array.isArray(cloudData.collectedIds) ? cloudData.collectedIds : []);
    const mergedCollected = Array.from(new Set([...localCollected, ...cloudCollected]));

    // 2. Scrapbook Memories: Set union of memory IDs
    const localMemories = new Set(Array.isArray(localData.unlockedMemories) ? localData.unlockedMemories : []);
    const cloudMemories = new Set(Array.isArray(cloudData.unlockedMemories) ? cloudData.unlockedMemories : []);
    const mergedMemories = Array.from(new Set([...localMemories, ...cloudMemories]));

    // 3. Quest Items: Set union of valid items
    const localItems = new Set(Array.isArray(localData.questItems) ? localData.questItems : []);
    const cloudItems = new Set(Array.isArray(cloudData.questItems) ? cloudData.questItems : []);
    const mergedItems = Array.from(new Set([...localItems, ...cloudItems]))
      .filter((id) => QUEST_ITEM_CATALOG[id]);

    // 4. Story Flags: Boolean OR for irreversible flags
    const mergedStoryFlags = { ...localData.storyFlags };
    if (cloudData.storyFlags && typeof cloudData.storyFlags === "object") {
      Object.keys(cloudData.storyFlags).forEach((k) => {
        mergedStoryFlags[k] = Boolean(mergedStoryFlags[k] || cloudData.storyFlags[k]);
      });
    }

    // 5. World State
    const mergedWorldState = {
      bridgeUnlockedPermanently: Boolean(
        (localData.worldState && localData.worldState.bridgeUnlockedPermanently) ||
        (cloudData.worldState && cloudData.worldState.bridgeUnlockedPermanently)
      ),
      shrineLit: Boolean(
        (localData.worldState && localData.worldState.shrineLit) ||
        (cloudData.worldState && cloudData.worldState.shrineLit)
      )
    };

    // 6. Missions: Combine objective progress and statuses
    const localMissions = Array.isArray(localData.missions) ? localData.missions : [];
    const cloudMissions = Array.isArray(cloudData.missions) ? cloudData.missions : [];
    const missionMap = new Map();

    localMissions.forEach((m) => {
      missionMap.set(m.id, {
        id: m.id,
        status: m.status,
        notifiedComplete: Boolean(m.notifiedComplete),
        objectives: Array.isArray(m.objectives) ? m.objectives.map((o) => ({ ...o })) : []
      });
    });

    cloudMissions.forEach((cm) => {
      if (!missionMap.has(cm.id)) {
        missionMap.set(cm.id, {
          id: cm.id,
          status: cm.status,
          notifiedComplete: Boolean(cm.notifiedComplete),
          objectives: Array.isArray(cm.objectives) ? cm.objectives.map((o) => ({ ...o })) : []
        });
      } else {
        const existing = missionMap.get(cm.id);
        // Objective progress merge: Math.max
        if (Array.isArray(cm.objectives)) {
          cm.objectives.forEach((co) => {
            const exObj = existing.objectives.find((o) => o.id === co.id);
            if (exObj) {
              exObj.current = Math.max(exObj.current || 0, co.current || 0);
              exObj.completed = Boolean(exObj.completed || co.completed);
            }
          });
        }
        // Status hierarchy: completed > active > locked
        if (cm.status === "completed" || existing.status === "completed") {
          existing.status = "completed";
          existing.notifiedComplete = true;
        } else if (cm.status === "active" || existing.status === "active") {
          existing.status = "active";
        }
      }
    });

    const mergedMissions = Array.from(missionMap.values());

    return {
      version: SAVE_SCHEMA_VERSION,
      collectedIds: mergedCollected,
      unlockedMemories: mergedMemories,
      questItems: mergedItems,
      storyFlags: mergedStoryFlags,
      worldState: mergedWorldState,
      missions: mergedMissions,
      revision: Math.max(Number(localData.revision || 0), Number(cloudData.revision || 0)) + 1,
      resetGeneration: Math.max(Number(localData.resetGeneration || 1), Number(cloudData.resetGeneration || 1))
    };
  }

  // Extract shared progression payload from local game state (excluding local player coordinates)
  extractSharedPayload() {
    return {
      version: SAVE_SCHEMA_VERSION,
      revision: this.localRevision,
      resetGeneration: this.resetGeneration,
      collectedIds: this.app.world.collectibles.filter((c) => c.collected).map((c) => c.id),
      questItems: Array.from(this.app.questItems),
      unlockedMemories: Array.from(this.app.unlockedMemories),
      storyFlags: { ...this.app.storyFlags },
      worldState: {
        bridgeUnlockedPermanently: Boolean(this.app.world.bridgeUnlockedPermanently),
        shrineLit: Boolean(this.app.world.shrineLit)
      },
      missions: this.app.missionManager.serialize(),
      updatedAt: Date.now()
    };
  }

  // Apply merged shared progression to running game instance
  applySharedProgressionToGame(merged) {
    this.isApplyingRemoteChange = true;

    // 1. Collectibles
    if (Array.isArray(merged.collectedIds)) {
      const colSet = new Set(merged.collectedIds);
      this.app.world.collectibles.forEach((c) => {
        if (colSet.has(c.id)) c.collected = true;
      });
    }

    // 2. Scrapbook memories
    if (Array.isArray(merged.unlockedMemories)) {
      merged.unlockedMemories.forEach((mid) => this.app.unlockedMemories.add(mid));
    }

    // 3. Quest items
    if (Array.isArray(merged.questItems)) {
      merged.questItems.forEach((qid) => this.app.questItems.add(qid));
    }

    // 4. Story flags
    if (merged.storyFlags && typeof merged.storyFlags === "object") {
      Object.keys(merged.storyFlags).forEach((k) => {
        if (typeof this.app.storyFlags[k] === "boolean") {
          this.app.storyFlags[k] = Boolean(this.app.storyFlags[k] || merged.storyFlags[k]);
        }
      });
    }

    // 5. World state
    if (merged.worldState) {
      if (merged.worldState.bridgeUnlockedPermanently) {
        this.app.world.bridgeUnlockedPermanently = true;
      }
      if (merged.worldState.shrineLit) {
        this.app.world.shrineLit = true;
      }
    }

    // 6. Missions
    if (Array.isArray(merged.missions)) {
      this.app.missionManager.restore(merged.missions);
    }
    this.app.missionManager.syncCollectibleCounts(true);

    // Update revision trackers
    this.localRevision = merged.revision || (this.localRevision + 1);
    this.resetGeneration = merged.resetGeneration || this.resetGeneration;
    safeStorageSet("ph_local_revision", String(this.localRevision));
    safeStorageSet("ph_reset_generation", String(this.resetGeneration));

    // Save locally
    SaveManager.saveGame(this.app);

    // Refresh UI
    this.app.updateStatsUI();
    this.app.updateQuestHUD();

    this.isApplyingRemoteChange = false;
  }

  // Upload local progression to couple cloud save
  async uploadLocalSave() {
    const coupleId = this.coupleManager.coupleId;
    if (!coupleId || !db) {
      this.setStatus(SYNC_STATUS.LOCAL_ONLY, "Playing locally");
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      this.setStatus(SYNC_STATUS.LOCAL_ONLY, "Sign in to sync with partner");
      return;
    }

    this.setStatus(SYNC_STATUS.SYNCING, "Uploading shared progress...");

    try {
      const saveRef = doc(db, "couples", coupleId, "shared_save", "current");
      const cloudSnap = await getDoc(saveRef);
      const cloudData = cloudSnap.exists() ? cloudSnap.data() : null;

      const localPayload = this.extractSharedPayload();
      const merged = this.mergeProgression(localPayload, cloudData);

      // Save merged to Firestore
      await setDoc(saveRef, {
        ...merged,
        serverUpdatedAt: serverTimestamp(),
        lastUpdatedBy: user.uid
      }, { merge: true });

      this.applySharedProgressionToGame(merged);

      this.lastSyncedAt = Date.now();
      safeStorageSet("ph_last_synced_at", String(this.lastSyncedAt));
      this.pendingSync = false;
      safeStorageSet("ph_pending_cloud_sync", "false");

      this.setStatus(SYNC_STATUS.SYNCED, `Synced just now`);
    } catch (err) {
      console.warn("[CloudSave] Upload failed, queuing offline:", err.message);
      this.pendingSync = true;
      safeStorageSet("ph_pending_cloud_sync", "true");
      this.setStatus(SYNC_STATUS.OFFLINE_PENDING, "Offline: changes will sync when reconnected");
    }
  }

  // Subscribe to real-time changes made by partner
  listenToCloudSave(coupleId) {
    if (!db || !coupleId) return;
    if (this.unsubscribeCloudSave) {
      this.unsubscribeCloudSave();
    }

    const saveRef = doc(db, "couples", coupleId, "shared_save", "current");
    this.unsubscribeCloudSave = onSnapshot(
      saveRef,
      (snap) => {
        if (!snap.exists()) {
          this.setStatus(SYNC_STATUS.SYNCED, "Cloud save ready");
          return;
        }

        const cloudData = snap.data();
        const currentUid = getCurrentUser() ? getCurrentUser().uid : null;

        // Skip applying if this update came from our own write
        if (cloudData.lastUpdatedBy === currentUid && !this.pendingSync) {
          this.lastSyncedAt = Date.now();
          safeStorageSet("ph_last_synced_at", String(this.lastSyncedAt));
          this.setStatus(SYNC_STATUS.SYNCED, `Synced just now`);
          return;
        }

        console.log("[CloudSave] Received shared update from partner (Rev #" + cloudData.revision + ")");

        const localPayload = this.extractSharedPayload();
        const merged = this.mergeProgression(localPayload, cloudData);
        this.applySharedProgressionToGame(merged);

        this.lastSyncedAt = Date.now();
        safeStorageSet("ph_last_synced_at", String(this.lastSyncedAt));
        this.setStatus(SYNC_STATUS.SYNCED, "Synced with partner progress ♥");

        if (this.app && this.app.showQuestToast) {
          this.app.showQuestToast("♥ PARTNER PROGRESS SYNCED", "Shared quests, crystals and memories updated!");
        }
      },
      (err) => {
        console.warn("[CloudSave] Snapshot error:", err.message);
        this.setStatus(SYNC_STATUS.CONFLICT_ERROR, "Sync interrupted. Playing offline.");
      }
    );
  }

  // Intentional New Game / Reset Protocol: increments generation so old devices won't overwrite
  async handleResetProgress() {
    this.resetGeneration += 1;
    this.localRevision = 1;
    safeStorageSet("ph_reset_generation", String(this.resetGeneration));
    safeStorageSet("ph_local_revision", String(this.localRevision));

    if (this.coupleManager.coupleId && db) {
      const user = getCurrentUser();
      if (user) {
        try {
          const saveRef = doc(db, "couples", this.coupleManager.coupleId, "shared_save", "current");
          await setDoc(saveRef, {
            ...this.extractSharedPayload(),
            revision: 1,
            resetGeneration: this.resetGeneration,
            serverUpdatedAt: serverTimestamp(),
            lastUpdatedBy: user.uid
          });
        } catch (err) {
          console.warn("[CloudSave] Reset cloud notification failed:", err.message);
        }
      }
    }
  }
}
