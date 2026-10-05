/**
 * N&Mstudio Grand Piano - Audio V2 Sympathetic Resonance Engine (Milestone 2)
 * Simulates soundboard body coupling and open-string sympathetic resonance when
 * the sustain pedal is depressed or harmonically related keys vibrate sympathetically.
 */

export class SympatheticResonanceBus {
  private context: AudioContext;
  private inputGain: GainNode;
  private bodyFilterLow: BiquadFilterNode;
  private bodyFilterMid: BiquadFilterNode;
  private resonanceGain: GainNode;
  private outputGain: GainNode;
  private isSustained = false;
  private activeNoteCount = 0;

  constructor(context: AudioContext) {
    this.context = context;

    // Parallel resonance bus routing
    this.inputGain = context.createGain();
    this.inputGain.gain.value = 0.22;

    // Soundboard primary acoustic formant (spruce bridge resonance ~320Hz)
    this.bodyFilterLow = context.createBiquadFilter();
    this.bodyFilterLow.type = 'peaking';
    this.bodyFilterLow.frequency.value = 320;
    this.bodyFilterLow.Q.value = 1.2;
    this.bodyFilterLow.gain.value = 4.5;

    // Harmonic air shimmer resonance (~2.4kHz soundboard bloom)
    this.bodyFilterMid = context.createBiquadFilter();
    this.bodyFilterMid.type = 'peaking';
    this.bodyFilterMid.frequency.value = 2400;
    this.bodyFilterMid.Q.value = 0.8;
    this.bodyFilterMid.gain.value = 2.0;

    // Dynamic resonance coupling gain (modulated by sustain pedal & polyphony)
    this.resonanceGain = context.createGain();
    this.resonanceGain.gain.value = 0.05; // Rest base soundboard bleed

    this.outputGain = context.createGain();
    this.outputGain.gain.value = 0.65;

    // Signal graph: Input -> Low Formant -> Mid Formant -> Resonance Gain -> Output
    this.inputGain.connect(this.bodyFilterLow);
    this.bodyFilterLow.connect(this.bodyFilterMid);
    this.bodyFilterMid.connect(this.resonanceGain);
    this.resonanceGain.connect(this.outputGain);
  }

  /**
   * Connect an audio source or voice bus into the sympathetic resonance engine
   */
  connectSource(source: AudioNode) {
    source.connect(this.inputGain);
  }

  /**
   * Connect the resonance engine output to the main audio mixing bus
   */
  connectDestination(destination: AudioNode) {
    this.outputGain.connect(destination);
  }

  /**
   * Modulates sympathetic resonance coupling when the sustain pedal state changes.
   * When dampers are lifted, all 88 strings vibrate sympathetically with sounding notes.
   */
  setSustain(down: boolean, atTime?: number) {
    this.isSustained = down;
    const t = atTime ?? this.context.currentTime;
    const targetGain = down ? 0.32 : 0.04;
    const timeConstant = down ? 0.06 : 0.22; // Quick bloom on press, gentle natural ring decay on release
    this.resonanceGain.gain.setTargetAtTime(targetGain, t, timeConstant);
  }

  /**
   * Adjusts harmonic density based on currently sounding polyphonic notes
   */
  setPolyphony(count: number) {
    this.activeNoteCount = Math.max(0, count);
    if (!this.isSustained) {
      // Subtle inter-string sympathetic coupling during multi-note chords
      const chordCoupling = Math.min(0.12, 0.03 + this.activeNoteCount * 0.015);
      this.resonanceGain.gain.setTargetAtTime(chordCoupling, this.context.currentTime, 0.05);
    }
  }

  disconnect() {
    try {
      this.inputGain.disconnect();
      this.bodyFilterLow.disconnect();
      this.bodyFilterMid.disconnect();
      this.resonanceGain.disconnect();
      this.outputGain.disconnect();
    } catch {
      // Ignore disconnect errors during teardown
    }
  }
}
