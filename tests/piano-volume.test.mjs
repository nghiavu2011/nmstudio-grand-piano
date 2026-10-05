import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { GrandAudio } = await loadTs('../lib/piano-audio.ts');
const { volumeToMasterGain, AUDIO_V2_GAIN_CONFIG } = await loadTs('../lib/audio/gain-staging.ts');

test('Audio V2 calibrated master gain staging and volume clamping', () => {
  const audio = new GrandAudio('v2');
  let gain = 0;
  audio.context = { currentTime: 0 };
  audio.master = { gain: { setTargetAtTime: (value) => { gain = value; } } };

  // V2 Calibrated tests
  audio.setVolume(1.0);
  assert.equal(gain, AUDIO_V2_GAIN_CONFIG.nominalGain);

  audio.setVolume(0);
  assert.equal(gain, 0);

  audio.setVolume(-0.5);
  assert.equal(gain, 0);

  audio.setVolume(1.5);
  assert.equal(gain, AUDIO_V2_GAIN_CONFIG.nominalGain);

  audio.setVolume(0.5);
  assert.equal(gain, volumeToMasterGain(0.5));
});

test('Audio V1 legacy fallback volume mapping preserves A/B compatibility', () => {
  const audio = new GrandAudio('v1');
  let gain = 0;
  audio.context = { currentTime: 0 };
  audio.master = { gain: { setTargetAtTime: (value) => { gain = value; } } };

  for (const [volume, expected] of [[0.5, 1.7], [1.0, 3.4], [0, 0], [-1, 0], [2, 3.4]]) {
    audio.setVolume(volume);
    assert.equal(gain, expected);
  }
});
