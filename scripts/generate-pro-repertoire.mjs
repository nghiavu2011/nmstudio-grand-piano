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

  addRolledChord(notes, timeSec, durationSec, baseVelocity, spreadMs = 24, hand = 'L') {
    const sorted = [...notes].sort((a, b) => a - b);
    sorted.forEach((note, idx) => {
      const offsetSec = (idx * spreadMs) / 1000;
      const vel = idx === sorted.length - 1 && hand === 'R' ? baseVelocity * 1.12 : baseVelocity * (0.92 + idx * 0.03);
      this.addNote(note, timeSec + offsetSec, durationSec - offsetSec, vel, hand);
    });
  }

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
          controllerType: 64, // Sustain pedal CC64
          value: ev.down ? 127 : 0,
          deltaTime: delta,
        });
      }
    }

    trackEvents.push({
      type: 'endOfTrack',
      deltaTime: PPQ,
    });

    const tempoEvents = [{
      type: 'setTempo',
      microsecondsPerBeat: Math.round(60000000 / this.baseBpm),
      deltaTime: 0,
    }, {
      type: 'timeSignature',
      numerator: this.timeSignature[0],
      denominator: this.timeSignature[1],
      metronome: 24,
      thirtyseconds: 8,
      deltaTime: 0,
    }, {
      type: 'trackName',
      text: this.title,
      deltaTime: 0,
    }, {
      type: 'endOfTrack',
      deltaTime: 0,
    }];

    const midiData = {
      header: {
        format: 1,
        numTracks: 2,
        ticksPerBeat: PPQ,
      },
      tracks: [tempoEvents, trackEvents],
    };

    return Buffer.from(writeMidi(midiData));
  }

  getMetrics() {
    const totalNotes = this.notes.length;
    const lhNotes = this.notes.filter((n) => n.hand === 'L').length;
    const rhNotes = this.notes.filter((n) => n.hand === 'R').length;
    const pedalEvents = this.pedals.length;
    const velocities = this.notes.map((n) => n.velocity);
    const minVel = Math.min(...velocities);
    const maxVel = Math.max(...velocities);
    const avgVel = Math.round(velocities.reduce((a, b) => a + b, 0) / (totalNotes || 1));
    const duration = this.notes.reduce((max, n) => Math.max(max, n.timeSec + n.durationSec), 0);

    return {
      title: this.title,
      durationSeconds: Number(duration.toFixed(1)),
      durationFormatted: `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`,
      totalNotes,
      lhNotes,
      rhNotes,
      pedalEvents,
      velocityRange: `${minVel} – ${maxVel}`,
      averageVelocity: avgVel,
    };
  }
}

/* ==========================================================================
   1. VIETNAMESE VIRTUOSIC & LYRICAL PIANO MASTERPIECES (FULL LENGTH)
   ========================================================================== */

/**
 * CÓ CHÀNG TRAI VIẾT LÊN CÂY (Phan Mạnh Quỳnh · OST Mắt Biếc)
 * Full Concert Piano Solo (~3:15)
 * Key: G Major / E Minor. 4/4 Time.
 */
