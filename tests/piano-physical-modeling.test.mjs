import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const {
  calculateDynamicTimbreExcitation,
  calculateStringInharmonicity,
  MechanicalActionEngine,
} = await loadTs('../lib/audio/physical-modeling.ts');
const { REPERTOIRE_REGISTRY } = await loadTs('../lib/piano-repertoire.ts');

test('calculateDynamicTimbreExcitation: non-linear velocity to brightness and harmonic boost', () => {
  const pp = calculateDynamicTimbreExcitation(0.1);
  const mf = calculateDynamicTimbreExcitation(0.6);
  const ff = calculateDynamicTimbreExcitation(1.0);

  // Pianissimo: soft, low cutoff, negative/subtle boost
  assert.ok(pp.brightnessCutoff < 5000);
  assert.ok(pp.harmonicBoostDb <= 0);

  // Fortissimo: high cutoff, intense harmonic excitation
  assert.ok(ff.brightnessCutoff >= 19000);
  assert.ok(ff.harmonicBoostDb > 5.0);

  // Monotonic increase
  assert.ok(ff.brightnessCutoff > mf.brightnessCutoff);
  assert.ok(mf.brightnessCutoff > pp.brightnessCutoff);
  assert.ok(ff.transientSharpness > pp.transientSharpness);
});

test('calculateStringInharmonicity: realistic grand piano string stiffness profile', () => {
  const bass = calculateStringInharmonicity(21);   // A0
  const middleC = calculateStringInharmonicity(60); // C4
  const highTreble = calculateStringInharmonicity(108); // C8

  assert.ok(bass > middleC);
  assert.ok(highTreble > middleC);
  assert.ok(middleC >= 0.0001 && middleC <= 0.0005);
});

test('Repertoire contains the 14 requested pieces with valid MIDI file references', () => {
  assert.equal(REPERTOIRE_REGISTRY.length, 15); // 14 pieces + Atelier Prelude

  const ids = REPERTOIRE_REGISTRY.map((p) => p.id);
  assert.ok(ids.includes('50-nam-ve-sau'));
  assert.ok(ids.includes('bai-thanh-ca-buon'));
  assert.ok(ids.includes('vet-mua'));
  assert.ok(ids.includes('close-to-you'));
  assert.ok(ids.includes('golden-hour'));
  assert.ok(ids.includes('ill-never-love-again'));
  assert.ok(ids.includes('imagine'));
  assert.ok(ids.includes('last-christmas'));
  assert.ok(ids.includes('proud-of-you'));
  assert.ok(ids.includes('haru-haru'));
  assert.ok(ids.includes('su-thanh-hoa'));
  assert.ok(ids.includes('dandelions-promise'));
  assert.ok(ids.includes('interstellar'));
  assert.ok(ids.includes('merry-go-round'));

  REPERTOIRE_REGISTRY.forEach((p) => {
    assert.ok(p.title.length > 0);
    assert.ok(p.composer.length > 0);
    assert.ok(p.file.length > 0);
    assert.equal(p.hasPerformance, true);
  });
});
