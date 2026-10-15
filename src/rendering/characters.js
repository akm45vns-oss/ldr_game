import { drawRoundedRect } from './structures.js';

/**
 * Draw Male Hero (Bhoot - Cobalt & Indigo Traveler)
 * Features: squash & stretch, turning tilt, flowing deep blue cloak, glowing cyan visor eyes, and dynamic nameplate.
 */
export function drawMaleHero(ctx, actor, camX, camY, nowMs, isCoopRemote = false) {
  const cx = actor.x + actor.width / 2 - camX;
  const bottomY = actor.y + actor.height - camY;
  const breathe = actor.onGround && Math.abs(actor.vx) < 10 ? Math.sin(nowMs * 0.005) * 0.6 : 0;
  const stride = !actor.onGround ? 1.8 : Math.abs(actor.vx) > 12 ? Math.sin(nowMs * 0.018) * 2.2 : 0;

  // Soft ground contact shadow
  if (actor.onGround) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.beginPath();
    ctx.ellipse(cx, bottomY + 0.5, 7, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, bottomY + breathe);
  ctx.scale(actor.squashX || 1.0, actor.squashY || 1.0);
  if (actor.facingTilt) {
    ctx.rotate(actor.facingTilt);
  }

  // 1. Flowing Traveler Cloak / Cape behind Hero
  const capeDir = -actor.facing;
  const capeFlutter = Math.sin(nowMs * 0.008) * 1.4 + (Math.abs(actor.vx) * 0.025);
  ctx.fillStyle = "#312e81";
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(capeDir * (7 + capeFlutter), -3);
  ctx.lineTo(capeDir * 3, -2);
  ctx.closePath();
  ctx.fill();

  // 2. Boots / Legs with run stride
  ctx.fillStyle = "#0f172a";
  drawRoundedRect(ctx, -4 + stride * 0.5, -4.5, 3.2, 4.5, 1);
  ctx.fill();
  drawRoundedRect(ctx, 1 - stride * 0.5, -4.5, 3.2, 4.5, 1);
  ctx.fill();

  // 3. Cobalt-Indigo Traveler Tunic & Gold Belt Trim
  const bodyGrad = ctx.createLinearGradient(0, -12, 0, -4);
  bodyGrad.addColorStop(0, "#2563eb");
  bodyGrad.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bodyGrad;
  drawRoundedRect(ctx, -5.5, -12, 11, 8, 2.5);
  ctx.fill();

  // Gold belt trim & central diamond crest
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-5, -5.2, 10, 1.1);
  ctx.save();
  ctx.translate(0, -8);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
  ctx.restore();

  // Glowing cyan scarf inlay
  ctx.fillStyle = "#38bdf8";
  drawRoundedRect(ctx, -4.2, -12.2, 8.4, 1.4, 0.7);
  ctx.fill();

  // 4. Traveler Hood / Cowl & Glowing Cyan Eyes
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.arc(0, -15.5, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Dark visor shadow inside cowl
  const visorX = actor.facing * 0.9;
  ctx.fillStyle = "#020617";
  drawRoundedRect(ctx, -3.8 + visorX, -16.8, 7.6, 3.2, 1.5);
  ctx.fill();

  // Expressive Glowing Cyan Eyes
  ctx.fillStyle = "#67e8f9";
  ctx.fillRect(-2.2 + visorX * 1.3, -15.8, 1.6, 1.3);
  ctx.fillRect(0.8 + visorX * 1.3, -15.8, 1.6, 1.3);

  ctx.restore();

  // 5. Dynamic Nameplate
  const displayName = actor.name || "Bhoot";
  if (isCoopRemote) {
    const tag = `♥ ${displayName} [CO-OP]`;
    ctx.font = "bold 4.8px sans-serif";
    const textW = ctx.measureText(tag).width;
    const badgeW = Math.max(46, textW + 10);
    const badgeH = 8.5;
    const bx = cx - badgeW / 2;
    const by = bottomY - 31 + breathe;

    ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
    drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const pulse = Math.sin(nowMs * 0.008) * 0.4 + 0.6;
    ctx.fillStyle = `rgba(34, 197, 94, ${pulse})`;
    ctx.beginPath();
    ctx.arc(bx + 4.5, by + 4.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a5f3fc";
    ctx.fillText(`♥ ${displayName}`, bx + 8.5, by + 5.8);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 4.0px monospace";
    ctx.fillText("LIVE", bx + badgeW - 12, by + 5.8);
  } else {
    ctx.font = "bold 4.8px sans-serif";
    const nameW = ctx.measureText(displayName).width;
    const badgeW = Math.max(36, nameW + 16);
    const badgeH = 8.5;
    const bx = cx - badgeW / 2;
    const by = bottomY - 31 + breathe;

    ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
    drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.75)";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(bx + 4.2, by + 4.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a5f3fc";
    ctx.font = "bold 4.8px sans-serif";
    ctx.fillText(displayName, bx + 7, by + 5.8);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "4.2px monospace";
    ctx.fillText("Lv.8", bx + badgeW - 10, by + 5.8);
  }
}

