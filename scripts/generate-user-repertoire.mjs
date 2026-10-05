import fs from 'node:fs';
import path from 'node:path';
import { writeMidi } from 'midi-file';

const OUT_DIR = path.resolve('public/midi');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function noteToMidi(name, octave) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return (octave + 1) * 12 + map[name];
}

/**
 * Builds a multi-track standard Type 1 MIDI buffer with Left Hand, Right Hand, and Sustain Pedal CC64.
 */
function buildExpressivePianoMidi({ bpm, timeSignature = [4, 4], patterns, bars = 24 }) {
  const ticksPerBeat = 480;
  const microsecondsPerBeat = Math.round(60000000 / bpm);
  const beatsPerBar = timeSignature[0];
  const ticksPerBar = beatsPerBar * ticksPerBeat;

  const tempoTrack = [
    { type: 'setTempo', deltaTime: 0, microsecondsPerBeat },
    { type: 'timeSignature', deltaTime: 0, numerator: timeSignature[0], denominator: timeSignature[1], metronome: 24, thirtyseconds: 8 },
    { type: 'endOfTrack', deltaTime: bars * ticksPerBar },
  ];

  // Sustain pedal track (Pedal down at start of each harmonic bar, slight lift 30 ticks before bar end)
  const pedalEvents = [];
  let currentPedalTick = 0;
  for (let b = 0; b < bars; b++) {
    const barStartTick = b * ticksPerBar;
    const pedalDownDelta = barStartTick - currentPedalTick;
    pedalEvents.push({ type: 'controller', channel: 0, controllerType: 64, value: 127, deltaTime: pedalDownDelta });
    currentPedalTick = barStartTick;

    const pedalLiftTick = barStartTick + ticksPerBar - 40;
    const liftDelta = pedalLiftTick - currentPedalTick;
    pedalEvents.push({ type: 'controller', channel: 0, controllerType: 64, value: 0, deltaTime: liftDelta });
    currentPedalTick = pedalLiftTick;
  }
  pedalEvents.push({ type: 'endOfTrack', deltaTime: 120 });

  // Generate note events from musical patterns
  const noteEvents = [];
  const rawNotes = [];

  for (let b = 0; b < bars; b++) {
    const pattern = patterns[b % patterns.length];
    const barOffset = b * ticksPerBar;

    // Left hand accompaniment (Bass & Arpeggios)
    if (pattern.lh) {
      pattern.lh.forEach((n) => {
        rawNotes.push({
          midi: n.midi,
          velocity: Math.max(35, Math.min(105, Math.round(n.vel * (0.95 + 0.1 * Math.sin(b * 0.4))))),
          startTick: barOffset + n.start,
          duration: n.dur,
        });
      });
    }

    // Right hand melody & expressive harmony
    if (pattern.rh) {
      pattern.rh.forEach((n) => {
        // Natural human rubato and phrasing dynamics
        const humanVel = Math.max(45, Math.min(118, Math.round(n.vel * (0.98 + 0.15 * Math.sin(b * 0.5 + (n.start / ticksPerBar))))));
        rawNotes.push({
          midi: n.midi,
          velocity: humanVel,
          startTick: barOffset + n.start,
          duration: n.dur,
        });
      });
    }
  }

  // Sort all note-ons and note-offs chronologically
  const deltaQueue = [];
  rawNotes.forEach((n) => {
    deltaQueue.push({ type: 'noteOn', midi: n.midi, velocity: n.velocity, tick: n.startTick });
    deltaQueue.push({ type: 'noteOff', midi: n.midi, velocity: 0, tick: n.startTick + n.duration });
  });

  deltaQueue.sort((a, b) => a.tick - b.tick);

  let prevTick = 0;
  deltaQueue.forEach((e) => {
    const delta = e.tick - prevTick;
    noteEvents.push({
      type: e.type,
      channel: 0,
      noteNumber: e.midi,
      velocity: e.velocity,
      deltaTime: Math.max(0, delta),
    });
    prevTick = e.tick;
  });

  noteEvents.push({ type: 'endOfTrack', deltaTime: 240 });

  const midiData = {
    header: { format: 1, numTracks: 3, ticksPerBeat },
    tracks: [tempoTrack, noteEvents, pedalEvents],
  };

  return Uint8Array.from(writeMidi(midiData));
}

