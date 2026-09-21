/**
 * Audio Service using Web Audio API
 * Generates ambient museum atmosphere, chime sounds on interaction, and footsteps
 * Does not require external audio files, works 100% reliably in any environment
 */
export class AudioService {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ambientGain = null;
    this.sfxGain = null;
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.isInitialized = false;
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

      // Ambient Drone Gain (very soft, relaxing museum reverb)
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.03;
      this.ambientGain.connect(this.ctx.destination);

      this.startAmbientDrone();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  startAmbientDrone() {
    if (!this.ctx) return;
    try {
      // Warm low frequency museum room resonance (55Hz and 110Hz harmonic)
      this.ambientOsc1 = this.ctx.createOscillator();
      this.ambientOsc1.type = 'sine';
      this.ambientOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);

      this.ambientOsc2 = this.ctx.createOscillator();
      this.ambientOsc2.type = 'triangle';
      this.ambientOsc2.frequency.setValueAtTime(110, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, this.ctx.currentTime);

      this.ambientOsc1.connect(filter);
      this.ambientOsc2.connect(filter);
      filter.connect(this.ambientGain);

      this.ambientOsc1.start();
      this.ambientOsc2.start();
    } catch (e) {}
  }

  toggleAudio() {
    this.init();
    this.enabled = !this.enabled;
    if (this.ctx) {
      if (this.enabled) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.sfxGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
      } else {
        this.sfxGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
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

  playBookOpenSound() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // 1. Leather creak / whoosh
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.35);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.38);

      // 2. Chime flourish
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
    try {
      const now = this.ctx.currentTime;
      // White noise buffer burst for realistic crisp paper rustle
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

  playBookCloseSound() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Soft muffled leather thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }
}

