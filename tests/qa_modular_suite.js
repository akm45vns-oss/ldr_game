// QA Verification Suite for Pixel Hearts Modular Architecture
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Mock Browser Environment
const localStorageMock = (function () {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

class MockElement {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: function (...cls) {
        cls.forEach((c) => this._classes.add(c));
      },
      remove: function (...cls) {
        cls.forEach((c) => this._classes.delete(c));
      },
      contains: function (c) {
        return this._classes.has(c);
      },
      toggle: function (c, force) {
        if (force === true) {
          this._classes.add(c);
          return true;
        } else if (force === false) {
          this._classes.delete(c);
          return false;
        }
        if (this._classes.has(c)) {
          this._classes.delete(c);
          return false;
        } else {
          this._classes.add(c);
          return true;
        }
      }
    };
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.children = [];
    this.attributes = {};
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] || null;
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { top: 0, bottom: 48, left: 0, right: 300, width: 300, height: 48 };
  }
  contains() {
    return false;
  }
  appendChild(child) {
    this.children.push(child);
  }
}

class MockCanvasContext {
  constructor() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  arc() {}
  fill() {}
  stroke() {}
  fillRect() {}
  strokeRect() {}
  clearRect() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
  rotate() {}
  ellipse() {}
  fillText() {}
  strokeText() {}
  setLineDash() {}
  measureText() {
    return { width: 10 };
  }
}

const domElements = new Map();
function getOrCreateElement(id, tag = 'div') {
  if (!domElements.has(id)) {
    domElements.set(id, new MockElement(tag, id));
  }
  return domElements.get(id);
}

// Pre-populate known element IDs
[
  'game-canvas',
  'top-hud',
  'hud-zone',
  'hud-partner-name',
  'hud-companion-mode',
  'hud-crystals',
  'hud-memories',
  'hud-bridge',
  'hud-quest-badge',
  'hud-quest-text',
  'hud-quest-progress',
  'hud-quest-bar-fill',
  'btn-quick-audio',
  'btn-menu-audio',
  'btn-weather',
  'btn-companion',
  'quest-toast',
  'quest-toast-title',
  'quest-toast-body',
  'dialogue-overlay',
  'dialogue-speaker',
  'dialogue-body',
  'dialogue-counter',
  'quests-modal',
  'inventory-modal',
  'scrapbook-modal',
  'settings-modal',
  'reset-confirm-modal',
  'quests-list-container',
  'inventory-content-container',
  'scrapbook-list-container',
  'orientation-overlay',
  'btn-fullscreen',
  'btn-orientation-fullscreen',
  'btn-dismiss-orientation',
  'btn-hud-menu',
  'hud-actions-drawer',
  'hud-quest-line',
  'btn-quests',
  'btn-close-quests',
  'btn-inventory',
  'btn-close-inventory',
  'btn-scrapbook',
  'btn-close-scrapbook',
  'btn-settings',
  'btn-close-settings',
  'btn-reset',
  'btn-open-newgame-confirm',
  'btn-respawn-only',
  'btn-confirm-respawn',
  'btn-cancel-reset',
  'btn-confirm-reset',
  'input-partner-name',
  'slider-bgm',
  'slider-sfx',
  'val-bgm',
  'val-sfx',
  'val-audio-mute',
  'btn-toggle-sound',
  'select-graphics',
  'select-reduced-motion',
  'slider-scale',
  'slider-opacity',
  'slider-pad',
  'select-handedness',
  'touch-controls',
  'val-scale',
  'val-opacity',
  'val-pad',
  'hud-status-card',
  'hud-right-wrap'
].forEach((id) => {
  getOrCreateElement(id);
});

// Canvas special setup
const canvasEl = getOrCreateElement('game-canvas', 'canvas');
canvasEl.getContext = () => new MockCanvasContext();

global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: global.requestAnimationFrame,
  performance: { now: () => Date.now() },
  localStorage: localStorageMock,
  location: { protocol: 'https:', hostname: 'localhost' }
};

