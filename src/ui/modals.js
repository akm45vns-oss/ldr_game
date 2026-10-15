import { QUEST_ITEM_CATALOG } from '../core/constants.js';
import { safeStorageSet, safeStorageGet } from '../core/storage.js';
import { SaveManager } from '../systems/save.js';

// Modal Controller: Quests, Inventory, Scrapbook, Settings, and Reset Modals
export class ModalController {
  constructor(game) {
    this.game = game;
    this.modalIds = [
      "quests-modal",
      "inventory-modal",
      "scrapbook-modal",
      "settings-modal",
      "reset-confirm-modal",
      "auth-modal",
      "couple-modal"
    ];
  }

  isAnyModalOpen() {
    return this.modalIds.some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains("hidden");
    });
  }

  closeAllModals() {
    this.modalIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  }

  openModal(modalId) {
    this.closeAllModals();
    if (this.game.input) {
      this.game.input.clearAllInputs();
    }
    if (this.game.sound) {
      this.game.sound.playMenuClick();
    }
    if (modalId === "quests-modal") this.renderQuestsModal();
    if (modalId === "inventory-modal") this.renderInventoryModal();
    if (modalId === "scrapbook-modal") this.renderScrapbookModal();
    if (modalId === "auth-modal" && this.game.authModal) this.game.authModal.render();
    if (modalId === "couple-modal" && this.game.coupleModal) this.game.coupleModal.render();
    const el = document.getElementById(modalId);
    if (el) el.classList.remove("hidden");
  }

  renderQuestsModal() {
    const container = document.getElementById("quests-list-container");
    if (!container) return;
    container.innerHTML = "";

    for (const m of this.game.missionManager.missions) {
      const card = document.createElement("div");
      card.className =
        "item-card " +
        (m.status === "completed"
          ? "completed"
          : m.status === "active"
          ? "active-quest"
          : "locked");

      const objsHtml = m.objectives
        .map(
          (o) =>
            `<li class="${o.completed ? "done" : ""}">${o.completed ? "✓" : "○"} ${o.text} <strong>(${o.current}/${o.target})</strong></li>`
        )
        .join("");

      card.innerHTML = `
        <div class="item-card-header">
          <span>${m.title}</span>
          <span class="status-badge ${m.status}">${m.status.toUpperCase()}</span>
        </div>
        <div style="color:var(--text-dim); font-size:11px; line-height:1.35;">${m.description}</div>
        <ul class="obj-list">${objsHtml}</ul>
      `;
      container.appendChild(card);
    }
  }

  renderInventoryModal() {
    const container = document.getElementById("inventory-content-container");
    if (!container) return;

    const crystals = this.game.world.collectibles.filter((c) => c.type === "crystal" && c.collected).length;
    const memories = this.game.world.collectibles.filter((c) => c.type === "memory" && c.collected).length;

    let itemsHtml = "";
    if (this.game.questItems.size === 0) {
      itemsHtml = `<div class="item-card locked"><div style="color:var(--text-dim);">No special quest items yet. Explore Oakvale Village and speak with Lantern Keeper Mira!</div></div>`;
    } else {
      for (const itemId of this.game.questItems) {
        const meta = QUEST_ITEM_CATALOG[itemId];
        if (!meta) continue;
        itemsHtml += `
          <div class="item-card unlocked">
            <div class="item-card-header">
              <span>${meta.icon} ${meta.name}</span>
              <span class="status-badge completed">KEY ITEM</span>
            </div>
            <div style="color:var(--text-dim); font-size:11px;">${meta.desc}</div>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="inv-grid" style="margin-bottom:10px;">
        <div class="item-card active-quest">
          <div class="item-card-header">
            <span>✦ Heart Crystals</span>
            <span class="stat-pill">${crystals} / 8</span>
          </div>
          <div style="color:var(--text-dim); font-size:11px;">Luminous astral crystals gathered across Oakvale and Whispering Forest.</div>
        </div>
        <div class="item-card active-quest">
          <div class="item-card-header">
            <span>📖 Memory Shards</span>
            <span class="stat-pill">${memories} / 3</span>
          </div>
          <div style="color:var(--text-dim); font-size:11px;">Golden starlight shards that unlock cherished moments in your Scrapbook.</div>
        </div>
      </div>
      <div style="font-size:11px; font-weight:700; color:#67e8f9; text-transform:uppercase; margin-bottom:6px;">Quest Items Held</div>
      ${itemsHtml}
    `;
  }

  renderScrapbookModal() {
    const container = document.getElementById("scrapbook-list-container");
    if (!container) return;
    container.innerHTML = "";

    const catalog = this.game.getScrapbookCatalog();
    for (const entry of catalog) {
      const isUnlocked = this.game.unlockedMemories.has(entry.id);
      const card = document.createElement("div");
      card.className = "item-card " + (isUnlocked ? "unlocked" : "locked");

      if (isUnlocked) {
        card.innerHTML = `
          <div class="item-card-header">
            <span style="color:#fcd34d;">✦ ${entry.title}</span>
            <span class="status-badge completed">UNLOCKED ♥</span>
          </div>
          <div style="font-size:10px; color:#67e8f9; margin-bottom:4px;">Location: ${entry.location}</div>
          <div style="font-size:12px; color:var(--text-main); line-height:1.45;">"${entry.text}"</div>
        `;
      } else {
        card.innerHTML = `
          <div class="item-card-header">
            <span>🔒 Undiscovered Memory</span>
            <span class="status-badge locked">LOCKED</span>
          </div>
          <div style="font-size:11px; color:var(--text-dim);">Hint: ${entry.hint}</div>
        `;
      }
      container.appendChild(card);
    }
  }

  bindUI() {
    const game = this.game;
    const partnerLabel = document.getElementById("hud-partner-name");
    const partnerInput = document.getElementById("input-partner-name");
    if (partnerLabel) partnerLabel.textContent = game.partnerName.toUpperCase();
    if (partnerInput) {
      partnerInput.value = game.partnerName;
      partnerInput.addEventListener("input", () => {
        const val = partnerInput.value.trim() || "Aanya";
        game.partnerName = val;
        game.partner.name = val;
        if (partnerLabel) partnerLabel.textContent = val.toUpperCase();
        safeStorageSet("ph_partner_name", val);
        SaveManager.saveGame(game);
        if (game.viewport) game.viewport.updateLayout();
      });
    }

    const weatherLabels = {
      fireflies: "✨ Weather: Fireflies",
      petals: "🌸 Weather: Sakura Petals",
      rain: "🌧 Weather: Lantern Rain",
    };
    const weatherBtn = document.getElementById("btn-weather");
    if (weatherBtn) {
      weatherBtn.textContent = weatherLabels[game.weatherMode] || "✨ Weather: Fireflies";
    }

    const menuBtn = document.getElementById("btn-hud-menu");
    const drawer = document.getElementById("hud-actions-drawer");
    const closeMenu = () => {
      if (drawer && menuBtn) {
        drawer.classList.remove("menu-open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    };

    if (menuBtn && drawer) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (game.sound) game.sound.playMenuClick();
        const open = drawer.classList.toggle("menu-open");
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("pointerdown", (e) => {
        if (drawer.classList.contains("menu-open") && !drawer.contains(e.target) && e.target !== menuBtn) {
          closeMenu();
        }
      });
    }

    const addModalBtn = (id, modalTarget) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("click", () => {
          this.openModal(modalTarget);
          closeMenu();
        });
      }
    };

    addModalBtn("hud-quest-line", "quests-modal");
    addModalBtn("btn-quests", "quests-modal");
    addModalBtn("btn-inventory", "inventory-modal");
    addModalBtn("btn-scrapbook", "scrapbook-modal");
    addModalBtn("btn-couple-menu", "couple-modal");
    addModalBtn("btn-account-menu", "auth-modal");
    addModalBtn("btn-settings", "settings-modal");
    addModalBtn("btn-reset", "reset-confirm-modal");
    addModalBtn("btn-open-newgame-confirm", "reset-confirm-modal");

    const addCloseBtn = (id, modalTarget) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("click", () => {
          if (game.sound) game.sound.playMenuClick();
          const target = document.getElementById(modalTarget);
          if (target) target.classList.add("hidden");
        });
      }
    };

    addCloseBtn("btn-close-quests", "quests-modal");
    addCloseBtn("btn-close-inventory", "inventory-modal");
    addCloseBtn("btn-close-scrapbook", "scrapbook-modal");
    addCloseBtn("btn-close-settings", "settings-modal");
    addCloseBtn("btn-cancel-reset", "reset-confirm-modal");

    if (weatherBtn) {
      weatherBtn.addEventListener("click", () => {
        const modes = ["fireflies", "petals", "rain"];
        const nextIdx = (modes.indexOf(game.weatherMode) + 1) % modes.length;
        game.weatherMode = modes[nextIdx];
        weatherBtn.textContent = weatherLabels[game.weatherMode];
        if (game.sound) game.sound.playMenuClick();
        SaveManager.saveGame(game);
        closeMenu();
      });
    }

    const returnTitleBtn = document.getElementById("btn-menu-title");
    if (returnTitleBtn) {
      returnTitleBtn.addEventListener("click", () => {
        this.closeAllModals();
        closeMenu();
        if (game.sound) game.sound.playMenuClick();
        game.returnToTitleScreen();
      });
    }

    const companionBtn = document.getElementById("btn-companion");
    if (companionBtn) {
      companionBtn.addEventListener("click", () => {
        game.toggleCompanionMode();
        closeMenu();
      });
    }

    const respawnBtn = document.getElementById("btn-respawn-only");
    if (respawnBtn) {
      respawnBtn.addEventListener("click", () => {
        this.closeAllModals();
        game.respawnCharactersOnly();
      });
    }
    const confirmRespawnBtn = document.getElementById("btn-confirm-respawn");
    if (confirmRespawnBtn) {
      confirmRespawnBtn.addEventListener("click", () => {
        this.closeAllModals();
        game.respawnCharactersOnly();
      });
    }

    const confirmResetBtn = document.getElementById("btn-confirm-reset");
    if (confirmResetBtn) {
      confirmResetBtn.addEventListener("click", () => {
        this.closeAllModals();
        game.resetAllProgressNewGame();
      });
    }

    // Audio & Sound UI Controls
    const quickAudioBtn = document.getElementById("btn-quick-audio");
    const menuAudioBtn = document.getElementById("btn-menu-audio");
    const toggleSoundBtn = document.getElementById("btn-toggle-sound");
    const sliderBgm = document.getElementById("slider-bgm");
    const sliderSfx = document.getElementById("slider-sfx");
    const valBgm = document.getElementById("val-bgm");
    const valSfx = document.getElementById("val-sfx");
    const valAudioMute = document.getElementById("val-audio-mute");
    const selectGraphics = document.getElementById("select-graphics");
    const selectMotion = document.getElementById("select-reduced-motion");

    const updateAudioUI = () => {
      const muted = game.sound.isMuted;
      if (quickAudioBtn) {
        quickAudioBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound";
        quickAudioBtn.classList.toggle("muted", muted);
      }
      if (menuAudioBtn) {
        menuAudioBtn.textContent = muted ? "🔇 Audio: Muted" : "🔊 Audio: On";
        menuAudioBtn.classList.toggle("muted", muted);
      }
      if (toggleSoundBtn) {
        toggleSoundBtn.textContent = muted ? "🔇 Sound: Muted" : "🔊 Sound: Enabled";
        toggleSoundBtn.classList.toggle("muted", muted);
      }
      if (valAudioMute) {
        valAudioMute.textContent = muted ? "Muted" : "Unmuted";
      }
      if (sliderBgm && valBgm) {
        sliderBgm.value = game.sound.bgmVol;
        valBgm.textContent = Math.round(game.sound.bgmVol * 100) + "%";
      }
      if (sliderSfx && valSfx) {
        sliderSfx.value = game.sound.sfxVol;
        valSfx.textContent = Math.round(game.sound.sfxVol * 100) + "%";
      }
    };

    updateAudioUI();

    if (quickAudioBtn) {
      quickAudioBtn.addEventListener("click", () => {
        game.sound.toggleMute();
        updateAudioUI();
      });
    }

    if (menuAudioBtn) {
      menuAudioBtn.addEventListener("click", () => {
        game.sound.toggleMute();
        updateAudioUI();
        closeMenu();
      });
    }

    if (toggleSoundBtn) {
      toggleSoundBtn.addEventListener("click", () => {
        game.sound.toggleMute();
        updateAudioUI();
      });
    }

    if (sliderBgm) {
      sliderBgm.addEventListener("input", () => {
        game.sound.setBgmVolume(sliderBgm.value);
        if (valBgm) valBgm.textContent = Math.round(sliderBgm.value * 100) + "%";
      });
    }

    if (sliderSfx) {
      sliderSfx.addEventListener("input", () => {
        game.sound.setSfxVolume(sliderSfx.value);
        if (valSfx) valSfx.textContent = Math.round(sliderSfx.value * 100) + "%";
      });
      sliderSfx.addEventListener("change", () => {
        game.sound.playCrystal();
      });
    }

    if (selectGraphics) {
      selectGraphics.value = game.effectsQuality;
      selectGraphics.addEventListener("change", () => {
        game.effectsQuality = selectGraphics.value;
        safeStorageSet("ph_effects_quality", game.effectsQuality);
        game.initParticles();
        game.sound.playMenuClick();
      });
    }

    if (selectMotion) {
      selectMotion.value = game.reducedMotion;
      selectMotion.addEventListener("change", () => {
        game.reducedMotion = selectMotion.value;
        safeStorageSet("ph_reduced_motion", game.reducedMotion);
        game.sound.playMenuClick();
      });
    }

    // Touch control customization sliders
    const rootStyle = document.documentElement.style;
    const sliderScale = document.getElementById("slider-scale");
    const sliderOpacity = document.getElementById("slider-opacity");
    const sliderPad = document.getElementById("slider-pad");
    const selectHand = document.getElementById("select-handedness");
    const touchControls = document.getElementById("touch-controls");

    const savedScale = safeStorageGet("ph_touch_scale");
    const savedOpacity = safeStorageGet("ph_touch_opacity");
    const savedPad = safeStorageGet("ph_touch_pad");
    const savedHand = safeStorageGet("ph_touch_hand");

    if (savedScale && sliderScale) {
      sliderScale.value = savedScale;
      rootStyle.setProperty("--touch-scale", savedScale);
      const valEl = document.getElementById("val-scale");
      if (valEl) valEl.textContent = Math.round(parseFloat(savedScale) * 100) + "%";
    }
    if (savedOpacity && sliderOpacity) {
      sliderOpacity.value = savedOpacity;
      rootStyle.setProperty("--touch-opacity", savedOpacity);
      const valEl = document.getElementById("val-opacity");
      if (valEl) valEl.textContent = Math.round(parseFloat(savedOpacity) * 100) + "%";
    }
    if (savedPad && sliderPad) {
      sliderPad.value = savedPad;
      rootStyle.setProperty("--touch-pad", savedPad + "px");
      const valEl = document.getElementById("val-pad");
      if (valEl) valEl.textContent = savedPad + "px";
    }
    if (savedHand === "swapped" && selectHand && touchControls) {
      selectHand.value = "swapped";
      touchControls.classList.add("touch-cluster-swapped");
    }

    if (sliderScale) {
      sliderScale.addEventListener("input", () => {
        rootStyle.setProperty("--touch-scale", sliderScale.value);
        const valEl = document.getElementById("val-scale");
        if (valEl) valEl.textContent = Math.round(sliderScale.value * 100) + "%";
        safeStorageSet("ph_touch_scale", sliderScale.value);
        if (game.viewport) game.viewport.updateLayout();
      });
    }

    if (sliderOpacity) {
      sliderOpacity.addEventListener("input", () => {
        rootStyle.setProperty("--touch-opacity", sliderOpacity.value);
        const valEl = document.getElementById("val-opacity");
        if (valEl) valEl.textContent = Math.round(sliderOpacity.value * 100) + "%";
        safeStorageSet("ph_touch_opacity", sliderOpacity.value);
      });
    }

    if (sliderPad) {
      sliderPad.addEventListener("input", () => {
        rootStyle.setProperty("--touch-pad", sliderPad.value + "px");
        const valEl = document.getElementById("val-pad");
        if (valEl) valEl.textContent = sliderPad.value + "px";
        safeStorageSet("ph_touch_pad", sliderPad.value);
        if (game.viewport) game.viewport.updateLayout();
      });
    }

    if (selectHand && touchControls) {
      selectHand.addEventListener("change", () => {
        if (selectHand.value === "swapped") {
          touchControls.classList.add("touch-cluster-swapped");
        } else {
          touchControls.classList.remove("touch-cluster-swapped");
        }
        safeStorageSet("ph_touch_hand", selectHand.value);
      });
    }
  }
}
