import { SAVE_STORAGE_KEY, SAVE_SCHEMA_VERSION, TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, QUEST_ITEM_CATALOG } from '../core/constants.js';
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../core/storage.js';

// Versioned Save & Load System with Safe Recovery
export class SaveManager {
  static saveGame(app) {
    const payload = {
      version: SAVE_SCHEMA_VERSION,
      updatedAt: Date.now(),
      partnerName: app.partnerName,
      weatherMode: app.weatherMode,
      effectsQuality: app.effectsQuality || "high",
      reducedMotion: app.reducedMotion || "auto",
      companionHoldMode: Boolean(app.companionHoldMode),
      playerPos: { x: Math.round(app.ayush.x), y: Math.round(app.ayush.y) },
      partnerPos: { x: Math.round(app.partner.x), y: Math.round(app.partner.y) },
      collectedIds: app.world.collectibles.filter((c) => c.collected).map((c) => c.id),
      questItems: Array.from(app.questItems),
      unlockedMemories: Array.from(app.unlockedMemories),
      storyFlags: { ...app.storyFlags },
      worldState: {
        bridgeUnlockedPermanently: Boolean(app.world.bridgeUnlockedPermanently),
        shrineLit: Boolean(app.world.shrineLit)
      },
      missions: app.missionManager.serialize()
    };
    safeStorageSet(SAVE_STORAGE_KEY, JSON.stringify(payload));
    if (app && app.cloudSave && !app.cloudSave.isApplyingRemoteChange) {
      app.cloudSave.uploadLocalSave().catch(() => {});
    }
    return true;
  }

  static loadGame(app) {
    const raw = safeStorageGet(SAVE_STORAGE_KEY, null);
    if (!raw) return { loaded: false, reason: "no_save" };

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { loaded: false, reason: "corrupted_json" };
    }

    if (!parsed || typeof parsed !== "object" || parsed.version !== SAVE_SCHEMA_VERSION) {
      return { loaded: false, reason: "invalid_schema" };
    }

    if (typeof parsed.partnerName === "string" && parsed.partnerName.trim().length > 0) {
      app.partnerName = parsed.partnerName.trim().slice(0, 16);
      app.partner.name = app.partnerName;
      safeStorageSet("ph_partner_name", app.partnerName);
    }
    if (["fireflies", "petals", "rain"].includes(parsed.weatherMode)) {
      app.weatherMode = parsed.weatherMode;
    }
    if (["high", "perf"].includes(parsed.effectsQuality)) {
      app.effectsQuality = parsed.effectsQuality;
    }
    if (["auto", "enabled", "disabled"].includes(parsed.reducedMotion)) {
      app.reducedMotion = parsed.reducedMotion;
    }

    if (Array.isArray(parsed.collectedIds)) {
      const validSet = new Set(parsed.collectedIds.filter((id) => typeof id === "string"));
      for (const item of app.world.collectibles) {
        item.collected = validSet.has(item.id);
      }
    }

    if (Array.isArray(parsed.questItems)) {
      app.questItems = new Set(
        parsed.questItems.filter((id) => typeof id === "string" && QUEST_ITEM_CATALOG[id])
      );
    }
    if (Array.isArray(parsed.unlockedMemories)) {
      app.unlockedMemories = new Set(
        parsed.unlockedMemories.filter((id) => typeof id === "string")
      );
    }
    for (const item of app.world.collectibles) {
      if (item.type === "memory" && item.collected && item.memoryId) {
        app.unlockedMemories.add(item.memoryId);
      }
    }

    if (parsed.storyFlags && typeof parsed.storyFlags === "object") {
      for (const key of Object.keys(app.storyFlags)) {
        if (typeof parsed.storyFlags[key] === "boolean") {
          app.storyFlags[key] = parsed.storyFlags[key];
        }
      }
    }
    if (parsed.worldState && typeof parsed.worldState === "object") {
      app.world.bridgeUnlockedPermanently = Boolean(parsed.worldState.bridgeUnlockedPermanently);
      app.world.shrineLit = Boolean(parsed.worldState.shrineLit);
    }

    if (Array.isArray(parsed.missions)) {
      app.missionManager.restore(parsed.missions);
    }
    app.missionManager.syncCollectibleCounts(true);

    const sanitizePos = (pos, fallbackX) => {
      if (
        !pos ||
        typeof pos.x !== "number" ||
        typeof pos.y !== "number" ||
        pos.x < 16 ||
        pos.x > WORLD_WIDTH - 32 ||
        pos.y < 0 ||
        pos.y > WORLD_HEIGHT
      ) {
        return { x: fallbackX, y: 15 * TILE_SIZE - 17 };
      }
      const col = Math.floor((pos.x + 6) / TILE_SIZE);
      const inChasm = col >= 150 && col <= 165 && !app.world.bridgeUnlockedPermanently;
      if (inChasm) {
        return { x: 142 * TILE_SIZE, y: 15 * TILE_SIZE - 17 };
      }
      const row = Math.floor((pos.y + 8) / TILE_SIZE);
      if (app.world.isSolidAt(col, row) || pos.y + 17 > 15 * TILE_SIZE) {
        return { x: pos.x, y: 15 * TILE_SIZE - 17 };
      }
      return { x: pos.x, y: pos.y };
    };

    const safeP1 = sanitizePos(parsed.playerPos, 8 * TILE_SIZE);
    app.ayush.x = safeP1.x;
    app.ayush.y = safeP1.y;

    const safeP2 = sanitizePos(parsed.partnerPos, 6 * TILE_SIZE);
    app.partner.x = safeP2.x;
    app.partner.y = safeP2.y;
    app.companionHoldMode = Boolean(parsed.companionHoldMode);

    return { loaded: true, reason: "ok" };
  }

  static clearSave() {
    safeStorageRemove(SAVE_STORAGE_KEY);
  }
}
