import { CHARACTERS, migrateProfileNames } from '../core/profile.js';
import { SaveManager } from '../systems/save.js';
import { renderCharacterPreview } from '../rendering/characters.js';
import { safeStorageGet, safeStorageSet } from '../core/storage.js';
import { ONLINE_COUPLE_STATUS } from '../systems/coupleManager.js';

/**
 * ============================================================================
 * PIXEL HEARTS — MILESTONE 4C: TITLE SCREEN & HOMEPAGE CONTROLLER
 * ============================================================================
 * Coordinates the main homepage, character selection, game mode selection,
 * adventure type selection, and seamless navigation into gameplay.
 */
export class TitleScreenController {
  constructor(game) {
    this.game = game;

    // Selections state
    this.selectedGender = safeStorageGet("ph_character_gender", "male");
    this.maleName = safeStorageGet("ph_male_name", "Bhoot");
    this.femaleName = safeStorageGet("ph_female_name", "Kida");

    // Perform initial migration check on stored names
    const migrated = migrateProfileNames(
      safeStorageGet("ph_player_name", null),
      safeStorageGet("ph_partner_name", null),
      this.selectedGender
    );
    if (this.selectedGender === "female") {
      this.femaleName = migrated.playerName;
      this.maleName = migrated.partnerName;
    } else {
      this.maleName = migrated.playerName;
      this.femaleName = migrated.partnerName;
    }

    this.selectedGameMode = safeStorageGet("ph_game_mode", "solo"); // "solo" | "coop"
    this.selectedAdventureType = safeStorageGet("ph_adventure_type", "story"); // "story" | "explore"

    this.currentView = "main"; // "main" | "character" | "mode" | "adventure" | "credits"
    this.animFrameId = null;
    this.previewActive = false;

    // DOM references
    this.rootEl = null;
    this.views = {};
    this.continueBtn = null;
    this.continueSummaryEl = null;
    this.malePreviewCanvas = null;
    this.femalePreviewCanvas = null;
    this.maleNameInput = null;
    this.femaleNameInput = null;
  }

  init() {
    this.rootEl = document.getElementById("title-screen");
    if (!this.rootEl) return;

    this.views = {
      main: document.getElementById("view-title-main"),
      character: document.getElementById("view-char-select"),
      mode: document.getElementById("view-game-mode"),
      adventure: document.getElementById("view-adventure-type"),
      credits: document.getElementById("view-credits")
    };

    this.continueBtn = document.getElementById("btn-title-continue");
    this.continueSummaryEl = document.getElementById("title-continue-summary");

    this.malePreviewCanvas = document.getElementById("canvas-preview-male");
    this.femalePreviewCanvas = document.getElementById("canvas-preview-female");

    this.maleNameInput = document.getElementById("input-male-name");
    this.femaleNameInput = document.getElementById("input-female-name");

    this.bindEvents();
    this.updateContinueState();
    this.applyCharacterSelectionUI();
    this.applyGameModeUI();
    this.applyAdventureTypeUI();
    this.updateOnlineStatusDisplay();

    // Hook CoupleManager state updates
    if (this.game.couple && typeof this.game.couple.onChange === "function") {
      this.game.couple.onChange(() => {
        this.updateOnlineStatusDisplay();
      });
    }

    // Render build identifier
    const buildBadgeEl = document.getElementById("title-build-badge");
    if (buildBadgeEl) {
      const ver = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "5.1.0";
      const commit = typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "prod";
      buildBadgeEl.textContent = `v${ver} • Build ${commit}`;
    }
  }

  show() {
    if (!this.rootEl) return;
    this.rootEl.classList.remove("hidden");
    this.switchView("main");
    this.updateContinueState();
    this.startPreviewLoop();

    // Ensure game HUD and touch controls are hidden while on title screen
    const hud = document.getElementById("hud-top");
    const touch = document.getElementById("touch-controls");
    if (hud) hud.classList.add("hidden");
    if (touch) touch.classList.add("hidden");
  }

  hide() {
    if (!this.rootEl) return;
    this.rootEl.classList.add("hidden");
    this.stopPreviewLoop();

    // Show gameplay HUD
    const hud = document.getElementById("hud-top");
    if (hud) hud.classList.remove("hidden");

    // Show touch controls if in touch mode
    const touch = document.getElementById("touch-controls");
    if (touch) touch.classList.remove("hidden");
  }

