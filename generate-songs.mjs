import fs from 'node:fs';
import path from 'node:path';
import { writeMidi } from 'midi-file';

const PPQ = 480;

function createPieceMidi({ bpm = 80, timeSig = [4, 4], keySig = 0, notes }) {
  // notes: array of { note, timeBeat, durationBeat, velocity }
  // Sort notes by start time, and create on/off events
  const rawEvents = [];
  notes.forEach((n, idx) => {
    const startTick = Math.round(n.timeBeat * PPQ);
    const endTick = Math.max(startTick + 60, Math.round((n.timeBeat + n.durationBeat) * PPQ));
    rawEvents.push({ type: 'noteOn', tick: startTick, note: n.note, velocity: n.velocity || 75, id: idx });
    rawEvents.push({ type: 'noteOff', tick: endTick, note: n.note, velocity: 0, id: idx });
  });

  // Sort events chronologically. At the same tick, noteOff must come before noteOn for the same note,
  // or noteOn before noteOff for different notes.
  rawEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.note === b.note) {
      return a.type === 'noteOff' ? -1 : 1;
    }
    return 0;
  });

  // Calculate deltaTimes
  let lastTick = 0;
  const trackEvents = [];
  for (const ev of rawEvents) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    if (ev.type === 'noteOn') {
      trackEvents.push({
        type: 'noteOn',
        channel: 0,
        noteNumber: ev.note,
        velocity: ev.velocity,
        deltaTime: delta,
      });
    } else {
      trackEvents.push({
        type: 'noteOff',
        channel: 0,
        noteNumber: ev.note,
        velocity: 0,
        deltaTime: delta,
      });
    }
  }

  // Add end of track
  trackEvents.push({ type: 'endOfTrack', deltaTime: PPQ });

  const microsecondsPerBeat = Math.round(60_000_000 / bpm);
  const headerTrack = [
    { type: 'setTempo', deltaTime: 0, microsecondsPerBeat },
    { type: 'timeSignature', deltaTime: 0, numerator: timeSig[0], denominator: timeSig[1], metronome: 24, thirtyseconds: 8 },
    { type: 'keySignature', deltaTime: 0, key: keySig, scale: 0 },
    { type: 'programChange', channel: 0, programNumber: 0, deltaTime: 0 },
    { type: 'endOfTrack', deltaTime: PPQ * 2 },
  ];

  const midiData = writeMidi({
    header: { format: 1, numTracks: 2, ticksPerBeat: PPQ },
    tracks: [headerTrack, trackEvents],
  });

  return Buffer.from(midiData);
}

// 1. Canon in D (Johann Pachelbel)
function generateCanonInD() {
  const notes = [];
  const chords = [
    { bass: 38, triad: [62, 66, 69, 74] }, // D
    { bass: 45, triad: [61, 64, 69, 73] }, // A
    { bass: 47, triad: [62, 66, 71, 74] }, // Bm
    { bass: 42, triad: [61, 66, 69, 73] }, // F#m
    { bass: 43, triad: [59, 62, 67, 71] }, // G
    { bass: 38, triad: [57, 62, 66, 69] }, // D
    { bass: 43, triad: [59, 62, 67, 71] }, // G
    { bass: 45, triad: [61, 64, 69, 73] }, // A
  ];

  // 2 cycles of chords with arpeggiation
  let beat = 0;
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const c of chords) {
      // Bass note
      notes.push({ note: c.bass, timeBeat: beat, durationBeat: 3.8, velocity: 80 });
      // Arpeggiated accompaniment
      notes.push({ note: c.triad[0], timeBeat: beat, durationBeat: 1.8, velocity: 65 });
      notes.push({ note: c.triad[1], timeBeat: beat + 1, durationBeat: 1.8, velocity: 65 });
      notes.push({ note: c.triad[2], timeBeat: beat + 2, durationBeat: 1.8, velocity: 70 });
      notes.push({ note: c.triad[3], timeBeat: beat + 3, durationBeat: 1.8, velocity: 75 });
      beat += 4;
    }
  }

  // Canon Melody in cycle 2
  const melody = [
    { n: 74, d: 2 }, { n: 73, d: 2 }, { n: 71, d: 2 }, { n: 69, d: 2 },
    { n: 67, d: 2 }, { n: 66, d: 2 }, { n: 67, d: 2 }, { n: 69, d: 2 },
    // Running 8th notes
    { n: 74, d: 0.5 }, { n: 76, d: 0.5 }, { n: 78, d: 0.5 }, { n: 79, d: 0.5 },
    { n: 81, d: 1 }, { n: 78, d: 1 },
    { n: 76, d: 0.5 }, { n: 74, d: 0.5 }, { n: 73, d: 1 }, { n: 74, d: 2 }
  ];
  let melBeat = 32;
  for (const m of melody) {
    notes.push({ note: m.n, timeBeat: melBeat, durationBeat: m.d * 0.9, velocity: 85 });
    melBeat += m.d;
  }

  return createPieceMidi({ bpm: 72, timeSig: [4, 4], keySig: 2, notes });
}

