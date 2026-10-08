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
    this.bgmDuckedVolume = 0.08; // 8% volume - ducked during voice narration
    this.fadeTimer = null;
    this.wasPlayingBeforeHidden = false;

    // Narration Audio
    this.narrationAudio = null;
    this.currentNarrationId = null;
    this.currentNarrationTitle = '';
    this.isNarrationPlaying = false;
    this.wasNarrationPlayingBeforeHidden = false;

    // Page-flip AudioBuffer (loaded once from file)
    this.pageFlipBuffer = null;
    this._pageFlipLoadAttempted = false;

    // Visibility change listener to pause music & narration when tab is hidden
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.bgm && !this.bgm.paused) {
            this.wasPlayingBeforeHidden = true;
            this.bgm.pause();
          }
          if (this.narrationAudio && !this.narrationAudio.paused) {
            this.wasNarrationPlayingBeforeHidden = true;
            this.narrationAudio.pause();
          }
        } else {
          if (this.enabled && this.wasPlayingBeforeHidden) {
            this.wasPlayingBeforeHidden = false;
            this.bgm?.play().catch(() => {});
          }
          if (this.enabled && this.wasNarrationPlayingBeforeHidden) {
            this.wasNarrationPlayingBeforeHidden = false;
            this.narrationAudio?.play().catch(() => {});
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
      this.bgm.volume = this.enabled ? (this.isNarrationPlaying ? this.bgmDuckedVolume : this.bgmVolume) : 0;
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

    // If audio is disabled, keep BGM at 0 volume
    if (!this.enabled) {
      this.bgm.volume = 0;
      if (onComplete) onComplete();
      return;
    }

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
   * Play zone / area narration audio
   * Duck BGM to bgmDuckedVolume (0.08) while narration plays.
   * Restore BGM to bgmVolume (0.30) when narration ends or stops.
   * @param {string} id - Identifier of the zone/narration ('welcome', 'cabinets', 'khu1'..'khu6')
   * @param {string} audioSrc - Relative URL to mp3
   * @param {Object} options - { title, onStart, onEnded, onError }
   */
  playNarration(id, audioSrc, options = {}) {
    if (!audioSrc) return;

    // If identical narration is currently actively playing, do not restart
    if (this.currentNarrationId === id && this.narrationAudio && !this.narrationAudio.paused && !this.narrationAudio.ended) {
      return;
    }

    // Stop current narration without restoring BGM immediately since new narration will duck it
    this.stopNarration(false);

    this.currentNarrationId = id;
    this.currentNarrationTitle = options.title || id;

    try {
      const audio = new Audio(audioSrc);
      audio.preload = 'auto';
      audio.volume = this.enabled ? 1.0 : 0;
      this.narrationAudio = audio;

      audio.addEventListener('play', () => {
        this.isNarrationPlaying = true;
        // Duck BGM smoothly when narration starts
        if (this.enabled && this.bgm) {
          this.fadeBgm(this.bgmDuckedVolume, 0.35);
        }
        if (options.onStart) options.onStart();
      });

      audio.addEventListener('ended', () => {
        this.isNarrationPlaying = false;
        this.currentNarrationId = null;
        // Restore BGM smoothly to normal volume
        if (this.enabled && this.bgm) {
          this.fadeBgm(this.bgmVolume, 0.6);
        }
        if (options.onEnded) options.onEnded();
      });

      audio.addEventListener('error', (err) => {
        console.warn(`Narration audio error for [${id}] (${audioSrc}):`, err);
        this.isNarrationPlaying = false;
        this.currentNarrationId = null;
        if (this.enabled && this.bgm) {
          this.fadeBgm(this.bgmVolume, 0.4);
        }
        if (options.onError) options.onError(err);
      });

      if (this.enabled) {
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(e => {
            console.warn(`Narration autoplay prevented for [${id}]:`, e);
          });
        }
      }
    } catch (e) {
      console.warn('Failed to initialize narration audio:', e);
    }
  }

  /**
   * Stop current narration and optionally restore BGM volume
   */
  stopNarration(restoreBgm = true) {
    if (this.narrationAudio) {
      try {
        this.narrationAudio.pause();
        this.narrationAudio.currentTime = 0;
      } catch (e) {}
      this.narrationAudio = null;
    }
    const wasPlaying = this.isNarrationPlaying;
    this.isNarrationPlaying = false;
    this.currentNarrationId = null;
    this.currentNarrationTitle = '';

    if (restoreBgm && wasPlaying && this.enabled && this.bgm) {
      this.fadeBgm(this.bgmVolume, 0.5);
    }
  }

  /**
   * Duck BGM volume by 30% for 0.4s then restore
   */
  _duckBgm() {
    if (!this.bgm || !this.enabled) return;
    const baseVol = this.isNarrationPlaying ? this.bgmDuckedVolume : this.bgmVolume;
    const duckedVol = baseVol * 0.7;
    this.fadeBgm(duckedVol, 0.1, () => {
      setTimeout(() => {
        this.fadeBgm(baseVol, 0.3);
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
          const targetVol = this.isNarrationPlaying ? this.bgmDuckedVolume : this.bgmVolume;
          this.fadeBgm(targetVol, 0.4);
        }).catch(() => {});
      } else {
        this.fadeBgm(0, 0.3, () => {
          this.bgm.pause();
        });
      }
    }

    if (this.narrationAudio) {
      if (this.enabled) {
        this.narrationAudio.volume = 1.0;
        this.narrationAudio.play().catch(() => {});
      } else {
        this.narrationAudio.pause();
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

