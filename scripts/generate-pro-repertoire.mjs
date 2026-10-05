import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMidi } from 'midi-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIDI_DIR = path.resolve(__dirname, '../public/midi');

if (!fs.existsSync(MIDI_DIR)) {
  fs.mkdirSync(MIDI_DIR, { recursive: true });
}

const PPQ = 480;

/**
 * High-precision Expressive Piano Track Builder
 */
class ExpressiveScoreBuilder {
  constructor(title, baseBpm = 80, timeSignature = [4, 4], keySignature = 0) {
    this.title = title;
    this.baseBpm = baseBpm;
    this.timeSignature = timeSignature;
    this.keySignature = keySignature;
    this.notes = []; // { note, timeSec, durationSec, velocity, hand }
    this.pedals = []; // { timeSec, down }
    this.tempos = [{ timeSec: 0, bpm: baseBpm }];
  }

  setTempo(timeSec, bpm) {
    this.tempos.push({ timeSec, bpm });
    this.tempos.sort((a, b) => a.timeSec - b.timeSec);
  }

  addPedal(timeSec, down) {
    this.pedals.push({ timeSec, down });
  }

  addNote(note, timeSec, durationSec, velocity, hand = 'R') {
    if (note < 21 || note > 108) return;
    const vel = Math.max(20, Math.min(127, Math.round(velocity)));
    this.notes.push({
      note,
      timeSec: Math.max(0, timeSec),
      durationSec: Math.max(0.05, durationSec),
      velocity: vel,
      hand,
    });
  }

  // Add rolled / spread chord with natural acoustic delay from bottom to top
  addRolledChord(notes, timeSec, durationSec, baseVelocity, spreadMs = 24, hand = 'L') {
    const sorted = [...notes].sort((a, b) => a - b);
    sorted.forEach((note, idx) => {
      const offsetSec = (idx * spreadMs) / 1000;
      // Melody note (top note) gets a slight musical accent
      const vel = idx === sorted.length - 1 && hand === 'R' ? baseVelocity * 1.12 : baseVelocity * (0.92 + idx * 0.03);
      this.addNote(note, timeSec + offsetSec, durationSec - offsetSec, vel, hand);
    });
  }

