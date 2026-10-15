import { VIEW_WIDTH, VIEW_HEIGHT, RENDER_SCALE, TILE_SIZE, LEVEL_COLS, LEVEL_ROWS } from '../core/constants.js';
import { drawRoundedRect, drawSacredSpiritTree, drawAncientShrineArch } from './structures.js';
import { drawAyushHero, drawPartnerSpirit } from './characters.js';

// Game Renderer: Compositor, Parallax, Backdrop, Terrain, and Particle Effects
export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.offscreen = document.createElement("canvas");
    this.offscreen.width = VIEW_WIDTH * RENDER_SCALE;
    this.offscreen.height = VIEW_HEIGHT * RENDER_SCALE;
    this.offCtx = this.offscreen.getContext("2d", { alpha: false });

    this.cachedSkyGrad = null;
    this.cachedMistGrad = null;
    this.cachedCliffGrad = null;
  }

  render(game, nowMs) {
    const ctx = this.offCtx;
    const camX = game.camera.renderX;
    const camY = game.camera.renderY;

    ctx.save();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);

    // 1. Deep Nocturnal Cosmic Gradient (#020308 -> #060b24 -> #130b2e)
    if (!this.cachedSkyGrad) {
      this.cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
      this.cachedSkyGrad.addColorStop(0, "#020308");
      this.cachedSkyGrad.addColorStop(0.48, "#060b24");
      this.cachedSkyGrad.addColorStop(1, "#130b2e");
    }
    ctx.fillStyle = this.cachedSkyGrad;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // 2. Subtle Auroral Atmospheric Waves
    const auroraShift = Math.sin(nowMs * 0.0005) * 18;
    const aurGrad1 = ctx.createRadialGradient(120 + auroraShift, 40, 10, 120 + auroraShift, 40, 180);
    aurGrad1.addColorStop(0, "rgba(6, 182, 212, 0.12)");
    aurGrad1.addColorStop(0.5, "rgba(20, 184, 166, 0.06)");
    aurGrad1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aurGrad1;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const aurGrad2 = ctx.createRadialGradient(360 - auroraShift, 55, 10, 360 - auroraShift, 55, 160);
    aurGrad2.addColorStop(0, "rgba(168, 85, 247, 0.11)");
    aurGrad2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aurGrad2;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // 3. Radiant Celestial Crescent Moon
    const moonX = 392 - camX * 0.025;
    const moonY = 36;
    const moonHalo = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, 44);
    moonHalo.addColorStop(0, "rgba(254, 240, 138, 0.38)");
    moonHalo.addColorStop(0.45, "rgba(56, 189, 248, 0.11)");
    moonHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = moonHalo;
    ctx.fillRect(moonX - 46, moonY - 46, 92, 92);

    ctx.save();
    ctx.translate(moonX, moonY);
    ctx.rotate(-0.35);
    ctx.fillStyle = "#fef9c3";
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0.25 * Math.PI, 1.75 * Math.PI, false);
    ctx.quadraticCurveTo(-2.5, 0, 10.5 * Math.cos(0.25 * Math.PI), 10.5 * Math.sin(0.25 * Math.PI));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Twinkling stars
    for (let i = 0; i < 36; i++) {
      const sx = ((i * 73 - camX * 0.04) % VIEW_WIDTH + VIEW_WIDTH) % VIEW_WIDTH;
      const sy = (i * 29) % 135;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(nowMs * 0.0015 + i));
      ctx.fillStyle =
        i % 4 === 0
          ? `rgba(103, 232, 249, ${twinkle.toFixed(2)})`
          : i % 3 === 0
          ? `rgba(253, 224, 71, ${twinkle.toFixed(2)})`
          : `rgba(241, 245, 249, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 5 === 0 ? 1.1 : 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Layer 1 Parallax: Distant Mountain Peaks (0.15x)
    const farMtnGrad = ctx.createLinearGradient(0, 85, 0, VIEW_HEIGHT);
    farMtnGrad.addColorStop(0, "rgba(11, 18, 50, 0.85)");
    farMtnGrad.addColorStop(1, "rgba(6, 9, 25, 0.96)");
    ctx.fillStyle = farMtnGrad;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_HEIGHT);
    const peaks1 = [0, 75, 42, 110, 28, 88, 18, 96, 36, 82, 22, 90];
    for (let i = 0; i < 12; i++) {
      const px = i * 52 - ((camX * 0.15) % 104);
      const py = 105 + peaks1[i % peaks1.length];
      ctx.lineTo(px, py);
    }
    ctx.lineTo(VIEW_WIDTH + 60, VIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // 5. Layer 2 Parallax: Mid-Range Pine Ridges (0.32x)
    const midGrad = ctx.createLinearGradient(0, 130, 0, VIEW_HEIGHT);
    midGrad.addColorStop(0, "#101938");
    midGrad.addColorStop(0.65, "#090d22");
    midGrad.addColorStop(1, "#050713");
    ctx.fillStyle = midGrad;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_HEIGHT);
    for (let i = -2; i < 24; i++) {
      const rx = i * 26 - ((camX * 0.32) % 52);
      const ry = 162 + ((i * 19) % 34);
      ctx.lineTo(rx, ry);
      ctx.lineTo(rx + 13, ry - 18 - ((i * 7) % 14));
    }
    ctx.lineTo(VIEW_WIDTH + 40, VIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // 6. Layer 3: Bioluminescent Valley Mist Band
    if (!this.cachedMistGrad) {
      this.cachedMistGrad = ctx.createLinearGradient(0, VIEW_HEIGHT - 95, 0, VIEW_HEIGHT);
      this.cachedMistGrad.addColorStop(0, "rgba(0, 242, 254, 0)");
      this.cachedMistGrad.addColorStop(0.55, "rgba(8, 51, 68, 0.24)");
      this.cachedMistGrad.addColorStop(1, "rgba(6, 12, 29, 0.72)");
    }
    ctx.fillStyle = this.cachedMistGrad;
    ctx.fillRect(0, VIEW_HEIGHT - 95, VIEW_WIDTH, 95);

    // 7. World Backdrop Architecture
    this.renderWorldBackdrop(ctx, game, camX, camY, nowMs);

    // 8. Collision-True Terrain & Platforms
    this.renderTerrainAndPlatforms(ctx, game, camX, camY, nowMs);

    // 9. Interactive Props & Collectibles
    this.renderPropsAndCollectibles(ctx, game, camX, camY, nowMs);

    // 10. Characters (Partner Spirit & Ayush Hero)
    drawPartnerSpirit(ctx, game.partner, game.companionHoldMode, camX, camY, nowMs);
    drawAyushHero(ctx, game.ayush, camX, camY, nowMs);

    // 11. Landing Dust Motes & Floating Hearts
    for (const m of game.dustMotes) {
      ctx.fillStyle = m.color;
      ctx.globalAlpha = Math.max(0, m.life);
      ctx.beginPath();
      ctx.arc(m.x - camX, m.y - camY, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const h of game.floatingHearts) {
      const hx = h.x - camX;
      const hy = h.y - camY;
      ctx.save();
      ctx.globalAlpha = Math.max(0, h.life);
      ctx.fillStyle = "#ff4b8b";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("♥", hx - 3, hy);
      ctx.restore();
    }

    // Proximity Twin Heart Emote when close
    const partnerDist = Math.hypot(game.ayush.x - game.partner.x, game.ayush.y - game.partner.y);
    if (partnerDist < 28) {
      const mx = (game.ayush.x + game.partner.x) / 2 + 6 - camX;
      const my = Math.min(game.ayush.y, game.partner.y) - 6 - camY + Math.sin(nowMs * 0.005) * 2;
      ctx.fillStyle = "#f472b6";
      ctx.font = "bold 7px sans-serif";
      ctx.fillText("♥", mx, my);
    }

    // 12. Weather & Lighting
    this.renderWeatherAndLighting(ctx, game, camX, camY, nowMs);

    // 13. Debug Overlay
    if (game.debugMode) {
      this.renderDebugOverlay(ctx, game, camX, camY);
    }

    ctx.restore();

    // Blit to display canvas
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
  }

  renderWorldBackdrop(ctx, game, camX, camY, nowMs) {
    const groundY = 15 * TILE_SIZE - camY;

    // Chasm Abyss Glow (cols 150..165)
    const chasmLeft = 150 * TILE_SIZE - camX;
    const chasmW = 16 * TILE_SIZE;
    if (chasmLeft + chasmW > 0 && chasmLeft < VIEW_WIDTH) {
      const abyssGrad = ctx.createLinearGradient(0, groundY, 0, VIEW_HEIGHT);
      abyssGrad.addColorStop(0, "rgba(88, 28, 135, 0)");
      abyssGrad.addColorStop(0.45, "rgba(88, 28, 135, 0.28)");
      abyssGrad.addColorStop(1, "rgba(236, 72, 153, 0.42)");
      ctx.fillStyle = abyssGrad;
      ctx.fillRect(chasmLeft, groundY, chasmW, VIEW_HEIGHT - groundY);
    }

    // Sacred Spirit Trees
    const trees = [
      { col: 14, scale: 1.1, lantern: true },
      { col: 46, scale: 0.95, lantern: true },
      { col: 78, scale: 1.15, lantern: true },
      { col: 108, scale: 1.05, lantern: true },
      { col: 134, scale: 0.9, lantern: true },
      { col: 182, scale: 1.1, lantern: true }
    ];
    for (const t of trees) {
      const tx = t.col * TILE_SIZE - camX;
      if (tx > -60 && tx < VIEW_WIDTH + 60) {
        drawSacredSpiritTree(ctx, tx, groundY, t.scale, nowMs, t.lantern);
      }
    }

    // Shrines & Landmarks
    const shrineX = 190 * TILE_SIZE - camX;
    if (shrineX > -80 && shrineX < VIEW_WIDTH + 80) {
      drawAncientShrineArch(ctx, shrineX, groundY, "STARLIGHT SHRINE", game.world.shrineLit, nowMs);
    }
  }

  renderTerrainAndPlatforms(ctx, game, camX, camY, nowMs) {
    const groundY = 15 * TILE_SIZE - camY;

    // 1. Ground Cliff Segments
    const segments = [
      { startCol: 0, endCol: 149 },
      { startCol: 166, endCol: LEVEL_COLS - 1 }
    ];

    for (const seg of segments) {
      const sx = seg.startCol * TILE_SIZE - camX;
      const sw = (seg.endCol - seg.startCol + 1) * TILE_SIZE;
      if (sx + sw < 0 || sx > VIEW_WIDTH) continue;

      const drawX = Math.max(-8, sx);
      const drawRight = Math.min(VIEW_WIDTH + 8, sx + sw);
      const drawW = drawRight - drawX;

      const cliffGrad = ctx.createLinearGradient(0, groundY, 0, VIEW_HEIGHT);
      cliffGrad.addColorStop(0, "#1f192b");
      cliffGrad.addColorStop(0.5, "#15121f");
      cliffGrad.addColorStop(1, "#0a0710");
      ctx.fillStyle = cliffGrad;
      drawRoundedRect(ctx, drawX, groundY, drawW, VIEW_HEIGHT - groundY + 12, 8);
      ctx.fill();

      // Rock strata lines
      ctx.strokeStyle = "rgba(34, 211, 238, 0.12)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(drawX, groundY + 14);
      ctx.lineTo(drawRight, groundY + 18);
      ctx.moveTo(drawX, groundY + 28);
      ctx.lineTo(drawRight, groundY + 25);
      ctx.stroke();

      // Moss Overhang
      const mossGrad = ctx.createLinearGradient(drawX, groundY, drawRight, groundY);
      mossGrad.addColorStop(0, "#059669");
      mossGrad.addColorStop(0.5, "#2dd4bf");
      mossGrad.addColorStop(1, "#10b981");
      ctx.fillStyle = mossGrad;
      drawRoundedRect(ctx, drawX, groundY - 1, drawW, 6.5, 3);
      ctx.fill();
    }

    // 2. One-Way Floating Monolith Platforms
    const runeSets = ["ᛟ ᚱ", "ᚠ ᛉ ᚦ", "ᚨ ᚲ"];
    for (let i = 0; i < game.world.platformRuns.length; i++) {
      const p = game.world.platformRuns[i];
      const px = p.colStart * TILE_SIZE - camX;
      const py = p.row * TILE_SIZE - camY;
      const pw = p.len * TILE_SIZE;
      const ph = 13;
      if (px + pw < 0 || px > VIEW_WIDTH) continue;

      const pGrad = ctx.createLinearGradient(0, py, 0, py + ph);
      pGrad.addColorStop(0, "#334155");
      pGrad.addColorStop(0.55, "#1e293b");
      pGrad.addColorStop(1, "#090d16");
      ctx.fillStyle = pGrad;
      drawRoundedRect(ctx, px, py, pw, ph, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(34, 211, 238, 0.48)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // Glowing top energy bar
      const barGrad = ctx.createLinearGradient(px, py, px + pw, py);
      barGrad.addColorStop(0, "#2dd4bf");
      barGrad.addColorStop(0.5, "#38bdf8");
      barGrad.addColorStop(1, "#818cf8");
      ctx.fillStyle = barGrad;
      drawRoundedRect(ctx, px + 3, py + 1.2, pw - 6, 2, 1);
      ctx.fill();

      ctx.fillStyle = "#67e8f9";
      ctx.font = "bold 5px monospace";
      ctx.fillText(runeSets[i % runeSets.length], px + pw / 2 - 8, py + 9.5);
    }

    // 3. Conditional Astral Bridge across Chasm (cols 150..165)
    const bridgeY = 15 * TILE_SIZE - camY;
    const bridgeStartX = 150 * TILE_SIZE - camX;
    const bridgeEndX = 166 * TILE_SIZE - camX;
    if (bridgeEndX > 0 && bridgeStartX < VIEW_WIDTH) {
      if (game.world.platePressed || game.world.bridgeUnlockedPermanently) {
        // Solid, walkable glowing bridge monoliths
        for (let c = 150; c <= 165; c += 2) {
          const segX = c * TILE_SIZE - camX;
          ctx.fillStyle = "#1e293b";
          drawRoundedRect(ctx, segX + 1, bridgeY, 30, 8, 3);
          ctx.fill();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = "#67e8f9";
          ctx.fillRect(segX + 3, bridgeY + 1, 26, 2);
        }
      } else {
        // Unpowered broken bridge holographic outline
        const ghostMonoliths = [
          { col: 151, w: 42, dy: 8, runes: "ᛟ ᚱ" },
          { col: 156, w: 48, dy: 2, runes: "ᚠ ᛉ ᚦ" },
          { col: 161, w: 38, dy: 9, runes: "ᚨ ᚲ" }
        ];
        ctx.save();
        for (let i = 0; i < ghostMonoliths.length; i++) {
          const gm = ghostMonoliths[i];
          const gx = gm.col * TILE_SIZE - camX;
          const gy = bridgeY + gm.dy + Math.sin(nowMs * 0.002 + i) * 2;
          ctx.fillStyle = "rgba(15, 23, 42, 0.42)";
          drawRoundedRect(ctx, gx, gy, gm.w, 13, 4);
          ctx.fill();
          ctx.setLineDash([2.5, 2]);
          ctx.strokeStyle = "rgba(56, 189, 248, 0.38)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
          ctx.fillRect(gx + 4, gy + 1.5, gm.w - 8, 1.5);
          ctx.font = "bold 4.8px monospace";
          ctx.fillText(gm.runes, gx + gm.w / 2 - 7, gy + 9.5);
        }
        ctx.restore();
      }
    }
  }

  renderPropsAndCollectibles(ctx, game, camX, camY, nowMs) {
    const py = 15 * TILE_SIZE - camY;

    // West Bank Pressure Plate (col 145)
    const px = 145 * TILE_SIZE - camX;
    const plateColor = game.world.platePressed ? "#00f2fe" : "#ff4b8b";
    ctx.fillStyle = plateColor;
    drawRoundedRect(
      ctx,
      px - 1,
      py - (game.world.platePressed ? 2.5 : 5),
      18,
      game.world.platePressed ? 2.5 : 5,
      2
    );
    ctx.fill();

    // East Bank Winch (col 168)
    const wx = 168 * TILE_SIZE - camX;
    ctx.fillStyle = "#1e293b";
    drawRoundedRect(ctx, wx + 1, py - 18, 14, 18, 3);
    ctx.fill();
    ctx.strokeStyle = game.world.bridgeUnlockedPermanently ? "#34d399" : "#fbbf24";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = game.world.bridgeUnlockedPermanently ? "#34d399" : "#fcd34d";
    ctx.beginPath();
    ctx.arc(wx + 8, py - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // Collectibles (Heart Crystals & Memory Shards)
    const bob = Math.sin(nowMs * 0.005) * 2.8;
    for (const item of game.world.collectibles) {
      if (item.collected) continue;
      const ix = item.x - camX + 5;
      const iy = item.y - camY + 4 + bob;
      if (ix < -20 || ix > VIEW_WIDTH + 20) continue;

      if (item.type === "crystal") {
        const cHalo = ctx.createRadialGradient(ix, iy, 1, ix, iy, 11);
        cHalo.addColorStop(0, "rgba(56, 189, 248, 0.55)");
        cHalo.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.fillStyle = cHalo;
        ctx.fillRect(ix - 11, iy - 11, 22, 22);

        ctx.save();
        ctx.translate(ix, iy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-3.8, -3.8, 7.6, 7.6);
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(-1.8, -1.8, 3.6, 3.6);
        ctx.restore();
      } else {
        const mHalo = ctx.createRadialGradient(ix, iy, 1, ix, iy, 13);
        mHalo.addColorStop(0, "rgba(251, 191, 36, 0.65)");
        mHalo.addColorStop(1, "rgba(251, 191, 36, 0)");
        ctx.fillStyle = mHalo;
        ctx.fillRect(ix - 13, iy - 13, 26, 26);

        ctx.save();
        ctx.translate(ix, iy);
        ctx.rotate(nowMs * 0.002);
        ctx.fillStyle = "#fcd34d";
        ctx.fillRect(-4.2, -4.2, 8.4, 8.4);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
        ctx.restore();
      }
    }

    // Floating Interaction Prompts
    let anyInInteractionRange = false;
    for (const obj of game.world.interactables) {
      const dist = Math.hypot(game.ayush.x + 6 - obj.x, game.ayush.y + 8 - obj.y);
      if (dist <= obj.radius) {
        anyInInteractionRange = true;
        const ox = obj.x - camX + 6;
        const oy = obj.y - camY - 24;
        ctx.fillStyle = "rgba(8, 12, 28, 0.92)";
        drawRoundedRect(ctx, ox - 20, oy - 9, 40, 11, 4);
        ctx.fill();
        ctx.strokeStyle = "#fcd34d";
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.font = "bold 5.5px sans-serif";
        ctx.fillText("[B / E] ACT", ox - 16, oy - 1.5);
      }
    }

    if (anyInInteractionRange) {
      const bounce = Math.sin(nowMs * 0.008) * 2;
      const ax = game.ayush.x + 6 - camX;
      const ay = game.ayush.y - camY - 22 + bounce;
      ctx.fillStyle = "rgba(6, 11, 36, 0.94)";
      drawRoundedRect(ctx, ax - 24, ay - 6, 48, 11, 4.5);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 5.2px sans-serif";
      ctx.fillText("[E / ACT] INTERACT", ax - 20, ay + 1.8);
    }
  }

  renderWeatherAndLighting(ctx, game, camX, camY, nowMs) {
    for (const p of game.particles) {
      const px = p.x;
      const py = p.y;
      if (game.weatherMode === "fireflies") {
        const alpha = 0.25 + 0.65 * Math.abs(Math.sin(p.phase));
        ctx.fillStyle = `hsla(${p.hue}, 95%, 72%, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (game.weatherMode === "petals") {
        ctx.fillStyle = "rgba(244, 114, 182, 0.8)";
        ctx.beginPath();
        ctx.ellipse(px, py, 1.6, 0.9, p.phase, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(103, 232, 249, 0.48)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 1.2, py + 5);
        ctx.stroke();
      }
    }

    // Restrained couple proximity aura
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ax = game.ayush.x + 6 - camX;
    const ay = game.ayush.y + 8 - camY;
    const px = game.partner.x + 6 - camX;
    const py = game.partner.y + 8 - camY;

    const drawHalo = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    drawHalo(ax, ay, 28, "rgba(34, 211, 238, 0.12)");
    drawHalo(px, py, 28, "rgba(244, 63, 94, 0.14)");
    if (Math.hypot(ax - px, ay - py) < 36) {
      drawHalo((ax + px) / 2, (ay + py) / 2, 42, "rgba(251, 191, 36, 0.15)");
    }
    ctx.restore();
  }

  renderDebugOverlay(ctx, game, camX, camY) {
    ctx.save();
    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endCol = Math.min(LEVEL_COLS - 1, Math.ceil((camX + VIEW_WIDTH) / TILE_SIZE));
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tx = c * TILE_SIZE - camX;
        const ty = r * TILE_SIZE - camY;
        if (game.world.isSolidAt(c, r)) {
          ctx.strokeStyle = "rgba(74, 222, 128, 0.75)";
          ctx.lineWidth = 0.6;
          ctx.strokeRect(tx + 0.3, ty + 0.3, TILE_SIZE - 0.6, TILE_SIZE - 0.6);
        } else if (game.world.isOneWayAt(c, r)) {
          ctx.strokeStyle = "rgba(0, 242, 254, 0.9)";
          ctx.lineWidth = 0.8;
          ctx.strokeRect(tx + 0.4, ty + 0.4, TILE_SIZE - 0.8, 5);
        }
      }
    }

    const drawActorBox = (actor, color) => {
      const ax = actor.x - camX;
      const ay = actor.y - camY;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(ax, ay, actor.width, actor.height);
      ctx.fillStyle = actor.onGround ? "#4ade80" : "#fb7185";
      ctx.fillRect(ax, ay + actor.height - 1.2, actor.width, 1.5);
    };
    drawActorBox(game.partner, "#f472b6");
    drawActorBox(game.ayush, "#38bdf8");
    ctx.restore();
  }
}
