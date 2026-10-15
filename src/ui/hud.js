// HUD Controller: Top Glassmorphic HUD, Counters, Quest Tracker, and Toasts
export class HUDController {
  constructor(game) {
    this.game = game;
    this.toastTimer = null;

    this.zoneEl = document.getElementById("hud-zone");
    this.partnerLabel = document.getElementById("hud-partner-name");
    this.companionModeEl = document.getElementById("hud-companion-mode");
    this.companionBtn = document.getElementById("btn-companion");
    this.crystalsEl = document.getElementById("hud-crystals");
    this.memoriesEl = document.getElementById("hud-memories");
    this.bridgeEl = document.getElementById("hud-bridge");
    this.badgeEl = document.getElementById("hud-quest-badge");
    this.questTextEl = document.getElementById("hud-quest-text");
    this.progEl = document.getElementById("hud-quest-progress");
    this.barEl = document.getElementById("hud-quest-bar-fill");
    this.quickAudioBtn = document.getElementById("btn-quick-audio");
    this.menuAudioBtn = document.getElementById("btn-menu-audio");
    this.weatherBtn = document.getElementById("btn-weather");
    this.cloudPill = document.getElementById("hud-cloud-pill");
    this.coopPill = document.getElementById("hud-coop-pill");

    if (this.cloudPill) {
      this.cloudPill.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        if (this.game.modals) this.game.modals.openModal("couple-modal");
      });
    }

    if (this.coopPill) {
      this.coopPill.addEventListener("click", () => {
        if (this.game.sound) this.game.sound.playMenuClick();
        if (this.game.modals) this.game.modals.openModal("couple-modal");
      });
    }

    this.lastZone = "";
  }

  updateCoopPill(status = "solo", label = "♥ Solo", tooltip = "Play Together / Solo Mode") {
    if (!this.coopPill) return;
    this.coopPill.className = `pixel-btn coop-pill-btn ${status}`;
    this.coopPill.textContent = label;
    this.coopPill.title = tooltip;
  }

  showQuestToast(title, body) {
    const toast = document.getElementById("quest-toast");
    const titleEl = document.getElementById("quest-toast-title");
    const bodyEl = document.getElementById("quest-toast-body");
    if (!toast || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.textContent = body;
    toast.classList.remove("hidden");

    if (this.game.sound) {
      this.game.sound.playToast();
    }

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 3200);
  }

  updateQuestHUD() {
    if (!this.badgeEl || !this.questTextEl) return;

    const completedCount = this.game.missionManager.missions.filter((m) => m.status === "completed").length;
    const totalCount = this.game.missionManager.missions.length;
    const activeMission = this.game.missionManager.getPrimaryTrackedMission();

    if (!activeMission && completedCount === totalCount) {
      this.badgeEl.textContent = `ALL ${totalCount}/${totalCount} DONE ♥`;
      this.questTextEl.textContent = `All Starlight Festival quests & memories completed!`;
      if (this.progEl) this.progEl.textContent = `${totalCount}/${totalCount}`;
      if (this.barEl) this.barEl.style.width = "100%";
    } else if (activeMission) {
      const nextObj = activeMission.objectives.find((o) => !o.completed) || activeMission.objectives[0];
      this.badgeEl.textContent = `QUEST ${activeMission.order}/${totalCount}:`;
      this.questTextEl.textContent = `${activeMission.title.replace(/^Mission \d+:\s*/, "")}: ${nextObj.text} (${nextObj.current}/${nextObj.target})`;
      if (this.progEl) this.progEl.textContent = `${nextObj.current}/${nextObj.target}`;
      if (this.barEl) {
        const pct = Math.max(8, Math.min(100, Math.round(((completedCount + nextObj.current / Math.max(1, nextObj.target)) / totalCount) * 100)));
        this.barEl.style.width = pct + "%";
      }
    }
  }

  updateStatsUI() {
    const crystals = this.game.world.collectibles.filter((c) => c.type === "crystal" && c.collected).length;
    const memories = this.game.world.collectibles.filter((c) => c.type === "memory" && c.collected).length;
    if (this.crystalsEl) this.crystalsEl.textContent = `${crystals} / 8`;
    if (this.memoriesEl) this.memoriesEl.textContent = `${memories} / 3`;

    if (this.bridgeEl) {
      if (this.game.world.bridgeUnlockedPermanently) {
        this.bridgeEl.textContent = "LOCKED ♥";
        this.bridgeEl.style.color = "#34d399";
        this.bridgeEl.style.borderColor = "rgba(52, 211, 153, 0.6)";
        this.bridgeEl.style.background = "rgba(16, 185, 129, 0.18)";
      } else if (this.game.world.platePressed) {
        this.bridgeEl.textContent = "ACTIVE (HELD)";
        this.bridgeEl.style.color = "#38bdf8";
        this.bridgeEl.style.borderColor = "rgba(56, 189, 248, 0.6)";
        this.bridgeEl.style.background = "rgba(14, 165, 233, 0.18)";
      } else {
        this.bridgeEl.textContent = "BROKEN";
        this.bridgeEl.style.color = "#fcd34d";
        this.bridgeEl.style.borderColor = "rgba(245, 158, 11, 0.55)";
        this.bridgeEl.style.background = "rgba(245, 158, 11, 0.18)";
      }
    }
  }

  updateCompanionUI() {
    if (!this.companionModeEl || !this.companionBtn) return;
    if (this.game.companionHoldMode) {
      this.companionModeEl.textContent = "[HOLDING SPOT]";
      this.companionModeEl.style.color = "#fcd34d";
      this.companionBtn.textContent = "🚶 Partner: Hold";
    } else {
      this.companionModeEl.textContent = "[FOLLOWING]";
      this.companionModeEl.style.color = "#f472b6";
      this.companionBtn.textContent = "🚶 Partner: Follow";
    }
  }

  updateZone(zoneName) {
    if (this.lastZone !== zoneName && this.zoneEl) {
      this.lastZone = zoneName;
      this.zoneEl.textContent = zoneName;
    }
  }

  updateAudioButtons() {
    if (!this.game.sound) return;
    const muted = this.game.sound.isMuted;
    if (this.quickAudioBtn) {
      this.quickAudioBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound";
      this.quickAudioBtn.classList.toggle("muted", muted);
    }
    if (this.menuAudioBtn) {
      this.menuAudioBtn.textContent = muted ? "🔇 Audio: Muted" : "🔊 Audio: On";
      this.menuAudioBtn.classList.toggle("muted", muted);
    }
  }

  updateCloudSyncPill(status, message) {
    if (!this.cloudPill) return;
    this.cloudPill.className = `pixel-btn cloud-pill-btn ${status || "local"}`;
    if (status === "synced") {
      this.cloudPill.textContent = "☁️ Synced";
      this.cloudPill.title = message || "Cloud Synced";
    } else if (status === "syncing") {
      this.cloudPill.textContent = "🔄 Syncing";
      this.cloudPill.title = message || "Syncing with cloud...";
    } else if (status === "offline_pending") {
      this.cloudPill.textContent = "⚠️ Offline";
      this.cloudPill.title = message || "Offline: changes pending";
    } else if (status === "conflict_error") {
      this.cloudPill.textContent = "❌ Sync Err";
      this.cloudPill.title = message || "Sync error";
    } else {
      this.cloudPill.textContent = "🏠 Local";
      this.cloudPill.title = message || "Local Offline Play";
    }
  }
}

