import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { GrandAudio } = await loadTs('../lib/piano-audio.ts');
const {
  SAMPLE_MANIFEST,
  selectClosestSample,
  midiToNoteName,
} = await loadTs('../lib/audio/sample-manifest.ts');
const {
  normalizeVelocity,
  velocityToLayer,
  velocityToAmplitude,
  velocityToAcousticFilter,
} = await loadTs('../lib/audio/velocity.ts');
const {
  volumeToMasterGain,
  AUDIO_V2_GAIN_CONFIG,
} = await loadTs('../lib/audio/gain-staging.ts');

test('Velocity normalization and bounding', () => {
  assert.equal(normalizeVelocity(0), 0.001);
  assert.equal(normalizeVelocity(-5), 0.001);
  assert.equal(normalizeVelocity(1.0), 1.0);
  assert.equal(normalizeVelocity(1.5), 1.0);
  // MIDI 1-127 normalization
  assert.equal(normalizeVelocity(127), 1.0);
  assert.equal(Math.round(normalizeVelocity(64) * 127), 64);
});

test('Velocity layer resolution across dynamic zones (pp, p, mf, f, ff)', () => {
  assert.equal(velocityToLayer(0.1), 'pp');
  assert.equal(velocityToLayer(0.24), 'pp');
  assert.equal(velocityToLayer(0.35), 'p');
  assert.equal(velocityToLayer(0.44), 'p');
  assert.equal(velocityToLayer(0.55), 'mf');
  assert.equal(velocityToLayer(0.68), 'mf');
  assert.equal(velocityToLayer(0.75), 'f');
  assert.equal(velocityToLayer(0.86), 'f');
  assert.equal(velocityToLayer(0.95), 'ff');
  assert.equal(velocityToLayer(1.0), 'ff');
});

test('Velocity to amplitude curve generates expressive dynamic headroom', () => {
  const ppAmp = velocityToAmplitude(0.1, 'normal');
  const mfAmp = velocityToAmplitude(0.6, 'normal');
  const ffAmp = velocityToAmplitude(1.0, 'normal');

  assert.ok(ppAmp > 0.05 && ppAmp < 0.25, `ppAmp ${ppAmp} in reasonable range`);
  assert.ok(mfAmp > 0.40 && mfAmp < 0.70, `mfAmp ${mfAmp} in reasonable range`);
  assert.ok(ffAmp >= 0.95 && ffAmp <= 1.05, `ffAmp ${ffAmp} near unity`);
  assert.ok(ppAmp < mfAmp && mfAmp < ffAmp, 'monotonic dynamic progression');

  // Test soft and hard curve variants
  const softAmp = velocityToAmplitude(0.5, 'soft');
  const hardAmp = velocityToAmplitude(0.5, 'hard');
  assert.ok(hardAmp > softAmp, 'hard curve produces more initial amplitude than soft curve');
});

test('Closest sample selection calculates accurate pitch shifts and layer fallbacks', () => {
  // Middle C (C4 = MIDI 60)
  const c4 = selectClosestSample(60, 'mf', SAMPLE_MANIFEST);
  assert.equal(c4.entry.midi, 60);
  assert.equal(c4.entry.note, 'C4');
  assert.equal(c4.pitchShiftSemitones, 0);

  // C#4 (MIDI 61) should resolve to C4 (+1 semitone) or Ds4 (-2 semitones)
  const cs4 = selectClosestSample(61, 'f', SAMPLE_MANIFEST);
  assert.ok(cs4.entry.midi === 60 || cs4.entry.midi === 63);
  assert.equal(Math.abs(cs4.pitchShiftSemitones) <= 2, true);

  // Fallback when requesting missing layer in partial manifest
  const partialManifest = [
    {
      midi: 60,
      note: 'C4',
      layers: { mf: '/audio/C4.mp3' },
    },
  ];
  const fallback = selectClosestSample(60, 'pp', partialManifest);
  assert.equal(fallback.layer, 'mf');
  assert.equal(fallback.url, '/audio/C4.mp3');
});

test('Acoustic harmonic filter expands with velocity and una corda response', () => {
  const softFilter = velocityToAcousticFilter(0.8, true, 60);
  const normalFilter = velocityToAcousticFilter(0.8, false, 60);

  assert.ok(normalFilter.frequency > softFilter.frequency, 'Una corda should be darker than normal strike');
  assert.ok(normalFilter.frequency <= 20000, 'Filter cutoff clamped under Nyquist ceiling');
});

test('GrandAudio engine A/B version switching and metrics', () => {
  const audioV2 = new GrandAudio('v2');
  assert.equal(audioV2.version, 'v2');
  assert.equal(audioV2.metrics().version, 'v2');

  const audioV1 = new GrandAudio('v1');
  assert.equal(audioV1.version, 'v1');
  assert.equal(audioV1.metrics().version, 'v1');

  audioV1.setEngineVersion('v2');
  assert.equal(audioV1.version, 'v2');
});
