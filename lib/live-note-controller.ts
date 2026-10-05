/**
 * N&Mstudio Grand Piano - Live Note & Glissando Controller
 * Handles manual pointer/touch/pen keyboard interactions, fast glissando traversal,
 * micro-spread note triggering, and natural acoustic release overlaps.
 */

export interface LiveNoteCallbacks {
  noteOn: (midi: number, source: string, velocity: number) => void;
  noteOff: (midi: number, source: string) => void;
}

export interface PointerState {
  pointerId: number;
  currentMidi: number;
  lastTime: number;
  source: string;
  isGlissando: boolean;
  velocity: number;
}

export class LiveNoteController {
  private activePointers = new Map<number, PointerState>();
  private pendingGlissandoTimers = new Set<ReturnType<typeof setTimeout>>();
  private callbacks: LiveNoteCallbacks;

  constructor(callbacks: LiveNoteCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Calculates natural glissando release duration in milliseconds based on MIDI pitch.
   * Bass strings ring slightly longer (~140ms), treble strings damp faster (~60ms).
   */
  static getGlissandoReleaseDuration(midi: number): number {
    const clamped = Math.max(21, Math.min(108, midi));
    const factor = (clamped - 21) / (108 - 21);
    return Math.round(140 - factor * 80);
  }

  /**
   * Normalizes pointer pressure (from pen/stylus/force touch) to piano velocity.
   */
  static normalizePressure(pressure?: number, defaultVelocity = 0.78): number {
    if (typeof pressure === 'number' && pressure > 0) {
      return Math.max(0.35, Math.min(0.98, pressure * 1.15));
    }
    return defaultVelocity;
  }

  /**
   * Handles pointer down on a specific MIDI note.
   */
  pointerDown(
    pointerId: number,
    midi: number,
    sourcePrefix: string,
    pressure?: number,
  ) {
    if (midi < 21 || midi > 108) return;

    // Release any previous note held by this pointer
    this.pointerUp(pointerId);

    const source = `${sourcePrefix}:${pointerId}`;
    const velocity = LiveNoteController.normalizePressure(pressure, 0.82);

    const state: PointerState = {
      pointerId,
      currentMidi: midi,
      lastTime: performance.now(),
      source,
      isGlissando: false,
      velocity,
    };

    this.activePointers.set(pointerId, state);
    this.callbacks.noteOn(midi, source, velocity);
  }

  /**
   * Handles pointer move / glissando across keys.
   * Interpolates all intermediate chromatic/diatonic keys if movement skips notes due to fast swiping.
   */
  pointerMove(
    pointerId: number,
    targetMidi: number | null,
    sourcePrefix: string,
    pressure?: number,
  ) {
    const state = this.activePointers.get(pointerId);
    if (!state) return;

    const source = `${sourcePrefix}:${pointerId}`;
    const now = performance.now();
    const dt = Math.max(1, now - state.lastTime);
    state.lastTime = now;

    if (pressure !== undefined && pressure > 0) {
      state.velocity = LiveNoteController.normalizePressure(pressure, state.velocity);
    }

    if (targetMidi === null || targetMidi < 21 || targetMidi > 108) {
      // Pointer moved off the keyboard area
      if (state.currentMidi >= 21) {
        this.callbacks.noteOff(state.currentMidi, source);
        state.currentMidi = -1;
      }
      return;
    }

    const startMidi = state.currentMidi;
    if (startMidi === targetMidi) return;

    state.isGlissando = true;

    // If starting from an off-keyboard position, strike target directly
    if (startMidi < 21) {
      state.currentMidi = targetMidi;
      this.callbacks.noteOn(targetMidi, source, state.velocity);
      return;
    }

    // Build the list of traversed keys between startMidi and targetMidi
    const step = targetMidi > startMidi ? 1 : -1;
    const traversedNotes: number[] = [];
    for (let m = startMidi + step; step > 0 ? m <= targetMidi : m >= targetMidi; m += step) {
      traversedNotes.push(m);
    }

    if (traversedNotes.length === 0) return;

    // Release old held note with natural glissando overlap
    const oldMidi = startMidi;
    const oldReleaseMs = LiveNoteController.getGlissandoReleaseDuration(oldMidi);
    const oldTimer = setTimeout(() => {
      this.callbacks.noteOff(oldMidi, source);
      this.pendingGlissandoTimers.delete(oldTimer);
    }, oldReleaseMs);
    this.pendingGlissandoTimers.add(oldTimer);

    // Calculate micro-spread delay per intermediate note (3-8 ms)
    const microSpreadMs = Math.min(8, Math.max(3, Math.round(dt / traversedNotes.length)));

    traversedNotes.forEach((midi, index) => {
      const isLast = index === traversedNotes.length - 1;
      const delay = index * microSpreadMs;

      if (isLast) {
        // The destination note becomes the active held note
        if (delay === 0) {
          state.currentMidi = midi;
          this.callbacks.noteOn(midi, source, state.velocity);
        } else {
          const timer = setTimeout(() => {
            if (this.activePointers.has(pointerId)) {
              state.currentMidi = midi;
              this.callbacks.noteOn(midi, source, state.velocity);
            }
            this.pendingGlissandoTimers.delete(timer);
          }, delay);
          this.pendingGlissandoTimers.add(timer);
        }
      } else {
        // Intermediate glissando stroke: trigger noteOn then noteOff after release overlap
        const timer = setTimeout(() => {
          this.callbacks.noteOn(midi, source, Math.max(0.4, state.velocity * 0.92));
          const glissDuration = LiveNoteController.getGlissandoReleaseDuration(midi);
          const offTimer = setTimeout(() => {
            this.callbacks.noteOff(midi, source);
            this.pendingGlissandoTimers.delete(offTimer);
          }, glissDuration);
          this.pendingGlissandoTimers.add(offTimer);
          this.pendingGlissandoTimers.delete(timer);
        }, delay);
        this.pendingGlissandoTimers.add(timer);
      }
    });

    state.currentMidi = targetMidi;
  }

  /**
   * Handles pointer up / pointer cancel.
   */
  pointerUp(pointerId: number) {
    const state = this.activePointers.get(pointerId);
    if (!state) return;

    if (state.currentMidi >= 21) {
      this.callbacks.noteOff(state.currentMidi, state.source);
    }

    this.activePointers.delete(pointerId);
  }

  /**
   * Releases all currently held pointers and clears pending timers.
   */
  releaseAll() {
    for (const [pointerId, state] of this.activePointers) {
      if (state.currentMidi >= 21) {
        this.callbacks.noteOff(state.currentMidi, state.source);
      }
    }
    this.activePointers.clear();
    for (const timer of this.pendingGlissandoTimers) {
      clearTimeout(timer);
    }
    this.pendingGlissandoTimers.clear();
  }

  /**
   * Checks if a pointer is currently active.
   */
  hasPointer(pointerId: number): boolean {
    return this.activePointers.has(pointerId);
  }

  /**
   * Gets current held note for pointer.
   */
  getCurrentMidi(pointerId: number): number | undefined {
    return this.activePointers.get(pointerId)?.currentMidi;
  }
}