// 1. "50 NĂM VỀ SAU" - Ballad in C Major / A Minor, 74 BPM
const p50Nam = [
  // Am7 -> Fmaj7 -> C -> G
  {
    lh: [
      { midi: 33, vel: 68, start: 0, dur: 440 }, { midi: 45, vel: 60, start: 120, dur: 400 },
      { midi: 52, vel: 58, start: 240, dur: 400 }, { midi: 57, vel: 62, start: 360, dur: 400 },
      { midi: 33, vel: 65, start: 480, dur: 440 }, { midi: 48, vel: 58, start: 600, dur: 400 },
      { midi: 52, vel: 60, start: 720, dur: 400 }, { midi: 57, vel: 64, start: 840, dur: 400 },
      { midi: 33, vel: 70, start: 960, dur: 440 }, { midi: 52, vel: 62, start: 1200, dur: 400 },
      { midi: 55, vel: 60, start: 1440, dur: 400 }, { midi: 57, vel: 66, start: 1680, dur: 400 },
    ],
    rh: [
      { midi: 69, vel: 85, start: 0, dur: 460 }, { midi: 72, vel: 88, start: 480, dur: 440 },
      { midi: 71, vel: 82, start: 960, dur: 420 }, { midi: 69, vel: 80, start: 1200, dur: 240 },
      { midi: 67, vel: 84, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 29, vel: 72, start: 0, dur: 440 }, { midi: 41, vel: 62, start: 120, dur: 400 },
      { midi: 48, vel: 60, start: 240, dur: 400 }, { midi: 53, vel: 64, start: 360, dur: 400 },
      { midi: 29, vel: 68, start: 480, dur: 440 }, { midi: 48, vel: 60, start: 720, dur: 400 },
      { midi: 57, vel: 62, start: 960, dur: 440 }, { midi: 60, vel: 65, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 65, vel: 86, start: 0, dur: 460 }, { midi: 69, vel: 88, start: 480, dur: 440 },
      { midi: 67, vel: 82, start: 960, dur: 440 }, { midi: 65, vel: 78, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 36, vel: 74, start: 0, dur: 440 }, { midi: 48, vel: 64, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 55, vel: 62, start: 360, dur: 400 },
      { midi: 36, vel: 70, start: 480, dur: 440 }, { midi: 52, vel: 62, start: 720, dur: 400 },
      { midi: 55, vel: 64, start: 960, dur: 440 }, { midi: 60, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 64, vel: 88, start: 0, dur: 460 }, { midi: 67, vel: 85, start: 480, dur: 440 },
      { midi: 69, vel: 90, start: 960, dur: 440 }, { midi: 72, vel: 94, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 31, vel: 72, start: 0, dur: 440 }, { midi: 43, vel: 62, start: 120, dur: 400 },
      { midi: 47, vel: 60, start: 240, dur: 400 }, { midi: 50, vel: 64, start: 360, dur: 400 },
      { midi: 31, vel: 68, start: 480, dur: 440 }, { midi: 47, vel: 62, start: 720, dur: 400 },
      { midi: 50, vel: 64, start: 960, dur: 440 }, { midi: 55, vel: 66, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 71, vel: 88, start: 0, dur: 460 }, { midi: 67, vel: 84, start: 480, dur: 440 },
      { midi: 65, vel: 80, start: 960, dur: 440 }, { midi: 64, vel: 82, start: 1440, dur: 440 },
    ],
  },
];