  switchView(viewName) {
    if (!this.views[viewName]) return;
    this.currentView = viewName;

    Object.keys(this.views).forEach((key) => {
      const el = this.views[key];
      if (el) {
        if (key === viewName) {
          el.classList.remove("hidden");
          el.classList.add("active");
        } else {
          el.classList.add("hidden");
          el.classList.remove("active");
        }
      }
    });

    if (viewName === "character") {
      this.startPreviewLoop();
    } else {
      this.stopPreviewLoop();
    }

    if (viewName === "mode") {
      this.updateOnlineStatusDisplay();
    }
  }

  bindEvents() {
    // -------------------------------------------------------------------------
    // View 1: Main Title Screen Buttons
    // -------------------------------------------------------------------------
    const playBtn = document.getElementById("btn-title-play");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("character");
      });
    }

    if (this.continueBtn) {
      this.continueBtn.addEventListener("click", () => {
        if (!SaveManager.hasValidSave()) return;
        if (this.game.sound) this.game.sound.playMenuClick();
        this.handleContinueGame();
      });
    }

    const charBtn = document.getElementById("btn-title-character");
    if (charBtn) {
      charBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("character");
      });
    }

    const modesBtn = document.getElementById("btn-title-modes");
    if (modesBtn) {
      modesBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("mode");
      });
    }

    const coupleBtn = document.getElementById("btn-title-couple");
    if (coupleBtn) {
      coupleBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        if (this.game.modals) this.game.modals.openModal("couple-modal");
      });
    }

    const settingsBtn = document.getElementById("btn-title-settings");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        if (this.game.modals) this.game.modals.openModal("settings-modal");
      });
    }

    const creditsBtn = document.getElementById("btn-title-credits");
    if (creditsBtn) {
      creditsBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("credits");
      });
    }

    // -------------------------------------------------------------------------
    // View 2: Character Selection
    // -------------------------------------------------------------------------
    const cardMale = document.getElementById("card-char-male");
    const cardFemale = document.getElementById("card-char-female");

    if (cardMale) {
      cardMale.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        this.selectGender("male");
      });
    }
    if (cardFemale) {
      cardFemale.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        this.selectGender("female");
      });
    }

    const pickMaleBtn = document.getElementById("btn-pick-male");
    if (pickMaleBtn) {
      pickMaleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectGender("male");
      });
    }
    const pickFemaleBtn = document.getElementById("btn-pick-female");
    if (pickFemaleBtn) {
      pickFemaleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectGender("female");
      });
    }

    if (this.maleNameInput) {
      this.maleNameInput.value = this.maleName;
      this.maleNameInput.addEventListener("input", (e) => {
        this.maleName = e.target.value.trim().slice(0, 16) || "Bhoot";
        safeStorageSet("ph_male_name", this.maleName);
      });
    }
    if (this.femaleNameInput) {
      this.femaleNameInput.value = this.femaleName;
      this.femaleNameInput.addEventListener("input", (e) => {
        this.femaleName = e.target.value.trim().slice(0, 16) || "Kida";
        safeStorageSet("ph_female_name", this.femaleName);
      });
    }

    const charBackBtn = document.getElementById("btn-char-back");
    if (charBackBtn) {
      charBackBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("main");
      });
    }
    const charNextBtn = document.getElementById("btn-char-next");
    if (charNextBtn) {
      charNextBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("mode");
      });
    }

    // -------------------------------------------------------------------------
    // View 3: Game Mode Selection
    // -------------------------------------------------------------------------
    const cardSolo = document.getElementById("card-mode-solo");
    const cardCoop = document.getElementById("card-mode-coop");

    if (cardSolo) {
      cardSolo.addEventListener("click", () => {
        this.selectGameMode("solo");
      });
    }
    if (cardCoop) {
      cardCoop.addEventListener("click", () => {
        this.selectGameMode("coop");
      });
    }

    const modeBackBtn = document.getElementById("btn-mode-back");
    if (modeBackBtn) {
      modeBackBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("character");
      });
    }
    const modeNextBtn = document.getElementById("btn-mode-next");
    if (modeNextBtn) {
      modeNextBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("adventure");
      });
    }

    const linkFromModeBtn = document.getElementById("btn-mode-open-couple");
    if (linkFromModeBtn) {
      linkFromModeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.game.sound) this.game.sound.playMenuClick();
        const user = this.game.couple ? this.game.couple.currentUser : null;
        if (!user) {
          if (this.game.modals) this.game.modals.openModal("auth-modal");
        } else {
          if (this.game.modals) this.game.modals.openModal("couple-modal");
        }
      });
    }

    const retryStatusBtn = document.getElementById("btn-mode-retry-status");
    if (retryStatusBtn) {
      retryStatusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.game.sound) this.game.sound.playMenuClick();
        if (this.game.couple) {
          this.game.couple.onlineStatus = ONLINE_COUPLE_STATUS.LOADING;
          this.game.couple.statusMessage = "Retrying online status check...";
          this.updateOnlineStatusDisplay();
          this.game.couple.init(this.game.couple.currentUser);
        }
      });
    }

    // -------------------------------------------------------------------------
    // View 4: Adventure Type Selection
    // -------------------------------------------------------------------------
    const cardStory = document.getElementById("card-adv-story");
    const cardExplore = document.getElementById("card-adv-explore");

    if (cardStory) {
      cardStory.addEventListener("click", () => {
        this.selectAdventureType("story");
      });
    }
    if (cardExplore) {
      cardExplore.addEventListener("click", () => {
        this.selectAdventureType("explore");
      });
    }

    const advBackBtn = document.getElementById("btn-adv-back");
    if (advBackBtn) {
      advBackBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("mode");
      });
    }

    const startGameBtn = document.getElementById("btn-start-game");
    if (startGameBtn) {
      startGameBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.handleStartGame();
      });
    }

    // -------------------------------------------------------------------------
    // View 5: Credits Back Button
    // -------------------------------------------------------------------------
    const creditsBackBtn = document.getElementById("btn-credits-back");
    if (creditsBackBtn) {
      creditsBackBtn.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        this.switchView("main");
      });
    }
  }

  selectGender(gender) {
    this.selectedGender = gender === "female" ? "female" : "male";
    safeStorageSet("ph_character_gender", this.selectedGender);
    if (this.game.sound) this.game.sound.playMenuClick();
    this.applyCharacterSelectionUI();
  }

  selectGameMode(mode) {
    this.selectedGameMode = mode === "coop" ? "coop" : "solo";
    safeStorageSet("ph_game_mode", this.selectedGameMode);
    if (this.game.sound) this.game.sound.playMenuClick();
    this.applyGameModeUI();
  }

  selectAdventureType(type) {
    this.selectedAdventureType = type === "explore" ? "explore" : "story";
    safeStorageSet("ph_adventure_type", this.selectedAdventureType);
    if (this.game.sound) this.game.sound.playMenuClick();
    this.applyAdventureTypeUI();
  }

  applyCharacterSelectionUI() {
    const cardMale = document.getElementById("card-char-male");
    const cardFemale = document.getElementById("card-char-female");
    const pickMaleBtn = document.getElementById("btn-pick-male");
    const pickFemaleBtn = document.getElementById("btn-pick-female");

    const isMale = this.selectedGender === "male";

    if (cardMale) cardMale.classList.toggle("selected", isMale);
    if (cardFemale) cardFemale.classList.toggle("selected", !isMale);

    if (pickMaleBtn) {
      pickMaleBtn.textContent = isMale ? "✓ Selected: Bhoot" : "Select Bhoot";
      pickMaleBtn.classList.toggle("primary", isMale);
    }
    if (pickFemaleBtn) {
      pickFemaleBtn.textContent = !isMale ? "✓ Selected: Kida" : "Select Kida";
      pickFemaleBtn.classList.toggle("primary", !isMale);
    }
  }

  applyGameModeUI() {
    const cardSolo = document.getElementById("card-mode-solo");
    const cardCoop = document.getElementById("card-mode-coop");
    const isSolo = this.selectedGameMode === "solo";

    if (cardSolo) cardSolo.classList.toggle("selected", isSolo);
    if (cardCoop) cardCoop.classList.toggle("selected", !isSolo);
  }

  applyAdventureTypeUI() {
    const cardStory = document.getElementById("card-adv-story");
    const cardExplore = document.getElementById("card-adv-explore");
    const isStory = this.selectedAdventureType === "story";

    if (cardStory) cardStory.classList.toggle("selected", isStory);
    if (cardExplore) cardExplore.classList.toggle("selected", !isStory);
  }

  updateOnlineStatusDisplay() {
    const statusTextEl = document.getElementById("mode-coop-status-text");
    const linkActionBtn = document.getElementById("btn-mode-open-couple");
    const retryBtn = document.getElementById("btn-mode-retry-status");
    if (!statusTextEl) return;

    const cm = this.game.couple;
    const status = cm ? cm.onlineStatus : ONLINE_COUPLE_STATUS.UNAUTHENTICATED;
    const statusMessage = cm ? cm.statusMessage : "🔒 Login or Link Couple Required to Play Online";

    statusTextEl.textContent = statusMessage;

    switch (status) {
      case ONLINE_COUPLE_STATUS.AUTHENTICATED_LINKED:
        statusTextEl.style.color = "#34d399";
        if (linkActionBtn) linkActionBtn.classList.add("hidden");
        if (retryBtn) retryBtn.classList.add("hidden");
        break;

      case ONLINE_COUPLE_STATUS.AUTHENTICATED_UNLINKED:
        statusTextEl.style.color = "#38bdf8";
        if (linkActionBtn) {
          linkActionBtn.textContent = "♥ Link Couple";
          linkActionBtn.classList.remove("hidden");
        }
        if (retryBtn) retryBtn.classList.add("hidden");
        break;

      case ONLINE_COUPLE_STATUS.OFFLINE:
      case ONLINE_COUPLE_STATUS.ERROR:
        statusTextEl.style.color = "#fb7185";
        if (linkActionBtn) linkActionBtn.classList.add("hidden");
        if (retryBtn) retryBtn.classList.remove("hidden");
        break;

      case ONLINE_COUPLE_STATUS.LOADING:
        statusTextEl.style.color = "#a5b4fc";
        if (linkActionBtn) linkActionBtn.classList.add("hidden");
        if (retryBtn) retryBtn.classList.add("hidden");
        break;

      case ONLINE_COUPLE_STATUS.UNAUTHENTICATED:
      default:
        statusTextEl.style.color = "#fcd34d";
        if (linkActionBtn) {
          linkActionBtn.textContent = "🔑 Sign In / Link Couple";
          linkActionBtn.classList.remove("hidden");
        }
        if (retryBtn) retryBtn.classList.add("hidden");
        break;
    }
  }

  updateContinueState() {
    const hasSave = SaveManager.hasValidSave();
    if (this.continueBtn) {
      this.continueBtn.disabled = !hasSave;
      this.continueBtn.classList.toggle("disabled", !hasSave);
      this.continueBtn.setAttribute("aria-disabled", String(!hasSave));
    }

    if (this.continueSummaryEl) {
      if (hasSave) {
        const sum = SaveManager.getSaveSummary();
        this.continueSummaryEl.textContent = `${sum.playerName} & ${sum.partnerName} • ${sum.zone} • ${sum.crystals}/8 Crystals`;
        this.continueSummaryEl.style.display = "block";
      } else {
        this.continueSummaryEl.textContent = "No saved journey found";
        this.continueSummaryEl.style.display = "block";
      }
    }
  }

  startPreviewLoop() {
    if (this.previewActive) return;
    this.previewActive = true;

    const renderPreviews = (nowMs) => {
      if (!this.previewActive) return;

      if (this.malePreviewCanvas) {
        renderCharacterPreview(
          this.malePreviewCanvas,
          "male",
          nowMs,
          this.maleNameInput ? this.maleNameInput.value : this.maleName
        );
      }
      if (this.femalePreviewCanvas) {
        renderCharacterPreview(
          this.femalePreviewCanvas,
          "female",
          nowMs,
          this.femaleNameInput ? this.femaleNameInput.value : this.femaleName
        );
      }

      this.animFrameId = requestAnimationFrame(renderPreviews);
    };

    this.animFrameId = requestAnimationFrame(renderPreviews);
  }

  stopPreviewLoop() {
    this.previewActive = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  handleContinueGame() {
    const summary = SaveManager.getSaveSummary();
    if (!summary.exists) return;

    this.game.startGameplay({
      isContinue: true,
      character: summary.selectedCharacter,
      playerName: summary.playerName,
      partnerName: summary.partnerName,
      gameMode: summary.gameMode || "solo",
      adventureMode: summary.adventureMode || "story"
    });
  }

  handleStartGame() {
    const hasSave = SaveManager.hasValidSave();

    // Determine final player and partner names
    const isMale = this.selectedGender === "male";
    const chosenPlayerName = isMale ? (this.maleName || "Bhoot") : (this.femaleName || "Kida");
    const chosenPartnerName = isMale ? (this.femaleName || "Kida") : (this.maleName || "Bhoot");

    if (hasSave) {
      // Prompt safety modal if existing progress might be reset
      const proceed = typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`An existing adventure save was found. Start a brand new journey with ${chosenPlayerName} & ${chosenPartnerName}? (Your previous save will be overwritten)`)
        : true;
      if (proceed) {
        SaveManager.clearSave();
        this.game.startGameplay({
          isContinue: false,
          character: this.selectedGender,
          playerName: chosenPlayerName,
          partnerName: chosenPartnerName,
          gameMode: this.selectedGameMode,
          adventureMode: this.selectedAdventureType
        });
      }
    } else {
      this.game.startGameplay({
        isContinue: false,
        character: this.selectedGender,
        playerName: chosenPlayerName,
        partnerName: chosenPartnerName,
        gameMode: this.selectedGameMode,
        adventureMode: this.selectedAdventureType
      });
    }
  }

  confirmAndStartNewGame() {
    this.handleStartGame();
  }
}