  // Export to standard Type 1 MIDI Buffer
  toMidiBuffer() {
    const timeline = [];

    this.notes.forEach((n, idx) => {
      timeline.push({
        type: 'noteOn',
        timeSec: n.timeSec,
        note: n.note,
        velocity: n.velocity,
        id: idx,
      });
      timeline.push({
        type: 'noteOff',
        timeSec: n.timeSec + n.durationSec,
        note: n.note,
        velocity: 0,
        id: idx,
      });
    });

    this.pedals.forEach((p, idx) => {
      timeline.push({
        type: 'pedal',
        timeSec: p.timeSec,
        down: p.down,
        id: idx,
      });
    });

    timeline.sort((a, b) => {
      if (Math.abs(a.timeSec - b.timeSec) > 0.0001) {
        return a.timeSec - b.timeSec;
      }
      if (a.type === 'noteOff' && b.type === 'noteOn' && a.note === b.note) return -1;
      if (a.type === 'noteOn' && b.type === 'noteOff' && a.note === b.note) return 1;
      if (a.type === 'pedal' && b.type === 'noteOn') return -1;
      if (a.type === 'noteOn' && b.type === 'pedal') return 1;
      return 0;
    });

    const secToTick = (targetSec) => {
      let currentSec = 0;
      let currentTick = 0;
      let currentBpm = this.tempos[0].bpm;

      for (let i = 0; i < this.tempos.length; i++) {
        const nextTempo = this.tempos[i + 1];
        const tempoEndSec = nextTempo ? nextTempo.timeSec : Infinity;

        if (targetSec <= tempoEndSec) {
          const deltaSec = targetSec - currentSec;
          const ticksPerSec = (currentBpm * PPQ) / 60;
          return Math.round(currentTick + deltaSec * ticksPerSec);
        } else {
          const deltaSec = tempoEndSec - currentSec;
          const ticksPerSec = (currentBpm * PPQ) / 60;
          currentTick += deltaSec * ticksPerSec;
          currentSec = tempoEndSec;
          currentBpm = nextTempo.bpm;
        }
      }
      return Math.round(currentTick);
    };

    const timedEvents = timeline.map((ev) => ({
      ...ev,
      tick: secToTick(ev.timeSec),
    }));

    timedEvents.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      if (a.type === 'noteOff' && b.type === 'noteOn') return -1;
      if (a.type === 'pedal' && b.type === 'noteOn') return -1;
      return 0;
    });

    let lastTick = 0;
    const trackEvents = [];

    for (const ev of timedEvents) {
      const delta = Math.max(0, ev.tick - lastTick);
      lastTick = ev.tick;

      if (ev.type === 'noteOn') {
        trackEvents.push({
          type: 'noteOn',
          channel: 0,
          noteNumber: ev.note,
          velocity: ev.velocity,
          deltaTime: delta,
        });
      } else if (ev.type === 'noteOff') {
        trackEvents.push({
          type: 'noteOff',
          channel: 0,
          noteNumber: ev.note,
          velocity: 0,
          deltaTime: delta,
        });
      } else if (ev.type === 'pedal') {
        trackEvents.push({
          type: 'controller',
          channel: 0,
          controllerType: 64,
          value: ev.down ? 127 : 0,
          deltaTime: delta,
        });
      }
    }

    trackEvents.push({ type: 'endOfTrack', deltaTime: PPQ * 2 });

    const headerTrack = [
      { type: 'setTempo', deltaTime: 0, microsecondsPerBeat: Math.round(60_000_000 / this.baseBpm) },
      { type: 'timeSignature', deltaTime: 0, numerator: this.timeSignature[0], denominator: this.timeSignature[1], metronome: 24, thirtyseconds: 8 },
      { type: 'keySignature', deltaTime: 0, key: this.keySignature, scale: 0 },
      { type: 'programChange', channel: 0, programNumber: 0, deltaTime: 0 },
      { type: 'endOfTrack', deltaTime: PPQ * 2 },
    ];

    const midiData = writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: PPQ },
      tracks: [headerTrack, trackEvents],
    });

    return Buffer.from(midiData);
  }

  getMetrics() {
    const lh = this.notes.filter((n) => n.hand === 'L').length;
    const rh = this.notes.filter((n) => n.hand === 'R').length;
    const duration = this.notes.length > 0
      ? Math.max(...this.notes.map((n) => n.timeSec + n.durationSec))
      : 0;
    const vels = this.notes.map((n) => n.velocity);
    const minVel = vels.length ? Math.min(...vels) : 0;
    const maxVel = vels.length ? Math.max(...vels) : 0;
    const avgVel = vels.length ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length) : 0;

    return {
      title: this.title,
      durationSeconds: Math.round(duration * 10) / 10,
      totalNotes: this.notes.length,
      lhNotes: lh,
      rhNotes: rh,
      pedalEvents: this.pedals.length,
      velocityRange: `${minVel} – ${maxVel}`,
      averageVelocity: avgVel,
    };
  }
}

/**
 * 1. BENCHMARK 1 — CANON IN D (Johann Pachelbel)
 * Professional Two-Hand Concert Solo Piano Arrangement
 */