// 2. "Bài Thánh Ca Buồn" - E Minor, 68 BPM (Slow Expressive)
const pThanhCa = [
  {
    lh: [
      { midi: 28, vel: 74, start: 0, dur: 440 }, { midi: 40, vel: 62, start: 120, dur: 400 },
      { midi: 47, vel: 60, start: 240, dur: 400 }, { midi: 52, vel: 64, start: 360, dur: 400 },
      { midi: 55, vel: 62, start: 480, dur: 440 }, { midi: 59, vel: 65, start: 720, dur: 400 },
      { midi: 55, vel: 60, start: 960, dur: 440 }, { midi: 52, vel: 62, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 64, vel: 86, start: 0, dur: 460 }, { midi: 67, vel: 88, start: 480, dur: 440 },
      { midi: 71, vel: 92, start: 960, dur: 600 }, { midi: 74, vel: 90, start: 1560, dur: 360 },
    ],
  },
  {
    lh: [
      { midi: 33, vel: 72, start: 0, dur: 440 }, { midi: 45, vel: 64, start: 120, dur: 400 },
      { midi: 48, vel: 60, start: 240, dur: 400 }, { midi: 52, vel: 62, start: 360, dur: 400 },
      { midi: 33, vel: 68, start: 480, dur: 440 }, { midi: 48, vel: 62, start: 720, dur: 400 },
      { midi: 52, vel: 64, start: 960, dur: 440 }, { midi: 57, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 72, vel: 90, start: 0, dur: 460 }, { midi: 71, vel: 86, start: 480, dur: 440 },
      { midi: 69, vel: 84, start: 960, dur: 440 }, { midi: 67, vel: 82, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 35, vel: 76, start: 0, dur: 440 }, { midi: 47, vel: 66, start: 120, dur: 400 },
      { midi: 50, vel: 62, start: 240, dur: 400 }, { midi: 54, vel: 64, start: 360, dur: 400 },
      { midi: 35, vel: 70, start: 480, dur: 440 }, { midi: 50, vel: 64, start: 720, dur: 400 },
      { midi: 54, vel: 66, start: 960, dur: 440 }, { midi: 59, vel: 70, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 66, vel: 88, start: 0, dur: 460 }, { midi: 69, vel: 86, start: 480, dur: 440 },
      { midi: 71, vel: 92, start: 960, dur: 440 }, { midi: 69, vel: 84, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 28, vel: 75, start: 0, dur: 440 }, { midi: 40, vel: 64, start: 120, dur: 400 },
      { midi: 47, vel: 62, start: 240, dur: 400 }, { midi: 52, vel: 65, start: 360, dur: 400 },
      { midi: 28, vel: 72, start: 480, dur: 440 }, { midi: 47, vel: 64, start: 720, dur: 400 },
      { midi: 52, vel: 66, start: 960, dur: 440 }, { midi: 55, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 67, vel: 90, start: 0, dur: 460 }, { midi: 66, vel: 84, start: 480, dur: 440 },
      { midi: 64, vel: 86, start: 960, dur: 900 },
    ],
  },
];

// 3. "Close To You" - G Major / Pop Romance, 88 BPM
const pCloseToYou = [
  {
    lh: [
      { midi: 43, vel: 72, start: 0, dur: 440 }, { midi: 55, vel: 62, start: 120, dur: 400 },
      { midi: 59, vel: 60, start: 240, dur: 400 }, { midi: 62, vel: 64, start: 360, dur: 400 },
      { midi: 43, vel: 68, start: 480, dur: 440 }, { midi: 55, vel: 62, start: 720, dur: 400 },
      { midi: 59, vel: 64, start: 960, dur: 440 }, { midi: 62, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 71, vel: 86, start: 0, dur: 440 }, { midi: 74, vel: 90, start: 480, dur: 440 },
      { midi: 71, vel: 84, start: 960, dur: 440 }, { midi: 69, vel: 80, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 42, vel: 70, start: 0, dur: 440 }, { midi: 54, vel: 60, start: 120, dur: 400 },
      { midi: 57, vel: 58, start: 240, dur: 400 }, { midi: 60, vel: 62, start: 360, dur: 400 },
      { midi: 42, vel: 66, start: 480, dur: 440 }, { midi: 57, vel: 62, start: 960, dur: 440 },
      { midi: 60, vel: 66, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 66, vel: 84, start: 0, dur: 440 }, { midi: 69, vel: 88, start: 480, dur: 440 },
      { midi: 67, vel: 82, start: 960, dur: 440 }, { midi: 66, vel: 78, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 40, vel: 74, start: 0, dur: 440 }, { midi: 52, vel: 64, start: 120, dur: 400 },
      { midi: 55, vel: 60, start: 240, dur: 400 }, { midi: 59, vel: 62, start: 360, dur: 400 },
      { midi: 40, vel: 70, start: 480, dur: 440 }, { midi: 55, vel: 62, start: 960, dur: 440 },
      { midi: 59, vel: 66, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 64, vel: 86, start: 0, dur: 440 }, { midi: 67, vel: 90, start: 480, dur: 440 },
      { midi: 71, vel: 94, start: 960, dur: 440 }, { midi: 74, vel: 96, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 36, vel: 76, start: 0, dur: 440 }, { midi: 48, vel: 64, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 55, vel: 62, start: 360, dur: 400 },
      { midi: 38, vel: 72, start: 960, dur: 440 }, { midi: 50, vel: 64, start: 1200, dur: 400 },
      { midi: 53, vel: 66, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 72, vel: 92, start: 0, dur: 440 }, { midi: 71, vel: 86, start: 480, dur: 440 },
      { midi: 69, vel: 84, start: 960, dur: 440 }, { midi: 67, vel: 88, start: 1440, dur: 440 },
    ],
  },
];

