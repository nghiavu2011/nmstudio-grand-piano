import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { PianoState } = await loadTs('../lib/piano-state.ts');
const { PianoTransport } = await loadTs('../lib/piano-transport.ts');
const events = new EventTarget();
globalThis.document = events;
document.hidden = false;
let draw;
globalThis.requestAnimationFrame = fn => { draw = fn; return 1; };
globalThis.cancelAnimationFrame = () => {};

test('Manual unison notes and pedals coexist with a separately scheduled demo', () => {
  let attacks = 0, releases = 0;
  const manual = new PianoState({ attack() { attacks++; }, release() { releases++; }, silence() {} });
  const demo = new PianoState({ attack() {}, release() {}, silence() {} });
  const scheduled = [];
  const audio = { context: { currentTime: 10 }, cancelScore() {}, scheduleNote(n, origin) { scheduled.push({n, origin}); } };
  const transport = new PianoTransport(audio, demo);
  const score = { duration: 12, voices: [{ midi: 60, time: 0, release: 10, velocity: .8 }], events: [{ type: 'on', midi: 60, time: 0, velocity: .8, id: 'demo:0' }] };
  try {
    transport.play(score, () => {}, () => {}, 0);
    draw();
    manual.noteOn(60, 'key:KeyA');
    manual.pedal(2, true, 'key:Space');
    manual.noteOff(60, 'key:KeyA');
    manual.pedal(2, false, 'key:Space');
    assert.equal(attacks, 1);
    assert.equal(releases, 1);
    assert.ok(demo.held.has(60));
    assert.ok(transport.playing);
    manual.allOff();
    assert.ok(transport.playing, 'focus cleanup must not stop the score');
    assert.equal(scheduled.length, 1);
  } finally { transport.stop(); }
});

test('Hiding the page queues the remaining score and resumes visuals from audio time', () => {
  const scheduled = [];
  const audio = { context: { currentTime: 10 }, cancelScore() {}, scheduleNote(n, origin) { scheduled.push({n, origin}); } };
  const demo = new PianoState({ attack() {}, release() {}, silence() {} });
  const transport = new PianoTransport(audio, demo);
  let position = 0;
  const score = { duration: 264, events: [], voices: [0, 20, 80, 200, 260].map(time => ({ midi: 60, time, release: time + 1, velocity: .8 })) };
  try {
    transport.play(score, p => { position = p; }, () => {}, 0);
    assert.equal(scheduled.length, 1);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(scheduled.length, 5);
    assert.ok(scheduled.every(v => v.origin === 10));
    audio.context.currentTime = 91;
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    draw();
    assert.equal(position, 81);
    assert.ok(transport.playing);
    assert.equal(scheduled.length, 5, 'returning must not replay queued notes');
  } finally { document.hidden = false; transport.stop(); }
});

test('Seek restores sustained notes and pedals; pause retains exact audio-clock position', () => {
  const scheduled = [];
  const audio = { context: { currentTime: 100 }, cancelScore() {}, scheduleNote(note, origin, offset) { scheduled.push({note, origin, offset}); } };
  const demo = new PianoState({ attack() {}, release() {}, silence() {} });
  let strikes = 0;
  demo.onStrike = () => { strikes++; };
  const transport = new PianoTransport(audio, demo);
  const score = {
    duration: 30,
    voices: [{ midi: 60, time: 1, release: 20, velocity: .8 }, { midi: 64, time: 2, release: 3, velocity: .8 }, { midi: 67, time: 12, release: 15, velocity: .8 }],
    events: [{ type: 'on', midi: 60, time: 1, velocity: .8, id: 'demo:0' }, { type: 'pedal', index: 2, down: true, time: 2, id: 'demo:pedal' }, { type: 'off', midi: 60, time: 4, id: 'demo:0' }],
  };
  try {
    transport.play(score, () => {}, () => {}, .15, 10);
    assert.deepEqual(scheduled.map(v => v.note.midi), [60, 67]);
    assert.equal(scheduled[0].offset, 10);
    assert.equal(scheduled[0].origin, 90.15);
    assert.ok(demo.pedals[2]);
    assert.ok(demo.sounding.has(60));
    assert.equal(demo.held.size, 0);
    assert.equal(strikes, 0, 'seek must not animate historical attacks');
    audio.context.currentTime = 103.15;
    assert.equal(transport.pause(), 13);
    assert.equal(transport.playing, false);
    transport.play(score, () => {}, () => {}, 0, transport.position);
    assert.equal(transport.position, 13);
  } finally { transport.stop(); }
});
