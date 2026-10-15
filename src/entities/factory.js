// Procedural Sprite & Tileset Factory
export class PixelArtFactory {
  static createCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  static generateCharacterFrames(isPartner = false) {
    const frames = [];
    for (let i = 0; i < 5; i++) {
      frames.push(this.createCanvas(16, 18));
    }
    return frames;
  }

  static generateMiraSprite() {
    return this.createCanvas(16, 18);
  }

  static generateTiles() {
    return {};
  }
}