// 4. "Golden Hour" - JVKE, Fast Shimmering Triplet Arpeggios, 94 BPM
const pGoldenHour = [
  {
    lh: [
      { midi: 34, vel: 78, start: 0, dur: 440 }, { midi: 46, vel: 68, start: 160, dur: 320 },
      { midi: 53, vel: 65, start: 320, dur: 320 }, { midi: 58, vel: 70, start: 480, dur: 440 },
      { midi: 34, vel: 75, start: 960, dur: 440 }, { midi: 53, vel: 68, start: 1280, dur: 440 },
    ],
    rh: [
      // Shimmering right hand cascade
      { midi: 70, vel: 88, start: 0, dur: 140 }, { midi: 74, vel: 84, start: 160, dur: 140 },
      { midi: 77, vel: 92, start: 320, dur: 140 }, { midi: 82, vel: 98, start: 480, dur: 200 },
      { midi: 77, vel: 90, start: 720, dur: 140 }, { midi: 74, vel: 86, start: 880, dur: 140 },
      { midi: 70, vel: 90, start: 960, dur: 140 }, { midi: 74, vel: 86, start: 1120, dur: 140 },
      { midi: 77, vel: 92, start: 1280, dur: 140 }, { midi: 82, vel: 100, start: 1440, dur: 440 },
    ],
  },
  {
    lh: [
      { midi: 38, vel: 78, start: 0, dur: 440 }, { midi: 50, vel: 68, start: 160, dur: 320 },
      { midi: 55, vel: 65, start: 320, dur: 320 }, { midi: 58, vel: 70, start: 480, dur: 440 },
      { midi: 38, vel: 75, start: 960, dur: 440 }, { midi: 55, vel: 68, start: 1280, dur: 440 },
    ],
    rh: [
      { midi: 69, vel: 86, start: 0, dur: 140 }, { midi: 74, vel: 84, start: 160, dur: 140 },
      { midi: 77, vel: 90, start: 320, dur: 140 }, { midi: 81, vel: 96, start: 480, dur: 200 },
      { midi: 77, vel: 88, start: 720, dur: 140 }, { midi: 74, vel: 84, start: 880, dur: 140 },
      { midi: 69, vel: 88, start: 960, dur: 140 }, { midi: 74, vel: 84, start: 1120, dur: 140 },
      { midi: 77, vel: 90, start: 1280, dur: 140 }, { midi: 81, vel: 98, start: 1440, dur: 440 },
    ],
  },
];

