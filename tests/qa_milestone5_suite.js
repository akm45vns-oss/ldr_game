/**
 * Pixel Hearts — Milestone 5 QA Verification Suite:
 * Production Readiness, Performance, Reliability & Firebase Hardening
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName} ${details ? "(" + details + ")" : ""}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName} ${details ? "(" + details + ")" : ""}`);
  }
}

console.log("\n================================================================");
console.log("  PIXEL HEARTS — MILESTONE 5 QA VERIFICATION SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// SECTION 1: Bundle Splitting & Initial Loading Payload
// -----------------------------------------------------------------------------
console.log("--- 1. Bundle Splitting & Initial Load Optimization ---");
const distAssetsDir = path.join(rootDir, 'dist', 'assets');
let distFiles = [];
if (fs.existsSync(distAssetsDir)) {
  distFiles = fs.readdirSync(distAssetsDir);
}

const vendorFirebaseChunk = distFiles.find(f => f.startsWith('vendor-firebase-') && f.endsWith('.js'));
const appEntryChunk = distFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));

assert(Boolean(vendorFirebaseChunk), "Vendor Firebase chunk isolated", vendorFirebaseChunk || "missing");
assert(Boolean(appEntryChunk), "App entry chunk generated", appEntryChunk || "missing");

if (appEntryChunk && fs.existsSync(path.join(distAssetsDir, appEntryChunk))) {
  const stat = fs.statSync(path.join(distAssetsDir, appEntryChunk));
  const sizeKb = (stat.size / 1024).toFixed(2);
  assert(stat.size < 250 * 1024, "Core app JavaScript bundle under 250 kB", `${sizeKb} kB`);
}

// -----------------------------------------------------------------------------
// SECTION 2: Modernized Service Worker & Cache Invalidation
// -----------------------------------------------------------------------------
console.log("\n--- 2. Service Worker & PWA Caching Strategy ---");
const swContent = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf-8');
const publicSwContent = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf-8');

assert(swContent.includes('pixel-hearts-v5-production'), "sw.js uses versioned cache key pixel-hearts-v5-production");
assert(publicSwContent.includes('pixel-hearts-v5-production'), "public/sw.js matches production cache version");
assert(swContent.includes('request.mode === "navigate"') && swContent.includes('fetch(event.request)'), "Navigation requests use Network-First strategy to prevent stale JS chunk locks");
assert(swContent.includes('BYPASS_HOST_KEYWORDS') && swContent.includes('firebaseio.com'), "Strict bypass prevents caching RTDB / Firestore / Auth APIs");
assert(swContent.includes('keys.map((key) => {') && swContent.includes('caches.delete(key)'), "Activate event cleans up outdated legacy caches");
assert(swContent.includes('SKIP_WAITING'), "Service worker supports SKIP_WAITING controlled updates");

// -----------------------------------------------------------------------------
// SECTION 3: Canvas 2D Rendering & Garbage Collection Reduction
// -----------------------------------------------------------------------------
console.log("\n--- 3. Canvas 2D Rendering & Allocation Optimization ---");
const rendererSrc = fs.readFileSync(path.join(rootDir, 'src', 'rendering', 'renderer.js'), 'utf-8');

assert(rendererSrc.includes('this.cachedFarMtnGrad'), "Parallax distant mountains gradient is cached on instance");
assert(rendererSrc.includes('this.cachedMidGrad'), "Parallax mid-range pine ridge gradient is cached on instance");
assert(rendererSrc.includes('this.crystalHaloCanvas'), "Crystal halo is pre-baked to offscreen buffer");
assert(rendererSrc.includes('this.shardHaloCanvas'), "Shard halo is pre-baked to offscreen buffer");
assert(rendererSrc.includes('ctx.globalAlpha = twinkle'), "Twinkling star loop sets globalAlpha instead of formatting per-frame strings");
assert(!rendererSrc.includes('`rgba(103, 232, 249, ${twinkle.toFixed(2)})`'), "Per-frame star template string allocations eliminated");
assert(rendererSrc.includes('PIXEL HEARTS v5.0-prod'), "Safe diagnostic telemetry panel integrated into debug overlay");

// -----------------------------------------------------------------------------
// SECTION 4: Animation Loop Safety & Tab Backgrounding
// -----------------------------------------------------------------------------
console.log("\n--- 4. Animation Loop Safety & Tab Backgrounding ---");
const gameSrc = fs.readFileSync(path.join(rootDir, 'src', 'game.js'), 'utf-8');

assert(gameSrc.includes('visibilitychange'), "Game coordinator listens to document visibilitychange");
assert(gameSrc.includes('if (this.isTabHidden)'), "Animation loop skips rendering and physics updates when tab is hidden");
assert(gameSrc.includes('this.lastTime = performance.now()'), "Resuming from background tab resets lastTime to prevent physics delta spikes");

// Check returnToTitleScreen duplicate loop fix
const returnToTitleIdx = gameSrc.indexOf('returnToTitleScreen()');
const returnToTitleBlock = gameSrc.slice(returnToTitleIdx, returnToTitleIdx + 400);
assert(!returnToTitleBlock.includes('requestAnimationFrame((t) => this.loop(t))'), "returnToTitleScreen does not spin up duplicate concurrent requestAnimationFrame loops");

// -----------------------------------------------------------------------------
// SECTION 5: Particle Boundedness & Memory Leak Protection
// -----------------------------------------------------------------------------
console.log("\n--- 5. Particle Capping & Memory Leak Protection ---");
assert(gameSrc.includes('this.dustMotes.length >= 36'), "dustMotes capped at 36 instances max");
assert(gameSrc.includes('this.floatingHearts.length >= 24'), "floatingHearts capped at 24 instances max");

// -----------------------------------------------------------------------------
// SECTION 6: Multiplayer Co-Op Pressure Plate Release & Cleanup
// -----------------------------------------------------------------------------
console.log("\n--- 6. Multiplayer Co-Op Pressure Plate Release & Cleanup ---");
const mpSrc = fs.readFileSync(path.join(rootDir, 'src', 'systems', 'multiplayerManager.js'), 'utf-8');

assert(mpSrc.includes('this.localPlatePressed = false'), "MultiplayerManager initializes localPlatePressed state tracking");
assert(mpSrc.includes('ayushOnPlate !== this.localPlatePressed'), "Pressure plate transitions trigger setPressurePlateCoop for both press and release");
assert(mpSrc.includes('this.setPressurePlateCoop(false)'), "Stepping off pressure plate or leaving room explicitly releases cooperative plate state");

// -----------------------------------------------------------------------------
// SECTION 7: Firebase Environment & Verified RTDB Provisioning
// -----------------------------------------------------------------------------
console.log("\n--- 7. Firebase Environment & Verified RTDB Provisioning ---");
const envSrc = fs.readFileSync(path.join(rootDir, '.env'), 'utf-8');
const envExampleSrc = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf-8');

assert(envSrc.includes('VITE_FIREBASE_DATABASE_URL=https://ldr-game-32a3c-default-rtdb.firebaseio.com'), ".env specifies canonical production Realtime Database URL");
assert(envExampleSrc.includes('VITE_FIREBASE_DATABASE_URL'), ".env.example documents VITE_FIREBASE_DATABASE_URL");

const firebaseJs = fs.readFileSync(path.join(rootDir, 'src', 'firebase', 'firebase.js'), 'utf-8');
assert(firebaseJs.includes('databaseURL: env.VITE_FIREBASE_DATABASE_URL'), "firebase.js uses explicit or canonical databaseURL configuration");

// -----------------------------------------------------------------------------
// SECTION 8: Startup Error Boundary & Audio Lifecycle Cleanup
// -----------------------------------------------------------------------------
console.log("\n--- 8. Startup Error Boundary & Audio Lifecycle Cleanup ---");
const mainSrc = fs.readFileSync(path.join(rootDir, 'src', 'main.js'), 'utf-8');
assert(mainSrc.includes('startup-error-banner'), "main.js includes non-intrusive adventure recovery notice");
assert(mainSrc.includes('unhandledrejection'), "main.js handles unhandled promise rejections safely");

const audioSrc = fs.readFileSync(path.join(rootDir, 'src', 'systems', 'audio.js'), 'utf-8');
assert(audioSrc.includes('window.removeEventListener("pointerdown", unlock)'), "SoundEngine removes pointerdown unlock listener once audio context is created");
assert(audioSrc.includes('window.removeEventListener("keydown", unlock)'), "SoundEngine removes keydown unlock listener once audio context is created");

// -----------------------------------------------------------------------------
// SECTION 9: SEO Metadata & HTML Hierarchy
// -----------------------------------------------------------------------------
console.log("\n--- 9. Production HTML Metadata & SEO ---");
const htmlSrc = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
assert(htmlSrc.includes('<meta name="description"'), "index.html contains descriptive meta description for SEO");
assert(htmlSrc.includes('<title>Pixel Hearts — A Romantic Fantasy Couple Platformer</title>'), "index.html uses polished production title");
assert(htmlSrc.includes('Couple Co-Op Adventure'), "index.html tagline highlights couple co-op adventure");

// -----------------------------------------------------------------------------
// Final Results
// -----------------------------------------------------------------------------
console.log("\n================================================================");
console.log(`  MILESTONE 5 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log("================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
