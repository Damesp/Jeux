// Retro Synthesized Audio Engine using Web Audio API

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  getMuteStatus() {
    return this.isMuted;
  }

  // Retro Coin/Point beep (Breakout bounce, pacman dot)
  playScore() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now); // A5 note
    osc.frequency.setValueAtTime(1200, now + 0.08); // Quick slide up

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Laser shot (Space Invaders shoot)
  playLaser() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.18); // slide down quickly

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Explosion (Spaceship hit, car crash, brick break)
  playExplosion() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);

    // Add distortion-like gain ramp
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Power Up sound
  playPowerUp() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(330, now); // E4
    osc1.frequency.setValueAtTime(440, now + 0.1); // A4
    osc1.frequency.setValueAtTime(554, now + 0.2); // C#5
    osc1.frequency.setValueAtTime(659, now + 0.3); // E5

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc1.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.45);
  }

  // Life lost or game over
  playGameOver() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.2);
    osc.frequency.linearRampToValueAtTime(100, now + 0.5);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  // Game starting fanfare
  playGameStart() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const duration = 0.12;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * duration);

      gain.gain.setValueAtTime(0.04, now + idx * duration);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * duration + duration * 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * duration);
      osc.stop(now + idx * duration + duration * 1.5);
    });
  }
}

export const audio = new AudioEngine();