// 5. "Haru Haru" - BIGBANG, Dramatic Minor Ballad, 82 BPM
const pHaruHaru = [
  {
    lh: [
      { midi: 33, vel: 75, start: 0, dur: 440 }, { midi: 45, vel: 64, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 57, vel: 65, start: 360, dur: 400 },
      { midi: 33, vel: 70, start: 480, dur: 440 }, { midi: 52, vel: 62, start: 960, dur: 440 },
      { midi: 57, vel: 66, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 69, vel: 90, start: 0, dur: 360 }, { midi: 72, vel: 88, start: 360, dur: 360 },
      { midi: 76, vel: 95, start: 720, dur: 480 }, { midi: 74, vel: 88, start: 1200, dur: 360 },
      { midi: 72, vel: 84, start: 1560, dur: 360 },
    ],
  },
  {
    lh: [
      { midi: 29, vel: 76, start: 0, dur: 440 }, { midi: 41, vel: 65, start: 120, dur: 400 },
      { midi: 48, vel: 62, start: 240, dur: 400 }, { midi: 53, vel: 66, start: 360, dur: 400 },
      { midi: 29, vel: 72, start: 480, dur: 440 }, { midi: 48, vel: 64, start: 960, dur: 440 },
      { midi: 53, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 72, vel: 90, start: 0, dur: 360 }, { midi: 69, vel: 86, start: 360, dur: 360 },
      { midi: 65, vel: 84, start: 720, dur: 480 }, { midi: 69, vel: 88, start: 1200, dur: 360 },
      { midi: 72, vel: 92, start: 1560, dur: 360 },
    ],
  },
  {
    lh: [
      { midi: 36, vel: 76, start: 0, dur: 440 }, { midi: 48, vel: 65, start: 120, dur: 400 },
      { midi: 52, vel: 62, start: 240, dur: 400 }, { midi: 55, vel: 66, start: 360, dur: 400 },
      { midi: 36, vel: 72, start: 480, dur: 440 }, { midi: 52, vel: 64, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 71, vel: 88, start: 0, dur: 360 }, { midi: 67, vel: 84, start: 360, dur: 360 },
      { midi: 64, vel: 82, start: 720, dur: 480 }, { midi: 67, vel: 86, start: 1200, dur: 360 },
      { midi: 71, vel: 90, start: 1560, dur: 360 },
    ],
  },
  {
    lh: [
      { midi: 31, vel: 78, start: 0, dur: 440 }, { midi: 43, vel: 66, start: 120, dur: 400 },
      { midi: 47, vel: 62, start: 240, dur: 400 }, { midi: 50, vel: 68, start: 360, dur: 400 },
      { midi: 31, vel: 74, start: 480, dur: 440 }, { midi: 47, vel: 65, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 71, vel: 92, start: 0, dur: 480 }, { midi: 69, vel: 88, start: 480, dur: 480 },
      { midi: 67, vel: 85, start: 960, dur: 480 }, { midi: 65, vel: 82, start: 1440, dur: 480 },
    ],
  },
];

// 6. "I'll Never Love Again" - Lady Gaga / A Star Is Born, 70 BPM
const pNeverLove = [
  {
    lh: [
      { midi: 34, vel: 74, start: 0, dur: 440 }, { midi: 46, vel: 64, start: 120, dur: 400 },
      { midi: 50, vel: 60, start: 240, dur: 400 }, { midi: 53, vel: 65, start: 360, dur: 400 },
      { midi: 34, vel: 70, start: 480, dur: 440 }, { midi: 50, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 70, vel: 92, start: 0, dur: 480 }, { midi: 69, vel: 86, start: 480, dur: 480 },
      { midi: 65, vel: 84, start: 960, dur: 480 }, { midi: 62, vel: 80, start: 1440, dur: 480 },
    ],
  },
  {
    lh: [
      { midi: 38, vel: 76, start: 0, dur: 440 }, { midi: 50, vel: 65, start: 120, dur: 400 },
      { midi: 53, vel: 62, start: 240, dur: 400 }, { midi: 57, vel: 66, start: 360, dur: 400 },
      { midi: 38, vel: 72, start: 480, dur: 440 }, { midi: 53, vel: 64, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 65, vel: 88, start: 0, dur: 480 }, { midi: 69, vel: 90, start: 480, dur: 480 },
      { midi: 72, vel: 95, start: 960, dur: 480 }, { midi: 74, vel: 98, start: 1440, dur: 480 },
    ],
  },
];