/**
 * Draw Female Hero (Kida - Rose-Quartz & Starlight Traveler)
 * Features: squash & stretch, turning tilt, flowing deep rose cloak, glowing warm pink eyes, and dynamic nameplate.
 */
export function drawFemaleHero(ctx, actor, camX, camY, nowMs, isCoopRemote = false) {
  const cx = actor.x + actor.width / 2 - camX;
  const bottomY = actor.y + actor.height - camY;
  const breathe = actor.onGround && Math.abs(actor.vx) < 10 ? Math.sin(nowMs * 0.005 + 1.2) * 0.6 : 0;
  const stride = !actor.onGround ? 1.8 : Math.abs(actor.vx) > 12 ? Math.sin(nowMs * 0.018 + 1.0) * 2.2 : 0;

  // 1. Soft ground contact shadow
  if (actor.onGround) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.beginPath();
    ctx.ellipse(cx, bottomY + 0.5, 7, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, bottomY + breathe);
  ctx.scale(actor.squashX || 1.0, actor.squashY || 1.0);
  if (actor.facingTilt) {
    ctx.rotate(actor.facingTilt);
  }

  // 2. Flowing Celestial Rose Cloak behind Hero
  const capeDir = -actor.facing;
  const capeFlutter = Math.sin(nowMs * 0.008 + 2.0) * 1.4 + (Math.abs(actor.vx) * 0.025);
  ctx.fillStyle = "#831843"; // Deep rose-wine
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(capeDir * (7 + capeFlutter), -3);
  ctx.lineTo(capeDir * 3, -2);
  ctx.closePath();
  ctx.fill();

  // 3. Boots / Legs with run stride
  ctx.fillStyle = "#1e1b4b";
  drawRoundedRect(ctx, -4 + stride * 0.5, -4.5, 3.2, 4.5, 1);
  ctx.fill();
  drawRoundedRect(ctx, 1 - stride * 0.5, -4.5, 3.2, 4.5, 1);
  ctx.fill();

  // 4. Rose-Quartz & Starlight Traveler Tunic with Gold Trim
  const bodyGrad = ctx.createLinearGradient(0, -12, 0, -4);
  bodyGrad.addColorStop(0, "#db2777"); // Bright pink/rose
  bodyGrad.addColorStop(1, "#831843");
  ctx.fillStyle = bodyGrad;
  drawRoundedRect(ctx, -5.5, -12, 11, 8, 2.5);
  ctx.fill();

  // Gold belt trim & heart-shaped crest
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-5, -5.2, 10, 1.1);
  ctx.save();
  ctx.translate(0, -8);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
  ctx.restore();

  // Glowing rose scarf inlay
  ctx.fillStyle = "#f472b6";
  drawRoundedRect(ctx, -4.2, -12.2, 8.4, 1.4, 0.7);
  ctx.fill();

  // 5. Traveler Hood / Cowl & Glowing Warm Pink Eyes
  ctx.fillStyle = "#fce7f3";
  ctx.beginPath();
  ctx.arc(0, -15.5, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f43f5e";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Dark visor shadow inside cowl
  const visorX = actor.facing * 0.9;
  ctx.fillStyle = "#020617";
  drawRoundedRect(ctx, -3.8 + visorX, -16.8, 7.6, 3.2, 1.5);
  ctx.fill();

  // Expressive Glowing Warm Pink Eyes
  ctx.fillStyle = "#fb7185";
  ctx.fillRect(-2.2 + visorX * 1.3, -15.8, 1.6, 1.3);
  ctx.fillRect(0.8 + visorX * 1.3, -15.8, 1.6, 1.3);

  ctx.restore();

  // 6. Dynamic Nameplate
  const displayName = actor.name || "Kida";
  if (isCoopRemote) {
    const tag = `♥ ${displayName} [CO-OP]`;
    ctx.font = "bold 4.8px sans-serif";
    const textW = ctx.measureText(tag).width;
    const badgeW = Math.max(46, textW + 10);
    const badgeH = 8.5;
    const bx = cx - badgeW / 2;
    const by = bottomY - 31 + breathe;

    ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
    drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 63, 94, 0.85)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const pulse = Math.sin(nowMs * 0.008) * 0.4 + 0.6;
    ctx.fillStyle = `rgba(34, 197, 94, ${pulse})`;
    ctx.beginPath();
    ctx.arc(bx + 4.5, by + 4.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fbcfe8";
    ctx.fillText(`♥ ${displayName}`, bx + 8.5, by + 5.8);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 4.0px monospace";
    ctx.fillText("LIVE", bx + badgeW - 12, by + 5.8);
  } else {
    ctx.font = "bold 4.8px sans-serif";
    const nameW = ctx.measureText(displayName).width;
    const badgeW = Math.max(36, nameW + 16);
    const badgeH = 8.5;
    const bx = cx - badgeW / 2;
    const by = bottomY - 31 + breathe;

    ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
    drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(236, 72, 153, 0.75)";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.arc(bx + 4.2, by + 4.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fbcfe8";
    ctx.font = "bold 4.8px sans-serif";
    ctx.fillText(displayName, bx + 7, by + 5.8);
    ctx.fillStyle = "#fcd34d";
    ctx.font = "4.2px monospace";
    ctx.fillText("Lv.8", bx + badgeW - 10, by + 5.8);
  }
}