global.document = {
  documentElement: {
    style: {
      setProperty: () => {}
    }
  },
  getElementById: (id) => getOrCreateElement(id),
  querySelectorAll: (selector) => {
    if (selector === '.touch-btn') {
      return [
        new MockElement('button'),
        new MockElement('button'),
        new MockElement('button'),
        new MockElement('button'),
        new MockElement('button')
      ];
    }
    return [];
  },
  createElement: (tag) => {
    const el = new MockElement(tag);
    if (tag === 'canvas') el.getContext = () => new MockCanvasContext();
    return el;
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

if (!global.navigator) {
  global.navigator = {};
}
try {
  global.navigator.serviceWorker = {
    register: async () => ({})
  };
} catch (_) {
  Object.defineProperty(global, 'navigator', {
    value: { serviceWorker: { register: async () => ({}) } },
    configurable: true,
    writable: true
  });
}

global.screen = {
  orientation: {
    lock: async () => {}
  }
};

// Mock AudioContext
class MockAudioNode {
  connect() {}
  disconnect() {}
}
class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = {
      value: 1,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {}
    };
  }
}
class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = {
      value: 440,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {}
    };
    this.type = 'sine';
  }
  start() {}
  stop() {}
}
global.AudioContext = class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = new MockAudioNode();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return new MockGainNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
};

// 2. Import Game Modules
import { PixelHeartsGame, runPixelHeartsTests } from '../src/game.js';
import { SaveManager } from '../src/systems/save.js';
import { MissionManager } from '../src/systems/missions.js';
import { SoundEngine } from '../src/systems/audio.js';
import { LevelWorld } from '../src/levels/world.js';
import { Actor } from '../src/entities/actor.js';
import { Camera2D } from '../src/core/camera.js';
import { InputManager } from '../src/core/input.js';
import { HUDController } from '../src/ui/hud.js';
import { ModalController } from '../src/ui/modals.js';
import { ViewportManager } from '../src/ui/viewport.js';
import { GameRenderer } from '../src/rendering/renderer.js';
import { PHYSICS, TILE_SIZE, VIEW_WIDTH, VIEW_HEIGHT } from '../src/core/constants.js';

console.log('=== RUNNING PIXEL HEARTS MODULAR QA TEST SUITE ===\n');

const suiteResults = [];
function test(name, fn) {
  try {
    fn();
    suiteResults.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    suiteResults.push({ name, passed: false, error: err.message });
    console.log(`[FAIL] ${name}: ${err.message}`);
  }
}

// Test 1: Module Imports
test('Module Exports & Classes Exist', () => {
  if (typeof PixelHeartsGame !== 'function') throw new Error('PixelHeartsGame missing');
  if (typeof SaveManager !== 'function') throw new Error('SaveManager missing');
  if (typeof MissionManager !== 'function') throw new Error('MissionManager missing');
  if (typeof SoundEngine !== 'function') throw new Error('SoundEngine missing');
  if (typeof LevelWorld !== 'function') throw new Error('LevelWorld missing');
  if (typeof Actor !== 'function') throw new Error('Actor missing');
  if (typeof Camera2D !== 'function') throw new Error('Camera2D missing');
  if (typeof InputManager !== 'function') throw new Error('InputManager missing');
  if (typeof HUDController !== 'function') throw new Error('HUDController missing');
  if (typeof ModalController !== 'function') throw new Error('ModalController missing');
  if (typeof ViewportManager !== 'function') throw new Error('ViewportManager missing');
  if (typeof GameRenderer !== 'function') throw new Error('GameRenderer missing');
});

// Test 2: Game Instantiation
let game = null;
test('Game Instantiation & Subsystem Wiring', () => {
  game = new PixelHeartsGame();
  window.__PIXEL_HEARTS_GAME__ = game;
  if (!game.world) throw new Error('world not initialized');
  if (!game.sound) throw new Error('sound not initialized');
  if (!game.missionManager) throw new Error('missionManager not initialized');
  if (!game.dialogue) throw new Error('dialogue not initialized');
  if (!game.camera) throw new Error('camera not initialized');
  if (!game.ayush || !game.partner) throw new Error('actors not initialized');
  if (!game.hud) throw new Error('hud not initialized');
  if (!game.modals) throw new Error('modals not initialized');
  if (!game.viewport) throw new Error('viewport not initialized');
  if (!game.renderer) throw new Error('renderer not initialized');
});

// Test 3: Standard QA Harness
test('Standard QA Test Suite Execution', () => {
  const qaResults = runPixelHeartsTests();
  const failed = qaResults.filter((r) => !r.passed);
  if (failed.length > 0) {
    throw new Error(`QA tests failed: ${failed.map((f) => f.name).join(', ')}`);
  }
});