// 7. "Imagine" - John Lennon, 76 BPM
const pImagine = [
  {
    lh: [
      { midi: 36, vel: 74, start: 0, dur: 440 }, { midi: 48, vel: 64, start: 240, dur: 400 },
      { midi: 36, vel: 70, start: 480, dur: 440 }, { midi: 48, vel: 62, start: 720, dur: 400 },
      { midi: 36, vel: 72, start: 960, dur: 440 }, { midi: 48, vel: 64, start: 1200, dur: 400 },
      { midi: 36, vel: 74, start: 1440, dur: 440 }, { midi: 48, vel: 66, start: 1680, dur: 400 },
    ],
    rh: [
      { midi: 52, vel: 72, start: 0, dur: 220 }, { midi: 55, vel: 75, start: 0, dur: 220 }, { midi: 60, vel: 80, start: 0, dur: 220 },
      { midi: 52, vel: 70, start: 240, dur: 220 }, { midi: 55, vel: 72, start: 240, dur: 220 }, { midi: 60, vel: 78, start: 240, dur: 220 },
      { midi: 52, vel: 72, start: 480, dur: 220 }, { midi: 55, vel: 75, start: 480, dur: 220 }, { midi: 60, vel: 80, start: 480, dur: 220 },
      { midi: 52, vel: 70, start: 720, dur: 220 }, { midi: 55, vel: 72, start: 720, dur: 220 }, { midi: 60, vel: 78, start: 720, dur: 220 },
      { midi: 52, vel: 72, start: 960, dur: 220 }, { midi: 55, vel: 75, start: 960, dur: 220 }, { midi: 60, vel: 80, start: 960, dur: 220 },
      { midi: 64, vel: 85, start: 1440, dur: 440 }, { midi: 65, vel: 88, start: 1680, dur: 240 },
    ],
  },
  {
    lh: [
      { midi: 29, vel: 74, start: 0, dur: 440 }, { midi: 41, vel: 64, start: 240, dur: 400 },
      { midi: 29, vel: 70, start: 480, dur: 440 }, { midi: 41, vel: 62, start: 720, dur: 400 },
      { midi: 29, vel: 72, start: 960, dur: 440 }, { midi: 41, vel: 64, start: 1200, dur: 400 },
      { midi: 29, vel: 74, start: 1440, dur: 440 }, { midi: 41, vel: 66, start: 1680, dur: 400 },
    ],
    rh: [
      { midi: 53, vel: 72, start: 0, dur: 220 }, { midi: 57, vel: 75, start: 0, dur: 220 }, { midi: 60, vel: 80, start: 0, dur: 220 },
      { midi: 53, vel: 70, start: 240, dur: 220 }, { midi: 57, vel: 72, start: 240, dur: 220 }, { midi: 60, vel: 78, start: 240, dur: 220 },
      { midi: 53, vel: 72, start: 480, dur: 220 }, { midi: 57, vel: 75, start: 480, dur: 220 }, { midi: 60, vel: 80, start: 480, dur: 220 },
      { midi: 53, vel: 70, start: 720, dur: 220 }, { midi: 57, vel: 72, start: 720, dur: 220 }, { midi: 60, vel: 78, start: 720, dur: 220 },
      { midi: 67, vel: 88, start: 1440, dur: 440 },
    ],
  },
];

// 8. "Last Christmas" - Wham!, 108 BPM
const pLastChristmas = [
  {
    lh: [
      { midi: 38, vel: 75, start: 0, dur: 440 }, { midi: 50, vel: 64, start: 120, dur: 400 },
      { midi: 54, vel: 60, start: 240, dur: 400 }, { midi: 57, vel: 65, start: 360, dur: 400 },
      { midi: 38, vel: 70, start: 480, dur: 440 }, { midi: 54, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 69, vel: 88, start: 0, dur: 240 }, { midi: 69, vel: 86, start: 240, dur: 240 },
      { midi: 69, vel: 90, start: 480, dur: 240 }, { midi: 66, vel: 84, start: 720, dur: 240 },
      { midi: 69, vel: 88, start: 960, dur: 480 }, { midi: 71, vel: 92, start: 1440, dur: 480 },
    ],
  },
  {
    lh: [
      { midi: 35, vel: 75, start: 0, dur: 440 }, { midi: 47, vel: 64, start: 120, dur: 400 },
      { midi: 50, vel: 60, start: 240, dur: 400 }, { midi: 54, vel: 65, start: 360, dur: 400 },
      { midi: 35, vel: 70, start: 480, dur: 440 }, { midi: 50, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 71, vel: 90, start: 0, dur: 240 }, { midi: 69, vel: 86, start: 240, dur: 240 },
      { midi: 66, vel: 84, start: 480, dur: 480 }, { midi: 62, vel: 82, start: 960, dur: 900 },
    ],
  },
];