export function buildCanonInD() {
  const bpm = 68;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Canon in D · Pachelbel', bpm, [4, 4], 2);

  const chordProg = [
    { root: 38, fifth: 45, oct: 50, tenths: 62, triad: [66, 69, 74] }, // D
    { root: 45, fifth: 52, oct: 57, tenths: 69, triad: [64, 69, 73] }, // A
    { root: 47, fifth: 54, oct: 59, tenths: 71, triad: [66, 71, 74] }, // Bm
    { root: 42, fifth: 49, oct: 54, tenths: 66, triad: [61, 66, 69] }, // F#m
    { root: 43, fifth: 50, oct: 55, tenths: 67, triad: [62, 67, 71] }, // G
    { root: 38, fifth: 45, oct: 50, tenths: 62, triad: [57, 62, 66] }, // D
    { root: 43, fifth: 50, oct: 55, tenths: 67, triad: [62, 67, 71] }, // G
    { root: 45, fifth: 52, oct: 57, tenths: 69, triad: [61, 64, 69] }, // A
  ];

  let t = 0.5;

  // Cycle 1: Intro — Meditative Cantabile opening (Quiet, spacious, p)
  for (let bar = 0; bar < 8; bar++) {
    const c = chordProg[bar];
    const barStart = t;
    const barDur = 4 * beatSec;

    score.addPedal(barStart + 0.02, true);

    const lhBaseVel = 48 + (bar % 4) * 2;
    score.addNote(c.root, barStart, barDur * 0.95, lhBaseVel + 8, 'L');
    score.addNote(c.fifth, barStart + beatSec * 0.98, barDur * 0.7, lhBaseVel, 'L');
    score.addNote(c.oct, barStart + beatSec * 1.98, barDur * 0.5, lhBaseVel + 2, 'L');
    score.addNote(c.tenths, barStart + beatSec * 2.98, barDur * 0.35, lhBaseVel + 4, 'L');

    const rhBaseVel = 60 + (bar % 4) * 3;
    if (bar === 0) {
      score.addNote(74, barStart + beatSec * 0.02, beatSec * 1.9, rhBaseVel + 4, 'R');
      score.addNote(73, barStart + beatSec * 2.02, beatSec * 1.9, rhBaseVel + 2, 'R');
    } else if (bar === 1) {
      score.addNote(71, barStart + beatSec * 0.02, beatSec * 1.9, rhBaseVel, 'R');
      score.addNote(69, barStart + beatSec * 2.02, beatSec * 1.9, rhBaseVel - 2, 'R');
    } else if (bar === 2) {
      score.addNote(67, barStart + beatSec * 0.02, beatSec * 1.9, rhBaseVel, 'R');
      score.addNote(66, barStart + beatSec * 2.02, beatSec * 1.9, rhBaseVel - 2, 'R');
    } else if (bar === 3) {
      score.addNote(67, barStart + beatSec * 0.02, beatSec * 1.9, rhBaseVel + 2, 'R');
      score.addNote(69, barStart + beatSec * 2.02, beatSec * 1.9, rhBaseVel + 4, 'R');
    } else if (bar === 4) {
      score.addNote(74, barStart + beatSec * 0.02, beatSec * 1.4, rhBaseVel + 6, 'R');
      score.addNote(76, barStart + beatSec * 1.5, beatSec * 0.9, rhBaseVel + 8, 'R');
      score.addNote(78, barStart + beatSec * 2.5, beatSec * 1.4, rhBaseVel + 10, 'R');
    } else if (bar === 5) {
      score.addNote(76, barStart + beatSec * 0.02, beatSec * 1.4, rhBaseVel + 8, 'R');
      score.addNote(74, barStart + beatSec * 1.5, beatSec * 0.9, rhBaseVel + 6, 'R');
      score.addNote(73, barStart + beatSec * 2.5, beatSec * 1.4, rhBaseVel + 4, 'R');
    } else if (bar === 6) {
      score.addNote(71, barStart + beatSec * 0.02, beatSec * 1.4, rhBaseVel + 4, 'R');
      score.addNote(73, barStart + beatSec * 1.5, beatSec * 0.9, rhBaseVel + 6, 'R');
      score.addNote(74, barStart + beatSec * 2.5, beatSec * 1.4, rhBaseVel + 8, 'R');
    } else if (bar === 7) {
      score.addNote(73, barStart + beatSec * 0.02, beatSec * 1.9, rhBaseVel + 6, 'R');
      score.addNote(69, barStart + beatSec * 2.02, beatSec * 1.9, rhBaseVel + 2, 'R');
    }

    score.addPedal(barStart + barDur - 0.08, false);
    t += barDur;
  }

  // Cycle 2: Flowing 16th-note Polyphony & Harmony Expansion (mf)
  for (let bar = 0; bar < 8; bar++) {
    const c = chordProg[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);

    const lhNotes = [c.root - 12, c.root, c.fifth, c.oct, c.tenths, c.triad[0], c.tenths, c.oct];
    lhNotes.forEach((pitch, step) => {
      const stepTime = barStart + step * (beatSec * 0.5);
      const vel = step === 0 ? 68 : 52 + (step % 2) * 6;
      score.addNote(pitch, stepTime, beatSec * 0.85, vel, 'L');
    });

    const rhMelody = [
      [74, 76, 78, 79, 81, 78, 74, 78],
      [73, 74, 76, 78, 76, 73, 69, 73],
      [71, 73, 74, 76, 74, 71, 67, 71],
      [69, 71, 73, 74, 73, 69, 66, 69],
      [67, 69, 71, 73, 71, 67, 62, 67],
      [66, 67, 69, 71, 69, 66, 62, 66],
      [67, 69, 71, 73, 74, 76, 78, 79],
      [81, 79, 78, 76, 74, 73, 71, 69],
    ][bar];

    rhMelody.forEach((pitch, step) => {
      const stepTime = barStart + step * (beatSec * 0.5);
      const vel = 66 + (step === 0 || step === 4 ? 12 : (step % 2) * 6);
      score.addNote(pitch, stepTime, beatSec * 0.46, vel, 'R');
      if (step === 0 || step === 4) {
        score.addNote(pitch - 7, stepTime + 0.015, beatSec * 0.44, vel - 12, 'R');
      }
    });

    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  }

  // Cycle 3: Majestic Grand Climax with Octaves & Full Resonance (f / ff)
  for (let bar = 0; bar < 8; bar++) {
    const c = chordProg[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);

    score.addNote(c.root - 12, barStart, barDur * 0.95, 88, 'L');
    score.addNote(c.root, barStart + 0.01, barDur * 0.95, 84, 'L');

    const arpeggio = [c.fifth, c.oct, c.tenths, c.triad[0], c.triad[1], c.triad[0]];
    arpeggio.forEach((pitch, step) => {
      score.addNote(pitch, barStart + beatSec * (1 + step * 0.5), beatSec * 0.7, 68 + step * 2, 'L');
    });

    const topNote = [86, 85, 83, 81, 79, 78, 79, 81][bar];
    score.addRolledChord([topNote - 12, topNote - 5, topNote], barStart, beatSec * 1.8, 92, 18, 'R');
    score.addRolledChord([topNote - 14, topNote - 7, topNote - 2], barStart + beatSec * 2, beatSec * 1.8, 86, 18, 'R');

    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  }

  // Cycle 4: Gentle Peaceful Resolution & Serene Outro (dim. to pp)
  for (let bar = 0; bar < 4; bar++) {
    const c = chordProg[bar * 2];
    const barStart = t;
    const barDur = 4 * beatSec * (bar === 3 ? 1.4 : 1.0);
    score.addPedal(barStart + 0.02, true);

    const vel = 52 - bar * 7;
    score.addNote(c.root - 12, barStart, barDur * 0.98, vel + 4, 'L');
    score.addNote(c.root, barStart + 0.02, barDur * 0.95, vel, 'L');
    score.addNote(c.fifth, barStart + beatSec * 1.0, barDur * 0.7, vel - 4, 'L');
    score.addNote(c.oct, barStart + beatSec * 2.0, barDur * 0.5, vel - 6, 'L');

    if (bar === 3) {
      score.addRolledChord([50, 57, 62, 66, 69, 74, 81, 86], barStart + beatSec * 0.5, barDur * 2.0, 54, 40, 'R');
    } else {
      score.addRolledChord([c.triad[0], c.triad[1], c.triad[2]], barStart + beatSec * 0.5, beatSec * 3.0, vel + 8, 20, 'R');
    }

    score.addPedal(barStart + barDur - (bar === 3 ? 0.01 : 0.08), false);
    t += barDur;
  }

  return score;
}

