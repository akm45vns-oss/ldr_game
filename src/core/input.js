// Unified Input Manager: Desktop Keyboard + Multi-Touch Mobile Controls
export class InputManager {
  constructor() {
    this.keys = new Set();
    this.touchActions = new Set();
    this.activePointers = new Map();
    this.justPressed = new Set();
    this.bindKeyboard();
    this.bindTouchButtons();
  }

  clearAllInputs() {
    this.keys.clear();
    this.touchActions.clear();
    this.activePointers.clear();
    document.querySelectorAll(".touch-btn.active").forEach((b) => b.classList.remove("active"));
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (document.activeElement && document.activeElement.tagName === "INPUT") return;
      const code = e.code;
      if (!this.keys.has(code)) {
        this.justPressed.add(code);
      }
      this.keys.add(code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener("blur", () => this.clearAllInputs());
    window.addEventListener("pagehide", () => this.clearAllInputs());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearAllInputs();
    });
  }

  bindTouchButtons() {
    const buttons = document.querySelectorAll(".touch-btn");
    buttons.forEach((btn) => {
      const action = btn.getAttribute("data-action");
      const activate = (e) => {
        e.preventDefault();
        if (typeof btn.setPointerCapture === "function" && e.pointerId !== undefined) {
          try {
            btn.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
        if (!this.touchActions.has(action)) {
          this.justPressed.add("touch:" + action);
        }
        this.touchActions.add(action);
        if (e.pointerId !== undefined) {
          this.activePointers.set(e.pointerId, { action, btn });
        }
        btn.classList.add("active");
      };

      const deactivate = (e) => {
        if (e && e.cancelable) e.preventDefault();
        if (e && e.pointerId !== undefined) {
          this.activePointers.delete(e.pointerId);
        }
        let stillHeld = false;
        for (const entry of this.activePointers.values()) {
          if (entry.action === action) {
            stillHeld = true;
            break;
          }
        }
        if (!stillHeld) {
          this.touchActions.delete(action);
          btn.classList.remove("active");
        }
      };

      btn.addEventListener("pointerdown", activate);
      btn.addEventListener("pointerup", deactivate);
      btn.addEventListener("pointercancel", deactivate);
      btn.addEventListener("lostpointercapture", deactivate);
      btn.addEventListener("pointerleave", (e) => {
        if (typeof btn.hasPointerCapture === "function" && e.pointerId !== undefined && btn.hasPointerCapture(e.pointerId)) {
          return;
        }
        deactivate(e);
      });
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    window.addEventListener("touchend", (e) => {
      if (e.touches && e.touches.length === 0) {
        this.touchActions.clear();
        this.activePointers.clear();
        document.querySelectorAll(".touch-btn.active").forEach((b) => b.classList.remove("active"));
      }
    }, { passive: true });
    window.addEventListener("touchcancel", () => this.clearAllInputs(), { passive: true });
  }

  get moveX() {
    let dir = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchActions.has("left")) dir -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchActions.has("right")) dir += 1;
    return dir;
  }

  get jumpHeld() {
    return (
      this.keys.has("Space") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("KeyW") ||
      this.touchActions.has("jump")
    );
  }

  consumeJumpPress() {
    const codes = ["Space", "ArrowUp", "KeyW", "touch:jump"];
    for (const c of codes) {
      if (this.justPressed.has(c)) {
        this.justPressed.delete(c);
        return true;
      }
    }
    return false;
  }

  consumeInteractPress() {
    const codes = ["KeyE", "Enter", "touch:interact"];
    for (const c of codes) {
      if (this.justPressed.has(c)) {
        this.justPressed.delete(c);
        return true;
      }
    }
    return false;
  }

  consumeCompanionToggle() {
    const codes = ["KeyC", "touch:call"];
    for (const c of codes) {
      if (this.justPressed.has(c)) {
        this.justPressed.delete(c);
        return true;
      }
    }
    return false;
  }

  consumeKey(code) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.justPressed.clear();
  }
}
