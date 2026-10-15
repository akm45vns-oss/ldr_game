// Multi-step Interactive Story & Dialogue Controller
export class DialogueController {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.speaker = "";
    this.pages = [];
    this.pageIndex = 0;
    this.onComplete = null;
    this.completedCallbackFired = false;

    this.bannerEl = document.getElementById("story-banner");
    this.speakerEl = document.getElementById("story-speaker");
    this.textEl = document.getElementById("story-text");
    this.stepEl = document.getElementById("dialogue-step-indicator");
    this.nextBtn = document.getElementById("btn-dialogue-next");
    this.closeBtn = document.getElementById("btn-dialogue-close");
    this.topCloseBtn = document.getElementById("story-close");

    this.bindEvents();
  }

  bindEvents() {
    if (this.nextBtn) {
      this.nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.advance();
      });
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close(true);
      });
    }
    if (this.topCloseBtn) {
      this.topCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close(true);
      });
    }
    if (this.bannerEl) {
      this.bannerEl.addEventListener("click", (e) => {
        if (e.target === this.nextBtn || e.target === this.closeBtn || e.target === this.topCloseBtn) return;
        this.advance();
      });
    }
  }

  open(speaker, pagesInput, onComplete = null) {
    const pages = Array.isArray(pagesInput) ? pagesInput.filter(Boolean) : [String(pagesInput || "")];
    if (pages.length === 0) return;

    this.speaker = speaker;
    this.pages = pages;
    this.pageIndex = 0;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.completedCallbackFired = false;
    this.isOpen = true;

    if (this.app.input) {
      this.app.input.clearAllInputs();
    }
    if (this.app.viewport) {
      this.app.viewport.updateLayout();
    }
    this.renderPage();
    if (this.bannerEl) {
      this.bannerEl.classList.remove("hidden");
    }
  }

  renderPage() {
    if (this.speakerEl) this.speakerEl.textContent = this.speaker;
    if (this.textEl) this.textEl.textContent = this.pages[this.pageIndex] || "";
    if (this.stepEl) this.stepEl.textContent = `Page ${this.pageIndex + 1} / ${this.pages.length}`;
    const hasMore = this.pageIndex < this.pages.length - 1;
    if (this.nextBtn) {
      this.nextBtn.textContent = hasMore ? "Next ▶ [E]" : "Continue ✓ [E]";
    }
  }

  advance() {
    if (!this.isOpen) return;
    if (this.app.sound) {
      this.app.sound.playInteract();
    }
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.renderPage();
    } else {
      this.close(true);
    }
  }

  close(runCompletion = true) {
    if (!this.isOpen) {
      if (this.bannerEl) this.bannerEl.classList.add("hidden");
      return;
    }
    this.isOpen = false;
    if (this.bannerEl) this.bannerEl.classList.add("hidden");
    if (runCompletion && this.onComplete && !this.completedCallbackFired) {
      this.completedCallbackFired = true;
      const cb = this.onComplete;
      this.onComplete = null;
      cb();
    }
  }
}