/**
 * 2. BENCHMARK 2 — FÜR ELISE (Ludwig van Beethoven)
 * Full Concert Two-Hand Classical Masterpiece (Poco Moto, WoO 59)
 */
export function buildFurElise() {
  const bpm = 126;
  const eighthSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Für Elise · Beethoven', bpm, [3, 8], 0);

  let t = 0.4;

  const playMotifA = (repeatCount = 2, baseDynamics = 58) => {
    for (let r = 0; r < repeatCount; r++) {
      const pickup = [
        { note: 76, dur: 1.0 }, { note: 75, dur: 1.0 }, { note: 76, dur: 1.0 },
        { note: 75, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 71, dur: 1.0 },
        { note: 74, dur: 1.0 }, { note: 72, dur: 1.0 }
      ];

      pickup.forEach((n, i) => {
        score.addNote(n.note, t + i * eighthSec, eighthSec * 0.92, baseDynamics + (i % 2 === 0 ? 4 : -2), 'R');
      });
      t += pickup.length * eighthSec;

      score.addPedal(t + 0.02, true);
      score.addNote(69, t, eighthSec * 2.5, baseDynamics + 6, 'R');
      score.addNote(33, t, eighthSec * 2.8, baseDynamics - 12, 'L');
      score.addNote(45, t + eighthSec * 0.98, eighthSec * 1.8, baseDynamics - 16, 'L');
      score.addNote(52, t + eighthSec * 1.98, eighthSec * 1.0, baseDynamics - 14, 'L');
      score.addNote(57, t + eighthSec * 2.0, eighthSec * 1.0, baseDynamics - 12, 'L');
      score.addNote(60, t + eighthSec * 2.98, eighthSec * 0.9, baseDynamics - 10, 'L');
      t += 3 * eighthSec;
      score.addPedal(t - 0.05, false);

      score.addNote(60, t, eighthSec * 0.9, baseDynamics, 'R');
      score.addNote(64, t + eighthSec, eighthSec * 0.9, baseDynamics + 2, 'R');
      score.addNote(69, t + eighthSec * 2, eighthSec * 0.9, baseDynamics + 4, 'R');
      score.addNote(71, t + eighthSec * 3, eighthSec * 2.2, baseDynamics + 6, 'R');

      score.addPedal(t + 0.02, true);
      score.addNote(28, t, eighthSec * 2.8, baseDynamics - 12, 'L');
      score.addNote(40, t + eighthSec * 0.98, eighthSec * 1.8, baseDynamics - 16, 'L');
      score.addNote(47, t + eighthSec * 1.98, eighthSec * 1.0, baseDynamics - 14, 'L');
      score.addNote(52, t + eighthSec * 2.0, eighthSec * 1.0, baseDynamics - 12, 'L');
      score.addNote(56, t + eighthSec * 2.98, eighthSec * 0.9, baseDynamics - 10, 'L');
      t += 3 * eighthSec;
      score.addPedal(t - 0.05, false);

      score.addNote(64, t, eighthSec * 0.9, baseDynamics, 'R');
      score.addNote(68, t + eighthSec, eighthSec * 0.9, baseDynamics + 2, 'R');
      score.addNote(71, t + eighthSec * 2, eighthSec * 0.9, baseDynamics + 4, 'R');
      score.addNote(72, t + eighthSec * 3, eighthSec * 2.2, baseDynamics + 6, 'R');

      score.addPedal(t + 0.02, true);
      score.addNote(33, t, eighthSec * 2.8, baseDynamics - 12, 'L');
      score.addNote(45, t + eighthSec * 0.98, eighthSec * 1.8, baseDynamics - 16, 'L');
      score.addNote(52, t + eighthSec * 1.98, eighthSec * 1.0, baseDynamics - 14, 'L');
      t += 3 * eighthSec;
      score.addPedal(t - 0.05, false);
    }
  };

  // Section 1: Main theme (p)
  playMotifA(2, 58);

  // Section 2: Dolce Cantabile in F Major / C Major (mf)
  const playSectionB = () => {
    score.setTempo(t, 120);
    score.addPedal(t + 0.02, true);
    score.addNote(36, t, eighthSec * 2.8, 56, 'L');
    score.addNote(48, t + eighthSec, eighthSec * 1.8, 50, 'L');
    score.addNote(52, t + eighthSec * 2, eighthSec * 0.9, 52, 'L');

    score.addNote(72, t, eighthSec * 1.8, 70, 'R');
    score.addNote(76, t + eighthSec * 1.5, eighthSec * 1.2, 74, 'R');
    score.addNote(79, t + eighthSec * 2.5, eighthSec * 1.8, 78, 'R');
    t += 3 * eighthSec;
    score.addPedal(t - 0.05, false);

    score.addPedal(t + 0.02, true);
    score.addNote(41, t, eighthSec * 2.8, 58, 'L');
    score.addNote(53, t + eighthSec, eighthSec * 1.8, 52, 'L');
    score.addNote(57, t + eighthSec * 2, eighthSec * 0.9, 54, 'L');

    score.addNote(81, t, eighthSec * 1.8, 80, 'R');
    score.addNote(79, t + eighthSec * 1.5, eighthSec * 1.2, 76, 'R');
    score.addNote(77, t + eighthSec * 2.5, eighthSec * 1.8, 72, 'R');
    t += 3 * eighthSec;
    score.addPedal(t - 0.05, false);

    const desc = [76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64];
    desc.forEach((p, idx) => {
      score.addNote(p, t + idx * (eighthSec * 0.4), eighthSec * 0.38, 64 - idx * 2, 'R');
    });
    t += desc.length * (eighthSec * 0.4);
  };

  playSectionB();

  // Section 3: Return to Main Theme (p)
  playMotifA(1, 54);

  // Section 4: Storm Section C (Agitato with repeated 16th-note low pedal point bass)
  const playStormSection = () => {
    score.setTempo(t, 132);
    // 4 bars of agitated repeated pedal-point bass
    for (let bar = 0; bar < 4; bar++) {
      score.addPedal(t + 0.02, true);
      // Repeated 32nd/16th low A1 note in LH
      for (let k = 0; k < 6; k++) {
        score.addNote(33, t + k * (eighthSec * 0.5), eighthSec * 0.45, 72 + (k % 2) * 8, 'L');
      }

      // Assertive RH chord stabs
      const chord = bar === 0 ? [57, 60, 69] : bar === 1 ? [56, 59, 68] : bar === 2 ? [55, 60, 67] : [56, 59, 68];
      score.addRolledChord(chord, t + eighthSec * 0.5, eighthSec * 1.2, 82 + bar * 3, 15, 'R');
      score.addRolledChord(chord, t + eighthSec * 2.0, eighthSec * 0.8, 86 + bar * 3, 15, 'R');

      t += 3 * eighthSec;
      score.addPedal(t - 0.03, false);
    }

    // Ascending arpeggio cadenza
    score.addPedal(t + 0.02, true);
    const arpeggio = [45, 52, 57, 60, 64, 69, 72, 76, 81, 84, 88, 93];
    arpeggio.forEach((p, i) => {
      score.addNote(p, t + i * (eighthSec * 0.25), eighthSec * 0.3, 70 + i * 2, i < 4 ? 'L' : 'R');
    });
    t += arpeggio.length * (eighthSec * 0.25);

    // Chromatic descent
    const chrom = [93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76];
    chrom.forEach((p, i) => {
      score.addNote(p, t + i * (eighthSec * 0.2), eighthSec * 0.25, 78 - i * 2, 'R');
    });
    t += chrom.length * (eighthSec * 0.2);
    score.addPedal(t, false);
  };

  playStormSection();

  // Section 5: Serene Final Theme & Arpeggio Cadence (pp, fading away)
  playMotifA(1, 50);

  score.addPedal(t + 0.02, true);
  score.addRolledChord([21, 33, 45, 52, 57, 60, 69, 81], t, eighthSec * 8, 54, 30, 'R');
  score.addPedal(t + eighthSec * 8 - 0.05, false);

  return score;
}

