import { LEVEL_ROWS, LEVEL_COLS, TILE_SIZE } from '../core/constants.js';

// Level World: Oakvale Village -> Whispering Forest -> Broken Bridge -> Starlight Shrine
export class LevelWorld {
  constructor() {
    this.grid = Array.from({ length: LEVEL_ROWS }, () => new Uint8Array(LEVEL_COLS));
    this.bridgeUnlockedPermanently = false;
    this.platePressed = false;
    this.shrineLit = false;
    this.platformRuns = [];
    this.buildLevel();
  }

  buildLevel() {
    // Continuous walkable ground at row 15..17 (cols 0..149 and cols 166..199)
    for (let c = 0; c < LEVEL_COLS; c++) {
      const isChasm = c >= 150 && c <= 165;
      if (!isChasm) {
        this.grid[15][c] = c < 66 ? 3 : 1;
        this.grid[16][c] = 2;
        this.grid[17][c] = 2;
      }
    }

    // Left & right world boundary walls
    for (let r = 0; r < LEVEL_ROWS; r++) {
      this.grid[r][0] = 4;
      this.grid[r][LEVEL_COLS - 1] = 4;
    }

    // Zone 1: Oakvale Village — generous overlapping 2-tile (32px) staircase monoliths (Max Jump = 59px)
    this.addPlatform(17, 13, 7, 5); // Plat 1A: cols 17..23, row 13 (32px above ground) -> Crystal c1
    this.addPlatform(27, 13, 9, 5); // Plat 1B: cols 27..35, row 13 stepping stone to Plat 1C
    this.addPlatform(33, 11, 9, 5); // Plat 1C: cols 33..41, row 11 (32px above Plat 1B) -> Crystal c2
    this.addPlatform(50, 13, 8, 5); // Plat 1D: cols 50..57, row 13 (32px above ground) -> Memory m1

    // Zone 2: Whispering Forest — unobstructed ground path + two overlapping 2-tile staircase ascents
    this.addPlatform(74, 13, 10, 5); // Plat 2A: cols 74..83, row 13 (32px above ground) -> Crystal c3
    this.addPlatform(81, 11, 11, 5); // Plat 2B: cols 81..91, row 11 (32px above Plat 2A) -> Crystal c4
    this.addPlatform(88, 9, 10, 5);  // Plat 2C: cols 88..97, row 9  (32px above Plat 2B) -> Memory m2

    this.addPlatform(103, 13, 10, 5); // Plat 2D: cols 103..112, row 13 (32px above ground) -> stepping monolith
    this.addPlatform(110, 11, 11, 5); // Plat 2E: cols 110..120, row 11 (32px above Plat 2D) -> Crystal c5
    this.addPlatform(117, 9, 10, 5);  // Plat 2F: cols 117..126, row 9  (32px above Plat 2E) -> Crystal c6
    this.addPlatform(131, 13, 7, 5);  // Plat 2G: cols 131..137, row 13 overlook before West Bank

    // Zone 3: Broken Bridge Chasm (cols 150..165) at row 15 — flush with West & East Banks!
    for (let c = 150; c <= 165; c++) {
      this.grid[15][c] = 6; // Type 6 = active when platePressed or bridgeUnlockedPermanently
    }

    // High sanctuary staircase ledges near Starlight Shrine (cols 172..188)
    this.addPlatform(172, 13, 9, 5); // Plat 3A: cols 172..180, row 13 (32px above ground) -> Crystal c8
    this.addPlatform(178, 11, 10, 5); // Plat 3B: cols 178..187, row 11 (32px above Plat 3A) -> Memory m3

    // Collectible Heart Crystals (8) & Memory Shards (3) aligned with reachable platforms
    this.collectibles = [
      { id: "c1", type: "crystal", x: 19.5 * 16, y: 11.6 * 16, collected: false },
      { id: "c2", type: "crystal", x: 38 * 16, y: 9.6 * 16, collected: false },
      {
        id: "m1",
        type: "memory",
        memoryId: "mem_1",
        x: 54 * 16,
        y: 11.6 * 16,
        collected: false,
        title: "Memory #1: First Coffee in Oakvale",
        text: "A sweet memory of waiting by the village lantern post—until a gentle smile made the whole evening glow."
      },
      { id: "c3", type: "crystal", x: 76.5 * 16, y: 11.6 * 16, collected: false },
      { id: "c4", type: "crystal", x: 86 * 16, y: 9.6 * 16, collected: false },
      {
        id: "m2",
        type: "memory",
        memoryId: "mem_2",
        x: 95 * 16,
        y: 7.6 * 16,
        collected: false,
        title: "Memory #2: Secret Under the Canopy",
        text: "Even when the forest trails grew steep, we never rushed ahead alone. Every climb feels lighter side by side."
      },
      { id: "c5", type: "crystal", x: 114 * 16, y: 9.6 * 16, collected: false },
      { id: "c6", type: "crystal", x: 123 * 16, y: 7.6 * 16, collected: false },
      { id: "c7", type: "crystal", x: 157.5 * 16, y: 14.1 * 16, collected: false },
      {
        id: "m3",
        type: "memory",
        memoryId: "mem_3",
        x: 184 * 16,
        y: 9.6 * 16,
        collected: false,
        title: "Memory #3: Promise at the Bridge",
        text: "No distance or chasm keeps us apart for long—one holds the anchor while the other builds the way across."
      },
      { id: "c8", type: "crystal", x: 175.5 * 16, y: 11.6 * 16, collected: false },
    ];

    // Interactive Objects (Signs, Lantern Keeper Mira, Pressure Plate, Bridge Winch, Starlight Shrine)
    this.interactables = [
      {
        id: "village_sign",
        x: 12 * 16,
        y: 13 * 16,
        radius: 38,
        speaker: "OAKVALE NOTICEBOARD",
        text: "Welcome to Oakvale! Head East into the Whispering Forest."
      },
      {
        id: "elder_cottage",
        x: 44 * 16,
        y: 13 * 16,
        radius: 42,
        speaker: "LANTERN KEEPER MIRA",
        text: "The old ravine bridge ahead collapsed in last night's storm!"
      },
      {
        id: "west_plate",
        x: 145 * 16,
        y: 14.5 * 16,
        radius: 38,
        speaker: "ANCIENT STONE PRESSURE PLATE",
        text: "Position your partner here and press [C] (or tap ♥ STAY/GO) so they hold the plate down while you cross the bridge!"
      },
      {
        id: "east_winch",
        x: 168 * 16,
        y: 13.5 * 16,
        radius: 40,
        speaker: "EAST BANK BRIDGE WINCH",
        text: "Press [B / ACT] to lock the suspension cables permanently so your partner can rejoin you!"
      },
      {
        id: "starlight_shrine",
        x: 190 * 16,
        y: 13 * 16,
        radius: 46,
        speaker: "STARLIGHT COUPLE SHRINE",
        text: "Bring both partners together at the Shrine and press [B / ACT] to ignite the Starlight Beacon!"
      },
    ];
  }

