import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
const source = await readFile(
  new URL('../lib/piano-state.ts', import.meta.url),
  'utf8',
);
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
});
const { PianoState, KEY_MAP, PEDAL_KEYS } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const results = [];
function test(name, fn) {
  try {
    const events = [];
    const p = new PianoState({
      attack: (...a) => events.push(['on', ...a]),
      release: (m) => events.push(['off', m]),
      silence: () => events.push(['silence']),
    });
    fn(p, events);
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
}
test('88 keys: A0 through C8 attack and release', (p) => {
  for (let m = 21; m <= 108; m++) {
    p.noteOn(m, 'a');
    assert(p.held.has(m));
    p.noteOff(m, 'a');
    assert(!p.held.has(m));
    assert(!p.sounding.has(m));
  }
});
test('Out-of-range and non-integer pitches rejected', (p, e) => {
  for (const m of [0, 20, 109, 128, 60.5, NaN, Infinity])
    p.noteOn(m, 'invalid');
  assert.equal(e.length, 0);
});
test('Keyboard auto-repeat is idempotent', (p, e) => {
  p.noteOn(60, 'key:A');
  p.noteOn(60, 'key:A');
  assert.equal(e.length, 1);
});
test('Two input sources own the same note independently', (p, e) => {
  p.noteOn(60, 'key:A');
  p.noteOn(60, 'mouse:1');
  p.noteOff(60, 'key:A');
  assert(p.held.has(60));
  assert(p.sounding.has(60));
  assert.equal(e.length, 1);
  p.noteOff(60, 'mouse:1');
  assert(!p.sounding.has(60));
});
test('Sustain keeps released notes sounding', (p, e) => {
  p.pedal(2, true, 'space');
  p.noteOn(60, 'a');
  p.noteOff(60, 'a');
  assert(!p.held.has(60));
  assert(p.sounding.has(60));
  assert(!e.some((x) => x[0] === 'off'));
  p.pedal(2, false, 'space');
  assert(!p.sounding.has(60));
});
test('Sustain release does not damp a physically held note', (p) => {
  p.pedal(2, true, 'space');
  p.noteOn(60, 'a');
  p.pedal(2, false, 'space');
  assert(p.sounding.has(60));
});
test('Sostenuto captures only already held notes', (p) => {
  p.noteOn(60, 'a');
  p.pedal(1, true, 'shift');
  p.noteOn(64, 'b');
  p.noteOff(60, 'a');
  p.noteOff(64, 'b');
  assert.deepEqual([...p.sounding], [60]);
  p.pedal(1, false, 'shift');
  assert.equal(p.sounding.size, 0);
});
test('Repeated sostenuto presses do not expand capture', (p) => {
  p.noteOn(60, 'a');
  p.pedal(1, true, 'shift');
  p.noteOn(64, 'b');
  p.pedal(1, true, 'shift');
  assert.deepEqual([...p.captured], [60]);
});
test('Sostenuto does not capture sustain-only notes', (p) => {
  p.pedal(2, true, 'space');
  p.noteOn(60, 'a');
  p.noteOff(60, 'a');
  p.pedal(1, true, 'shift');
  assert.equal(p.captured.size, 0);
  p.pedal(2, false, 'space');
  assert.equal(p.sounding.size, 0);
});
test('Sustain and sostenuto cooperate when either releases', (p) => {
  p.noteOn(60, 'a');
  p.pedal(1, true, 'shift');
  p.pedal(2, true, 'space');
  p.noteOff(60, 'a');
  p.pedal(2, false, 'space');
  assert(p.sounding.has(60));
  p.pedal(1, false, 'shift');
  assert(!p.sounding.has(60));
});
test('Pedal mouse and keyboard sources coexist', (p) => {
  p.pedal(2, true, 'space');
  p.pedal(2, true, 'touch');
  p.pedal(2, false, 'space');
  assert(p.pedals[2]);
  p.pedal(2, false, 'touch');
  assert(!p.pedals[2]);
});
test('Una corda changes new attack timbre, not note ownership', (p, e) => {
  p.pedal(0, true, 'soft');
  p.noteOn(60, 'a', 0.5);
  assert.deepEqual(e[0], ['on', 60, 0.5, true]);
  p.pedal(0, false, 'soft');
  assert(p.held.has(60));
});
test('Velocity is bounded', (p, e) => {
  p.noteOn(60, 'a', 2);
  p.noteOn(64, 'b', -0.3);
  assert.equal(e[0][2], 1);
  assert.equal(e[1][2], 0.1);
});
test('Source cleanup does not stop another performer', (p) => {
  p.noteOn(60, 'demo:a');
  p.noteOn(64, 'key:d');
  p.pedal(2, true, 'demo:p');
  p.releaseSource('demo:');
  assert.deepEqual([...p.held.keys()], [64]);
  assert.deepEqual([...p.sounding], [64]);
  assert(!p.pedals[2]);
});
test('All-off clears notes and every pedal', (p) => {
  p.noteOn(60, 'key:a');
  p.pedal(0, true, 's');
  p.pedal(1, true, 'r');
  p.pedal(2, true, 'p');
  p.allOff();
  assert.equal(p.held.size, 0);
  assert.equal(p.sounding.size, 0);
  assert.equal(p.captured.size, 0);
  assert.deepEqual(p.pedals, [false, false, false]);
});
test('Snapshot mutations do not change state', (p) => {
  p.noteOn(60, 'a');
  const s = p.snapshot();
  s.held.length = 0;
  s.pedals[2] = true;
  assert(p.held.has(60));
  assert(!p.pedals[2]);
});
test('Key mapping spans 20 unique consecutive notes', () => {
  assert.deepEqual(
    Object.values(KEY_MAP).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, i) => i),
  );
  assert.deepEqual(PEDAL_KEYS, { ShiftLeft: 0, ShiftRight: 1, Space: 2 });
});
test('Chord release and repeated reattack do not leave stuck voices', (p, e) => {
  for (let i = 0; i < 20; i++) {
    for (const m of [48, 60, 64, 67]) p.noteOn(m, `key:${m}`);
    p.pedal(2, true, 'space');
    for (const m of [48, 60, 64, 67]) p.noteOff(m, `key:${m}`);
    p.pedal(2, false, 'space');
  }
  assert.equal(p.sounding.size, 0);
  assert.equal(e.filter((x) => x[0] === 'on').length, 80);
  assert.equal(e.filter((x) => x[0] === 'off').length, 80);
});
test('Natural sample decay clears sounding state while key remains held', (p) => {
  p.noteOn(60, 'key:a');
  p.ended(60);
  assert(p.held.has(60));
  assert(!p.sounding.has(60));
});
console.log(
  JSON.stringify(
    {
      passed: results.filter((x) => x.pass).length,
      total: results.length,
      results,
    },
    null,
    2,
  ),
);
if (results.some((x) => !x.pass)) process.exitCode = 1;
