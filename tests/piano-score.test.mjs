import test from 'node:test';
import assert from 'node:assert/strict';
import { midiFixture } from './midi-fixture.mjs';
import { createHash } from 'node:crypto';
import { parseMidi, writeMidi } from 'midi-file';
import * as Three from 'three';
import { loadTs } from './load-ts.mjs';
const { parsePianoMidi, originalScore } = await loadTs('../lib/piano-score.ts');
const { KEY_LAYOUT, midiFrequency, noteName } = await loadTs('../lib/music.ts');
const { GrandAudio } = await loadTs('../lib/piano-audio.ts');
const bytes = midiFixture();
const fixture = (events, tempoTrack = [], format = 1) =>
  Uint8Array.from(
    writeMidi({
      header: { format, numTracks: 2, ticksPerBeat: 480 },
      tracks: [tempoTrack, events],
    }),
  );
const on = (midi, deltaTime = 0) => ({
  type: 'noteOn',
  noteNumber: midi,
  velocity: 100,
  channel: 0,
  deltaTime,
});
const off = (midi, deltaTime) => ({
  type: 'noteOff',
  noteNumber: midi,
  velocity: 0,
  channel: 0,
  deltaTime,
});
const cc = (controllerType, value, deltaTime) => ({
  type: 'controller',
  controllerType,
  value,
  channel: 0,
  deltaTime,
});

