// Helper for rounded rectangles
export function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Sacred Spirit Tree (Oakvale & Forest Backdrops)
export function drawSacredSpiritTree(ctx, baseX, groundY, scale, nowMs, hasHangingLantern = true) {
  const trunkW = 18 * scale;
  const trunkH = 86 * scale;
  const trunkX = baseX - trunkW / 2;
  const trunkY = groundY - trunkH;

  // Contoured dark bark trunk
  const barkGrad = ctx.createLinearGradient(trunkX, trunkY, trunkX + trunkW, trunkY);
  barkGrad.addColorStop(0, "#211410");
  barkGrad.addColorStop(0.5, "#38231a");
  barkGrad.addColorStop(1, "#180d09");
  ctx.fillStyle = barkGrad;
  drawRoundedRect(ctx, trunkX, trunkY, trunkW, trunkH + 4, 4);
  ctx.fill();

  // Glowing cyan/teal spirit bark veins
  ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(trunkX + 4 * scale, groundY);
  ctx.quadraticCurveTo(trunkX + 7 * scale, groundY - 30 * scale, trunkX + 5 * scale, trunkY + 20 * scale);
  ctx.moveTo(trunkX + 13 * scale, groundY);
  ctx.quadraticCurveTo(trunkX + 11 * scale, groundY - 45 * scale, trunkX + 14 * scale, trunkY + 10 * scale);
  ctx.stroke();

  // Majestic Bioluminescent Foliage Crown Layers
  const crownX = baseX;
  const crownY = trunkY - 14 * scale;

  const drawCloud = (cx, cy, rw, rh, c1, c2) => {
    const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rw, rh));
    cg.addColorStop(0, c1);
    cg.addColorStop(0.85, c2);
    cg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Deep indigo/purple shadow canopy
  drawCloud(crownX - 18 * scale, crownY + 8 * scale, 34 * scale, 24 * scale, "#1e1b4b", "#0f172a");
  drawCloud(crownX + 18 * scale, crownY + 4 * scale, 36 * scale, 25 * scale, "#311042", "#0f172a");

  // Mid radiant magenta/teal leaf clouds
  drawCloud(crownX, crownY - 6 * scale, 40 * scale, 28 * scale, "#065f46", "#042f2e");
  drawCloud(crownX - 12 * scale, crownY - 16 * scale, 28 * scale, 20 * scale, "#047857", "#064e3b");
  drawCloud(crownX + 14 * scale, crownY - 14 * scale, 30 * scale, 22 * scale, "#831843", "#4c0519");

  // Outer glowing highlights
  drawCloud(crownX, crownY - 22 * scale, 24 * scale, 16 * scale, "rgba(45, 212, 191, 0.7)", "rgba(13, 148, 136, 0.1)");
  drawCloud(crownX + 12 * scale, crownY - 8 * scale, 18 * scale, 14 * scale, "rgba(244, 114, 182, 0.65)", "rgba(190, 24, 93, 0.1)");

  // Hanging glowing Starlight Festival lantern
  if (hasHangingLantern) {
    const lx = crownX + 22 * scale;
    const ly = crownY + 22 * scale;
    const swing = Math.sin(nowMs * 0.003 + scale) * 2.5;

    ctx.strokeStyle = "rgba(148, 163, 184, 0.75)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(crownX + 16 * scale, crownY);
    ctx.lineTo(lx + swing, ly);
    ctx.stroke();

    const halo = ctx.createRadialGradient(lx + swing, ly + 4, 1, lx + swing, ly + 4, 14);
    halo.addColorStop(0, "rgba(254, 240, 138, 0.85)");
    halo.addColorStop(0.4, "rgba(251, 146, 60, 0.35)");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lx + swing, ly + 4, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fef08a";
    drawRoundedRect(ctx, lx + swing - 2.5, ly, 5, 8, 1.5);
    ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.fillRect(lx + swing - 3, ly - 1, 6, 1.5);
    ctx.fillRect(lx + swing - 3, ly + 7.5, 6, 1.5);
  }

  // Constellation blossom buds
  const buds = [
    { dx: -16, dy: -8, col: "#67e8f9" },
    { dx: 14, dy: -20, col: "#f472b6" },
    { dx: -4, dy: 10, col: "#fcd34d" },
    { dx: 8, dy: -15, col: "#6ee7b7" }
  ];
  for (const b of buds) {
    ctx.fillStyle = b.col;
    ctx.beginPath();
    ctx.arc(crownX + b.dx * scale, crownY + b.dy * scale, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Ancient Starlight Shrine Arch & Ascending Starlight Beacon
export function drawAncientShrineArch(ctx, centerX, groundY, labelText, isLit, nowMs) {
  const w = 52;
  const h = 38;
  const leftX = centerX - w / 2;
  const topY = groundY - h;

  // Left & Right carved stone pillars
  const pilGrad = ctx.createLinearGradient(0, topY, 0, groundY);
  pilGrad.addColorStop(0, "#334155");
  pilGrad.addColorStop(0.5, "#1e293b");
  pilGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = pilGrad;

  // Left pillar
  drawRoundedRect(ctx, leftX + 4, topY + 4, 10, h - 8, 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Right pillar
  drawRoundedRect(ctx, leftX + w - 14, topY + 10, 10, h - 14, 2);
  ctx.fill();
  ctx.stroke();

  // Glowing cyan top cap on left pillar
  ctx.fillStyle = "#67e8f9";
  ctx.fillRect(leftX + 4, topY + 3, 10, 1.5);

  // Keystone arch span
  ctx.fillStyle = "#1e293b";
  drawRoundedRect(ctx, leftX + 10, topY - 2, w - 20, 7, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.stroke();

  // Floating Shrine Diamond Relic & Starlight Beacon Beam
  const pulseY = Math.sin(nowMs * 0.004) * 2;
  const coreColor = isLit ? "#ff4b8b" : "#38bdf8";

  if (isLit) {
    // Radiant ascending Starlight Beacon Beam into the sky
    const beaconGrad = ctx.createLinearGradient(0, topY, 0, topY - 190);
    beaconGrad.addColorStop(0, "rgba(255, 75, 139, 0.78)");
    beaconGrad.addColorStop(0.35, "rgba(0, 242, 254, 0.62)");
    beaconGrad.addColorStop(0.7, "rgba(254, 240, 138, 0.42)");
    beaconGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = beaconGrad;
    const beamW = 16 + Math.sin(nowMs * 0.006) * 3;
    ctx.fillRect(centerX - beamW / 2, topY - 190, beamW, 190);

    // Expanding celestial aura ring
    const ringR = 10 + ((nowMs * 0.02) % 22);
    const ringAlpha = Math.max(0, 1 - (ringR - 10) / 22);
    ctx.strokeStyle = `rgba(254, 240, 138, ${ringAlpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, topY + 1.5, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Rising stardust motes
    for (let m = 0; m < 5; m++) {
      const mx = centerX + Math.sin(nowMs * 0.004 + m * 1.6) * (beamW * 0.7);
      const my = topY - ((nowMs * 0.06 + m * 38) % 190);
      ctx.fillStyle = m % 2 === 0 ? "#ff4b8b" : "#67e8f9";
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
  }

  ctx.save();
  ctx.translate(centerX, topY + 1.5 + pulseY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = coreColor;
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();

  // Glowing runes on pillars
  ctx.fillStyle = "#67e8f9";
  ctx.font = "bold 5px monospace";
  ctx.fillText("ᚨ", leftX + 7, topY + 14);
  ctx.fillText("ᛟ", leftX + 7, topY + 22);
  ctx.fillText("ᚱ", leftX + 7, topY + 30);
  ctx.fillText("ᛉ", leftX + w - 11, topY + 20);
  ctx.fillText("ᚠ", leftX + w - 11, topY + 28);

  // Shrine Altar Base
  ctx.fillStyle = "#1e293b";
  drawRoundedRect(ctx, leftX, groundY - 6, w, 6, 2);
  ctx.fill();
  ctx.strokeStyle = isLit ? "#ff4b8b" : "#38bdf8";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = isLit ? "#fbcfe8" : "#67e8f9";
  ctx.font = "bold 4.5px monospace";
  ctx.fillText(labelText, centerX - 18, groundY - 1.8);
}
