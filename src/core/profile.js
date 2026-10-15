// Profile Configuration & Name Migration System for Milestone 4C
// Defines default characters (Bhoot & Kida), placeholder detection, and safe save migration.

export const CHARACTERS = {
  male: {
    id: "male",
    gender: "male",
    defaultName: "Bhoot",
    title: "Traveler of Oakvale",
    tagline: "Courageous Spirit & Loyal Heart",
    palette: {
      primary: "#2563eb",
      secondary: "#1e1b4b",
      accent: "#38bdf8",
      eye: "#67e8f9",
      cloak: "#312e81",
      border: "rgba(56, 189, 248, 0.7)"
    }
  },
  female: {
    id: "female",
    gender: "female",
    defaultName: "Kida",
    title: "Guiding Light of the Vale",
    tagline: "Radiant Grace & Guiding Light",
    palette: {
      primary: "#db2777",
      secondary: "#831843",
      accent: "#f472b6",
      eye: "#fb7185",
      cloak: "#831843",
      border: "rgba(244, 114, 182, 0.7)"
    }
  }
};

// Application default placeholders from previous versions that should be safely migrated
export const LEGACY_MALE_PLACEHOLDERS = new Set(["ayush", "player", "hero", "boy", "traveler", "male"]);
export const LEGACY_FEMALE_PLACEHOLDERS = new Set(["aanya", "partner", "companion", "girl", "spirit", "female"]);

/**
 * Migrates character profile names safely according to Milestone 4C specifications:
 * 1. New male profiles default to "Bhoot".
 * 2. New female profiles default to "Kida".
 * 3. Preserves existing user-entered custom names (e.g. "Rohan", "Simran", "Alex", "Maya").
 * 4. Replaces an old name ONLY when it matches a legacy application default placeholder.
 * 5. Keeps player and partner identities distinct.
 *
 * @param {string|null} savedPlayerName
 * @param {string|null} savedPartnerName
 * @param {string} selectedCharacter "male" | "female"
 * @returns {{ playerName: string, partnerName: string, selectedCharacter: string }}
 */
export function migrateProfileNames(savedPlayerName, savedPartnerName, selectedCharacter = "male") {
  const char = selectedCharacter === "female" ? "female" : "male";
  let playerName = savedPlayerName ? String(savedPlayerName).trim().slice(0, 16) : "";
  let partnerName = savedPartnerName ? String(savedPartnerName).trim().slice(0, 16) : "";

  const isPlayerPlaceholder =
    !playerName ||
    LEGACY_MALE_PLACEHOLDERS.has(playerName.toLowerCase()) ||
    LEGACY_FEMALE_PLACEHOLDERS.has(playerName.toLowerCase());

  const isPartnerPlaceholder =
    !partnerName ||
    LEGACY_FEMALE_PLACEHOLDERS.has(partnerName.toLowerCase()) ||
    LEGACY_MALE_PLACEHOLDERS.has(partnerName.toLowerCase());

  if (char === "female") {
    if (isPlayerPlaceholder) {
      playerName = CHARACTERS.female.defaultName;
    }
    if (isPartnerPlaceholder) {
      partnerName = CHARACTERS.male.defaultName;
    }
  } else {
    // Default male character
    if (isPlayerPlaceholder) {
      playerName = CHARACTERS.male.defaultName;
    }
    if (isPartnerPlaceholder) {
      partnerName = CHARACTERS.female.defaultName;
    }
  }

  // Prevent identical player and partner names
  if (playerName.toLowerCase() === partnerName.toLowerCase()) {
    partnerName = char === "female" ? CHARACTERS.male.defaultName : CHARACTERS.female.defaultName;
  }

  return {
    playerName,
    partnerName,
    selectedCharacter: char
  };
}

export function isCustomName(name) {
  if (!name || typeof name !== "string") return false;
  const clean = name.trim().toLowerCase();
  return !LEGACY_MALE_PLACEHOLDERS.has(clean) && !LEGACY_FEMALE_PLACEHOLDERS.has(clean);
}
