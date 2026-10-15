import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  RENDER_SCALE,
  TILE_SIZE,
  PHYSICS,
  QUEST_ITEM_CATALOG
} from './core/constants.js';
import { safeStorageGet, safeStorageSet } from './core/storage.js';
import { InputManager } from './core/input.js';
import { Camera2D } from './core/camera.js';
import { Actor } from './entities/actor.js';
import { PixelArtFactory } from './entities/factory.js';
import { LevelWorld } from './levels/world.js';
import { SoundEngine } from './systems/audio.js';
import { DialogueController } from './systems/dialogue.js';
import { MissionManager } from './systems/missions.js';
import { SaveManager } from './systems/save.js';
import { HUDController } from './ui/hud.js';
import { ModalController } from './ui/modals.js';
import { ViewportManager } from './ui/viewport.js';
import { GameRenderer } from './rendering/renderer.js';
import { CoupleManager } from './systems/coupleManager.js';
import { CloudSaveManager } from './systems/cloudSaveManager.js';
import { AuthModal } from './ui/authModal.js';
import { CoupleModal } from './ui/coupleModal.js';
import { MultiplayerManager } from './systems/multiplayerManager.js';
import { onAuthChange } from './firebase/auth.js';
import { TitleScreenController } from './ui/titleScreen.js';
import { migrateProfileNames } from './core/profile.js';

export class PixelHeartsGame {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.offscreen = PixelArtFactory.createCanvas(VIEW_WIDTH * RENDER_SCALE, VIEW_HEIGHT * RENDER_SCALE);
    this.offCtx = this.offscreen.getContext("2d", { alpha: false });

    this.tiles = PixelArtFactory.generateTiles();
    this.ayushFrames = PixelArtFactory.generateCharacterFrames(false);
    this.partnerFrames = PixelArtFactory.generateCharacterFrames(true);
    this.miraSprite = PixelArtFactory.generateMiraSprite();

    this.input = new InputManager();
    this.world = new LevelWorld();
    this.camera = new Camera2D();
    this.sound = new SoundEngine();

    this.gameState = "menu"; // "menu" | "playing"

    // Milestone 4C Profile & Mode State
    this.selectedCharacter = safeStorageGet("ph_character_gender", "male");
    const migrated = migrateProfileNames(
      safeStorageGet("ph_player_name", null),
      safeStorageGet("ph_partner_name", null),
      this.selectedCharacter
    );
    this.playerName = migrated.playerName;
    this.partnerName = migrated.partnerName;
    this.adventureMode = safeStorageGet("ph_adventure_type", "story");
    this.gameMode = safeStorageGet("ph_game_mode", "solo");

    this.companionHoldMode = false;
    this.weatherMode = "fireflies";
    this.effectsQuality = safeStorageGet("ph_effects_quality", "high");
    this.reducedMotion = safeStorageGet("ph_reduced_motion", "auto");
    this.partnerBlockedTimer = 0;
    this.lastZoneText = "";
    this.debugMode = false;

    this.ayush = new Actor(this.playerName, 8 * TILE_SIZE, 12 * TILE_SIZE, this.ayushFrames);
    this.player = this.ayush;
    this.partner = new Actor(this.partnerName, 6 * TILE_SIZE, 12 * TILE_SIZE, this.partnerFrames);

    this.questItems = new Set();
    this.unlockedMemories = new Set();
    this.storyFlags = {
      signRead: false,
      miraMet: false,
      plateActivatedOnce: false,
      bridgeUnlockedPermanently: false,
      shrineLit: false,
      introShown: false
    };

    this.particles = [];
    this.floatingHearts = [];
    this.dustMotes = [];
    this.initParticles();

    this.missionManager = new MissionManager(this);
    this.dialogue = new DialogueController(this);
    this.hud = new HUDController(this);
    this.modals = new ModalController(this);
    this.viewport = new ViewportManager(this);
    this.renderer = new GameRenderer(this.canvas);
    this.couple = new CoupleManager(this);
    this.coupleManager = this.couple;
    this.cloudSave = new CloudSaveManager(this, this.couple);
    this.authModal = new AuthModal(this);
    this.coupleModal = new CoupleModal(this);
    this.multiplayer = new MultiplayerManager(this);
    this.titleScreen = new TitleScreenController(this);

    this.modals.bindUI();
    this.viewport.bind();
    this.cloudSave.init();
    if (SaveManager.hasValidSave()) {
      SaveManager.loadGame(this);
    }
    this.titleScreen.init();
    this.titleScreen.show();

    // Hook Multiplayer state updates to HUD status pill
    this.multiplayer.onChange((mp) => {
      if (!mp.isCoopActive) {
        this.hud.updateCoopPill("solo", "♥ Solo", "Click to Play Together with your partner in real time");
      } else if (!mp.isPartnerConnected) {
        this.hud.updateCoopPill("connecting", "♥ Waiting...", "Waiting for partner to join room");
      } else if (mp.isPartnerInSameZone) {
        const partnerName = mp.presence.partnerStatus.displayName || "Partner";
        this.hud.updateCoopPill("live", `♥ ${partnerName} Live`, `Connected with ${partnerName} in real time`);
      } else {
        const partnerName = mp.presence.partnerStatus.displayName || "Partner";
        const zoneName = mp.getZoneDisplayName(mp.presence.partnerStatus.zoneId);
        this.hud.updateCoopPill("other_zone", `♥ ${partnerName} (${zoneName})`, `${partnerName} is exploring ${zoneName}`);
      }
    });