test('88-key layout: middle C is key 40 / white key 24', () => {
  assert.equal(KEY_LAYOUT.length, 88);
  assert.equal(KEY_LAYOUT.filter((k) => !k.black).length, 52);
  assert.equal(KEY_LAYOUT[39].midi, 60);
  assert.equal(KEY_LAYOUT[39].whiteIndex, 23);
  assert.equal(noteName(60), 'C4');
  assert.ok(Math.abs(midiFrequency(60) - 261.6255653) < 1e-6);
  assert.equal(midiFrequency(69), 440);
});
test('Pianist camera projects all pitches ascending left to right', () => {
  const camera = new Three.PerspectiveCamera(37, 16 / 9, 0.035, 80);
  camera.position.set(0, 1.62, -2.65);
  camera.lookAt(0, 0.835, -0.9);
  camera.updateMatrixWorld();
  const positions = KEY_LAYOUT.map(
    (k) => new Three.Vector3(-k.x, 0.85, -1.12).project(camera).x,
  );
  for (let i = 1; i < positions.length; i++)
    assert.ok(positions[i] > positions[i - 1]);
  assert.ok(positions[39] < 0);
});
test('Default tempo preserves 500ms quarter note', () => {
  const s = parsePianoMidi(fixture([on(60), off(60, 480)]), 'test.mid');
  assert.equal(s.voices[0].release, 0.5);
  assert.equal(s.title, 'test');
});
test('A held note integrates a mid-note tempo change without quantizing', () => {
  const s = parsePianoMidi(
    fixture(
      [on(60), off(60, 960)],
      [
        { type: 'setTempo', deltaTime: 0, microsecondsPerBeat: 500000 },
        { type: 'setTempo', deltaTime: 480, microsecondsPerBeat: 1000000 },
      ],
    ),
    'tempo',
  );
  assert.equal(s.voices[0].release, 1.5);
  assert.equal(s.tempoChanges, 2);
});
test('Sustain changes acoustic duration without changing key-off time', () => {
  const s = parsePianoMidi(
    fixture([on(60), cc(64, 127, 120), off(60, 120), cc(64, 0, 480)]),
    'pedal',
  );
  assert.equal(s.events.find((e) => e.type === 'off').time, 0.25);
  assert.equal(s.voices[0].release, 0.75);
});
test('Sostenuto captures only keys down at the pedal edge', () => {
  const s = parsePianoMidi(
    fixture([
      on(60),
      cc(66, 127, 120),
      on(64, 120),
      off(60, 120),
      off(64, 120),
      cc(66, 0, 480),
    ]),
    'sost',
  );
  assert.equal(s.voices[0].release, 1);
  assert.equal(s.voices[1].release, 0.5);
});
test('Soft pedal preserves MIDI velocity and changes only timbre', () => {
  const s = parsePianoMidi(
    fixture([cc(67, 127, 0), on(60), off(60, 480)]),
    'soft',
  );
  assert.equal(s.voices[0].soft, true);
  assert.equal(s.voices[0].velocity, 100 / 127);
});
test('Repeated overlapping pitches retrigger without truncating the new note', () => {
  const s = parsePianoMidi(
    fixture([on(60), on(60, 240), off(60, 240), off(60, 240)]),
    'repeat',
  );
  assert.equal(s.voices.length, 2);
  assert.equal(s.voices[0].release, 0.25);
  assert.equal(s.voices[1].release, 0.75);
});
test('Simultaneous note then sostenuto order is preserved', () => {
  const s = parsePianoMidi(
    fixture([on(60), cc(66, 127, 0), off(60, 120), cc(66, 0, 120)]),
    'same-tick',
  );
  assert.equal(s.voices[0].release, 0.25);
});
test('MIDI rejects out-of-range notes instead of transposing them', () => {
  assert.throws(
    () => parsePianoMidi(fixture([on(20), off(20, 480)]), 'bad'),
    /A0/,
  );
});
test('MIDI rejects unmatched releases and dangling notes', () => {
  assert.throws(() => parsePianoMidi(fixture([off(60, 480)]), 'bad'), /未配对/);
  assert.throws(() => parsePianoMidi(fixture([on(60)]), 'bad'), /缺失/);
});
test('MIDI rejects asynchronous tracks, bad header and non-piano notes', () => {
  assert.throws(
    () => parsePianoMidi(fixture([on(60), off(60, 480)], [], 2), 'bad'),
    /Format/,
  );
  assert.throws(() => parsePianoMidi(new Uint8Array(20), 'bad'), /有效/);
  assert.throws(
    () =>
      parsePianoMidi(
        fixture([
          {
            type: 'programChange',
            deltaTime: 0,
            channel: 0,
            programNumber: 48,
          },
          on(60),
          off(60, 480),
        ]),
        'bad',
      ),
    /非钢琴/,
  );
});
test('Original demo remains available independently of MIDI import', () => {
  const s = originalScore();
  assert.equal(s.noteCount, 32);
  assert.equal(originalScore(3).noteCount, 96);
  assert.equal(s.voices[0].midi, 48);
  assert.equal(s.voices[0].release, 2.695);
});
test('Synthetic MIDI: every pitch, velocity, on/off and tempo checked against exact tick integration', () => {
  const file = parseMidi(bytes);
  const score = parsePianoMidi(bytes, 'Synthetic timing fixture');
  const tempos = [];
  file.tracks.forEach((track) => {
    let tick = 0;
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === 'setTempo')
        tempos.push({ tick, us: e.microsecondsPerBeat });
    }
  });
  tempos.sort((a, b) => a.tick - b.tick);
  const exactSeconds = (tick) => {
    let sum = 0n,
      previous = 0,
      us = 500000;
    for (const t of tempos) {
      if (t.tick > tick) break;
      sum += BigInt(t.tick - previous) * BigInt(us);
      previous = t.tick;
      us = t.us;
    }
    sum += BigInt(tick - previous) * BigInt(us);
    return Number(sum) / file.header.ticksPerBeat / 1e6;
  };
  const expected = [];
  file.tracks.forEach((track, ti) => {
    let tick = 0;
    const active = new Map();
    for (const e of track) {
      tick += e.deltaTime;
      const key = `${e.channel}:${e.noteNumber}`;
      if (e.type === 'noteOn' && e.velocity > 0) {
        const n = { midi: e.noteNumber, tick, ti, velocity: e.velocity / 127 };
        const q = active.get(key) || [];
        q.push(n);
        active.set(key, q);
        expected.push(n);
      } else if (e.type === 'noteOff' || (e.type === 'noteOn' && !e.velocity))
        active.get(key).shift().end = tick;
    }
  });
  expected.sort((a, b) => a.tick - b.tick || a.ti - b.ti);
  const ons = score.events.filter((e) => e.type === 'on');
  const offs = new Map(
    score.events.filter((e) => e.type === 'off').map((e) => [e.id, e]),
  );
  assert.equal(ons.length, 128);
  assert.equal(score.tempoChanges, 2);
  let maxError = 0;
  expected.forEach((n, i) => {
    assert.equal(ons[i].midi, n.midi);
    assert.equal(ons[i].velocity, n.velocity);
    maxError = Math.max(
      maxError,
      Math.abs(ons[i].time - exactSeconds(n.tick)),
      Math.abs(offs.get(ons[i].id).time - exactSeconds(n.end)),
    );
  });
  assert.ok(maxError < 1e-9);
  assert.equal(score.events.filter((e) => e.type === 'pedal').length, 2);
  console.log(
    JSON.stringify({
      file: 'synthetic fixture',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      notes: score.noteCount,
      tempoEvents: score.tempoChanges,
      pedalEvents: 2,
      duration: score.duration,
      maximumTimingErrorSeconds: maxError,
      range: [
        Math.min(...ons.map((e) => e.midi)),
        Math.max(...ons.map((e) => e.midi)),
      ],
    }),
  );
});
test('Sampler schedules exact start/release times and octave playback rates', () => {
  const log = [];
  const param = () => ({
    value: 1,
    setValueAtTime: (v, t) => log.push(['gain', v, t]),
    exponentialRampToValueAtTime: (v, t) => log.push(['ramp', v, t]),
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const sound = Object.create(GrandAudio.prototype);
  sound.context = {
    currentTime: 5,
    createBufferSource() {
      const n = {
        ...node(),
        playbackRate: param(),
        started: false,
        start(t) {
          this.started = true;
          log.push(['start', t, this.playbackRate.value]);
        },
        stop(t) {
          assert.ok(this.started);
          log.push(['stop', t]);
        },
      };
      return n;
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
  };
  sound.status = 'ready';
  sound.buffers = new Map([[60, {}]]);
  sound.voices = new Map();
  sound.nextId = 0;
  sound.input = node();
  sound.scheduleNote(
    { midi: 61, time: 0.25, release: 1.75, velocity: 0.7, soft: false },
    10,
  );
  assert.deepEqual(
    log.find((e) => e[0] === 'start'),
    ['start', 10.25, 2 ** (1 / 12)],
  );
  assert.equal(log.find((e) => e[0] === 'gain')[2], 11.75);
  assert.equal(log.find((e) => e[0] === 'stop')[1], 11.9);
});