/**
 * 3. BENCHMARK 3 — BÈO DẠT MÂY TRÔI (Dân Ca Quan Họ Bắc Ninh)
 * Original N&Mstudio Concert Solo Piano Arrangement
 * Flowing pentatonic impressionist river textures with vocal-like lyricism.
 */
export function buildBeoDatMayTroi() {
  const bpm = 64;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Bèo Dạt Mây Trôi · Dân ca VN', bpm, [4, 4], -1);

  let t = 0.5;

  const progression = [
    { root: 29, fifth: 36, ninth: 43, third: 45, fifthHi: 48, triad: [53, 57, 60, 65] }, // F
    { root: 26, fifth: 33, ninth: 40, third: 41, fifthHi: 45, triad: [50, 53, 57, 62] }, // Dm
    { root: 22, fifth: 29, ninth: 36, third: 38, fifthHi: 41, triad: [46, 50, 53, 58] }, // Bb
    { root: 24, fifth: 31, ninth: 38, third: 41, fifthHi: 43, triad: [48, 53, 55, 60] }, // C
    { root: 26, fifth: 33, ninth: 40, third: 41, fifthHi: 45, triad: [50, 53, 57, 62] }, // Dm
    { root: 29, fifth: 36, ninth: 43, third: 45, fifthHi: 48, triad: [53, 57, 60, 65] }, // F
    { root: 22, fifth: 29, ninth: 36, third: 38, fifthHi: 41, triad: [46, 50, 53, 58] }, // Bb
    { root: 24, fifth: 31, ninth: 38, third: 41, fifthHi: 43, triad: [48, 53, 55, 60] }, // C
  ];

  // 1. Intro: Gợn sóng nước — Cascading bell-like pentatonic water ripples (p)
  for (let bar = 0; bar < 4; bar++) {
    const c = progression[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);

    score.addNote(c.root, barStart, barDur * 0.95, 48, 'L');
    score.addNote(c.fifth, barStart + beatSec * 0.98, barDur * 0.7, 44, 'L');
    score.addNote(c.ninth, barStart + beatSec * 1.98, barDur * 0.5, 46, 'L');
    score.addNote(c.third, barStart + beatSec * 2.98, barDur * 0.35, 48, 'L');

    const introRipples = [77, 81, 84, 86, 84, 81, 77, 72];
    introRipples.forEach((p, idx) => {
      score.addNote(p, barStart + idx * (beatSec * 0.5), beatSec * 0.45, 54 + (idx % 3) * 4, 'R');
    });

    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  }

  // Vocal melody phrase definitions
  const vocalPhrases = [
    [{ note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 74, dur: 1.4 }, { note: 72, dur: 0.6 }],
    [{ note: 67, dur: 1.0 }, { note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 74, dur: 1.0 }],
    [{ note: 77, dur: 1.5 }, { note: 74, dur: 0.8 }, { note: 72, dur: 0.7 }, { note: 69, dur: 1.0 }],
    [{ note: 65, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }],
    [{ note: 74, dur: 1.0 }, { note: 77, dur: 1.0 }, { note: 79, dur: 1.2 }, { note: 81, dur: 1.8 }],
    [{ note: 79, dur: 1.0 }, { note: 77, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 72, dur: 1.0 }],
    [{ note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 77, dur: 1.0 }],
    [{ note: 67, dur: 1.5 }, { note: 69, dur: 1.0 }, { note: 65, dur: 2.0 }],
  ];

  // 2. Verse 1: "Bèo dạt mây trôi, chốn xa xôi..." (Cantabile vocal melody, mp)
  vocalPhrases.forEach((phrase, bar) => {
    const c = progression[bar % progression.length];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);

    const lhArp = [c.root, c.fifth, c.ninth, c.third, c.fifthHi, c.third];
    lhArp.forEach((p, step) => {
      const stepTime = barStart + step * (beatSec * 0.65);
      score.addNote(p, stepTime, beatSec * 0.85, 52 + (step === 0 ? 12 : 0), 'L');
    });

    let noteTime = barStart;
    phrase.forEach((n, idx) => {
      const dur = n.dur * beatSec;
      const isPeak = bar === 4;
      const baseVel = isPeak ? 84 : 68;

      if (idx === 0) {
        score.addNote(n.note - 2, noteTime - 0.035, 0.04, baseVel - 12, 'R');
      }

      score.addNote(n.note, noteTime, dur * 0.95, baseVel + (idx % 2) * 4, 'R');

      if (idx === 0 || idx === 2) {
        score.addNote(n.note - 7, noteTime + 0.015, dur * 0.85, baseVel - 16, 'R');
      }

      noteTime += dur;
    });

    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  });

  // 3. Verse 2: High Octave Flute-like Variation with Romantic River Waves (mf / f)
  vocalPhrases.forEach((phrase, bar) => {
    const c = progression[bar % progression.length];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);

    // LH: Rich sweeping 8-note river waves
    const lhWave = [c.root - 12, c.root, c.fifth, c.ninth, c.third, c.fifthHi, c.third, c.ninth];
    lhWave.forEach((p, step) => {
      const stepTime = barStart + step * (beatSec * 0.5);
      score.addNote(p, stepTime, beatSec * 0.7, 56 + (step === 0 ? 16 : 0), 'L');
    });

    let noteTime = barStart;
    phrase.forEach((n, idx) => {
      const dur = n.dur * beatSec;
      const isPeak = bar === 4;
      const baseVel = isPeak ? 92 : 76;
      const highNote = n.note + 12; // 8va

      score.addNote(highNote, noteTime, dur * 0.95, baseVel, 'R');
      score.addNote(highNote - 12, noteTime + 0.01, dur * 0.85, baseVel - 14, 'R'); // lower octave shadow

      noteTime += dur;
    });

    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  });

  // 4. Outro: Tiếng đàn lắng đọng bên sông (diminuendo to ppp)
  for (let bar = 0; bar < 2; bar++) {
    const c = progression[bar];
    const barStart = t;
    const barDur = 4 * beatSec * 1.25;
    score.addPedal(barStart + 0.02, true);

    score.addNote(c.root, barStart, barDur * 0.98, 42 - bar * 8, 'L');
    score.addNote(c.fifth, barStart + beatSec, barDur * 0.8, 38 - bar * 8, 'L');

    if (bar === 1) {
      score.addRolledChord([53, 57, 60, 65, 69, 72, 77, 84, 89], barStart + beatSec * 0.5, barDur * 2.5, 46, 35, 'R');
    } else {
      score.addRolledChord([65, 69, 72, 77], barStart + beatSec * 0.5, barDur, 52, 25, 'R');
    }

    score.addPedal(barStart + barDur - 0.02, false);
    t += barDur;
  }

  return score;
}

/**
 * Generate and write the 3 Benchmark Pieces
 */
export function generateBenchmarkMidis() {
  const pieces = [
    { file: 'canon-in-d.mid', builder: buildCanonInD },
    { file: 'fur-elise.mid', builder: buildFurElise },
    { file: 'beo-dat-may-troi.mid', builder: buildBeoDatMayTroi },
  ];

  const results = [];

  for (const p of pieces) {
    const score = p.builder();
    const buf = score.toMidiBuffer();
    const destPath = path.join(MIDI_DIR, p.file);
    fs.writeFileSync(destPath, buf);
    const metrics = score.getMetrics();
    results.push(metrics);
  }

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = generateBenchmarkMidis();
  console.log('\n=== PROFESSIONAL PERFORMANCE V2 BENCHMARKS GENERATED ===\n');
  console.table(results);
}
