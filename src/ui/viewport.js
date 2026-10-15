import { VIEW_WIDTH, VIEW_HEIGHT } from '../core/constants.js';

// Viewport Manager: Responsive Layout, Canvas Aspect Ratio, Fullscreen, and Orientation
export class ViewportManager {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.orientationDismissed = false;
  }

  bind() {
    const onViewportChange = () => {
      this.updateLayout();
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", () => {
      setTimeout(onViewportChange, 60);
      setTimeout(onViewportChange, 240);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
      window.visualViewport.addEventListener("scroll", onViewportChange);
    }

    const updateFsLabel = () => {
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      const fsBtn = document.getElementById("btn-fullscreen");
      if (fsBtn) {
        fsBtn.textContent = isFs ? "✕ Exit Full" : "⛶ Fullscreen";
      }
      onViewportChange();
    };

    document.addEventListener("fullscreenchange", updateFsLabel);
    document.addEventListener("webkitfullscreenchange", updateFsLabel);

    const fsBtn = document.getElementById("btn-fullscreen");
    if (fsBtn) {
      fsBtn.addEventListener("click", () => this.toggleFullscreen());
    }
    const orientFsBtn = document.getElementById("btn-orientation-fullscreen");
    if (orientFsBtn) {
      orientFsBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    const dismissBtn = document.getElementById("btn-dismiss-orientation");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        this.orientationDismissed = true;
        const overlay = document.getElementById("orientation-overlay");
        if (overlay) overlay.classList.remove("active");
        this.updateLayout();
      });
    }

    this.updateLayout();
  }

  async toggleFullscreen() {
    const docEl = document.documentElement;
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);

    if (!isFs) {
      const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (typeof reqFs === "function") {
        try {
          await reqFs.call(docEl, { navigationUI: "hide" });
          if (screen.orientation && typeof screen.orientation.lock === "function") {
            await screen.orientation.lock("landscape").catch(() => {});
          }
        } catch (_) {
          if (this.game.dialogue) {
            this.game.dialogue.show(
              "FULLSCREEN NOTICE",
              "Your browser restricted automatic fullscreen. Rotate your phone to landscape manually, or use 'Add to Home Screen' in Chrome for standalone fullscreen play."
            );
          }
        }
      } else {
        if (this.game.dialogue) {
          this.game.dialogue.show(
            "FULLSCREEN & STANDALONE TIP",
            "Fullscreen API is not supported in this browser tab. Rotate your device to landscape or install Pixel Hearts to your home screen for standalone display."
          );
        }
      }
    } else {
      const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
      if (typeof exitFs === "function") {
        try {
          await exitFs.call(document);
        } catch (_) {}
      }
    }
    this.updateLayout();
  }

  updateLayout() {
    const vv = window.visualViewport;
    const vw = Math.round(vv ? vv.width : window.innerWidth);
    const vh = Math.round(vv ? vv.height : window.innerHeight);

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--app-width", vw + "px");
    rootStyle.setProperty("--app-height", vh + "px");

    const sliderPadEl = document.getElementById("slider-pad");
    const rawPad = sliderPadEl ? parseFloat(sliderPadEl.value) || 18 : 18;
    const maxSafePad = vw < 540 ? Math.max(8, Math.floor(vw * 0.035)) : 48;
    const effPad = Math.min(maxSafePad, Math.max(8, rawPad));
    const maxSafeGap = vw < 540 ? 6 : 14;
    const availWidth = Math.max(160, vw - 2 * effPad - 20 - 3 * maxSafeGap);
    const maxSafeBtn = Math.max(36, Math.floor(availWidth / 5.1));
    rootStyle.setProperty("--max-safe-pad", maxSafePad + "px");
    rootStyle.setProperty("--max-safe-gap", maxSafeGap + "px");
    rootStyle.setProperty("--max-safe-btn", maxSafeBtn + "px");

    const targetAspect = VIEW_WIDTH / VIEW_HEIGHT;
    let displayW = vw;
    let displayH = Math.round(vw / targetAspect);
    if (displayH > vh) {
      displayH = vh;
      displayW = Math.round(vh * targetAspect);
    }
    this.canvas.style.width = displayW + "px";
    this.canvas.style.height = displayH + "px";

    const overlay = document.getElementById("orientation-overlay");
    const isPortrait = vh > vw;
    if (overlay) {
      if (isPortrait && !this.orientationDismissed) {
        overlay.classList.add("active");
      } else {
        overlay.classList.remove("active");
      }
    }

    const statusCard = document.getElementById("hud-status-card");
    const rightWrap = document.getElementById("hud-right-wrap");
    let hudBottom = 56;
    if (statusCard) {
      const rect = statusCard.getBoundingClientRect();
      if (rect.bottom > 0) hudBottom = Math.max(hudBottom, Math.ceil(rect.bottom));
    }
    if (rightWrap) {
      const rect2 = rightWrap.getBoundingClientRect();
      if (rect2.bottom > 0) hudBottom = Math.max(hudBottom, Math.ceil(rect2.bottom));
    }
    rootStyle.setProperty("--hud-bottom-offset", (hudBottom + 6) + "px");
  }
}