    // Subscribe to Firebase Authentication state changes
    onAuthChange(async (user) => {
      await this.couple.init(user);
      if (user && this.cloudSave) {
        this.cloudSave.uploadLocalSave();
      }
      if (!user && this.multiplayer) {
        this.multiplayer.leaveRoom();
      }
      if (this.titleScreen) {
        this.titleScreen.updateOnlineStatusDisplay();
      }
    });

    this.updateViewportLayout();
    this.registerServiceWorker();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  startGameplay(options = {}) {
    const isContinue = Boolean(options.isContinue);

    if (isContinue) {
      const loadResult = SaveManager.loadGame(this);
      if (loadResult.loaded) {
        this.showQuestToast("SAVE LOADED ♥", `Welcome back, ${this.playerName} & ${this.partnerName}!`);
      }
    } else {
      if (options.character) {
        this.selectedCharacter = options.character;
        safeStorageSet("ph_character_gender", this.selectedCharacter);
      }
      if (options.playerName) {
        this.playerName = options.playerName;
        safeStorageSet("ph_player_name", this.playerName);
      }
      if (options.partnerName) {
        this.partnerName = options.partnerName;
        safeStorageSet("ph_partner_name", this.partnerName);
      }
      if (options.gameMode) {
        this.gameMode = options.gameMode;
        safeStorageSet("ph_game_mode", this.gameMode);
      }
      if (options.adventureMode) {
        this.adventureMode = options.adventureMode;
        safeStorageSet("ph_adventure_type", this.adventureMode);
      }

      const playerActor = this.player || this.ayush;
      if (playerActor) {
        playerActor.name = this.playerName;
        playerActor.x = 8 * TILE_SIZE;
        playerActor.y = 12 * TILE_SIZE;
        playerActor.vx = 0;
        playerActor.vy = 0;
      }
      if (this.partner) {
        this.partner.name = this.partnerName;
        this.partner.x = 6 * TILE_SIZE;
        this.partner.y = 12 * TILE_SIZE;
      }

      // Reset level collectibles and mission progress for new game
      for (const c of this.world.collectibles) {
        c.collected = false;
      }
      this.questItems.clear();
      this.unlockedMemories.clear();
      this.storyFlags = {
        signRead: false,
        miraMet: false,
        plateActivatedOnce: false,
        bridgeUnlockedPermanently: false,
        shrineLit: false,
        introShown: false
      };
      this.world.bridgeUnlockedPermanently = false;
      this.world.shrineLit = false;
      this.world.platePressed = false;
      this.missionManager.resetToDefaults();
      SaveManager.saveGame(this);
    }

    this.gameState = "playing";
    if (this.titleScreen) {
      this.titleScreen.hide();
    }

    // Update HUD badges and elements
    const pNameEl = document.getElementById("hud-player-name");
    if (pNameEl) pNameEl.textContent = this.playerName.toUpperCase();
    const partNameEl = document.getElementById("hud-partner-name");
    if (partNameEl) partNameEl.textContent = this.partnerName.toUpperCase();

    this.updateStatsUI();
    this.updateQuestHUD();
    this.updateCompanionUI();

    // Mode handling: Co-Op vs Solo
    if (this.gameMode === "coop") {
      if (this.couple && this.couple.coupleId && this.couple.currentUser) {
        const partnerUid = this.couple.partnerUid || "partner_placeholder";
        this.multiplayer.joinRoom(this.couple.coupleId, this.couple.currentUser.uid, partnerUid);
      } else {
        this.showQuestToast("CO-OP MODE", "Please link your couple account to connect live!");
        if (this.modals) this.modals.openModal("couple-modal");
      }
    } else {
      if (this.multiplayer) {
        this.multiplayer.playSolo();
      }
    }

    // Trigger prologue if story mode and not yet seen
    if (!isContinue && this.adventureMode === "story" && !this.storyFlags.introShown) {
      this.storyFlags.introShown = true;
      this.dialogue.open(
        "STARLIGHT FESTIVAL PROLOGUE",
        [
          `Tonight is Oakvale's annual Starlight Festival! ${this.playerName} and ${this.partnerName} have arrived in the village to light the ancient Starlight Shrine together.`,
          `Start by walking right to inspect the Oakvale Noticeboard [col 12] and pressing [B / ACT] (or E on keyboard) to begin Mission 1.`
        ]
      );
      SaveManager.saveGame(this);
    }
  }

