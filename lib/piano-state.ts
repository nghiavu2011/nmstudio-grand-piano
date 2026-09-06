export interface PianoAudio {
  attack(midi: number, velocity: number, soft: boolean): void;
  release(midi: number): void;
  silence(): void;
}
export type PianoSnapshot = {
  held: number[];
  sounding: number[];
  pedals: boolean[];
  captured: number[];
  lastNote: number | null;
};
/** Source ownership prevents a mouse release from stopping a keyboard-held note. */
export class PianoState {
  held = new Map<number, Set<string>>();
  sounding = new Set<number>();
  captured = new Set<number>();
  pedalSources = [new Set<string>(), new Set<string>(), new Set<string>()];
  lastNote: number | null = null;
  visualOnly = false;
  onChange?: (state: PianoSnapshot) => void;
  onStrike?: (midi: number) => void;
  constructor(private audio: PianoAudio) {}
  get pedals() {
    return this.pedalSources.map((s) => s.size > 0);
  }
  snapshot(): PianoSnapshot {
    return {
      held: [...this.held.keys()],
      sounding: [...this.sounding],
      pedals: this.pedals,
      captured: [...this.captured],
      lastNote: this.lastNote,
    };
  }
  emit() {
    this.onChange?.(this.snapshot());
  }
  noteOn(midi: number, source: string, velocity = 0.78, retrigger = false) {
    if (!Number.isInteger(midi) || midi < 21 || midi > 108) return;
    const sources = this.held.get(midi) ?? new Set<string>();
    if (sources.has(source)) return;
    const alreadyHeld = sources.size > 0;
    sources.add(source);
    this.held.set(midi, sources);
    this.lastNote = midi;
    if (!alreadyHeld || retrigger) {
      this.sounding.add(midi);
      if (!this.visualOnly)
        this.audio.attack(
          midi,
          Math.max(0.1, Math.min(1, velocity)),
          this.pedals[0],
        );
      this.onStrike?.(midi);
    }
    this.emit();
  }
  noteOff(midi: number, source: string) {
    const sources = this.held.get(midi);
    if (!sources) return;
    sources.delete(source);
    if (!sources.size) {
      this.held.delete(midi);
      this.damp(midi);
    }
    this.emit();
  }
  private damp(midi: number) {
    if (
      !this.held.has(midi) &&
      !this.pedals[2] &&
      !(this.pedals[1] && this.captured.has(midi))
    ) {
      if (!this.visualOnly) this.audio.release(midi);
      this.sounding.delete(midi);
    }
  }
  pedal(index: number, down: boolean, source: string) {
    if (index < 0 || index > 2 || !Number.isInteger(index)) return;
    const before = this.pedals[index];
    if (down) this.pedalSources[index].add(source);
    else this.pedalSources[index].delete(source);
    const after = this.pedals[index];
    if (before === after) return;
    if (index === 1) {
      if (after) this.captured = new Set(this.held.keys());
      else this.captured.clear();
    }
    if (!after && index !== 0)
      for (const midi of this.sounding) this.damp(midi);
    this.emit();
  }
  releaseSource(prefix: string) {
    for (const [midi, sources] of this.held)
      for (const source of sources)
        if (source.startsWith(prefix)) this.noteOff(midi, source);
    this.pedalSources.forEach((s, i) => {
      for (const source of s)
        if (source.startsWith(prefix)) this.pedal(i, false, source);
    });
  }
  allOff() {
    this.audio.silence();
    this.held.clear();
    this.sounding.clear();
    this.captured.clear();
    this.pedalSources.forEach((s) => s.clear());
    this.emit();
  }
  ended(midi: number) {
    this.sounding.delete(midi);
    this.emit();
  }
}
export const KEY_MAP: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
  Quote: 17,
  BracketRight: 18,
  Backslash: 19,
};
export const KEY_LABELS = [
  'A',
  'W',
  'S',
  'E',
  'D',
  'F',
  'T',
  'G',
  'Y',
  'H',
  'U',
  'J',
  'K',
  'O',
  'L',
  'P',
  ';',
  "'",
  ']',
  '\\',
];
export const PEDAL_KEYS: Record<string, number> = {
  ShiftLeft: 0,
  ShiftRight: 1,
  Space: 2,
};
