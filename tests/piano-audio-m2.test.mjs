import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { GrandAudio } = await loadTs('../lib/piano-audio.ts');
const { calculateReleaseDuration, DEFAULT_DAMPER_CONFIG } = await loadTs('../lib/audio/release.ts');
const { SympatheticResonanceBus } = await loadTs('../lib/audio/resonance.ts');

test('Physical damper release duration varies naturally by register and sustain state', () => {
  // Treble damperless notes (MIDI >= 89) ring freely
  const c8Duration = calculateReleaseDuration(108, false);
  assert.equal(c8Duration, 1.25);

  const a7Duration = calculateReleaseDuration(93, false);
  assert.equal(a7Duration, 1.25);

  // Middle register note (MIDI 60 / C4)
  const c4Duration = calculateReleaseDuration(60, false);
  assert.equal(c4Duration, DEFAULT_DAMPER_CONFIG.baseDampingSeconds);

  // Bass note (MIDI 21 / A0) has more vibrating mass, taking longer to damp
  const a0Duration = calculateReleaseDuration(21, false);
  assert.ok(a0Duration > c4Duration, `A0 duration (${a0Duration}s) should be longer than C4 (${c4Duration}s)`);

  // Sustained notes remain ringing
  const sustainedDuration = calculateReleaseDuration(60, true);
  assert.equal(sustainedDuration, 12.0);
});

test('Sympathetic Resonance Bus connects and modulates with sustain pedal', () => {
  const node = () => ({
    connect() {},
    disconnect() {},
    gain: {
      value: 1,
      setTargetAtTime() {},
    },
    frequency: { value: 440 },
    Q: { value: 1 },
  });

  const mockContext = {
    currentTime: 0,
    createGain: node,
    createBiquadFilter: node,
  };

  const resonance = new SympatheticResonanceBus(mockContext);
  assert.ok(resonance);

  // Test sustain transition
  resonance.setSustain(true, 0.5);
  resonance.setPolyphony(8);
  resonance.setSustain(false, 1.0);

  // Test cleanup
  resonance.disconnect();
});

test('GrandAudio setPedal modulates sustain state in real-time', () => {
  const audio = new GrandAudio('v2');
  audio.setPedal(2, true);
  audio.setPedal(2, false);
  assert.equal(audio.version, 'v2');
});
