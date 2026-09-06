import test from 'node:test';
import assert from 'node:assert/strict';
import { midiFixture, fixturePieces as REPERTOIRE } from './midi-fixture.mjs';
import { loadTs } from './load-ts.mjs';
const { measuresFor, voicesFor, beatTime, layoutMeasures, tempoAt } = await loadTs('../lib/piano-notation.ts');
const { parsePianoMidi } = await loadTs('../lib/piano-score.ts');
for (const piece of REPERTOIRE) test(`${piece.title}: every bar is filled and every written note retains its quantized duration`, () => {
  const score = parsePianoMidi(midiFixture(piece.variant),piece.title);
  const bars = measuresFor(score);
  const totals = new Map();
  for (const bar of bars) for (const low of [false,true]) for (const fragments of voicesFor(bar,low)) {
    assert.equal(fragments[0].start,bar.start);
    assert.equal(fragments.at(-1).end,bar.end);
    fragments.forEach((f,i) => {
      if (i) assert.equal(f.start,fragments[i-1].end);
      f.notes.forEach(n => totals.set(n.id,(totals.get(n.id) ?? 0) + f.end - f.start));
    });
  }
  const notes = new Map(bars.flatMap(b => b.notes.map(n => [n.id,n])));
  assert.equal(notes.size,score.noteCount);
  for (const n of notes.values()) assert.ok(Math.abs(totals.get(n.id) - (n.end-n.start)) < 1e-7);
  for (const t of score.notation.tempos) assert.ok(Math.abs(beatTime(score,t.beat)-t.time) < 1e-7);
});
test('MIDI preserves key signatures, changing meter and pedal beats', () => {
  const score = parsePianoMidi(midiFixture(),'Synthetic fixture');
  assert.ok(score.notation.keys.some(k => k.key === -4));
  assert.ok(score.notation.meters.some(m => m.numerator === 3));
  assert.ok(score.events.filter(e => e.type === 'pedal').every(e => Number.isFinite(e.beat)));
});
for (const piece of REPERTOIRE) test(`${piece.title}: density pagination preserves all bars, timings and playback data`, () => {
  const score = parsePianoMidi(midiFixture(piece.variant),piece.title);
  const before = JSON.stringify(score);
  const bars = measuresFor(score), pages = layoutMeasures(bars);
  assert.deepEqual(pages.flatMap(p => p.systems.flatMap(s => s.bars)),bars);
  assert.equal(JSON.stringify(score),before);
  pages.forEach((p,i) => {
    assert.equal(p.start,beatTime(score,p.systems[0].bars[0].start));
    if (i) assert.ok(p.start > pages[i-1].start);
    assert.ok(p.systems.length <= 4);
    for (const s of p.systems) {
      assert.ok(s.bars.length <= 4);
      assert.ok(s.weights.every(w => w > 0));
      for (const b of s.bars) assert.deepEqual([b.key,b.minor,b.numerator,b.denominator],[s.bars[0].key,s.bars[0].minor,s.bars[0].numerator,s.bars[0].denominator]);
    }
  });
  assert.equal(Math.round(tempoAt(score, 0)),150, 'Actual beat-zero tempo overrides the synthetic 120 BPM default');
});