// 2. Für Elise (Ludwig van Beethoven)
function generateFurElise() {
  const notes = [];
  // 3/8 time signature
  // Motif: E5 - D#5 - E5 - D#5 - E5 - B4 - D5 - C5 - A4
  const motif = [
    { n: 76, d: 0.5 }, { n: 75, d: 0.5 }, { n: 76, d: 0.5 }, { n: 75, d: 0.5 },
    { n: 76, d: 0.5 }, { n: 71, d: 0.5 }, { n: 74, d: 0.5 }, { n: 72, d: 0.5 },
    { n: 69, d: 1.5 },
  ];

  let b = 0;
  for (let rep = 0; rep < 2; rep++) {
    // Motif part 1
    for (const m of motif) {
      notes.push({ note: m.n, timeBeat: b, durationBeat: m.d * 0.9, velocity: 78 });
      b += m.d;
    }
    // Accompaniment Am
    notes.push({ note: 45, timeBeat: b - 1.5, durationBeat: 2.8, velocity: 70 });
    notes.push({ note: 52, timeBeat: b - 1.0, durationBeat: 1.2, velocity: 65 });
    notes.push({ note: 57, timeBeat: b - 0.5, durationBeat: 1.0, velocity: 65 });

    // Motif part 2
    const part2 = [
      { n: 60, d: 0.5 }, { n: 64, d: 0.5 }, { n: 69, d: 0.5 }, { n: 71, d: 1.5 },
    ];
    for (const m of part2) {
      notes.push({ note: m.n, timeBeat: b, durationBeat: m.d * 0.9, velocity: 78 });
      b += m.d;
    }
    // Accompaniment E
    notes.push({ note: 40, timeBeat: b - 1.5, durationBeat: 2.8, velocity: 70 });
    notes.push({ note: 47, timeBeat: b - 1.0, durationBeat: 1.2, velocity: 65 });
    notes.push({ note: 56, timeBeat: b - 0.5, durationBeat: 1.0, velocity: 65 });

    // Motif part 3
    const part3 = [
      { n: 64, d: 0.5 }, { n: 68, d: 0.5 }, { n: 71, d: 0.5 }, { n: 72, d: 1.5 },
    ];
    for (const m of part3) {
      notes.push({ note: m.n, timeBeat: b, durationBeat: m.d * 0.9, velocity: 78 });
      b += m.d;
    }
    // Accompaniment Am
    notes.push({ note: 45, timeBeat: b - 1.5, durationBeat: 2.8, velocity: 70 });
    notes.push({ note: 52, timeBeat: b - 1.0, durationBeat: 1.2, velocity: 65 });
    notes.push({ note: 57, timeBeat: b - 0.5, durationBeat: 1.0, velocity: 65 });
  }

  return createPieceMidi({ bpm: 120, timeSig: [3, 8], keySig: 0, notes });
}