// 9. "Proud of You (I Can Fly)" - Fiona Fung, 78 BPM
const pProudOfYou = [
  {
    lh: [
      { midi: 36, vel: 74, start: 0, dur: 440 }, { midi: 48, vel: 64, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 55, vel: 65, start: 360, dur: 400 },
      { midi: 36, vel: 70, start: 480, dur: 440 }, { midi: 52, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 64, vel: 88, start: 0, dur: 480 }, { midi: 67, vel: 90, start: 480, dur: 480 },
      { midi: 72, vel: 96, start: 960, dur: 480 }, { midi: 71, vel: 88, start: 1440, dur: 480 },
    ],
  },
  {
    lh: [
      { midi: 33, vel: 74, start: 0, dur: 440 }, { midi: 45, vel: 64, start: 120, dur: 400 },
      { midi: 48, vel: 60, start: 240, dur: 400 }, { midi: 52, vel: 65, start: 360, dur: 400 },
      { midi: 33, vel: 70, start: 480, dur: 440 }, { midi: 48, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 69, vel: 90, start: 0, dur: 480 }, { midi: 67, vel: 86, start: 480, dur: 480 },
      { midi: 64, vel: 84, start: 960, dur: 480 }, { midi: 67, vel: 88, start: 1440, dur: 480 },
    ],
  },
];

// 10. "Sứ Thanh Hoa" (青花瓷) - Jay Chou, 76 BPM
const pSuThanhHoa = [
  {
    lh: [
      { midi: 33, vel: 76, start: 0, dur: 440 }, { midi: 45, vel: 65, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 57, vel: 66, start: 360, dur: 400 },
      { midi: 33, vel: 70, start: 480, dur: 440 }, { midi: 52, vel: 64, start: 960, dur: 440 },
      { midi: 57, vel: 68, start: 1440, dur: 400 },
    ],
    rh: [
      { midi: 76, vel: 92, start: 0, dur: 240 }, { midi: 74, vel: 88, start: 240, dur: 240 },
      { midi: 72, vel: 90, start: 480, dur: 480 }, { midi: 69, vel: 86, start: 960, dur: 480 },
      { midi: 72, vel: 92, start: 1440, dur: 480 },
    ],
  },
  {
    lh: [
      { midi: 29, vel: 76, start: 0, dur: 440 }, { midi: 41, vel: 65, start: 120, dur: 400 },
      { midi: 48, vel: 60, start: 240, dur: 400 }, { midi: 53, vel: 66, start: 360, dur: 400 },
      { midi: 29, vel: 70, start: 480, dur: 440 }, { midi: 48, vel: 64, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 72, vel: 90, start: 0, dur: 240 }, { midi: 69, vel: 86, start: 240, dur: 240 },
      { midi: 65, vel: 84, start: 480, dur: 480 }, { midi: 67, vel: 88, start: 960, dur: 480 },
      { midi: 69, vel: 90, start: 1440, dur: 480 },
    ],
  },
];

