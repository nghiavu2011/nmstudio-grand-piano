import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { GrandAudio } = await loadTs('../lib/piano-audio.ts');
test('New 50 percent equals the previous full-volume gain; mute and clamp remain valid', () => {
  const audio = new GrandAudio();
  let gain;
  audio.context = {currentTime:0};
  audio.master = {gain:{setTargetAtTime:value => { gain = value; }}};
  for (const [volume,expected] of [[.5,1.7],[1,3.4],[0,0],[-1,0],[2,3.4]]) {
    audio.setVolume(volume);
    assert.equal(gain,expected);
  }
});