  returnToTitleScreen() {
    if (this.gameState === "menu") return;
    SaveManager.saveGame(this);
    if (this.multiplayer && this.multiplayer.isCoopActive) {
      this.multiplayer.leaveRoom();
    }
    this.gameState = "menu";
    if (this.titleScreen) {
      this.titleScreen.show();
    }

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  getScrapbookCatalog() {
    return [
      {
        id: "mem_1",
        title: "Memory #1: First Coffee in Oakvale",
        location: "Oakvale Village Rooftop (Shard #1)",
        hint: "Climb the monolith ledges above eastern Oakvale Village (col 54).",
        text: `${this.playerName} still remembers how nervous they were waiting by the village lantern post—until ${this.partnerName} smiled and made the whole evening glow.`
      },
      {
        id: "mem_2",
        title: "Memory #2: Secret Under the Canopy",
        location: "Whispering Forest High Branch (Shard #2)",
        hint: "Leap across the mossy forest canopy platforms in Zone 2 (col 95).",
        text: `Even when the forest trails grew steep, ${this.playerName} and ${this.partnerName} never rushed ahead alone. Every climb feels lighter side by side.`
      },
      {
        id: "mem_3",
        title: "Memory #3: Promise at the Bridge",
        location: "Sanctuary Cliff Ledge (Shard #3)",
        hint: "Explore the elevated ledges just before the Starlight Shrine (col 185).",
        text: `No distance or chasm keeps us apart for long—one holds the anchor while the other builds the way across.`
      },
      {
        id: "mem_4",
        title: "Memory #4: Mira's Twin-Flame Blessing",
        location: "Lantern Keeper's Sanctuary (Mission 4)",
        hint: "Speak with Lantern Keeper Mira outside her sanctuary in Oakvale (col 44).",
        text: `Lantern Keeper Mira handed ${this.partnerName} and ${this.playerName} a twin-flame charm: "A bridge isn't held by stone alone, but by trust between both banks."`
      },
      {
        id: "mem_5",
        title: "Memory #5: Starlight Shrine Promise",
        location: "Starlight Couple Shrine Summit (Mission 6)",
        hint: "Repair the Broken Bridge and ignite the Starlight Shrine together (col 190).",
        text: `Under a sky full of lantern fireflies, ${this.playerName} and ${this.partnerName} lit the Starlight Beacon together—turning a quiet village evening into a forever memory.`
      }
    ];
  }

  unlockScrapbookMemory(memoryId, silent = false) {
    if (!memoryId || this.unlockedMemories.has(memoryId)) return false;
    this.unlockedMemories.add(memoryId);
    const entry = this.getScrapbookCatalog().find((e) => e.id === memoryId);
    if (entry && !silent) {
      this.showQuestToast("SCRAPBOOK MEMORY UNLOCKED 📖", entry.title);
    }
    return true;
  }

  grantQuestItem(itemId, silent = false) {
    if (!itemId || !QUEST_ITEM_CATALOG[itemId] || this.questItems.has(itemId)) return false;
    this.questItems.add(itemId);
    if (!silent) {
      this.showQuestToast("ITEM ACQUIRED 🎒", QUEST_ITEM_CATALOG[itemId].name);
    }
    return true;
  }

  showQuestToast(title, body) {
    this.hud.showQuestToast(title, body);
  }

  updateQuestHUD() {
    this.hud.updateQuestHUD();
  }

  updateStatsUI() {
    this.hud.updateStatsUI();
  }

  updateCompanionUI() {
    this.hud.updateCompanionUI();
  }

  isAnyModalOpen() {
    return this.modals.isAnyModalOpen();
  }

  closeAllModals() {
    this.modals.closeAllModals();
  }

  openModal(modalId) {
    this.modals.openModal(modalId);
  }

  renderQuestsModal() {
    this.modals.renderQuestsModal();
  }

  renderInventoryModal() {
    this.modals.renderInventoryModal();
  }

  renderScrapbookModal() {
    this.modals.renderScrapbookModal();
  }

  toggleFullscreen() {
    this.viewport.toggleFullscreen();
  }

  updateViewportLayout() {
    this.viewport.updateLayout();
  }

  showBanner(speaker, text, onComplete = null) {
    const pages = Array.isArray(text) ? text : [String(text)];
    this.dialogue.open(speaker, pages, onComplete);
  }

  initParticles() {
    this.particles = [];
    const hues = [48, 185, 325, 155]; // Gold, Cyan, Magenta, Emerald
    for (let i = 0; i < 52; i++) {
      this.particles.push({
        x: Math.random() * VIEW_WIDTH,
        y: Math.random() * VIEW_HEIGHT,
        vx: (Math.random() - 0.5) * 16,
        vy: -(Math.random() * 10 + 4),
        phase: Math.random() * Math.PI * 2,
        size: Math.random() * 1.4 + 0.8,
        hue: hues[i % hues.length]
      });
    }
  }

  spawnDustMotes(x, y, color = "#67e8f9", count = 6) {
    for (let i = 0; i < count; i++) {
      this.dustMotes.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y - Math.random() * 2,
        vx: (Math.random() - 0.5) * 32,
        vy: -Math.random() * 24 - 6,
        life: 1.0,
        color
      });
    }
  }

  spawnHeartBurst(x, y) {
    for (let i = 0; i < 6; i++) {
      this.floatingHearts.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y - Math.random() * 6,
        vy: -18 - Math.random() * 14,
        life: 1.0
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.phase += dt * 2.4;
      if (this.weatherMode === "fireflies") {
        p.x += Math.cos(p.phase) * 10 * dt;
        p.y += p.vy * dt;
      } else if (this.weatherMode === "petals") {
        p.x -= 26 * dt + Math.sin(p.phase) * 8 * dt;
        p.y += 20 * dt;
      } else {
        p.x -= 18 * dt;
        p.y += 145 * dt;
      }
      if (p.x < 0) p.x += VIEW_WIDTH;
      if (p.x > VIEW_WIDTH) p.x -= VIEW_WIDTH;
      if (p.y < 0) p.y += VIEW_HEIGHT;
      if (p.y > VIEW_HEIGHT) p.y -= VIEW_HEIGHT;
    }

    for (let i = this.floatingHearts.length - 1; i >= 0; i--) {
      const h = this.floatingHearts[i];
      h.y += h.vy * dt;
      h.life -= dt * 0.9;
      if (h.life <= 0) this.floatingHearts.splice(i, 1);
    }

    for (let i = this.dustMotes.length - 1; i >= 0; i--) {
      const m = this.dustMotes[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt * 1.8;
      if (m.life <= 0) this.dustMotes.splice(i, 1);
    }
  }

  registerServiceWorker() {
    if (
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1")
    ) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  respawnCharactersOnly() {
    this.ayush.x = 8 * TILE_SIZE;
    this.ayush.y = 12 * TILE_SIZE;
    this.ayush.vx = 0;
    this.ayush.vy = 0;
    this.partner.x = 6 * TILE_SIZE;
    this.partner.y = 12 * TILE_SIZE;
    this.partner.vx = 0;
    this.partner.vy = 0;
    this.companionHoldMode = false;
    this.updateCompanionUI();
    SaveManager.saveGame(this);
    this.showQuestToast("RESPAWNED IN OAKVALE", "Progress, crystals & memories kept!");
  }

  resetAllProgressNewGame() {
    SaveManager.clearSave();
    this.world = new LevelWorld();
    this.ayush.x = 8 * TILE_SIZE;
    this.ayush.y = 12 * TILE_SIZE;
    this.ayush.vx = 0;
    this.ayush.vy = 0;
    this.partner.x = 6 * TILE_SIZE;
    this.partner.y = 12 * TILE_SIZE;
    this.partner.vx = 0;
    this.partner.vy = 0;
    this.companionHoldMode = false;
    this.questItems = new Set();
    this.unlockedMemories = new Set();
    this.storyFlags = {
      signRead: false,
      miraMet: false,
      plateActivatedOnce: false,
      bridgeUnlockedPermanently: false,
      shrineLit: false,
      introShown: true
    };
    this.missionManager = new MissionManager(this);
    this.updateCompanionUI();
    this.updateStatsUI();
    this.updateQuestHUD();
    SaveManager.saveGame(this);
    if (this.cloudSave) {
      this.cloudSave.handleResetProgress();
    }
    this.dialogue.open(
      "NEW GAME STARTED — OAKVALE VILLAGE",
      [
        `All mission progress, crystals, and scrapbook memories have been reset for a fresh adventure with ${this.partnerName}.`,
        `Walk East to the Oakvale Noticeboard [col 12] and press [B / ACT] to begin Mission 1: Explore Oakvale!`
      ]
    );
  }

  resetLevel() {
    this.respawnCharactersOnly();
  }

  toggleCompanionMode() {
    this.companionHoldMode = !this.companionHoldMode;
    this.partner.heartTimer = 1.1;
    this.ayush.heartTimer = 1.1;
    this.spawnHeartBurst(this.partner.x + 6, this.partner.y - 4);

    const plateX = 145 * TILE_SIZE;
    const nearWestPlate =
      Math.abs(this.partner.x - plateX) < 84 || Math.abs(this.ayush.x - plateX) < 84;
    if (this.companionHoldMode && nearWestPlate) {
      this.partner.x = plateX;
      this.partner.y = 15 * TILE_SIZE - this.partner.height;
      this.partner.vx = 0;
      this.partner.vy = 0;
      this.partner.onGround = true;
      this.world.platePressed = true;
      this.sound.playPlate();
      this.updateStatsUI();
      this.dialogue.open(
        `${this.partnerName.toUpperCase()} — HOLDING PLATE`,
        [
          `"I've got the West Pressure Plate held down, ${this.playerName}! The Starlight Bridge is glowing—cross the ravine and lock the East Bank Winch!"`
        ]
      );
    }
    this.updateCompanionUI();
    SaveManager.saveGame(this);
  }

  handleObjectInteraction(obj) {
    if (obj.id === "village_sign") {
      if (!this.storyFlags.signRead) {
        this.dialogue.open(
          "OAKVALE NOTICEBOARD",
          [
            `"Welcome to Oakvale's Starlight Festival! Trail Guide: Follow the lantern path East through Whispering Forest to reach the Starlight Couple Shrine."`,
            `${this.partnerName}: "Look, ${this.playerName}! Someone pinned a trail note here—it says Lantern Keeper Mira at the eastern sanctuary [col 44] has the key to the ravine bridge winch!"`
          ],
          () => {
            this.storyFlags.signRead = true;
            this.grantQuestItem("oakvale_map");
            this.setMissionProgressSafe("m1_explore_oakvale", "read_village_sign", 1);
            SaveManager.saveGame(this);
          }
        );
      } else {
        this.dialogue.open(
          "OAKVALE NOTICEBOARD",
          [
            `"Trail Guide: Collect the 8 Heart Crystals and 3 Memory Shards along the forest canopy, and speak with Lantern Keeper Mira at col 44 before crossing the ravine."`
          ]
        );
      }
      return;
    }

    if (obj.id === "elder_cottage") {
      if (this.missionManager.getMission("m4_find_lantern_keeper").status === "locked") {
        this.unlockMissionSafe("m4_find_lantern_keeper", true);
      }

      if (!this.storyFlags.miraMet) {
        this.dialogue.open(
          "LANTERN KEEPER MIRA",
          [
            `"Blessings on your evening, ${this.playerName} and ${this.partnerName}! Heading up to the Starlight Shrine? Last night's gale snapped the old rope bridge across the ravine."`,
            `"Take this Starlight Winch Key and Twin-Flame Lantern Charm. When you reach the West Bank Plate [col 145], have ${this.partnerName} hold the plate ([C] or ♥ STAY/GO) while ${this.playerName} crosses the astral span and locks the East Winch!"`
          ],
          () => {
            this.storyFlags.miraMet = true;
            this.grantQuestItem("winch_key");
            this.grantQuestItem("lantern_charm");
            this.unlockScrapbookMemory("mem_4");
            this.setMissionProgressSafe("m4_find_lantern_keeper", "talk_to_mira", 1);
            SaveManager.saveGame(this);
          }
        );
      } else {
        const bridgeDone = this.world.bridgeUnlockedPermanently;
        this.dialogue.open(
          "LANTERN KEEPER MIRA",
          [
            bridgeDone
              ? `"I saw the Astral Starlight Bridge flare to life across the ravine! Head up to the Shrine summit together and light the beacon!"`
              : `"Remember: position ${this.partnerName} on the West Stone Plate [col 145] and press [C / ♥ STAY-GO], then cross the bridge and use my Winch Key on the East Bank Winch [col 168]."`
          ]
        );
      }
      return;
    }

    if (obj.id === "west_plate") {
      const plateX = 145 * TILE_SIZE;
      this.companionHoldMode = true;
      this.partner.x = plateX;
      this.partner.y = 15 * TILE_SIZE - this.partner.height;
      this.partner.vx = 0;
      this.partner.vy = 0;
      this.partner.onGround = true;
      this.world.platePressed = true;
      this.updateCompanionUI();
      this.updateStatsUI();
      this.dialogue.open(
        "ANCIENT STONE PRESSURE PLATE — ACTIVATED",
        [
          `${this.partnerName} stepped onto the rune-carved West Stone Pressure Plate and is holding it down!`,
          `The Astral Starlight Bridge has solidified across the chasm—run across to the East Bank Winch [col 168] and press [B / ACT] to lock it permanently!`
        ],
        () => {
          if (!this.storyFlags.plateActivatedOnce) {
            this.storyFlags.plateActivatedOnce = true;
            if (this.missionManager.getMission("m5_repair_bridge").status === "locked") {
              this.missionManager.unlockMission("m5_repair_bridge", true);
            }
            this.missionManager.setObjectiveProgress("m5_repair_bridge", "hold_west_plate", 1);
          }
          SaveManager.saveGame(this);
        }
      );
      return;
    }

    if (obj.id === "east_winch") {
      if (this.world.bridgeUnlockedPermanently) {
        this.dialogue.open(
          "EAST BANK BRIDGE WINCH",
          [
            `The astral bridge monoliths are permanently locked with Mira's Starlight Winch Key. Both partners can cross freely!`
          ]
        );
        return;
      }

      if (!this.world.platePressed && this.ayush.x < 150 * TILE_SIZE) {
        this.dialogue.open(
          "EAST BANK BRIDGE WINCH",
          [`You must cross the chasm while the West Stone Pressure Plate is held down to reach the winch.`]
        );
        return;
      }

      if (this.missionManager.getMission("m5_repair_bridge").status === "locked") {
        this.unlockMissionSafe("m5_repair_bridge", true);
      }

      this.dialogue.open(
        "BRIDGE REPAIRED!",
        [
          `${this.playerName} engaged the East Bank Winch! The Astral Starlight Bridge is now permanently anchored across the ravine.`,
          `${this.partnerName} switches back to Follow mode and glides across the glowing span to rejoin you!`
        ],
        () => {
          this.world.bridgeUnlockedPermanently = true;
          this.sound.playBridgeUnlock();
          this.storyFlags.bridgeUnlockedPermanently = true;
          this.companionHoldMode = false;
          this.updateCompanionUI();
          this.updateStatsUI();
          this.spawnHeartBurst(obj.x, obj.y - 10);
          this.setMissionProgressSafe("m5_repair_bridge", "hold_west_plate", 1, true);
          this.setMissionProgressSafe("m5_repair_bridge", "lock_east_winch", 1);
          SaveManager.saveGame(this);
          if (this.multiplayer) {
            this.multiplayer.broadcastEvent("bridge_repaired", {});
          }
        }
      );
      return;
    }

    if (obj.id === "starlight_shrine") {
      const activePartner = (this.multiplayer && this.multiplayer.isCoopActive && this.multiplayer.remoteActor && this.multiplayer.remoteActor.visible)
        ? this.multiplayer.remoteActor
        : this.partner;
      const partnerDist = Math.hypot(activePartner.x + 6 - obj.x, activePartner.y + 8 - obj.y);
      if (!this.world.bridgeUnlockedPermanently) {
        this.dialogue.open(
          "STARLIGHT COUPLE SHRINE",
          [
            `The Shrine awaits both hearts, but the Broken Bridge must be permanently repaired first so ${this.partnerName} can stand beside you!`
          ]
        );
        return;
      }

      if (partnerDist >= 56) {
        this.dialogue.open(
          "STARLIGHT COUPLE SHRINE",
          [
            `Both hearts are needed to ignite the Starlight Beacon! Make sure your partner is standing right beside you at the Shrine summit.`
          ]
        );
        return;
      }

      const crystals = this.world.collectibles.filter((c) => c.type === "crystal" && c.collected).length;
      const memories = this.world.collectibles.filter((c) => c.type === "memory" && c.collected).length;

      if (this.missionManager.getMission("m6_light_shrine").status === "locked") {
        this.unlockMissionSafe("m6_light_shrine", true);
      }

      this.dialogue.open(
        `♥ STARLIGHT SHRINE IGNITED — ${this.playerName.toUpperCase()} & ${this.partnerName.toUpperCase()} ♥`,
        [
          `Hand in hand, ${this.playerName} and ${this.partnerName} raise the Twin-Flame Charm. A pillar of rose-gold and cyan starlight arcs into the night sky above Oakvale!`,
          `Milestone 2 Story Complete! Heart Crystals: ${crystals}/8 | Memory Shards: ${memories}/3 | Scrapbook Memories Unlocked: ${Math.min(5, this.unlockedMemories.size + 1)}/5.`
        ],
        () => {
          this.world.shrineLit = true;
          this.sound.playShrineIgnite();
          this.storyFlags.shrineLit = true;
          this.grantQuestItem("starlight_emblem");
          this.unlockScrapbookMemory("mem_5");
          this.spawnHeartBurst(this.ayush.x, this.ayush.y - 8);
          this.spawnHeartBurst(this.partner.x, this.partner.y - 8);
          this.setMissionProgressSafe("m6_light_shrine", "ignite_shrine_together", 1);
          SaveManager.saveGame(this);
          if (this.multiplayer) {
            this.multiplayer.broadcastEvent("shrine_ignited", {});
          }
        }
      );
    }
  }

  setMissionProgressSafe(missionId, objKey, amount, absolute = false) {
    if (this.adventureMode === "explore") return;
    if (this.missionManager) {
      this.missionManager.setObjectiveProgress(missionId, objKey, amount, absolute);
    }
  }

  unlockMissionSafe(missionId, silent = false) {
    if (this.adventureMode === "explore") return;
    if (this.missionManager) {
      this.missionManager.unlockMission(missionId, silent);
    }
  }

  update(dt) {
    if (this.gameState === "menu") {
      this.updateParticles(dt);
      this.input.endFrame();
      return;
    }

    if (this.input.consumeKey("KeyP")) {
      const modal = document.getElementById("settings-modal");
      const isHidden = modal.classList.contains("hidden");
      this.closeAllModals();
      if (isHidden) modal.classList.remove("hidden");
    }
    if (this.input.consumeKey("KeyQ")) {
      const modal = document.getElementById("quests-modal");
      const isHidden = modal.classList.contains("hidden");
      this.closeAllModals();
      if (isHidden) this.openModal("quests-modal");
    }
    if (this.input.consumeKey("KeyI")) {
      const modal = document.getElementById("inventory-modal");
      const isHidden = modal.classList.contains("hidden");
      this.closeAllModals();
      if (isHidden) this.openModal("inventory-modal");
    }
    if (this.input.consumeKey("KeyM")) {
      const modal = document.getElementById("scrapbook-modal");
      const isHidden = modal.classList.contains("hidden");
      this.closeAllModals();
      if (isHidden) this.openModal("scrapbook-modal");
    }

    if (this.isAnyModalOpen()) {
      this.input.endFrame();
      return;
    }

    if (this.dialogue.isOpen) {
      if (this.input.consumeInteractPress() || this.input.consumeJumpPress()) {
        this.dialogue.advance();
      }
      this.ayush.updatePhysics(dt, this.world, 0, false, false);
      this.partner.updatePhysics(dt, this.world, 0, false, false);
      this.camera.update(dt, this.ayush);
      this.updateParticles(dt);
      this.input.endFrame();
      return;
    }

    if (this.input.consumeCompanionToggle()) {
      this.toggleCompanionMode();
    }

    const moveX = this.input.moveX;
    const jumpPressed = this.input.consumeJumpPress();
    const jumpHeld = this.input.jumpHeld;
    const wasInAir = !this.ayush.onGround;
    if (jumpPressed && (this.ayush.onGround || this.ayush.coyoteTimer > 0)) {
      this.sound.playJump();
    }
    this.ayush.updatePhysics(dt, this.world, moveX, jumpPressed, jumpHeld);
    if (wasInAir && this.ayush.onGround) {
      this.sound.playLand();
    }
    if (this.ayush.justLanded) {
      this.spawnDustMotes(this.ayush.x + 6, this.ayush.y + this.ayush.height, "#67e8f9", 6);
    }

    if (this.input.consumeKey("Backquote") || this.input.consumeKey("F3") || this.input.consumeKey("KeyV")) {
      this.debugMode = !this.debugMode;
      this.showQuestToast(
        this.debugMode ? "DEBUG OVERLAY ENABLED [~ / F3 / V]" : "DEBUG OVERLAY DISABLED",
        this.debugMode
          ? "Showing AABB hitboxes, collision tiles, velocities & interaction radii."
          : "Returned to clean visual presentation."
      );
    }

    // Real-Time Co-Op Multiplayer update
    if (this.multiplayer) {
      this.multiplayer.update(dt, performance.now());
    }

    const humanPartnerOnline = this.multiplayer && this.multiplayer.isCoopActive && this.multiplayer.isPartnerConnected;

    if (humanPartnerOnline) {
      // Remote human player is active in the room; suppress local AI companion movement and rendering
      this.partner.visible = false;
    } else {
      // Solo mode or partner offline/disconnected: AI companion operates normally
      this.partner.visible = true;
      let partnerMove = 0;
      let partnerJump = false;
      if (!this.companionHoldMode) {
        const dx = this.ayush.x - this.partner.x;
        const nearChasmEdge =
          !this.world.platePressed &&
          !this.world.bridgeUnlockedPermanently &&
          this.partner.x > 146 * TILE_SIZE &&
          this.partner.x < 150 * TILE_SIZE &&
          dx > 0;

        // Auto-anchor Partner on West Pressure Plate (col 145) if Ayush steps toward the chasm before bridge is locked
        if (
          !this.world.bridgeUnlockedPermanently &&
          this.ayush.x >= 146 * TILE_SIZE &&
          this.ayush.x <= 170 * TILE_SIZE &&
          Math.abs(this.partner.x - 145 * TILE_SIZE) < 42
        ) {
          this.partner.x = 145 * TILE_SIZE;
          this.partner.y = 15 * TILE_SIZE - this.partner.height;
          this.partner.vx = 0;
          this.partner.vy = 0;
          this.partner.onGround = true;
          partnerMove = 0;
        } else if (!nearChasmEdge && Math.abs(dx) > 22) {
          partnerMove = dx > 0 ? 1 : -1;
          const isBlocked = Math.abs(this.partner.vx) < 5;
          if (isBlocked) {
            this.partnerBlockedTimer = (this.partnerBlockedTimer || 0) + dt;
          } else {
            this.partnerBlockedTimer = 0;
          }
          const needHeightJump = this.ayush.y < this.partner.y - 12;
          const needObstacleJump = this.partnerBlockedTimer > 0.08;
          if (this.partner.onGround && (needHeightJump || needObstacleJump)) {
            partnerJump = true;
            this.partnerBlockedTimer = 0;
          }
        } else {
          this.partnerBlockedTimer = 0;
        }

        // If Partner is stranded on a one-way platform above Ayush, drop down to Ayush level
        const partnerBottomRow = Math.floor((this.partner.y + this.partner.height + 1) / TILE_SIZE);
        const partnerCol = Math.floor((this.partner.x + 6) / TILE_SIZE);
        if (
          this.partner.onGround &&
          this.ayush.y > this.partner.y + 16 &&
          Math.abs(dx) < 64 &&
          this.world.isOneWayAt(partnerCol, partnerBottomRow) &&
          partnerBottomRow < 15
        ) {
          this.partner.y += 6;
          this.partner.onGround = false;
        }

        // Safe catch-up if partner is far behind on the same bank or after bridge is active
        const canCatchUp =
          this.world.bridgeUnlockedPermanently ||
          this.world.platePressed ||
          this.ayush.x < 150 * TILE_SIZE;
        if (Math.abs(dx) > 260 && canCatchUp) {
          this.partner.x = Math.max(16, this.ayush.x - this.ayush.facing * 20);
          this.partner.y = this.ayush.y;
          this.partner.vx = 0;
          this.partner.vy = 0;
          this.spawnHeartBurst(this.partner.x, this.partner.y);
        }
      }

      // Pass jumpHeld = true while partner is ascending (this.partner.vy < 0) so her jump is never prematurely cut!
      const partnerJumpHeld = partnerJump || this.partner.vy < 0;
      this.partner.updatePhysics(dt, this.world, partnerMove, partnerJump, partnerJumpHeld);
    }

    const plateX = 145 * TILE_SIZE;
    const ayushOnPlate = Math.abs(this.ayush.x - plateX) < 18 && this.ayush.onGround;
    const partnerOnPlate = this.partner.visible && Math.abs(this.partner.x - plateX) < 18 && this.partner.onGround;
    const remotePartnerOnPlate =
      this.multiplayer &&
      this.multiplayer.remoteActor &&
      this.multiplayer.remoteActor.visible &&
      Math.abs(this.multiplayer.remoteActor.x - plateX) < 22 &&
      this.multiplayer.remoteActor.onGround;
    const remotePlateActive = this.multiplayer && this.multiplayer.remotePlateActive;
    const wasPlatePressed = this.world.platePressed;
    this.world.platePressed = ayushOnPlate || partnerOnPlate || remotePartnerOnPlate || remotePlateActive || this.world.bridgeUnlockedPermanently;

    if (this.world.platePressed && !this.storyFlags.plateActivatedOnce) {
      this.storyFlags.plateActivatedOnce = true;
      if (this.adventureMode !== "explore") {
        if (this.missionManager.getMission("m5_repair_bridge").status === "locked") {
          this.missionManager.unlockMission("m5_repair_bridge", true);
        }
        this.missionManager.setObjectiveProgress("m5_repair_bridge", "hold_west_plate", 1);
      }
      SaveManager.saveGame(this);
    }
    if (wasPlatePressed !== this.world.platePressed) {
      this.updateStatsUI();
    }

    for (const item of this.world.collectibles) {
      if (item.collected) continue;
      const dAyush = Math.hypot(this.ayush.x + 6 - item.x, this.ayush.y + 8 - item.y);
      const dPartner = this.partner.visible ? Math.hypot(this.partner.x + 6 - item.x, this.partner.y + 8 - item.y) : 999;
      if (dAyush < 16 || dPartner < 16) {
        item.collected = true;
        this.spawnHeartBurst(item.x, item.y);
        this.spawnDustMotes(item.x, item.y, item.type === "crystal" ? "#38bdf8" : "#fcd34d", 8);
        if (item.type === "crystal") {
          this.sound.playCrystal();
        } else {
          this.sound.playMemory();
        }

        if (this.multiplayer && this.multiplayer.isCoopActive) {
          this.multiplayer.broadcastEvent("collectible_pickup", { itemId: item.id, itemType: item.type });
        }

        if (item.type === "crystal") {
          if (this.adventureMode !== "explore") {
            if (this.missionManager.getMission("m2_gather_crystals").status === "locked") {
              this.missionManager.unlockMission("m2_gather_crystals", true);
            }
            this.missionManager.syncCollectibleCounts(false);
          }
        } else if (item.type === "memory") {
          if (this.adventureMode !== "explore") {
            if (this.missionManager.getMission("m3_recover_memories").status === "locked") {
              this.missionManager.unlockMission("m3_recover_memories", true);
            }
            this.missionManager.syncCollectibleCounts(false);
          }
          this.unlockScrapbookMemory(item.memoryId, true);
          this.dialogue.open(item.title, [item.text]);
        }

        this.updateStatsUI();
        this.updateQuestHUD();
        SaveManager.saveGame(this);
      }
    }

    if (this.input.consumeInteractPress()) {
      let handled = false;
      for (const obj of this.world.interactables) {
        const dist = Math.hypot(this.ayush.x + 6 - obj.x, this.ayush.y + 8 - obj.y);
        if (dist <= obj.radius) {
          handled = true;
          this.sound.playInteract();
          this.handleObjectInteraction(obj);
          break;
        }
      }
      if (!handled) {
        this.spawnHeartBurst(this.ayush.x + 6, this.ayush.y - 4);
      }
    }

    let zoneName = "ZONE 1: OAKVALE VILLAGE";
    if (this.ayush.x >= 140 * TILE_SIZE) {
      zoneName = "ZONE 3: BROKEN BRIDGE & SHRINE";
    } else if (this.ayush.x >= 68 * TILE_SIZE) {
      zoneName = "ZONE 2: WHISPERING FOREST";
    }
    if (this.lastZoneText !== zoneName) {
      this.lastZoneText = zoneName;
      const zoneEl = document.getElementById("hud-zone");
      if (zoneEl) zoneEl.textContent = zoneName;
    }

    this.camera.update(dt, this.ayush);
    this.updateParticles(dt);
    this.input.endFrame();
  }

  loop(nowMs) {
    const dt = Math.min((nowMs - this.lastTime) / 1000, 0.05);
    this.lastTime = nowMs;

    this.update(dt);
    this.renderer.render(this, nowMs);

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Global QA Test Runner function
export function runPixelHeartsTests() {
  const results = [];
  const logTest = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`[${passed ? "PASS" : "FAIL"}] ${name}: ${detail}`);
  };

  try {
    const game = window.__PIXEL_HEARTS_GAME__;
    if (!game) {
      logTest("Game Initialization", false, "game instance not found");
      return results;
    }
    logTest("Game Initialization", true, "PixelHeartsGame mounted");

    // 1. Jump Physics Apex Test
    const testApex = (PHYSICS.JUMP_VELOCITY * PHYSICS.JUMP_VELOCITY) / (2 * PHYSICS.GRAVITY);
    const apexPass = testApex >= 58 && testApex <= 60;
    logTest("Jump Physics Apex", apexPass, `Calculated Apex: ${testApex.toFixed(2)}px (Target: ~59.2px)`);

    // 2. Platform Reachability
    const maxStep = 32; // 2 tiles
    const reachPass = testApex > maxStep + 15;
    logTest("Platform Staircase Reachability", reachPass, `Jump Margin: +${(testApex - maxStep).toFixed(1)}px above 32px staircase step`);

    // 3. Audio System Verification
    const audioPass = Boolean(game.sound && typeof game.sound.playJump === "function" && typeof game.sound.setMute === "function");
    logTest("Audio System Integrity", audioPass, `SoundEngine initialized with BGM & SFX controls (Muted: ${game.sound.isMuted})`);

    // 4. Collectibles Verification
    const crystalCount = game.world.collectibles.filter((c) => c.type === "crystal").length;
    const memoryCount = game.world.collectibles.filter((c) => c.type === "memory").length;
    const colPass = crystalCount === 8 && memoryCount === 3;
    logTest("Collectible Counts", colPass, `${crystalCount}/8 crystals, ${memoryCount}/3 memories`);

    // 5. Missions Setup
    const missions = game.missionManager.missions;
    const mPass = missions.length === 6 && missions[0].id === "m1_explore_oakvale";
    logTest("Mission System Integrity", mPass, `${missions.length} story missions defined`);

    // 6. Save System Roundtrip
    const savePass = SaveManager.saveGame(game);
    logTest("Save System Serialization", savePass, "Saved state to localStorage successfully");

    // 7. Touch Controls Bound
    const touchBtns = document.querySelectorAll(".touch-btn");
    logTest("Touch Controls Elements", touchBtns.length === 5, `${touchBtns.length}/5 touch buttons present`);

    // 8. Companion Follow/Hold State
    const companionPass = typeof game.companionHoldMode === "boolean";
    logTest("Companion AI Mode", companionPass, `Current mode: ${game.companionHoldMode ? "HOLD" : "FOLLOW"}`);

    const allPassed = results.every((r) => r.passed);
    console.log(`=== QA TEST SUITE FINISHED: ${allPassed ? "ALL TESTS PASSED ♥" : "SOME TESTS FAILED"} ===`);
  } catch (err) {
    logTest("QA Test Runner Exception", false, err.message);
  }
  return results;
}

if (typeof window !== "undefined") {
  window.__RUN_PIXEL_HEARTS_TESTS__ = runPixelHeartsTests;
}
