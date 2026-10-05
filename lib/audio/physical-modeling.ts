/**
 * N&Mstudio Grand Piano - Physical Acoustic & Mechanical Action Synthesis Engine
 * Real-time physical modeling of an Acoustic Concert Grand Piano:
 * - Non-linear felt-covered wooden hammer impact (Key-Down thuds)
 * - Key-Up release damper landing contact noise
 * - Collective Damper Lift / Drop swoosh on Sustain Pedal (CC64)
 * - Pedal mechanism engagement clicks & spring tension
 * - Dynamic Timbre Shifting (velocity-to-spectral brightness non-linear excitation)
 * - String Inharmonicity & frequency-dependent physical soundboard decay
 */

export interface PhysicalActionConfig {
  hammerThudEnabled: boolean;
  damperReleaseEnabled: boolean;
  pedalNoiseEnabled: boolean;
  timbreExciterGain: number;
}

export const DEFAULT_PHYSICAL_CONFIG: PhysicalActionConfig = {
  hammerThudEnabled: true,
  damperReleaseEnabled: true,
  pedalNoiseEnabled: true,
  timbreExciterGain: 1.0,
};

/**
 * Generates continuous non-linear spectral harmonic boost based on hammer strike velocity.
 * Simulates felt compression against the wooden core on forte strikes.
 */
export function calculateDynamicTimbreExcitation(velocity: number): {
  brightnessCutoff: number;
  harmonicBoostDb: number;
  transientSharpness: number;
} {
  const v = Math.max(0.001, Math.min(1.0, velocity));
  // Non-linear power curve for felt compression
  const compression = Math.pow(v, 1.85);

  // High-frequency spectral expansion: 3.5kHz (pianissimo) -> 20kHz (fortissimo)
  const brightnessCutoff = 3500 + compression * 16500;

  // Dynamic harmonic boost (up to +7.5dB on explosive strikes)
  const harmonicBoostDb = Math.max(-2.0, (compression - 0.35) * 11.5);

  // Attack transient sharpness factor
  const transientSharpness = 0.8 + compression * 0.45;

  return { brightnessCutoff, harmonicBoostDb, transientSharpness };
}

/**
 * Calculates string inharmonicity coefficient B for a given MIDI note.
 * In a grand piano, string stiffness causes upper partials to be sharper than strict harmonics:
 * fn = n * f0 * sqrt(1 + B * n^2)
 */
export function calculateStringInharmonicity(midi: number): number {
  const note = Math.max(21, Math.min(108, midi));
  // Bass strings (wrapped copper) and high treble strings have higher stiffness
  if (note < 40) {
    return 0.00015 + (40 - note) * 0.00002;
  }
  if (note > 80) {
    return 0.0003 + (note - 80) * 0.00004;
  }
  return 0.0002;
}

/**
 * Real-time Physical Mechanical Action Synthesizer
 */
export class MechanicalActionEngine {
  private context: AudioContext;
  private noiseBus: GainNode;
  private soundboardBus: GainNode;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;

    this.soundboardBus = context.createGain();
    this.soundboardBus.gain.value = 0.85;
    this.soundboardBus.connect(destination);

    this.noiseBus = context.createGain();
    this.noiseBus.gain.value = 0.65;
    this.noiseBus.connect(this.soundboardBus);

    this.initNoiseBuffer();
  }

  private initNoiseBuffer() {
    // 2-second high-density pink/stochastic noise buffer for mechanical micro-transients
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * 2.0);
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise filter algorithm (Paul Kellet)
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * Triggers key-down mechanical hammer thud & wooden keybed impact
   */
  triggerHammerImpact(midi: number, velocity: number, time?: number) {
    if (!this.noiseBuffer) return;
    const t = time ?? this.context.currentTime;
    const v = Math.max(0.1, Math.min(1.0, velocity));

    // 1. Low-frequency wooden keybed thump (80Hz - 160Hz)
    const thumpOsc = this.context.createOscillator();
    const thumpGain = this.context.createGain();
    const thumpFilter = this.context.createBiquadFilter();

    thumpFilter.type = 'lowpass';
    thumpFilter.frequency.value = 140;
    thumpFilter.Q.value = 2.0;

    const fundamental = 90 + ((midi - 21) / 88) * 45;
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime(fundamental, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(45, t + 0.028);

    const thumpAmp = Math.pow(v, 1.9) * 0.09;
    thumpGain.gain.setValueAtTime(thumpAmp, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    thumpOsc.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    thumpGain.connect(this.noiseBus);

    thumpOsc.start(t);
    thumpOsc.stop(t + 0.04);

    // 2. High-frequency hammer felt strike slap (3.2kHz - 5.5kHz)
    if (v > 0.35) {
      const slapSource = this.context.createBufferSource();
      slapSource.buffer = this.noiseBuffer;
      const slapFilter = this.context.createBiquadFilter();
      slapFilter.type = 'bandpass';
      slapFilter.frequency.value = 3600 + v * 1800;
      slapFilter.Q.value = 1.8;

      const slapGain = this.context.createGain();
      const slapAmp = Math.pow(v, 2.2) * 0.045;
      slapGain.gain.setValueAtTime(slapAmp, t);
      slapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

      slapSource.connect(slapFilter);
      slapFilter.connect(slapGain);
      slapGain.connect(this.noiseBus);

      slapSource.start(t, Math.random() * 0.5);
      slapSource.stop(t + 0.018);
    }
  }

  /**
   * Triggers key-up damper landing noise on string release
   */
  triggerDamperRelease(midi: number, time?: number) {
    if (!this.noiseBuffer || midi >= 89) return; // Damperless register has no damper contact
    const t = time ?? this.context.currentTime;

    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(600, 1800 - (midi - 21) * 12);
    filter.Q.value = 1.4;

    const gain = this.context.createGain();
    const amp = 0.022 * (1 - (midi - 21) / 100);
    gain.gain.setValueAtTime(amp, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.noiseBus);

    source.start(t, Math.random() * 0.5);
    source.stop(t + 0.03);
  }

  /**
   * Triggers collective damper lift / drop swoosh when sustain pedal (CC64) engages/releases
   */
  triggerPedalSustainAction(down: boolean, time?: number) {
    if (!this.noiseBuffer) return;
    const t = time ?? this.context.currentTime;

    if (down) {
      // Damper Lift Swoosh (all 88 felt dampers lifting off strings simultaneously)
      const source = this.context.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, t);
      filter.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
      filter.Q.value = 0.85;

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.055, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.noiseBus);

      source.start(t, Math.random() * 0.5);
      source.stop(t + 0.18);

      // Mechanical pedal engagement trapwork click
      this.triggerPedalMechanicalClick(t, true);
    } else {
      // Damper Drop Damp (all dampers landing back on strings)
      const source = this.context.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      filter.Q.value = 1.0;

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.noiseBus);

      source.start(t, Math.random() * 0.5);
      source.stop(t + 0.11);

      this.triggerPedalMechanicalClick(t, false);
    }
  }

  /**
   * Pedal mechanism spring tension & metal-wood click
   */
  private triggerPedalMechanicalClick(time: number, isDown: boolean) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDown ? 780 : 640, time);
    osc.frequency.exponentialRampToValueAtTime(220, time + 0.012);

    gain.gain.setValueAtTime(0.03, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);

    osc.connect(gain);
    gain.connect(this.noiseBus);

    osc.start(time);
    osc.stop(time + 0.02);
  }

  disconnect() {
    try {
      this.noiseBus.disconnect();
      this.soundboardBus.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}
