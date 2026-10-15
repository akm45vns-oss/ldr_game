import './style.css';
import { PixelHeartsGame, runPixelHeartsTests } from './game.js';

function bootPixelHearts() {
  if (typeof window === "undefined") return;
  if (!window.__PIXEL_HEARTS_GAME__) {
    try {
      const game = new PixelHeartsGame();
      window.__PIXEL_HEARTS_GAME__ = game;
      // Provide backward-compatible class alias
      window.PixelHeartsMilestone2 = PixelHeartsGame;
    } catch (err) {
      console.error("[PixelHearts] Startup initialization failed non-critically:", err ? err.message : err);
      const root = document.getElementById("game-root");
      if (root && !document.getElementById("startup-error-banner")) {
        const banner = document.createElement("div");
        banner.id = "startup-error-banner";
        banner.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1f132b;border:1px solid #f43f5e;color:#fecdd3;padding:12px 20px;border-radius:8px;font-family:sans-serif;font-size:13px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.6);text-align:center;max-width:90%;";
        banner.innerHTML = "<strong>Adventure Recovery Notice</strong><br>An initialization issue occurred. Your local save is secure.<br><button onclick='location.reload()' style='margin-top:8px;padding:4px 12px;background:#f43f5e;border:none;color:white;border-radius:4px;cursor:pointer;font-weight:bold;'>Reload Game</button>";
        root.appendChild(banner);
      }
    }
  }
}

// Global safety catchers for network & runtime errors (non-intrusive)
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    // Suppress noise from non-critical network drops or failed lazy loads
    if (event.reason && (event.reason.name === "AbortError" || event.reason.code === "unavailable")) {
      event.preventDefault();
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bootPixelHearts);
  } else {
    bootPixelHearts();
  }
}

export { PixelHeartsGame, runPixelHeartsTests };
