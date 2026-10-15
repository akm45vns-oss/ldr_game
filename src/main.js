import './style.css';
import { PixelHeartsGame, runPixelHeartsTests } from './game.js';

function bootPixelHearts() {
  if (!window.__PIXEL_HEARTS_GAME__) {
    const game = new PixelHeartsGame();
    window.__PIXEL_HEARTS_GAME__ = game;
    // Provide backward-compatible class alias
    window.PixelHeartsMilestone2 = PixelHeartsGame;
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootPixelHearts);
} else {
  bootPixelHearts();
}

export { PixelHeartsGame, runPixelHeartsTests };
