import type { GrandAudio } from './piano-audio';
import type { PianoState } from './piano-state';
import type { PianoScore } from './piano-score';

/** Audio uses the sample clock, not one setTimeout per note. The UI follows
 * that same clock, so a slow render frame never alters pitch or note length. */
export class PianoTransport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private generation = 0;
  private backgroundSchedule: (() => void) | null = null;
  private origin = 0;
  private duration = 0;
  position = 0;
  playing = false;
  constructor(
    private audio: GrandAudio,
    private state: PianoState,
  ) {}
  play(
    score: PianoScore,
    onProgress: (seconds: number) => void,
    onFinish: () => void,
    leadIn = 0.15,
    startPosition = 0,
  ) {
    this.stop();
    this.audio.setProfile?.('demo');
    this.state.allOff();
    this.state.visualOnly = true;
    const offset = Math.max(0, Math.min(score.duration, startPosition));
    const origin = this.audio.context!.currentTime + leadIn - offset;
    this.origin = origin;
    this.duration = score.duration;
    this.position = offset;
    const generation = ++this.generation;
    this.playing = true;
    let voice = 0,
      event = 0;
    // Restore held keys and pedal state without replaying past hammer strikes.
    const strike = this.state.onStrike;
    this.state.onStrike = undefined;
    while (event < score.events.length && score.events[event].time < offset) {
      const e = score.events[event++];
      if (e.type === 'on') this.state.noteOn(e.midi, e.id, e.velocity, true);
      else if (e.type === 'off') this.state.noteOff(e.midi, e.id);
      else this.state.pedal(e.index, e.down, e.id);
    }
    this.state.onStrike = strike;
    const schedule = () => {
      // Hidden documents may have timers and animation frames suspended.
      // Queue the remaining audio on Web Audio's independent sample clock.
      const horizon = document.hidden ? score.duration : this.audio.context!.currentTime - origin + 5;
      while (
        voice < score.voices.length &&
        score.voices[voice].time <= horizon
      ) {
        const note = score.voices[voice++];
        if (note.release > offset) this.audio.scheduleNote(note, origin, offset);
      }
    };
    schedule();
    this.backgroundSchedule = schedule;
    document.addEventListener('visibilitychange', schedule);
    this.timer = setInterval(schedule, 25);
    const draw = () => {
      if (!this.playing || generation !== this.generation) return;
      this.position = Math.max(offset, Math.min(score.duration, this.audio.context!.currentTime - origin));
      while (
        event < score.events.length &&
        score.events[event].time <= this.position
      ) {
        const e = score.events[event++];
        if (e.type === 'on') this.state.noteOn(e.midi, e.id, e.velocity, true);
        else if (e.type === 'off') this.state.noteOff(e.midi, e.id);
        else this.state.pedal(e.index, e.down, e.id);
      }
      onProgress(Math.max(0, this.position));
      if (this.audio.context!.currentTime - origin > score.duration + 0.03) {
        this.stop(false);
        onFinish();
      } else this.frame = requestAnimationFrame(draw);
    };
    this.frame = requestAnimationFrame(draw);
  }
  pause() {
    if (this.playing) this.position = Math.max(this.position, Math.min(this.duration, this.audio.context!.currentTime - this.origin));
    this.stop();
    return this.position;
  }
  stop(cancelAudio = true) {
    this.generation++;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.backgroundSchedule) document.removeEventListener('visibilitychange', this.backgroundSchedule);
    this.backgroundSchedule = null;
    cancelAnimationFrame(this.frame);
    if (cancelAudio) this.audio.cancelScore();
    this.audio.setProfile?.('live');
    this.state.releaseSource('demo:');
    this.state.visualOnly = false;
  }
}