// 11. "Vết Mưa" - Vũ Cát Tường, 80 BPM
const pVetMua = [
  {
    lh: [
      { midi: 33, vel: 74, start: 0, dur: 440 }, { midi: 45, vel: 64, start: 120, dur: 400 },
      { midi: 48, vel: 60, start: 240, dur: 400 }, { midi: 52, vel: 65, start: 360, dur: 400 },
      { midi: 33, vel: 70, start: 480, dur: 440 }, { midi: 48, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 69, vel: 90, start: 0, dur: 360 }, { midi: 72, vel: 88, start: 360, dur: 360 },
      { midi: 76, vel: 94, start: 720, dur: 480 }, { midi: 74, vel: 88, start: 1200, dur: 360 },
      { midi: 72, vel: 86, start: 1560, dur: 360 },
    ],
  },
  {
    lh: [
      { midi: 29, vel: 75, start: 0, dur: 440 }, { midi: 41, vel: 64, start: 120, dur: 400 },
      { midi: 45, vel: 60, start: 240, dur: 400 }, { midi: 48, vel: 65, start: 360, dur: 400 },
      { midi: 29, vel: 70, start: 480, dur: 440 }, { midi: 45, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 72, vel: 90, start: 0, dur: 360 }, { midi: 69, vel: 86, start: 360, dur: 360 },
      { midi: 65, vel: 84, start: 720, dur: 480 }, { midi: 69, vel: 88, start: 1200, dur: 360 },
      { midi: 72, vel: 92, start: 1560, dur: 360 },
    ],
  },
];

// 12. "蒲公英的约定 (Dandelion's Promise)" - Jay Chou, 72 BPM
const pDandelion = [
  {
    lh: [
      { midi: 36, vel: 76, start: 0, dur: 440 }, { midi: 48, vel: 65, start: 120, dur: 400 },
      { midi: 52, vel: 60, start: 240, dur: 400 }, { midi: 55, vel: 66, start: 360, dur: 400 },
      { midi: 36, vel: 70, start: 480, dur: 440 }, { midi: 52, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 64, vel: 88, start: 0, dur: 480 }, { midi: 67, vel: 90, start: 480, dur: 480 },
      { midi: 72, vel: 95, start: 960, dur: 480 }, { midi: 71, vel: 88, start: 1440, dur: 480 },
    ],
  },
  {
    lh: [
      { midi: 31, vel: 76, start: 0, dur: 440 }, { midi: 43, vel: 65, start: 120, dur: 400 },
      { midi: 47, vel: 60, start: 240, dur: 400 }, { midi: 50, vel: 66, start: 360, dur: 400 },
      { midi: 31, vel: 70, start: 480, dur: 440 }, { midi: 47, vel: 62, start: 960, dur: 440 },
    ],
    rh: [
      { midi: 71, vel: 90, start: 0, dur: 480 }, { midi: 69, vel: 86, start: 480, dur: 480 },
      { midi: 67, vel: 84, start: 960, dur: 480 }, { midi: 64, vel: 82, start: 1440, dur: 480 },
    ],
  },
];

const songs = [
  { name: '50-nam-ve-sau.mid', bpm: 74, patterns: p50Nam, bars: 32 },
  { name: 'bai-thanh-ca-buon.mid', bpm: 68, patterns: pThanhCa, bars: 32 },
  { name: 'close-to-you.mid', bpm: 88, patterns: pCloseToYou, bars: 32 },
  { name: 'golden-hour.mid', bpm: 94, patterns: pGoldenHour, bars: 36 },
  { name: 'haru-haru.mid', bpm: 82, patterns: pHaruHaru, bars: 32 },
  { name: 'ill-never-love-again.mid', bpm: 70, patterns: pNeverLove, bars: 32 },
  { name: 'imagine.mid', bpm: 76, patterns: pImagine, bars: 32 },
  { name: 'last-christmas.mid', bpm: 108, patterns: pLastChristmas, bars: 36 },
  { name: 'proud-of-you.mid', bpm: 78, patterns: pProudOfYou, bars: 32 },
  { name: 'su-thanh-hoa.mid', bpm: 76, patterns: pSuThanhHoa, bars: 32 },
  { name: 'vet-mua.mid', bpm: 80, patterns: pVetMua, bars: 32 },
  { name: 'dandelions-promise.mid', bpm: 72, patterns: pDandelion, bars: 32 },
];

songs.forEach((s) => {
  const filePath = path.join(OUT_DIR, s.name);
  const bytes = buildExpressivePianoMidi(s);
  fs.writeFileSync(filePath, bytes);
  console.log(`Generated MIDI: ${s.name} (${bytes.length} bytes)`);
});
