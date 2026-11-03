export class Sfx {
  ctx?: AudioContext;
  master?: GainNode;
  engineGain?: GainNode;
  driftGain?: GainNode;
  osc?: OscillatorNode;
  osc2?: OscillatorNode;
  analyser?: AnalyserNode;
  enabled = false;
  voices = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on && !this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 12;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(limiter).connect(analyser).connect(ctx.destination);
      const engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1000;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'triangle';
      osc.connect(filter); osc2.connect(filter); filter.connect(engineGain).connect(master);
      osc.start(); osc2.start();
      const driftGain = ctx.createGain(); driftGain.gain.value = 0;
      const screech = ctx.createOscillator(); screech.type = 'sawtooth'; screech.frequency.value = 950;
      const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 2;
      screech.connect(band).connect(driftGain).connect(master); screech.start();
      Object.assign(this, { ctx, master, osc, osc2, engineGain, driftGain, analyser });
    }
    if (this.ctx) {
      if (on) void this.ctx.resume();
      this.master?.gain.setTargetAtTime(on ? 0.65 : 0, this.ctx.currentTime, 0.05);
    }
  }

  engine(ratio: number, throttle: boolean, active: boolean, drift = false, boost = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const audible = active && !document.hidden;
    const rpm = 45 + ratio * 180 + (boost ? 35 : 0);
    this.osc?.frequency.setTargetAtTime(rpm, t, 0.08);
    this.osc2?.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engineGain?.gain.setTargetAtTime(audible ? (throttle || boost ? 0.065 : 0.035) : 0, t, 0.1);
    this.driftGain?.gain.setTargetAtTime(audible && drift ? 0.025 : 0, t, 0.06);
  }

  beep(freq: number, dur = 0.15, delay = 0) {
    if (!this.ctx || !this.enabled || !this.master || document.hidden || this.voices >= 8) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
    this.voices++;
    o.onended = () => { this.voices--; o.disconnect(); g.disconnect(); };
  }

  checkpoint() { [659, 880, 1318].forEach((f, i) => this.beep(f, 0.16, i * 0.07)); }
  thud() {
    if (!this.ctx || !this.enabled || !this.master || this.voices >= 8 || document.hidden) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.24), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 350;
    const gain = ctx.createGain(); gain.gain.value = 0.23;
    noise.connect(filter).connect(gain).connect(this.master); noise.start();
    this.voices++; noise.onended = () => { this.voices--; noise.disconnect(); gain.disconnect(); filter.disconnect(); };
    this.beep(60, 0.2);
  }

  meters() {
    if (!this.analyser) return { peak: 0, rms: 0 };
    const values = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(values);
    let peak = 0, sum = 0;
    for (const v of values) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { peak, rms: Math.sqrt(sum / values.length) };
  }

  dispose() { void this.ctx?.close(); }
}