  addPlatform(colStart, row, len, tileId) {
    for (let c = colStart; c < colStart + len; c++) {
      if (c > 0 && c < LEVEL_COLS - 1) this.grid[row][c] = tileId;
    }
    this.platformRuns.push({ colStart, row, len, tileId });
  }

  addSolidBlock(colStart, rowStart, widthCols, heightRows, tileId) {
    for (let r = rowStart; r < rowStart + heightRows; r++) {
      for (let c = colStart; c < colStart + widthCols; c++) {
        if (r >= 0 && r < LEVEL_ROWS && c > 0 && c < LEVEL_COLS - 1) {
          this.grid[r][c] = tileId;
        }
      }
    }
  }

  isSolidAt(col, row) {
    if (col < 0 || col >= LEVEL_COLS) return true;
    if (row < 0) return false;
    if (row >= LEVEL_ROWS) return false;
    const t = this.grid[row][col];
    return t === 1 || t === 2 || t === 3 || t === 4;
  }

  isOneWayAt(col, row) {
    if (col < 0 || col >= LEVEL_COLS || row < 0 || row >= LEVEL_ROWS) return false;
    const t = this.grid[row][col];
    if (t === 5) return true;
    if (t === 6) return this.platePressed || this.bridgeUnlockedPermanently;
    return false;
  }
}
