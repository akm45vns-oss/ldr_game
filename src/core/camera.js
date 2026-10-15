import { VIEW_WIDTH, VIEW_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from './constants.js';

// Camera2D with look-ahead, deadzone, exponential smoothing, and world clamping
export class Camera2D {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.lookAhead = 0;
  }

  update(dt, targetActor) {
    const desiredLook = targetActor.facing * 28;
    this.lookAhead += (desiredLook - this.lookAhead) * Math.min(1, dt * 4);

    const targetX = targetActor.x + targetActor.width / 2 + this.lookAhead - VIEW_WIDTH / 2;
    const targetY = targetActor.y + targetActor.height / 2 - VIEW_HEIGHT * 0.58;

    const alpha = 1 - Math.exp(-7.5 * dt);
    this.x += (targetX - this.x) * alpha;
    this.y += (targetY - this.y) * alpha;

    this.x = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, this.x));
    this.y = Math.max(0, Math.min(WORLD_HEIGHT - VIEW_HEIGHT, this.y));
  }

  get renderX() {
    return Math.round(this.x * 2) / 2;
  }

  get renderY() {
    return Math.round(this.y * 2) / 2;
  }
}