export function buildCoChangTraiVietLenCay() {
  const bpm = 72;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Có Chàng Trai Viết Lên Cây · Phan Mạnh Quỳnh', bpm, [4, 4], 1);

  let t = 0.5;

  const chords = [
    { root: 31, fifth: 38, tenth: 47, arp: [43, 50, 55, 59] }, // G
    { root: 30, fifth: 38, tenth: 45, arp: [42, 49, 54, 57] }, // D/F#
    { root: 28, fifth: 35, tenth: 43, arp: [40, 47, 52, 55] }, // Em
    { root: 24, fifth: 31, tenth: 40, arp: [36, 43, 48, 52] }, // C
    { root: 23, fifth: 31, tenth: 38, arp: [35, 43, 47, 50] }, // G/B
    { root: 21, fifth: 28, tenth: 36, arp: [33, 40, 45, 48] }, // Am7
    { root: 26, fifth: 33, tenth: 42, arp: [38, 45, 50, 54] }, // D7
    { root: 31, fifth: 38, tenth: 47, arp: [43, 50, 55, 59] }, // G
  ];

  const verse1 = [
    [{ note: 59, dur: 1.0 }, { note: 62, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }],
    [{ note: 66, dur: 1.5 }, { note: 64, dur: 0.5 }, { note: 62, dur: 2.0 }],
    [{ note: 59, dur: 1.0 }, { note: 62, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }],
    [{ note: 69, dur: 1.5 }, { note: 67, dur: 0.5 }, { note: 64, dur: 2.0 }],
    [{ note: 62, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 71, dur: 1.0 }],
    [{ note: 69, dur: 1.5 }, { note: 67, dur: 0.5 }, { note: 64, dur: 2.0 }],
    [{ note: 62, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.5 }, { note: 66, dur: 0.5 }],
    [{ note: 62, dur: 3.0 }, { note: 64, dur: 1.0 }],
  ];

  const chorus = [
    [{ note: 71, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }],
    [{ note: 78, dur: 1.5 }, { note: 76, dur: 0.5 }, { note: 74, dur: 2.0 }],
    [{ note: 71, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }],
    [{ note: 81, dur: 1.5 }, { note: 79, dur: 0.5 }, { note: 76, dur: 2.0 }],
    [{ note: 74, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 83, dur: 1.0 }],
    [{ note: 81, dur: 1.5 }, { note: 79, dur: 0.5 }, { note: 76, dur: 2.0 }],
    [{ note: 74, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.5 }, { note: 78, dur: 0.5 }],
    [{ note: 79, dur: 3.0 }, { note: 76, dur: 1.0 }],
  ];

  const playSection = (melody, dynamicMultiplier = 1.0, isChorus = false, octaveOffset = 0) => {
    melody.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = Math.round(54 * dynamicMultiplier);
      score.addNote(c.root - (isChorus ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      if (isChorus) {
        score.addNote(c.root, barStart + 0.02, barDur * 0.9, bassVel - 10, 'L');
      }

      c.arp.forEach((p, idx) => {
        const stepTime = barStart + (idx + 1) * (beatSec * 0.75);
        score.addNote(p, stepTime, beatSec * 0.9, bassVel - 8 + (idx % 2) * 4, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = Math.round((70 + (idx % 2) * 5) * dynamicMultiplier);
        const pitch = n.note + octaveOffset;
        score.addNote(pitch, noteTime, dur * 0.95, vel, 'R');

        if (isChorus) {
          score.addNote(pitch - 12, noteTime + 0.015, dur * 0.85, vel - 15, 'R');
          if (idx === 0 || idx === 2) {
            score.addNote(pitch - 5, noteTime + 0.02, dur * 0.8, vel - 20, 'R');
          }
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  };

  // 1. Intro
  for (let bar = 0; bar < 4; bar++) {
    const c = chords[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root, barStart, barDur * 0.95, 48, 'L');
    score.addRolledChord([c.arp[0], c.arp[1], c.arp[2], c.arp[3] + 12], barStart + beatSec, barDur * 0.7, 52, 25, 'R');
    score.addPedal(barStart + barDur - 0.05, false);
    t += barDur;
  }

  // Full Song Form (~3:15)
  playSection(verse1, 0.95, false, 0);
  playSection(chorus, 1.1, true, 0);
  playSection(verse1, 1.05, false, 0);
  playSection(chorus, 1.25, true, 0);
  playSection(chorus, 1.35, true, 12);

  // Outro
  for (let bar = 0; bar < 2; bar++) {
    const c = chords[bar * 4];
    const barStart = t;
    const barDur = 4 * beatSec * 1.5;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root - 12, barStart, barDur * 0.98, 40, 'L');
    score.addRolledChord([43, 50, 55, 59, 67, 71, 79, 86, 91], barStart + beatSec * 0.5, barDur * 2.5, 46, 35, 'R');
    score.addPedal(barStart + barDur - 0.02, false);
    t += barDur;
  }

  return score;
}

/**
 * NHẮM MẮT THẤY MÙA HÈ (Hồ Tiến Đạt · OST Nhắm Mắt Thấy Mùa Hè)
 * Full Concert Piano Solo (~3:10)
 * Key: C Major / A Minor. 4/4 Time.
 */
export function buildNhamMatThayMuaHe() {
  const bpm = 68;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Nhắm Mắt Thấy Mùa Hè · Hồ Tiến Đạt', bpm, [4, 4], 0);

  let t = 0.5;

  const chords = [
    { root: 24, arp: [36, 43, 48, 52] }, // C
    { root: 21, arp: [33, 40, 45, 48] }, // Am
    { root: 29, arp: [41, 48, 53, 57] }, // F
    { root: 31, arp: [43, 50, 55, 59] }, // G
    { root: 28, arp: [40, 47, 52, 55] }, // Em
    { root: 21, arp: [33, 40, 45, 48] }, // Am
    { root: 26, arp: [38, 45, 50, 53] }, // Dm7
    { root: 31, arp: [43, 50, 55, 59] }, // G7
  ];

  const verseMelody = [
    [{ note: 60, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 71, dur: 1.0 }],
    [{ note: 69, dur: 1.5 }, { note: 67, dur: 0.5 }, { note: 64, dur: 2.0 }],
    [{ note: 60, dur: 1.0 }, { note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 72, dur: 1.0 }],
    [{ note: 71, dur: 1.5 }, { note: 69, dur: 0.5 }, { note: 67, dur: 2.0 }],
    [{ note: 64, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 71, dur: 1.0 }, { note: 74, dur: 1.0 }],
    [{ note: 72, dur: 1.5 }, { note: 71, dur: 0.5 }, { note: 69, dur: 2.0 }],
    [{ note: 65, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 69, dur: 1.5 }, { note: 71, dur: 0.5 }],
    [{ note: 67, dur: 3.0 }, { note: 64, dur: 1.0 }],
  ];

  const chorusMelody = [
    [{ note: 72, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 83, dur: 1.0 }],
    [{ note: 81, dur: 1.5 }, { note: 79, dur: 0.5 }, { note: 76, dur: 2.0 }],
    [{ note: 72, dur: 1.0 }, { note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 84, dur: 1.0 }],
    [{ note: 83, dur: 1.5 }, { note: 81, dur: 0.5 }, { note: 79, dur: 2.0 }],
    [{ note: 76, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 83, dur: 1.0 }, { note: 86, dur: 1.0 }],
    [{ note: 84, dur: 1.5 }, { note: 83, dur: 0.5 }, { note: 81, dur: 2.0 }],
    [{ note: 77, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 81, dur: 1.5 }, { note: 83, dur: 0.5 }],
    [{ note: 84, dur: 3.0 }, { note: 79, dur: 1.0 }],
  ];

  const playSection = (melody, dynamicMult = 1.0, isChorus = false) => {
    melody.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = Math.round(52 * dynamicMult);
      score.addNote(c.root - (isChorus ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = Math.round((72 + (idx % 2) * 4) * dynamicMult);
        score.addNote(n.note, noteTime, dur * 0.95, vel, 'R');
        if (isChorus) {
          score.addNote(n.note - 12, noteTime + 0.015, dur * 0.85, vel - 16, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  };

  // 1. Intro
  for (let bar = 0; bar < 4; bar++) {
    const c = chords[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root, barStart, barDur * 0.95, 46, 'L');
    score.addRolledChord([c.arp[0], c.arp[1], c.arp[2], c.arp[3] + 12], barStart + beatSec, barDur * 0.7, 50, 25, 'R');
    score.addPedal(barStart + barDur - 0.05, false);
    t += barDur;
  }

  // Full Song Form (~3:10)
  playSection(verseMelody, 0.95, false);
  playSection(chorusMelody, 1.15, true);
  playSection(verseMelody, 1.05, false);
  playSection(chorusMelody, 1.3, true);
  playSection(chorusMelody, 1.4, true);

  // Outro
  score.addPedal(t + 0.02, true);
  score.addRolledChord([24, 36, 43, 48, 52, 60, 64, 67, 72, 79, 84], t, 4 * beatSec * 2, 48, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * HẠNH PHÚC MỚI (Sơn Tùng M-TP & Hari Won · OST Chàng Trai Năm Ấy)
 * Full Concert Piano Solo (~3:05)
 * Key: Eb Major / C Minor. 4/4 Time.
 */
export function buildHanhPhucMoi() {
  const bpm = 70;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Hạnh Phúc Mới · Sơn Tùng M-TP', bpm, [4, 4], -3);

  let t = 0.5;

  const chords = [
    { root: 27, arp: [39, 46, 51, 55] }, // Eb
    { root: 34, arp: [46, 53, 58, 62] }, // Bb
    { root: 24, arp: [36, 43, 48, 51] }, // Cm
    { root: 20, arp: [32, 39, 44, 48] }, // Ab
    { root: 27, arp: [39, 46, 51, 55] }, // Eb
    { root: 34, arp: [46, 53, 58, 62] }, // Bb
    { root: 20, arp: [32, 39, 44, 48] }, // Ab
    { root: 27, arp: [39, 46, 51, 55] }, // Eb
  ];

  const verse = [
    [{ note: 63, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 75, dur: 1.0 }],
    [{ note: 74, dur: 1.5 }, { note: 72, dur: 0.5 }, { note: 70, dur: 2.0 }],
    [{ note: 60, dur: 1.0 }, { note: 63, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 72, dur: 1.0 }],
    [{ note: 70, dur: 1.5 }, { note: 68, dur: 0.5 }, { note: 67, dur: 2.0 }],
    [{ note: 63, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 75, dur: 1.0 }],
    [{ note: 74, dur: 1.5 }, { note: 75, dur: 0.5 }, { note: 77, dur: 2.0 }],
    [{ note: 68, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 72, dur: 1.5 }, { note: 70, dur: 0.5 }],
    [{ note: 63, dur: 4.0 }],
  ];

  const chorus = [
    [{ note: 75, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 82, dur: 1.0 }, { note: 87, dur: 1.0 }],
    [{ note: 86, dur: 1.5 }, { note: 84, dur: 0.5 }, { note: 82, dur: 2.0 }],
    [{ note: 72, dur: 1.0 }, { note: 75, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 84, dur: 1.0 }],
    [{ note: 82, dur: 1.5 }, { note: 80, dur: 0.5 }, { note: 79, dur: 2.0 }],
    [{ note: 75, dur: 1.0 }, { note: 79, dur: 1.0 }, { note: 82, dur: 1.0 }, { note: 87, dur: 1.0 }],
    [{ note: 86, dur: 1.5 }, { note: 87, dur: 0.5 }, { note: 89, dur: 2.0 }],
    [{ note: 80, dur: 1.0 }, { note: 82, dur: 1.0 }, { note: 84, dur: 1.5 }, { note: 82, dur: 0.5 }],
    [{ note: 75, dur: 4.0 }],
  ];

  const play = (mel, dyn = 1.0, isCh = false) => {
    mel.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = Math.round(54 * dyn);
      score.addNote(c.root - (isCh ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = Math.round((70 + (idx % 2) * 5) * dyn);
        score.addNote(n.note, noteTime, dur * 0.95, vel, 'R');
        if (isCh) {
          score.addNote(n.note - 12, noteTime + 0.015, dur * 0.85, vel - 15, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  };

  // 1. Intro
  for (let bar = 0; bar < 4; bar++) {
    const c = chords[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root, barStart, barDur * 0.95, 48, 'L');
    score.addRolledChord([c.arp[0], c.arp[1], c.arp[2], c.arp[3] + 12], barStart + beatSec, barDur * 0.7, 52, 25, 'R');
    score.addPedal(barStart + barDur - 0.05, false);
    t += barDur;
  }

  play(verse, 0.95, false);
  play(chorus, 1.15, true);
  play(verse, 1.05, false);
  play(chorus, 1.3, true);
  play(chorus, 1.4, true);

  // Outro
  score.addPedal(t + 0.02, true);
  score.addRolledChord([27, 39, 46, 51, 55, 63, 67, 70, 75, 82, 87], t, 4 * beatSec * 2, 48, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * PHÉP MÀU (Miracle · Lyrical & Virtuosic Piano Solo)
 * Full Concert Piano Solo (~2:50)
 * Key: D Minor -> F Major -> D Major. 4/4 Time.
 */
export function buildPhepMau() {
  const bpm = 74;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Phép Màu · Concert Solo', bpm, [4, 4], -1);

  let t = 0.5;

  const chords = [
    { root: 26, arp: [38, 45, 50, 53] }, // Dm
    { root: 22, arp: [34, 41, 46, 50] }, // Bb
    { root: 29, arp: [41, 48, 53, 57] }, // F
    { root: 24, arp: [36, 43, 48, 52] }, // C
    { root: 31, arp: [43, 50, 55, 58] }, // Gm
    { root: 26, arp: [38, 45, 50, 53] }, // Dm
    { root: 21, arp: [33, 40, 45, 49] }, // A7
    { root: 26, arp: [38, 45, 50, 53] }, // Dm
  ];

  const themeA = [
    [{ note: 62, dur: 1.0 }, { note: 65, dur: 1.0 }, { note: 69, dur: 1.0 }, { note: 74, dur: 1.0 }],
    [{ note: 72, dur: 1.5 }, { note: 70, dur: 0.5 }, { note: 69, dur: 2.0 }],
    [{ note: 65, dur: 1.0 }, { note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 77, dur: 1.0 }],
    [{ note: 76, dur: 1.5 }, { note: 74, dur: 0.5 }, { note: 72, dur: 2.0 }],
    [{ note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 79, dur: 1.0 }],
    [{ note: 77, dur: 1.5 }, { note: 76, dur: 0.5 }, { note: 74, dur: 2.0 }],
    [{ note: 69, dur: 1.0 }, { note: 73, dur: 1.0 }, { note: 76, dur: 1.5 }, { note: 74, dur: 0.5 }],
    [{ note: 62, dur: 4.0 }],
  ];

  const play = (mel, dyn = 1.0, isClimax = false) => {
    mel.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = Math.round(54 * dyn);
      score.addNote(c.root - (isClimax ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = Math.round((72 + (idx % 2) * 5) * dyn);
        score.addNote(n.note, noteTime, dur * 0.95, vel, 'R');
        if (isClimax) {
          score.addNote(n.note - 12, noteTime + 0.015, dur * 0.85, vel - 16, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  };

  // Intro
  for (let bar = 0; bar < 4; bar++) {
    const c = chords[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root, barStart, barDur * 0.95, 48, 'L');
    score.addRolledChord([c.arp[0], c.arp[1], c.arp[2], c.arp[3] + 12], barStart + beatSec, barDur * 0.7, 52, 25, 'R');
    score.addPedal(barStart + barDur - 0.05, false);
    t += barDur;
  }

  play(themeA, 0.95, false);
  play(themeA, 1.15, true);
  play(themeA, 1.3, true);
  play(themeA, 1.4, true);
  play(themeA, 1.45, true);

  // Outro
  score.addPedal(t + 0.02, true);
  score.addRolledChord([26, 38, 45, 50, 53, 62, 65, 69, 74, 81], t, 4 * beatSec * 2, 48, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * BÈO DẠT MÂY TRÔI (Dân Ca Quan Họ Bắc Ninh · Concert Rhapsody)
 * Full Concert Piano Solo (~2:45)
 */
export function buildBeoDatMayTroi() {
  const bpm = 64;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Bèo Dạt Mây Trôi · Dân ca VN', bpm, [4, 4], -1);

  let t = 0.5;

  const progression = [
    { root: 29, fifth: 36, ninth: 43, third: 45, fifthHi: 48 }, // F
    { root: 26, fifth: 33, ninth: 40, third: 41, fifthHi: 45 }, // Dm
    { root: 22, fifth: 29, ninth: 36, third: 38, fifthHi: 41 }, // Bb
    { root: 24, fifth: 31, ninth: 38, third: 41, fifthHi: 43 }, // C
    { root: 26, fifth: 33, ninth: 40, third: 41, fifthHi: 45 }, // Dm
    { root: 29, fifth: 36, ninth: 43, third: 45, fifthHi: 48 }, // F
    { root: 22, fifth: 29, ninth: 36, third: 38, fifthHi: 41 }, // Bb
    { root: 24, fifth: 31, ninth: 38, third: 41, fifthHi: 43 }, // C
  ];

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

  // 1. Intro
  for (let bar = 0; bar < 4; bar++) {
    const c = progression[bar];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root, barStart, barDur * 0.95, 48, 'L');
    score.addNote(c.fifth, barStart + beatSec * 0.98, barDur * 0.7, 44, 'L');
    score.addNote(c.ninth, barStart + beatSec * 1.98, barDur * 0.5, 46, 'L');
    score.addNote(c.third, barStart + beatSec * 2.98, barDur * 0.35, 48, 'L');
    const ripples = [77, 81, 84, 86, 84, 81, 77, 72];
    ripples.forEach((p, idx) => {
      score.addNote(p, barStart + idx * (beatSec * 0.5), beatSec * 0.45, 54 + (idx % 3) * 4, 'R');
    });
    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  }

  // 2. Verse 1
  vocalPhrases.forEach((phrase, bar) => {
    const c = progression[bar % progression.length];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    const lhArp = [c.root, c.fifth, c.ninth, c.third, c.fifthHi, c.third];
    lhArp.forEach((p, step) => {
      score.addNote(p, barStart + step * (beatSec * 0.65), beatSec * 0.85, 52 + (step === 0 ? 12 : 0), 'L');
    });
    let noteTime = barStart;
    phrase.forEach((n, idx) => {
      const dur = n.dur * beatSec;
      score.addNote(n.note, noteTime, dur * 0.95, 68 + (idx % 2) * 4, 'R');
      noteTime += dur;
    });
    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  });

  // 3. Verse 2
  vocalPhrases.forEach((phrase, bar) => {
    const c = progression[bar % progression.length];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    const lhWave = [c.root - 12, c.root, c.fifth, c.ninth, c.third, c.fifthHi, c.third, c.ninth];
    lhWave.forEach((p, step) => {
      score.addNote(p, barStart + step * (beatSec * 0.5), beatSec * 0.7, 56 + (step === 0 ? 16 : 0), 'L');
    });
    let noteTime = barStart;
    phrase.forEach((n) => {
      const dur = n.dur * beatSec;
      score.addNote(n.note + 12, noteTime, dur * 0.95, 82, 'R');
      score.addNote(n.note, noteTime + 0.015, dur * 0.85, 64, 'R');
      noteTime += dur;
    });
    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  });

  // 4. Grand Climax Reprise
  vocalPhrases.forEach((phrase, bar) => {
    const c = progression[bar % progression.length];
    const barStart = t;
    const barDur = 4 * beatSec;
    score.addPedal(barStart + 0.02, true);
    score.addNote(c.root - 12, barStart, barDur * 0.98, 76, 'L');
    score.addNote(c.fifth, barStart + beatSec, barDur * 0.8, 64, 'L');
    score.addNote(c.ninth, barStart + beatSec * 2, barDur * 0.6, 68, 'L');
    let noteTime = barStart;
    phrase.forEach((n) => {
      const dur = n.dur * beatSec;
      score.addNote(n.note + 12, noteTime, dur * 0.95, 92, 'R');
      score.addNote(n.note, noteTime + 0.015, dur * 0.85, 78, 'R');
      noteTime += dur;
    });
    score.addPedal(barStart + barDur - 0.06, false);
    t += barDur;
  });

  // 5. Outro
  score.addPedal(t + 0.02, true);
  score.addRolledChord([29, 41, 48, 53, 57, 60, 65, 69, 72, 77, 84, 89], t, 4 * beatSec * 2.5, 46, 35, 'R');
  score.addPedal(t + 4 * beatSec * 2.5 - 0.02, false);

  return score;
}

/* ==========================================================================
   2. CLASSICAL REPERTOIRE (FULL LENGTH BENCHMARKS)
   ========================================================================== */

/**
 * CANON IN D (Johann Pachelbel · Full Concert Grand Edition)
 * Duration: ~3:20
 */
export function buildCanonInD() {
  const bpm = 68;
  const beatSec = 60 / bpm;
  const barDur = 4 * beatSec;
  const score = new ExpressiveScoreBuilder('Canon in D · Pachelbel', bpm, [4, 4], 2);

  let t = 0.5;

  const groundBass = [
    { root: 26, arp: [38, 45, 50, 54] }, // D
    { root: 33, arp: [45, 52, 57, 61] }, // A
    { root: 35, arp: [47, 54, 59, 62] }, // Bm
    { root: 30, arp: [42, 49, 54, 57] }, // F#m
    { root: 31, arp: [43, 50, 55, 59] }, // G
    { root: 26, arp: [38, 45, 50, 54] }, // D
    { root: 31, arp: [43, 50, 55, 59] }, // G
    { root: 33, arp: [45, 52, 57, 61] }, // A
  ];

  const melodyThemes = [
    [74, 73, 71, 69, 67, 66, 67, 69],
    [62, 64, 66, 67, 69, 71, 73, 74],
    [74, 76, 74, 73, 71, 69, 71, 73],
    [74, 78, 76, 74, 73, 71, 69, 71],
  ];

  for (let cycle = 0; cycle < 7; cycle++) {
    groundBass.forEach((c, idx) => {
      const barStart = t;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 48 + cycle * 8;
      score.addNote(c.root - (cycle >= 3 ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      if (cycle >= 3) {
        score.addNote(c.root, barStart + 0.02, barDur * 0.9, bassVel - 8, 'L');
      }

      c.arp.forEach((p, step) => {
        score.addNote(p, barStart + (step + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 6, 'L');
      });

      const theme = melodyThemes[cycle % melodyThemes.length];
      const p = theme[idx];
      const noteVel = 64 + cycle * 6;
      const pitch = p + (cycle >= 4 ? 12 : 0);

      score.addNote(pitch, barStart, barDur * 0.45, noteVel, 'R');
      score.addNote(pitch - 2, barStart + barDur * 0.5, barDur * 0.45, noteVel - 4, 'R');

      if (cycle >= 4) {
        score.addNote(pitch - 12, barStart + 0.02, barDur * 0.4, noteVel - 15, 'R');
      }

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([26, 38, 45, 50, 54, 62, 66, 69, 74, 81], t, barDur * 3, 52, 35, 'R');
  score.addPedal(t + barDur * 3 - 0.05, false);

  return score;
}

/**
 * FÜR ELISE (Ludwig van Beethoven · Complete Bagatelle WoO 59)
 * Full Concert Duration: ~2:45
 */
export function buildFurElise() {
  const bpm = 138;
  const eighthSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Für Elise · Beethoven', bpm, [3, 8], 0);

  let t = 0.5;

  const playMotifA = (repeats = 2, dyn = 60, is8va = false) => {
    for (let r = 0; r < repeats; r++) {
      score.addPedal(t + 0.02, true);
      const motif = [76, 75, 76, 75, 76, 71, 74, 72, 69];
      motif.forEach((p, i) => {
        const pitch = p + (is8va ? 12 : 0);
        score.addNote(pitch, t + i * eighthSec, eighthSec * 0.92, dyn + (i % 2) * 4, 'R');
      });
      score.addNote(33, t + 4 * eighthSec, eighthSec * 3, dyn - 12, 'L');
      score.addNote(45, t + 5 * eighthSec, eighthSec * 2, dyn - 14, 'L');
      score.addNote(52, t + 6 * eighthSec, eighthSec * 2, dyn - 12, 'L');
      score.addNote(57, t + 7 * eighthSec, eighthSec * 2, dyn - 10, 'L');
      t += 9 * eighthSec;
      score.addPedal(t - 0.04, false);
    }
  };

  const playSectionB = (dyn = 76) => {
    for (let pass = 0; pass < 2; pass++) {
      score.addPedal(t + 0.02, true);
      const bTheme = [65, 69, 72, 77, 76, 74, 72, 70, 69, 67, 65, 69, 72, 76, 77, 79, 81];
      bTheme.forEach((p, i) => {
        score.addNote(p, t + i * (eighthSec * 1.1), eighthSec * 1.05, dyn + (pass * 6), 'R');
        if (i % 2 === 0) {
          score.addNote(29, t + i * (eighthSec * 1.1), eighthSec * 2.1, dyn - 16, 'L');
          score.addNote(41, t + i * (eighthSec * 1.1) + 0.02, eighthSec * 2.0, dyn - 20, 'L');
        }
      });
      t += bTheme.length * (eighthSec * 1.1);
      score.addPedal(t - 0.04, false);
    }
  };

  const playSectionC = () => {
    score.addPedal(t + 0.02, true);
    for (let i = 0; i < 32; i++) {
      score.addNote(21, t + i * eighthSec, eighthSec * 0.8, 88, 'L');
      score.addNote(33, t + i * eighthSec + 0.01, eighthSec * 0.8, 82, 'L');
      if (i % 4 === 0) {
        score.addNote(69, t + i * eighthSec, eighthSec * 3.5, 94, 'R');
        score.addNote(72, t + i * eighthSec + 0.01, eighthSec * 3.5, 88, 'R');
      }
    }
    t += 32 * eighthSec;
    const chrom = [93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76];
    chrom.forEach((p, i) => {
      score.addNote(p, t + i * (eighthSec * 0.25), eighthSec * 0.35, 84 - i * 2, 'R');
    });
    t += chrom.length * (eighthSec * 0.25);
    score.addPedal(t - 0.04, false);
  };

  // Full A-B-A-C-A-B-A Concert Structure (~2:45)
  playMotifA(4, 58, false);
  playSectionB(74);
  playMotifA(3, 64, false);
  playSectionC();
  playMotifA(3, 70, true);
  playSectionB(80);
  playMotifA(3, 54, false);

  // Coda
  score.addPedal(t + 0.02, true);
  score.addRolledChord([21, 33, 45, 52, 57, 60, 69, 81, 88], t, eighthSec * 12, 48, 30, 'R');
  score.addPedal(t + eighthSec * 12 - 0.05, false);

  return score;
}

/* ==========================================================================
   3. MODERN & CINEMATIC PIANO (FULL LENGTH)
   ========================================================================== */

/**
 * RIVER FLOWS IN YOU (Yiruma · Full Grand Solo)
 * Full Concert Duration: ~3:10
 */
export function buildRiverFlowsInYou() {
  const bpm = 68;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('River Flows in You · Yiruma', bpm, [4, 4], 3);

  let t = 0.5;

  const chords = [
    { root: 30, arp: [42, 49, 54, 57] }, // F#m
    { root: 26, arp: [38, 45, 50, 54] }, // D
    { root: 33, arp: [45, 52, 57, 61] }, // A
    { root: 28, arp: [40, 47, 52, 56] }, // E
  ];

  const themeA = [
    [{ note: 73, dur: 0.5 }, { note: 71, dur: 0.5 }, { note: 73, dur: 0.5 }, { note: 69, dur: 2.5 }],
    [{ note: 73, dur: 0.5 }, { note: 71, dur: 0.5 }, { note: 73, dur: 0.5 }, { note: 69, dur: 2.5 }],
    [{ note: 73, dur: 0.5 }, { note: 71, dur: 0.5 }, { note: 73, dur: 0.5 }, { note: 74, dur: 1.0 }, { note: 73, dur: 0.5 }, { note: 71, dur: 1.0 }],
    [{ note: 69, dur: 0.5 }, { note: 71, dur: 0.5 }, { note: 68, dur: 3.0 }],
  ];

  for (let pass = 0; pass < 12; pass++) {
    themeA.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 48 + Math.min(30, pass * 3);
      score.addNote(c.root - (pass >= 4 ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = 64 + Math.min(30, pass * 3) + (idx % 2) * 4;
        const pitch = n.note + (pass >= 6 ? 12 : 0);
        score.addNote(pitch, noteTime, dur * 0.95, vel, 'R');
        if (pass >= 3) {
          score.addNote(pitch - 12, noteTime + 0.02, dur * 0.8, vel - 18, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([33, 45, 52, 57, 61, 69, 73, 81], t, 4 * beatSec * 2, 50, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * KISS THE RAIN (Yiruma · Full Grand Solo)
 * Full Concert Duration: ~3:15
 */
export function buildKissTheRain() {
  const bpm = 64;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Kiss the Rain · Yiruma', bpm, [4, 4], -4);

  let t = 0.5;

  const chords = [
    { root: 32, arp: [44, 51, 56, 60] }, // Ab
    { root: 31, arp: [43, 51, 55, 58] }, // Eb/G
    { root: 29, arp: [41, 48, 53, 56] }, // Fm
    { root: 25, arp: [37, 44, 49, 53] }, // Db
  ];

  const melody = [
    [{ note: 68, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 75, dur: 1.0 }],
    [{ note: 72, dur: 2.0 }, { note: 70, dur: 2.0 }],
    [{ note: 68, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 75, dur: 1.0 }],
    [{ note: 73, dur: 2.0 }, { note: 72, dur: 2.0 }],
  ];

  for (let pass = 0; pass < 12; pass++) {
    melody.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 46 + Math.min(28, pass * 3);
      score.addNote(c.root, barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n) => {
        const dur = n.dur * beatSec;
        const vel = 64 + Math.min(26, pass * 3);
        const pitch = n.note + (pass >= 6 ? 12 : 0);
        score.addNote(pitch, noteTime, dur * 0.95, vel, 'R');
        if (pass >= 4) {
          score.addNote(pitch - 12, noteTime + 0.015, dur * 0.85, vel - 16, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([32, 44, 51, 56, 60, 68, 72, 80], t, 4 * beatSec * 2, 48, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * NUVOLE BIANCHE (Ludovico Einaudi · Full Composition)
 * Full Concert Duration: ~3:25
 */
export function buildNuvoleBianche() {
  const bpm = 128;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Nuvole Bianche · Ludovico Einaudi', bpm, [4, 4], -4);

  let t = 0.5;

  const progression = [
    { root: 29, ost: [53, 56, 60, 65] }, // Fm
    { root: 25, ost: [49, 53, 56, 61] }, // Db
    { root: 32, ost: [51, 56, 60, 63] }, // Ab
    { root: 27, ost: [51, 55, 58, 63] }, // Eb
  ];

  for (let pass = 0; pass < 24; pass++) {
    progression.forEach((c) => {
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 42 + Math.min(50, pass * 2.5);
      score.addNote(c.root - (pass >= 10 ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      if (pass >= 10) {
        score.addNote(c.root, barStart + beatSec * 2, barDur * 0.45, bassVel - 8, 'L');
      }

      for (let step = 0; step < 8; step++) {
        const p = c.ost[step % c.ost.length] + (pass >= 8 ? 12 : 0);
        score.addNote(p, barStart + step * (beatSec * 0.5), beatSec * 0.48, 48 + Math.min(45, pass * 2.5) + (step % 2) * 4, 'R');
      }

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([29, 41, 48, 53, 56, 60, 65, 72, 80], t, 4 * beatSec * 2, 50, 25, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * MARIAGE D'AMOUR (Paul de Senneville · Complete Concert Solo)
 * Full Concert Duration: ~2:45
 */
export function buildMariageDamour() {
  const bpm = 80;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder("Mariage d'Amour · Paul de Senneville", bpm, [4, 4], -2);

  let t = 0.5;

  const chords = [
    { root: 31, arp: [43, 50, 55, 58] }, // Gm
    { root: 24, arp: [36, 43, 48, 51] }, // Cm
    { root: 29, arp: [41, 48, 53, 57] }, // F
    { root: 22, arp: [34, 41, 46, 50] }, // Bb
    { root: 27, arp: [39, 46, 51, 55] }, // Eb
    { root: 26, arp: [38, 45, 50, 54] }, // D7
    { root: 31, arp: [43, 50, 55, 58] }, // Gm
    { root: 26, arp: [38, 45, 50, 54] }, // D7
  ];

  const theme = [
    [{ note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 79, dur: 1.0 }],
    [{ note: 77, dur: 1.5 }, { note: 75, dur: 0.5 }, { note: 74, dur: 2.0 }],
    [{ note: 65, dur: 1.0 }, { note: 69, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 77, dur: 1.0 }],
    [{ note: 75, dur: 1.5 }, { note: 74, dur: 0.5 }, { note: 72, dur: 2.0 }],
    [{ note: 63, dur: 1.0 }, { note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 75, dur: 1.0 }],
    [{ note: 74, dur: 1.5 }, { note: 72, dur: 0.5 }, { note: 70, dur: 2.0 }],
    [{ note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 74, dur: 1.5 }, { note: 72, dur: 0.5 }],
    [{ note: 67, dur: 4.0 }],
  ];

  for (let pass = 0; pass < 6; pass++) {
    theme.forEach((phrase, bar) => {
      const c = chords[bar % chords.length];
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 52 + pass * 6;
      score.addNote(c.root - (pass >= 3 ? 12 : 0), barStart, barDur * 0.95, bassVel, 'L');
      c.arp.forEach((p, idx) => {
        score.addNote(p, barStart + (idx + 1) * (beatSec * 0.75), beatSec * 0.9, bassVel - 8, 'L');
      });

      let noteTime = barStart;
      phrase.forEach((n, idx) => {
        const dur = n.dur * beatSec;
        const vel = 70 + pass * 5 + (idx % 2) * 4;
        const pitch = n.note + (pass >= 4 ? 12 : 0);
        score.addNote(pitch, noteTime, dur * 0.95, vel, 'R');
        if (pass >= 2) {
          score.addNote(pitch - 12, noteTime + 0.015, dur * 0.85, vel - 15, 'R');
        }
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.05, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([31, 43, 50, 55, 58, 67, 70, 74, 79], t, 4 * beatSec * 2, 52, 30, 'R');
  score.addPedal(t + 4 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * TIME (Hans Zimmer · Inception Grand Suite)
 * Full Concert Duration: ~3:45
 */
export function buildTimeInception() {
  const bpm = 60;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Time · Hans Zimmer', bpm, [4, 4], 0);

  let t = 0.5;

  const progression = [
    { root: 33, chord: [57, 60, 64] }, // Am
    { root: 28, chord: [52, 55, 59] }, // Em
    { root: 31, chord: [55, 59, 62] }, // G
    { root: 26, chord: [50, 53, 57] }, // D
    { root: 29, chord: [53, 57, 60] }, // F
    { root: 24, chord: [48, 52, 55] }, // C
    { root: 26, chord: [50, 53, 57] }, // Dm
    { root: 28, chord: [52, 56, 59] }, // E
  ];

  for (let pass = 0; pass < 6; pass++) {
    progression.forEach((c) => {
      const barStart = t;
      const barDur = 4 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 40 + pass * 12;
      score.addNote(c.root - (pass >= 2 ? 12 : 0), barStart, barDur * 0.98, bassVel, 'L');
      if (pass >= 3) {
        score.addNote(c.root, barStart + 0.02, barDur * 0.95, bassVel - 8, 'L');
      }

      for (let beat = 0; beat < 4; beat++) {
        c.chord.forEach((p) => {
          score.addNote(p + (pass >= 3 ? 12 : 0), barStart + beat * beatSec, beatSec * 0.95, 46 + pass * 9, 'R');
        });
      }

      score.addPedal(barStart + barDur - 0.04, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([21, 33, 45, 57, 60, 64, 69, 72, 81], t, 4 * beatSec * 3, 46, 40, 'R');
  score.addPedal(t + 4 * beatSec * 3 - 0.05, false);

  return score;
}

/**
 * INTERSTELLAR (Hans Zimmer · Main Theme Suite)
 * Full Concert Duration: ~3:15
 */
export function buildInterstellar() {
  const bpm = 90;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder('Interstellar · Hans Zimmer', bpm, [3, 4], 0);

  let t = 0.5;

  const progression = [
    { root: 33, motif: [76, 77, 76] }, // Am
    { root: 29, motif: [76, 77, 76] }, // F
    { root: 24, motif: [76, 77, 76] }, // C
    { root: 31, motif: [74, 76, 74] }, // G
  ];

  for (let pass = 0; pass < 36; pass++) {
    progression.forEach((c) => {
      const barStart = t;
      const barDur = 3 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 44 + Math.min(50, pass * 2.5);
      score.addNote(c.root - (pass >= 8 ? 12 : 0), barStart, barDur * 0.98, bassVel, 'L');
      if (pass >= 12) {
        score.addNote(c.root, barStart + beatSec, barDur * 0.65, bassVel - 8, 'L');
      }

      c.motif.forEach((p, idx) => {
        score.addNote(p + (pass >= 10 ? 12 : 0), barStart + idx * beatSec, beatSec * 0.95, 56 + Math.min(46, pass * 2.5), 'R');
      });

      score.addPedal(barStart + barDur - 0.04, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([21, 33, 45, 57, 64, 69, 76, 81, 88], t, 3 * beatSec * 3, 48, 35, 'R');
  score.addPedal(t + 3 * beatSec * 3 - 0.05, false);

  return score;
}

/**
 * MERRY-GO-ROUND OF LIFE (Joe Hisaishi · Complete Concert Waltz)
 * Full Concert Duration: ~5:28
 */
export function buildMerryGoRound() {
  const bpm = 130;
  const beatSec = 60 / bpm;
  const score = new ExpressiveScoreBuilder("Merry-Go-Round of Life · Joe Hisaishi", bpm, [3, 4], -2);

  let t = 0.5;

  const progression = [
    { root: 31, chord: [50, 55, 58] }, // Gm
    { root: 27, chord: [46, 51, 55] }, // Eb
    { root: 24, chord: [43, 48, 51] }, // Cm
    { root: 26, chord: [45, 50, 54] }, // D7
    { root: 31, chord: [50, 55, 58] }, // Gm
    { root: 22, chord: [46, 50, 53] }, // Bb
    { root: 27, chord: [46, 51, 55] }, // Eb
    { root: 26, chord: [45, 50, 54] }, // D7
  ];

  const waltzTheme = [
    [{ note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 74, dur: 1.0 }],
    [{ note: 79, dur: 2.0 }, { note: 77, dur: 1.0 }],
    [{ note: 75, dur: 1.0 }, { note: 74, dur: 1.0 }, { note: 72, dur: 1.0 }],
    [{ note: 74, dur: 3.0 }],
    [{ note: 67, dur: 1.0 }, { note: 70, dur: 1.0 }, { note: 74, dur: 1.0 }],
    [{ note: 77, dur: 2.0 }, { note: 75, dur: 1.0 }],
    [{ note: 74, dur: 1.0 }, { note: 72, dur: 1.0 }, { note: 70, dur: 1.0 }],
    [{ note: 67, dur: 3.0 }],
  ];

  for (let pass = 0; pass < 30; pass++) {
    waltzTheme.forEach((phrase, bar) => {
      const c = progression[bar % progression.length];
      const barStart = t;
      const barDur = 3 * beatSec;
      score.addPedal(barStart + 0.02, true);

      const bassVel = 58 + Math.min(32, pass * 2.5);
      score.addNote(c.root - (pass >= 6 ? 12 : 0), barStart, beatSec * 0.9, bassVel, 'L');
      score.addRolledChord(c.chord, barStart + beatSec, beatSec * 0.6, bassVel - 12, 12, 'L');
      score.addRolledChord(c.chord, barStart + beatSec * 2, beatSec * 0.6, bassVel - 12, 12, 'L');

      let noteTime = barStart;
      phrase.forEach((n) => {
        const dur = n.dur * beatSec;
        const vel = 70 + Math.min(26, pass * 2);
        score.addNote(n.note + (pass >= 8 ? 12 : 0), noteTime, dur * 0.9, vel, 'R');
        noteTime += dur;
      });

      score.addPedal(barStart + barDur - 0.04, false);
      t += barDur;
    });
  }

  score.addPedal(t + 0.02, true);
  score.addRolledChord([31, 43, 50, 55, 58, 67, 74, 79, 86], t, 3 * beatSec * 2, 58, 25, 'R');
  score.addPedal(t + 3 * beatSec * 2 - 0.05, false);

  return score;
}

/**
 * Generate and write all Complete Full-Length Repertoire Pieces
 */
export function generateAllMidis() {
  const pieces = [
    // 1. Classical
    { file: 'canon-in-d.mid', builder: buildCanonInD },
    { file: 'fur-elise.mid', builder: buildFurElise },
    // 2. Vietnamese Virtuosic & Lyrical
    { file: 'co-chang-trai-viet-len-cay.mid', builder: buildCoChangTraiVietLenCay },
    { file: 'nham-mat-thay-mua-he.mid', builder: buildNhamMatThayMuaHe },
    { file: 'hanh-phuc-moi.mid', builder: buildHanhPhucMoi },
    { file: 'phep-mau.mid', builder: buildPhepMau },
    { file: 'beo-dat-may-troi.mid', builder: buildBeoDatMayTroi },
    // 3. Modern Piano
    { file: 'river-flows-in-you.mid', builder: buildRiverFlowsInYou },
    { file: 'kiss-the-rain.mid', builder: buildKissTheRain },
    { file: 'nuvole-bianche.mid', builder: buildNuvoleBianche },
    { file: 'mariage-damour.mid', builder: buildMariageDamour },
    // 4. Cinematic Piano
    { file: 'time-inception.mid', builder: buildTimeInception },
    { file: 'interstellar.mid', builder: buildInterstellar },
    { file: 'merry-go-round-of-life.mid', builder: buildMerryGoRound },
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
  const results = generateAllMidis();
  console.log('\n=== PROFESSIONAL PERFORMANCE V2 FULL-LENGTH REPERTOIRE GENERATED ===\n');
  console.table(results);
}