// 3. River Flows in You (Yiruma)
function generateRiverFlows() {
  const notes = [];
  const chords = [
    { bass: 45, arr: [57, 64, 69] }, // A
    { bass: 40, arr: [52, 59, 64] }, // E
    { bass: 42, arr: [54, 61, 66] }, // F#m
    { bass: 50, arr: [57, 62, 66] }, // D
  ];

  let b = 0;
  for (let loop = 0; loop < 2; loop++) {
    for (const c of chords) {
      notes.push({ note: c.bass, timeBeat: b, durationBeat: 3.8, velocity: 75 });
      notes.push({ note: c.arr[0], timeBeat: b + 0.5, durationBeat: 1.5, velocity: 60 });
      notes.push({ note: c.arr[1], timeBeat: b + 1.5, durationBeat: 1.5, velocity: 62 });
      notes.push({ note: c.arr[2], timeBeat: b + 2.5, durationBeat: 1.5, velocity: 65 });
      b += 4;
    }
  }

  // Melody
  const mel = [
    { n: 73, d: 0.5 }, { n: 74, d: 0.5 }, { n: 73, d: 1.0 }, { n: 74, d: 0.5 },
    { n: 73, d: 0.5 }, { n: 71, d: 1.0 }, { n: 69, d: 2.0 },
    { n: 69, d: 0.5 }, { n: 71, d: 0.5 }, { n: 73, d: 1.0 }, { n: 74, d: 1.0 },
    { n: 76, d: 2.0 },
    { n: 74, d: 0.5 }, { n: 73, d: 0.5 }, { n: 71, d: 1.0 }, { n: 69, d: 2.0 }
  ];
  let mb = 0;
  for (const m of mel) {
    notes.push({ note: m.n, timeBeat: mb, durationBeat: m.d * 0.9, velocity: 82 });
    mb += m.d;
  }

  return createPieceMidi({ bpm: 68, timeSig: [4, 4], keySig: 3, notes });
}

// 4. Bèo Dạt Mây Trôi (Dân ca Bắc Bộ Việt Nam)
function generateBeoDatMayTroi() {
  const notes = [];
  const chords = [
    { bass: 43, triad: [55, 59, 62] }, // G
    { bass: 40, triad: [52, 55, 59] }, // Em
    { bass: 48, triad: [55, 60, 64] }, // C
    { bass: 43, triad: [50, 55, 59] }, // G
  ];

  let b = 0;
  for (let loop = 0; loop < 2; loop++) {
    for (const c of chords) {
      notes.push({ note: c.bass, timeBeat: b, durationBeat: 3.8, velocity: 75 });
      notes.push({ note: c.triad[0], timeBeat: b + 1, durationBeat: 1.5, velocity: 60 });
      notes.push({ note: c.triad[1], timeBeat: b + 2, durationBeat: 1.5, velocity: 62 });
      notes.push({ note: c.triad[2], timeBeat: b + 3, durationBeat: 1.5, velocity: 65 });
      b += 4;
    }
  }

  // Melody: "Bèo dạt mây trôi, chốn xa xôi... Anh ơi, em vẫn đợi bèo dạt mây trôi"
  const mel = [
    { n: 67, d: 1.5 }, { n: 69, d: 1.0 }, { n: 71, d: 1.5 }, // Bèo dạt mây
    { n: 74, d: 3.0 },                                       // trôi
    { n: 71, d: 1.0 }, { n: 69, d: 1.0 }, { n: 67, d: 1.5 }, { n: 64, d: 2.5 }, // chốn xa xôi
    { n: 67, d: 1.0 }, { n: 64, d: 1.0 }, { n: 62, d: 4.0 },                     // vắng lặng
    // Ornament
    { n: 62, d: 0.5 }, { n: 64, d: 0.5 }, { n: 67, d: 1.0 }, { n: 69, d: 1.0 }, { n: 71, d: 3.0 },
    { n: 67, d: 4.0 }
  ];

  let mb = 0;
  for (const m of mel) {
    notes.push({ note: m.n, timeBeat: mb, durationBeat: m.d * 0.9, velocity: 84 });
    mb += m.d;
  }

  return createPieceMidi({ bpm: 64, timeSig: [4, 4], keySig: 1, notes });
}

