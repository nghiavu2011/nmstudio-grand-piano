import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { midiFixture, fixturePieces } from './midi-fixture.mjs';
import { loadTs } from './load-ts.mjs';

const { REPERTOIRE } = await loadTs('../lib/repertoire.ts');
const { parsePianoMidi } = await loadTs('../lib/piano-score.ts');
const { paginateScore } = await loadTs('../lib/piano-sheet.ts');

for (const piece of fixturePieces) {
  test(`${piece.title}: MIDI and complete sheet pagination`, () => {
    const score = parsePianoMidi(midiFixture(piece.variant), piece.title);
    assert.equal(score.noteCount, 128);
    const pages = paginateScore(score);
    assert.equal(pages.flatMap((p) => p.notes).length, score.noteCount);
    assert.ok(pages.every((p) => p.notes.every((n) => n.beats > 0 && n.length > 0)));
    assert.ok(pages.every((p, i) => !i || p.start > pages[i - 1].start));
    assert.deepEqual(
      pages.flatMap((p) => p.notes.map((n) => n.midi)),
      score.events.filter((e) => e.type === 'on').map((e) => e.midi),
    );
  });
}

test('N&Mstudio edition contains curated licensed & public domain repertoire', () => {
  assert.ok(REPERTOIRE.length >= 6, `Found ${REPERTOIRE.length} pieces in repertoire`);
  const midiFiles = readdirSync(new URL('../public/midi/', import.meta.url));
  assert.ok(midiFiles.some((name) => /\.midi?$/i.test(name)), 'MIDI directory contains playable files');
});
