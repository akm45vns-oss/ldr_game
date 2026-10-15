import { safeStorageGet, safeStorageSet } from '../core/storage.js';

// Sound & Audio Engine: Self-Contained Procedural Web Audio API
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.isMuted = safeStorageGet("ph_audio_muted", "false") === "true";
    this.bgmVol = parseFloat(safeStorageGet("ph_bgm_vol", "0.65")) || 0.65;
    this.sfxVol = parseFloat(safeStorageGet("ph_sfx_vol", "0.85")) || 0.85;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.unlocked = false;
    this.setupAutoplayUnlock();
  }

  setupAutoplayUnlock() {
    const unlock = () => {
      if (!this.unlocked) {
        this.ensureContext();
        this.unlocked = true;
        if (!this.isMuted) {
          this.startBgm();
        }
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopBgm();
      } else if (this.unlocked && !this.isMuted) {
        this.startBgm();
      }
    });
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      try {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.updateGains();
      } catch (_) {
        return null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  updateGains() {
    if (!this.masterGain || !this.bgmGain || !this.sfxGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const targetMaster = this.isMuted ? 0 : 1;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(targetMaster, now + 0.05);

    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
    this.bgmGain.gain.linearRampToValueAtTime(this.bgmVol * 0.35, now + 0.05);

    this.sfxGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
    this.sfxGain.gain.linearRampToValueAtTime(this.sfxVol, now + 0.05);
  }

  setMute(mute) {
    this.isMuted = Boolean(mute);
    safeStorageSet("ph_audio_muted", this.isMuted ? "true" : "false");
    this.updateGains();
    if (this.isMuted) {
      this.stopBgm();
    } else if (this.unlocked) {
      this.startBgm();
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setBgmVolume(val) {
    this.bgmVol = Math.max(0, Math.min(1, parseFloat(val) || 0));
    safeStorageSet("ph_bgm_vol", this.bgmVol.toString());
    this.updateGains();
  }

  setSfxVolume(val) {
    this.sfxVol = Math.max(0, Math.min(1, parseFloat(val) || 0));
    safeStorageSet("ph_sfx_vol", this.sfxVol.toString());
    this.updateGains();
  }

  startBgm() {
    if (this.bgmTimer) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const CHORDS = [
      { root: 130.81, notes: [130.81, 196.00, 246.94, 329.63, 392.00] }, // Cmaj9
      { root: 110.00, notes: [110.00, 164.81, 196.00, 261.63, 329.63] }, // Am9
      { root: 87.31,  notes: [87.31,  130.81, 174.61, 220.00, 261.63] }, // Fmaj7
      { root: 98.00,  notes: [98.00,  146.83, 196.00, 246.94, 293.66] }  // G
    ];

    const BELL_NOTES = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

    const playMeasure = () => {
      if (this.isMuted || !this.ctx) return;
      const chord = CHORDS[this.bgmStep % CHORDS.length];
      this.bgmStep++;

      const now = this.ctx.currentTime;
      const dur = 3.9;

      // Warm filtered pad chord
      chord.notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = idx % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(380 + Math.sin(now * 0.2) * 80, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.038 / chord.notes.length, now + 0.8);
        gain.gain.setValueAtTime(0.038 / chord.notes.length, now + dur - 0.9);
        gain.gain.linearRampToValueAtTime(0.0001, now + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(now);
        osc.stop(now + dur + 0.1);
      });

      // Delicate high bell chimes in pentatonic harmony
      const bellCount = 2 + (this.bgmStep % 2);
      for (let b = 0; b < bellCount; b++) {
        const bDelay = 0.5 + b * 1.1 + Math.random() * 0.3;
        const bFreq = BELL_NOTES[(this.bgmStep * 2 + b * 3) % BELL_NOTES.length];
        const bNow = now + bDelay;

        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();

        bOsc.type = "sine";
        bOsc.frequency.setValueAtTime(bFreq, bNow);

        bGain.gain.setValueAtTime(0.0001, bNow);
        bGain.gain.linearRampToValueAtTime(0.024, bNow + 0.02);
        bGain.gain.exponentialRampToValueAtTime(0.0001, bNow + 0.9);

        bOsc.connect(bGain);
        bGain.connect(this.bgmGain);

        bOsc.start(bNow);
        bOsc.stop(bNow + 0.95);
      }
    };

    playMeasure();
    this.bgmTimer = setInterval(playMeasure, 4000);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playJump() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  playLand() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.1);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(260, now);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playCrystal() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const notes = [1318.5, 1661.2, 1975.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.34);
    });
  }

  playMemory() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const chord = [523.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, i) => {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.8);
    });
  }

  playInteract() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playPlate() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playBridgeUnlock() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const chord = [293.66, 369.99, 440.00, 587.33];
    chord.forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.9);
    });
  }

  playShrineIgnite() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const fanfare = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25, 783.99, 1046.50];
    fanfare.forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i >= 4 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 1.25);
    });
  }

  playMenuClick() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.035);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.045);
  }

  playToast() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  playRespawn() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(540, now + 0.2);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.45);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.48);
  }
}
