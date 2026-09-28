/**
 * Audio Service using Web Audio API & HTML5 Audio
 * GĐ4: File-based page-flip sound (page-flip.mp3) with random pitch variation.
 * BGM ducks 30% during page flip. Open/close book uses same file at rate 0.85.
 */
export class AudioService {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.sfxGain = null;
    this.isInitialized = false;

    // Background Music
    this.bgm = null;
    this.bgmVolume = 0.3; // 30% volume - gentle, elegant background atmosphere
    this.fadeTimer = null;
    this.wasPlayingBeforeHidden = false;

    // Page-flip AudioBuffer (loaded once from file)
    this.pageFlipBuffer = null;
    this._pageFlipLoadAttempted = false;

    // Visibility change listener to pause music when tab is hidden
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.bgm && !this.bgm.paused) {
            this.wasPlayingBeforeHidden = true;
            this.bgm.pause();
          }
        } else {
          if (this.enabled && this.wasPlayingBeforeHidden) {
            this.wasPlayingBeforeHidden = false;
            this.bgm?.play().catch(() => {});
          }
        }
      });
    }
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master FX Gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.25;
      this.sfxGain.connect(this.ctx.destination);

      // Initialize Background Music (HTML5 Audio for smooth streaming & looping)
      this.initBgm();

      // Load page-flip.mp3 into AudioBuffer
      this._loadPageFlipBuffer();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  async _loadPageFlipBuffer() {
    if (this._pageFlipLoadAttempted || !this.ctx) return;
    this._pageFlipLoadAttempted = true;
    try {
      const resp = await fetch('assets/audio/page-flip.mp3');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      this.pageFlipBuffer = await this.ctx.decodeAudioData(arrayBuf);
      console.log('Page-flip audio buffer loaded successfully');
    } catch (e) {
      console.warn('Failed to load page-flip.mp3, will use synthesized fallback:', e);
      this.pageFlipBuffer = null;
    }
  }

  initBgm() {
    if (this.bgm) return;
    try {
      this.bgm = new Audio('assets/audio/hitslab-art-gallery-exhibition-museum-music-272222.mp3');
      this.bgm.loop = true;
      this.bgm.volume = this.enabled ? this.bgmVolume : 0;
      this.bgm.preload = 'auto';

      if (this.enabled) {
        this.playBgm();
      }
    } catch (e) {
      console.warn('Background music failed to load:', e);
    }
  }

  playBgm() {
    if (!this.bgm || !this.enabled) return;
    this.bgm.play().catch(e => {
      // Browser autoplay policy might block before interaction; attach one-time listener
      const onUserInteraction = () => {
        if (this.enabled && this.bgm && this.bgm.paused) {
          this.bgm.play().catch(() => {});
        }
        window.removeEventListener('click', onUserInteraction);
        window.removeEventListener('keydown', onUserInteraction);
        window.removeEventListener('touchstart', onUserInteraction);
      };
      window.addEventListener('click', onUserInteraction, { once: true });
      window.addEventListener('keydown', onUserInteraction, { once: true });
      window.addEventListener('touchstart', onUserInteraction, { once: true });
    });
  }

  pauseBgm() {
    if (this.bgm) {
      this.bgm.pause();
    }
  }

  fadeBgm(targetVol, durationSec = 0.4, onComplete = null) {
    if (!this.bgm) return;
    if (this.fadeTimer) clearInterval(this.fadeTimer);

    const startVol = this.bgm.volume;
    const startTime = performance.now();
    const durationMs = durationSec * 1000;

    this.fadeTimer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      this.bgm.volume = Math.max(0, Math.min(1, startVol + (targetVol - startVol) * progress));

      if (progress >= 1) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (onComplete) onComplete();
      }
    }, 25);
  }

  /**
   * Duck BGM volume by 30% for 0.4s then restore
   */
  _duckBgm() {
    if (!this.bgm || !this.enabled) return;
    const duckedVol = this.bgmVolume * 0.7;
    this.fadeBgm(duckedVol, 0.1, () => {
      setTimeout(() => {
        this.fadeBgm(this.bgmVolume, 0.3);
      }, 300);
    });
  }

  toggleAudio() {
    this.init();
    this.enabled = !this.enabled;

    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.enabled) {
        this.ctx.resume();
      }
      this.sfxGain.gain.setValueAtTime(this.enabled ? 0.25 : 0, this.ctx.currentTime);
    }

    if (this.bgm) {
      if (this.enabled) {
        this.bgm.play().then(() => {
          this.fadeBgm(this.bgmVolume, 0.4);
        }).catch(() => {});
      } else {
        this.fadeBgm(0, 0.3, () => {
          this.bgm.pause();
        });
      }
    }

    return this.enabled;
  }

  playHoverSound() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      // Subtle pleasant high crystal ping (880Hz -> 1320Hz)
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  playClickSound() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Elegant warm chime chord (Major Triad: C6, E6, G6)
      const freqs = [1046.5, 1318.5, 1567.9];
      freqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.03);

        gain.gain.setValueAtTime(0.08, now + i * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.6);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now + i * 0.03);
        osc.stop(now + i * 0.03 + 0.65);
      });
    } catch (e) {}
  }

  playTeleportSound() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.4);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch (e) {}
  }

  playFootstep() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  /**
   * Play page-flip.mp3 from AudioBuffer with random pitch variation.
   * Falls back to synthesized white noise if file failed to load.
   */
  _playFlipBuffer(rate = null) {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.pageFlipBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.pageFlipBuffer;
        src.playbackRate.value = rate ?? (0.95 + Math.random() * 0.10); // 0.95–1.05
        const gain = this.ctx.createGain();
        gain.gain.value = 0.35;
        src.connect(gain);
        gain.connect(this.sfxGain);
        src.start(0);
      } else {
        // Fallback: synthesized white noise rustle
        this._playSynthPageFlip();
      }
    } catch (e) {}
  }

  /** Synthesized fallback when page-flip.mp3 is unavailable */
  _playSynthPageFlip() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.18;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.1);
      filter.Q.value = 1.2;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      noise.start(now);
    } catch (e) {}
  }

  playBookOpenSound() {
    if (!this.enabled || !this.ctx) return;
    // Play page-flip at slower rate for open creak + chime flourish
    this._playFlipBuffer(0.85);
    try {
      const now = this.ctx.currentTime;
      // Chime flourish
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + 0.1 + i * 0.05);
        g.gain.setValueAtTime(0.04, now + 0.1 + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + i * 0.05 + 0.5);
        o.connect(g);
        g.connect(this.sfxGain);
        o.start(now + 0.1 + i * 0.05);
        o.stop(now + 0.1 + i * 0.05 + 0.55);
      });
    } catch (e) {}
  }

  playPageTurnSound() {
    if (!this.enabled || !this.ctx) return;
    this._playFlipBuffer(); // random rate 0.95–1.05
    this._duckBgm(); // BGM ducks 30% for 0.4s
  }

  playBookCloseSound() {
    if (!this.enabled || !this.ctx) return;
    // Play page-flip at slower rate for thud
    this._playFlipBuffer(0.85);
  }
}