/**
 * Backward-compatible aliases for Milestone 1-4B code & tests
 */
export const drawAyushHero = drawMaleHero;
export const drawRemotePartnerHero = (ctx, actor, camX, camY, nowMs) => drawFemaleHero(ctx, actor, camX, camY, nowMs, true);

/**
 * Draw Partner Celestial Spirit with bloom halo, orbiting runes in HOLD mode, wisps, and floating nameplate
 */
export function drawPartnerSpirit(ctx, actor, companionHoldMode, camX, camY, nowMs) {
  const cx = actor.x + actor.width / 2 - camX;
  const floatBob = Math.sin(nowMs * 0.0045) * 2.5;
  const cy = actor.y + actor.height / 2 - camY - 3 + floatBob;

  // 1. Outer Pulsing Celestial Bloom Halo
  const bloom = ctx.createRadialGradient(cx, cy, 1, cx, cy, 18);
  bloom.addColorStop(0, companionHoldMode ? "rgba(251, 191, 36, 0.6)" : "rgba(244, 63, 94, 0.55)");
  bloom.addColorStop(0.5, companionHoldMode ? "rgba(245, 158, 11, 0.25)" : "rgba(236, 72, 153, 0.22)");
  bloom.addColorStop(1, "rgba(244, 63, 94, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(cx - 18, cy - 18, 36, 36);

  // Orbiting golden runes when in HOLD mode
  if (companionHoldMode) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(nowMs * 0.002);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    for (let r = 0; r < 3; r++) {
      const ang = (r * Math.PI * 2) / 3;
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(Math.cos(ang) * 11 - 1, Math.sin(ang) * 11 - 1, 2, 2);
    }
    ctx.restore();
  }

  // 2. Trailing Stardust Wisp below companion
  const tailGrad = ctx.createLinearGradient(cx, cy + 3, cx, cy + 14);
  tailGrad.addColorStop(0, "rgba(244, 114, 182, 0.65)");
  tailGrad.addColorStop(1, "rgba(244, 114, 182, 0)");
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5, cy + 3);
  ctx.lineTo(cx + 3.5, cy + 3);
  ctx.lineTo(cx, cy + 14);
  ctx.closePath();
  ctx.fill();

  // 3. Rotating Ethereal Petal Rings
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(nowMs * 0.0012);
  ctx.strokeStyle = "rgba(244, 114, 182, 0.58)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.rotate(-nowMs * 0.0028);
  ctx.strokeStyle = "rgba(253, 164, 175, 0.75)";
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(0, 0, 5.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 4. Glowing Rose-Magenta Core Orb with White Inner Radiance
  const orbGrad = ctx.createRadialGradient(cx - 1, cy - 1, 0.8, cx, cy, 4.8);
  orbGrad.addColorStop(0, "#ffffff");
  orbGrad.addColorStop(0.45, "#f472b6");
  orbGrad.addColorStop(1, "#e11d48");
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 4.8, 0, Math.PI * 2);
  ctx.fill();

  // 5. Sleek Pink-Bordered Floating Nameplate ("♥ Aanya [FOLLOW]")
  const modeText = companionHoldMode ? "[HOLD]" : "[FOLLOW]";
  const label = `♥ ${actor.name} ${modeText}`;
  ctx.font = "bold 4.6px sans-serif";
  const textW = ctx.measureText(label).width;
  const badgeW = Math.max(38, textW + 8);
  const badgeH = 8.5;
  const bx = cx - badgeW / 2;
  const by = cy - 19;

  ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
  drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(236, 72, 153, 0.78)";
  ctx.lineWidth = 0.7;
  ctx.stroke();

  ctx.fillStyle = "#fbcfe8";
  ctx.fillText(`♥ ${actor.name}`, bx + 4, by + 5.8);
  ctx.fillStyle = companionHoldMode ? "#fcd34d" : "#f472b6";
  ctx.font = "4.2px monospace";
  ctx.fillText(modeText, bx + badgeW - ctx.measureText(modeText).width - 3.5, by + 5.8);
}

