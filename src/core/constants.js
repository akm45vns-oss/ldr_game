// Game Constants and Configurations
export const VIEW_WIDTH = 480;   // Logical gameplay coordinate width (16:9)
export const VIEW_HEIGHT = 270;  // Logical gameplay coordinate height
export const RENDER_SCALE = 2;   // 2x HD Canvas rendering scale (960x540 native buffer)
export const TILE_SIZE = 16;
export const LEVEL_COLS = 200;   // 200 * 16 = 3200px total world width
export const LEVEL_ROWS = 18;    // 18 * 16 = 288px total world height
export const WORLD_WIDTH = LEVEL_COLS * TILE_SIZE;
export const WORLD_HEIGHT = LEVEL_ROWS * TILE_SIZE;

export const SAVE_STORAGE_KEY = "ph_save_v2";
export const LEGACY_SAVE_STORAGE_KEY = "ph_save_v1";
export const SAVE_SCHEMA_VERSION = 2;

export const PHYSICS = {
  GRAVITY: 920,
  MAX_FALL_SPEED: 340,
  MOVE_ACCEL: 1200,
  MOVE_DECEL: 1400,
  AIR_ACCEL: 920,
  MAX_MOVE_SPEED: 138,
  JUMP_VELOCITY: -330,
  JUMP_CUT_MULTIPLIER: 0.58,
  MIN_JUMP_HOLD_MS: 95,
  COYOTE_TIME_MS: 115,
  JUMP_BUFFER_MS: 135,
  MAX_SUBSTEP_DT: 1 / 120,
};

export const QUEST_ITEM_CATALOG = {
  oakvale_map: {
    id: "oakvale_map",
    name: "Oakvale Trail Note",
    icon: "🗺",
    desc: "A sketched map from the village noticeboard marking the Whispering Forest and Ravine."
  },
  winch_key: {
    id: "winch_key",
    name: "Starlight Winch Key",
    icon: "🗝",
    desc: "Entrusted by Lantern Keeper Mira to lock the East Bank suspension bridge gears."
  },
  lantern_charm: {
    id: "lantern_charm",
    name: "Festival Lantern Charm",
    icon: "🏮",
    desc: "A warm twin-flame charm given by Mira that resonates with the Starlight Couple Shrine."
  },
  starlight_emblem: {
    id: "starlight_emblem",
    name: "Starlight Couple Emblem",
    icon: "🌟",
    desc: "Awarded for igniting the Starlight Shrine together at the summit."
  }
};