// Test 4: Jump Physics Apex & Platform Reachability
test('Deterministic Jump Apex Calculation', () => {
  const apex = (PHYSICS.JUMP_VELOCITY * PHYSICS.JUMP_VELOCITY) / (2 * PHYSICS.GRAVITY);
  if (apex < 58 || apex > 60) {
    throw new Error(`Jump apex ${apex} outside acceptable range 58-60px`);
  }
  // Staircase platform max step is 32px (2 tiles)
  if (apex < 32 + 15) {
    throw new Error(`Jump apex does not give sufficient clearance over 32px staircase step`);
  }
});

// Test 5: Save System Schema & Serialization
test('SaveManager Save / Load Cycle (Schema v2)', () => {
  game.partnerName = 'Priya';
  game.questItems.add('oakvale_map');
  game.unlockedMemories.add('mem_1');
  game.world.collectibles[0].collected = true;

  const saved = SaveManager.saveGame(game);
  if (!saved) throw new Error('SaveManager.saveGame failed');

  const rawJson = localStorageMock.getItem('ph_save_v2');
  if (!rawJson) throw new Error('ph_save_v2 missing in storage');
  const parsed = JSON.parse(rawJson);
  if (parsed.version !== 2) throw new Error(`Expected schema version 2, got ${parsed.version}`);
  if (parsed.partnerName !== 'Priya') throw new Error('partnerName not saved correctly');
  if (!parsed.questItems.includes('oakvale_map')) throw new Error('questItems not saved correctly');
  if (!parsed.unlockedMemories.includes('mem_1')) throw new Error('unlockedMemories not saved correctly');

  // Verify load restores state
  const newGame = new PixelHeartsGame();
  if (newGame.partnerName !== 'Priya') throw new Error('partnerName not loaded correctly');
  if (!newGame.questItems.has('oakvale_map')) throw new Error('questItems not loaded correctly');
  if (!newGame.unlockedMemories.has('mem_1')) throw new Error('unlockedMemories not loaded correctly');
});

// Test 6: Mission Manager Progression
test('Mission Progression State Machine', () => {
  const m1 = game.missionManager.getMission('m1_explore_oakvale');
  if (!m1) throw new Error('m1 not found');
  if (m1.status !== 'active') throw new Error(`m1 should be active, got ${m1.status}`);

  game.missionManager.setObjectiveProgress('m1_explore_oakvale', 'read_village_sign', 1);
  if (m1.status !== 'completed') throw new Error(`m1 should be completed, got ${m1.status}`);

  const m2 = game.missionManager.getMission('m2_gather_crystals');
  if (m2.status !== 'active') throw new Error(`m2 should auto-unlock to active, got ${m2.status}`);
});

// Test 7: Companion Follow / Hold Toggle
test('Companion Hold and Follow Toggle', () => {
  const initialMode = game.companionHoldMode;
  game.toggleCompanionMode();
  if (game.companionHoldMode === initialMode) throw new Error('toggleCompanionMode failed to flip mode');
  game.toggleCompanionMode();
  if (game.companionHoldMode !== initialMode) throw new Error('toggleCompanionMode second flip failed');
});

// Test 8: Audio Engine Mute and Volume
test('SoundEngine Volume and Mute Controls', () => {
  const initialMute = game.sound.isMuted;
  game.sound.toggleMute();
  if (game.sound.isMuted === initialMute) throw new Error('toggleMute failed to toggle');
  game.sound.setBgmVolume(0.5);
  if (Math.abs(game.sound.bgmVol - 0.5) > 0.01) throw new Error('setBgmVolume failed');
  game.sound.setSfxVolume(0.8);
  if (Math.abs(game.sound.sfxVol - 0.8) > 0.01) throw new Error('setSfxVolume failed');
});

// Test 9: Renderer Draw Without Exceptions
test('GameRenderer Execution Without Errors', () => {
  game.renderer.render(game, 1000);
});

// Summary
console.log('\n==================================================');
const allPassed = suiteResults.every((r) => r.passed);
console.log(`TOTAL TESTS: ${suiteResults.length}`);
console.log(`PASSED: ${suiteResults.filter((r) => r.passed).length}`);
console.log(`FAILED: ${suiteResults.filter((r) => !r.passed).length}`);
console.log(`OVERALL STATUS: ${allPassed ? 'ALL TESTS PASSED ♥' : 'SOME TESTS FAILED'}`);
console.log('==================================================');

if (!allPassed) {
  process.exit(1);
} else {
  process.exit(0);
}