/**
 * High-definition live preview renderer for Character Selection cards
 * Renders an animated character preview directly onto an HTML5 canvas.
 */
export function renderCharacterPreview(canvas, gender, nowMs, displayName) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Soft atmospheric background glow
  const isFemale = gender === "female";
  const glow = ctx.createRadialGradient(w / 2, h * 0.6, 2, w / 2, h * 0.6, w * 0.45);
  glow.addColorStop(0, isFemale ? "rgba(244, 63, 94, 0.28)" : "rgba(34, 211, 238, 0.28)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Subtle floating stardust spark
  for (let s = 0; s < 4; s++) {
    const sx = (w * 0.2 + (s * 23 + (nowMs * 0.015)) % (w * 0.6));
    const sy = (h * 0.8 - ((s * 17 + nowMs * 0.02) % (h * 0.6)));
    ctx.fillStyle = isFemale ? "rgba(253, 164, 175, 0.6)" : "rgba(103, 232, 249, 0.6)";
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scale up for high-resolution crisp preview
  ctx.save();
  const scale = 2.4;
  ctx.scale(scale, scale);

  const mockActor = {
    x: 0,
    y: 0,
    width: 12,
    height: 17,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: true,
    name: displayName || (isFemale ? "Kida" : "Bhoot"),
    squashX: 1.0,
    squashY: 1.0,
    facingTilt: 0
  };

  const camX = -((w / scale) / 2 - 6);
  const camY = -((h / scale) * 0.72 - 17);

  if (isFemale) {
    drawFemaleHero(ctx, mockActor, camX, camY, nowMs, false);
  } else {
    drawMaleHero(ctx, mockActor, camX, camY, nowMs, false);
  }

  ctx.restore();
}
