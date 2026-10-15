import { TILE_SIZE, LEVEL_ROWS, WORLD_HEIGHT, PHYSICS } from '../core/constants.js';

// Actor Entity & Deterministic AABB / One-Way Platform Physics
export class Actor {
  constructor(name, x, y, frames) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.width = 12;
    this.height = 17;
    this.facing = 1;
    this.onGround = false;
    this.wasOnGround = false;
    this.justLanded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpElapsedMs = 0;
    this.jumpCutApplied = false;
    this.frames = frames;
    this.animTimer = 0;
    this.currentFrame = 0;
    this.heartTimer = 0;
    this.squashX = 1.0;
    this.squashY = 1.0;
    this.landingSquashTimer = 0;
    this.takeoffStretchTimer = 0;
    this.facingTilt = 0;
  }

  updatePhysics(dt, world, moveDir, jumpPressed, jumpHeld) {
    this.wasOnGround = this.onGround;
    this.justLanded = false;

    const dtMs = dt * 1000;
    if (this.onGround) {
      this.coyoteTimer = PHYSICS.COYOTE_TIME_MS;
      this.jumpElapsedMs = 0;
      this.jumpCutApplied = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dtMs);
      this.jumpElapsedMs += dtMs;
    }

    if (jumpPressed) {
      this.jumpBufferTimer = PHYSICS.JUMP_BUFFER_MS;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dtMs);
    }

    // Execute buffered or coyote jump before sub-stepping
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = PHYSICS.JUMP_VELOCITY;
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpElapsedMs = 0;
      this.jumpCutApplied = false;
      this.takeoffStretchTimer = 0.12;
    }

    // Frame-rate-independent variable jump height cut (responsive early cut for snappy low hops)
    if (
      !jumpHeld &&
      !this.jumpCutApplied &&
      this.jumpElapsedMs >= 40 &&
      this.vy < -60
    ) {
      this.vy *= PHYSICS.JUMP_CUT_MULTIPLIER;
      this.jumpCutApplied = true;
    }

    // Sub-step integration (max 1/120s per step) so jump apex and platform landing are identical at 20–120 FPS
    const steps = Math.max(1, Math.ceil(dt / PHYSICS.MAX_SUBSTEP_DT));
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const accel = this.onGround ? PHYSICS.MOVE_ACCEL : PHYSICS.AIR_ACCEL;
      if (moveDir !== 0) {
        this.vx += moveDir * accel * subDt;
        this.vx = Math.max(-PHYSICS.MAX_MOVE_SPEED, Math.min(PHYSICS.MAX_MOVE_SPEED, this.vx));
        this.facing = moveDir > 0 ? 1 : -1;
      } else {
        const decel = PHYSICS.MOVE_DECEL * subDt;
        if (Math.abs(this.vx) <= decel) {
          this.vx = 0;
        } else {
          this.vx -= Math.sign(this.vx) * decel;
        }
      }

      // Midpoint / Verlet vertical integration for exact frame-rate-independent jump apex
      const prevVy = this.vy;
      this.vy = Math.min(PHYSICS.MAX_FALL_SPEED, this.vy + PHYSICS.GRAVITY * subDt);
      const avgVy = 0.5 * (prevVy + this.vy);

      this.x += this.vx * subDt;
      this.resolveHorizontalCollisions(world);

      const prevBottom = this.y + this.height;
      this.y += avgVy * subDt;
      this.resolveVerticalCollisions(world, prevBottom);
    }

    if (!this.wasOnGround && this.onGround) {
      this.justLanded = true;
      this.landingSquashTimer = 0.12;
    }

    // Squash and stretch decay timers
    if (this.landingSquashTimer > 0) {
      this.landingSquashTimer = Math.max(0, this.landingSquashTimer - dt);
      const ratio = this.landingSquashTimer / 0.12;
      this.squashX = 1.0 + 0.18 * ratio;
      this.squashY = 1.0 - 0.18 * ratio;
    } else if (this.takeoffStretchTimer > 0) {
      this.takeoffStretchTimer = Math.max(0, this.takeoffStretchTimer - dt);
      const ratio = this.takeoffStretchTimer / 0.12;
      this.squashX = 1.0 - 0.12 * ratio;
      this.squashY = 1.0 + 0.16 * ratio;
    } else if (!this.onGround && this.vy < -70) {
      this.squashX = 0.94;
      this.squashY = 1.06;
    } else {
      this.squashX = 1.0;
      this.squashY = 1.0;
    }

    // Smooth dynamic turning tilt
    const desiredTilt = moveDir * 0.08;
    this.facingTilt += (desiredTilt - this.facingTilt) * Math.min(1, dt * 14);

    // Safe zone-aware chasm/pit recovery (respects bridge state)
    if (this.y > WORLD_HEIGHT + 32) {
      if (this.x >= 166 * TILE_SIZE && world.bridgeUnlockedPermanently) {
        this.x = 168 * TILE_SIZE;
      } else if (this.x >= 135 * TILE_SIZE) {
        this.x = 142 * TILE_SIZE;
      } else {
        this.x = 8 * TILE_SIZE;
      }
      this.y = 15 * TILE_SIZE - this.height;
      this.vx = 0;
      this.vy = 0;
      this.onGround = true;
    }

    this.animTimer += dt;
    if (!this.onGround) {
      this.currentFrame = 4;
    } else if (Math.abs(this.vx) > 12) {
      this.currentFrame = 2 + (Math.floor(this.animTimer * 9) % 2);
    } else {
      this.currentFrame = Math.floor(this.animTimer * 2.2) % 2;
    }

    if (this.heartTimer > 0) {
      this.heartTimer = Math.max(0, this.heartTimer - dt);
    }
  }

  resolveHorizontalCollisions(world) {
    const topRow = Math.floor((this.y + 2) / TILE_SIZE);
    const bottomRow = Math.floor((this.y + this.height - 2) / TILE_SIZE);

    if (this.vx > 0) {
      const rightCol = Math.floor((this.x + this.width) / TILE_SIZE);
      for (let r = topRow; r <= bottomRow; r++) {
        if (world.isSolidAt(rightCol, r)) {
          this.x = rightCol * TILE_SIZE - this.width - 0.01;
          this.vx = 0;
          break;
        }
      }
    } else if (this.vx < 0) {
      const leftCol = Math.floor(this.x / TILE_SIZE);
      for (let r = topRow; r <= bottomRow; r++) {
        if (world.isSolidAt(leftCol, r)) {
          this.x = (leftCol + 1) * TILE_SIZE + 0.01;
          this.vx = 0;
          break;
        }
      }
    }
  }

  resolveVerticalCollisions(world, prevBottom) {
    this.onGround = false;
    const leftCol = Math.floor((this.x + 1.5) / TILE_SIZE);
    const rightCol = Math.floor((this.x + this.width - 1.5) / TILE_SIZE);

    if (this.vy >= 0) {
      const startRow = Math.max(0, Math.floor((prevBottom - 1) / TILE_SIZE));
      const endRow = Math.min(LEVEL_ROWS - 1, Math.floor((this.y + this.height) / TILE_SIZE));
      for (let r = startRow; r <= endRow; r++) {
        const tileTop = r * TILE_SIZE;
        for (let c = leftCol; c <= rightCol; c++) {
          if (
            world.isSolidAt(c, r) ||
            (world.isOneWayAt(c, r) && prevBottom <= tileTop + 5)
          ) {
            this.y = tileTop - this.height;
            this.vy = 0;
            this.onGround = true;
            return;
          }
        }
      }
    } else if (this.vy < 0) {
      const topRow = Math.floor(this.y / TILE_SIZE);
      for (let c = leftCol; c <= rightCol; c++) {
        if (world.isSolidAt(c, topRow)) {
          this.y = (topRow + 1) * TILE_SIZE;
          this.vy = 0;
          return;
        }
      }
    }
  }
}