// 5. Diễm Xưa (Trịnh Công Sơn)
function generateDiemXua() {
  const notes = [];
  // Key: D minor
  const chords = [
    { bass: 50, arr: [57, 62, 65] }, // Dm
    { bass: 45, arr: [57, 60, 64] }, // Am
    { bass: 46, arr: [58, 62, 65] }, // Bb
    { bass: 45, arr: [52, 57, 61] }, // A7
  ];

  let b = 0;
  for (let loop = 0; loop < 2; loop++) {
    for (const c of chords) {
      notes.push({ note: c.bass, timeBeat: b, durationBeat: 3.8, velocity: 74 });
      notes.push({ note: c.arr[0], timeBeat: b + 1, durationBeat: 1.5, velocity: 60 });
      notes.push({ note: c.arr[1], timeBeat: b + 2, durationBeat: 1.5, velocity: 62 });
      notes.push({ note: c.arr[2], timeBeat: b + 3, durationBeat: 1.5, velocity: 65 });
      b += 4;
    }
  }

  // "Mưa vẫn mưa bay trên tầng tháp cổ... Dài tay em mấy thuở mắt xanh xao"
  const mel = [
    { n: 62, d: 1.0 }, { n: 65, d: 1.0 }, { n: 67, d: 1.0 }, { n: 69, d: 2.0 },
    { n: 69, d: 0.5 }, { n: 67, d: 0.5 }, { n: 65, d: 1.0 }, { n: 64, d: 2.0 },
    { n: 62, d: 1.0 }, { n: 65, d: 1.0 }, { n: 67, d: 1.0 }, { n: 69, d: 1.5 },
    { n: 70, d: 0.5 }, { n: 69, d: 2.0 },
    { n: 67, d: 1.0 }, { n: 65, d: 1.0 }, { n: 64, d: 1.0 }, { n: 62, d: 3.0 }
  ];

  let mb = 0;
  for (const m of mel) {
    notes.push({ note: m.n, timeBeat: mb, durationBeat: m.d * 0.9, velocity: 82 });
    mb += m.d;
  }

  return createPieceMidi({ bpm: 72, timeSig: [4, 4], keySig: -1, notes });
}

// 6. Mẹ Yêu Con (Nguyễn Văn Tý)
function generateMeYeuCon() {
  const notes = [];
  // Key: C major (Dân ca ru con)
  const chords = [
    { bass: 36, arr: [48, 52, 55] }, // C
    { bass: 45, arr: [48, 52, 57] }, // Am
    { bass: 41, arr: [48, 53, 57] }, // F
    { bass: 43, arr: [47, 50, 55] }, // G
  ];

  let b = 0;
  for (let loop = 0; loop < 2; loop++) {
    for (const c of chords) {
      notes.push({ note: c.bass, timeBeat: b, durationBeat: 3.8, velocity: 72 });
      notes.push({ note: c.arr[0], timeBeat: b + 1, durationBeat: 1.5, velocity: 58 });
      notes.push({ note: c.arr[1], timeBeat: b + 2, durationBeat: 1.5, velocity: 60 });
      notes.push({ note: c.arr[2], timeBeat: b + 3, durationBeat: 1.5, velocity: 63 });
      b += 4;
    }
  }

  // "Khúc ru à ơi... Mẹ yêu con thương con biết mấy"
  const mel = [
    { n: 60, d: 1.0 }, { n: 64, d: 1.0 }, { n: 67, d: 2.0 },
    { n: 69, d: 1.0 }, { n: 67, d: 1.0 }, { n: 64, d: 2.0 },
    { n: 62, d: 1.0 }, { n: 64, d: 1.0 }, { n: 67, d: 1.5 }, { n: 69, d: 0.5 },
    { n: 72, d: 3.0 },
    { n: 69, d: 1.0 }, { n: 67, d: 1.0 }, { n: 64, d: 1.5 }, { n: 62, d: 0.5 },
    { n: 60, d: 4.0 }
  ];

  let mb = 0;
  for (const m of mel) {
    notes.push({ note: m.n, timeBeat: mb, durationBeat: m.d * 0.9, velocity: 80 });
    mb += m.d;
  }

  return createPieceMidi({ bpm: 66, timeSig: [4, 4], keySig: 0, notes });
}

// Generate all 6 files into public/midi/
const outDir = path.join(process.cwd(), 'public', 'midi');
fs.mkdirSync(outDir, { recursive: true });

const pieces = [
  { file: 'canon-in-d.mid', buf: generateCanonInD() },
  { file: 'fur-elise.mid', buf: generateFurElise() },
  { file: 'river-flows-in-you.mid', buf: generateRiverFlows() },
  { file: 'beo-dat-may-troi.mid', buf: generateBeoDatMayTroi() },
  { file: 'diem-xua.mid', buf: generateDiemXua() },
  { file: 'me-yeu-con.mid', buf: generateMeYeuCon() },
];

for (const p of pieces) {
  const filePath = path.join(outDir, p.file);
  fs.writeFileSync(filePath, p.buf);
  console.log(`Generated: ${p.file} (${p.buf.length} bytes)`);
}
