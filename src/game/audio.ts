export class Sfx {
  ctx?: AudioContext;
  osc?: OscillatorNode;
  osc2?: OscillatorNode;
  gain?: GainNode;
  enabled = false;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on && !this.ctx) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 50;
      const osc2 = ctx.createOscillator();
      osc2.type = "square";
      osc2.frequency.value = 25;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      osc.connect(filter);
      osc2.connect(g2).connect(filter);
      filter.connect(gain).connect(ctx.destination);
      osc.start();
      osc2.start();
      Object.assign(this, { ctx, osc, osc2, gain });
    }
    if (this.ctx) {
      if (on) void this.ctx.resume();
      this.gain!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  engine(ratio: number, throttle: boolean, active: boolean) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const f = 45 + ratio * 190;
    this.osc!.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2!.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.gain!.gain.setTargetAtTime(active ? (throttle ? 0.07 : 0.04) : 0.02, t, 0.1);
  }

  beep(freq: number, dur = 0.15) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  thud() { this.beep(70, 0.25); }
}
