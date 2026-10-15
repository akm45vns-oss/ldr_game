import {
  SAVE_STORAGE_KEY,
  LEGACY_SAVE_STORAGE_KEY,
  SAVE_SCHEMA_VERSION,
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  QUEST_ITEM_CATALOG
} from '../core/constants.js';
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../core/storage.js';
import { migrateProfileNames } from '../core/profile.js';

// Versioned Save & Load System with Profile Migration for Milestone 4C
export class SaveManager {
  static saveGame(app) {
    const playerActor = app.player || app.ayush;
    const partnerActor = app.partner;

    const payload = {
      version: SAVE_SCHEMA_VERSION,
      updatedAt: Date.now(),
      selectedCharacter: app.selectedCharacter || "male",
      playerName: app.playerName || "Bhoot",
      partnerName: app.partnerName || "Kida",
      adventureMode: app.adventureMode || "story",
      gameMode: app.gameMode || "solo",
      weatherMode: app.weatherMode,
      effectsQuality: app.effectsQuality || "high",
      reducedMotion: app.reducedMotion || "auto",
      companionHoldMode: Boolean(app.companionHoldMode),
      playerPos: { x: Math.round(playerActor.x), y: Math.round(playerActor.y) },
      partnerPos: { x: Math.round(partnerActor.x), y: Math.round(partnerActor.y) },
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

  static getRawSaveData() {
    // Check v3 first, fallback to legacy v2
    const rawV3 = safeStorageGet(SAVE_STORAGE_KEY, null);
    if (rawV3) {
      try {
        const parsed = JSON.parse(rawV3);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {}
    }

    const rawV2 = safeStorageGet(LEGACY_SAVE_STORAGE_KEY, null);
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {}
    }

    return null;
  }

  static hasValidSave() {
    const data = this.getRawSaveData();
    if (!data) return false;
    return data.version === SAVE_SCHEMA_VERSION || data.version === 2;
  }

  static getSaveSummary() {
    const data = this.getRawSaveData();
    if (!data) return { exists: false };

    const migration = migrateProfileNames(
      data.playerName,
      data.partnerName,
      data.selectedCharacter || "male"
    );

    const crystals = Array.isArray(data.collectedIds)
      ? data.collectedIds.filter((id) => /^c\d+$/.test(id) || id.startsWith("crystal")).length
      : 0;
    const memories = Array.isArray(data.unlockedMemories)
      ? data.unlockedMemories.length
      : 0;

    let zone = "Zone 1: Oakvale";
    if (data.playerPos && typeof data.playerPos.x === "number") {
      if (data.playerPos.x >= 140 * TILE_SIZE) {
        zone = "Zone 3: Broken Bridge & Shrine";
      } else if (data.playerPos.x >= 68 * TILE_SIZE) {
        zone = "Zone 2: Whispering Forest";
      }
    }

    return {
      exists: true,
      playerName: migration.playerName,
      partnerName: migration.partnerName,
      selectedCharacter: migration.selectedCharacter,
      adventureMode: data.adventureMode || "story",
      gameMode: data.gameMode || "solo",
      crystals,
      memories,
      zone,
      bridgeUnlocked: Boolean(data.worldState && data.worldState.bridgeUnlockedPermanently),
      updatedAt: data.updatedAt || Date.now()
    };
  }

  static loadGame(app) {
    const parsed = this.getRawSaveData();
    if (!parsed) return { loaded: false, reason: "no_save" };

    if (parsed.version !== SAVE_SCHEMA_VERSION && parsed.version !== 2) {
      return { loaded: false, reason: "invalid_schema" };
    }

    // Apply safe profile & name migration
    const profile = migrateProfileNames(
      parsed.playerName,
      parsed.partnerName,
      parsed.selectedCharacter || "male"
    );

    app.selectedCharacter = profile.selectedCharacter;
    app.playerName = profile.playerName;
    app.partnerName = profile.partnerName;

    const playerActor = app.player || app.ayush;
    if (playerActor) playerActor.name = app.playerName;
    if (app.partner) app.partner.name = app.partnerName;

    safeStorageSet("ph_character_gender", app.selectedCharacter);
    safeStorageSet("ph_player_name", app.playerName);
    safeStorageSet("ph_partner_name", app.partnerName);

    if (parsed.adventureMode) {
      app.adventureMode = parsed.adventureMode;
    }
    if (parsed.gameMode) {
      app.gameMode = parsed.gameMode;
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
    if (playerActor) {
      playerActor.x = safeP1.x;
      playerActor.y = safeP1.y;
    }

    const safeP2 = sanitizePos(parsed.partnerPos, 6 * TILE_SIZE);
    if (app.partner) {
      app.partner.x = safeP2.x;
      app.partner.y = safeP2.y;
    }
    app.companionHoldMode = Boolean(parsed.companionHoldMode);

    return { loaded: true, reason: "ok" };
  }

  static clearSave() {
    safeStorageRemove(SAVE_STORAGE_KEY);
    safeStorageRemove(LEGACY_SAVE_STORAGE_KEY);
  }
}
