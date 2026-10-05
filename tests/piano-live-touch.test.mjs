import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { LiveNoteController } = await loadTs('../lib/live-note-controller.ts');
const { trimLeadingSilence, GrandAudio } = await loadTs('../lib/piano-audio.ts');
const { PianoTransport } = await loadTs('../lib/piano-transport.ts');
const { PianoState } = await loadTs('../lib/piano-state.ts');

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
if (!globalThis.document) {
  const events = new EventTarget();
  globalThis.document = events;
  document.hidden = false;
}

test('LiveNoteController: single tap triggers immediate noteOn with normalized velocity', () => {
  const events = [];
  const controller = new LiveNoteController({
    noteOn: (midi, source, velocity) => events.push({ type: 'on', midi, source, velocity }),
    noteOff: (midi, source) => events.push({ type: 'off', midi, source }),
  });

  controller.pointerDown(1, 60, 'ui');
  assert.equal(events.length, 1);
  assert.equal(events[0].midi, 60);
  assert.equal(events[0].source, 'ui:1');
  assert.ok(events[0].velocity >= 0.7);

  controller.pointerUp(1);
  assert.equal(events.length, 2);
  assert.equal(events[1].type, 'off');
  assert.equal(events[1].midi, 60);
  assert.equal(events[1].source, 'ui:1');
});

test('LiveNoteController: pen pressure normalization clamps between 0.35 and 0.98', () => {
  assert.equal(LiveNoteController.normalizePressure(0.1), 0.35);
  assert.equal(LiveNoteController.normalizePressure(0.5), 0.5 * 1.15);
  assert.equal(LiveNoteController.normalizePressure(1.0), 0.98);
  assert.equal(LiveNoteController.normalizePressure(undefined, 0.78), 0.78);
});

test('LiveNoteController: natural glissando release duration scales from bass (140ms) to treble (60ms)', () => {
  const bass = LiveNoteController.getGlissandoReleaseDuration(21); // A0
  const mid = LiveNoteController.getGlissandoReleaseDuration(60);  // C4
  const treble = LiveNoteController.getGlissandoReleaseDuration(108); // C8

  assert.equal(bass, 140);
  assert.equal(treble, 60);
  assert.ok(mid < 140 && mid > 60);
});

test('LiveNoteController: glissando swipe across keys triggers intermediate notes and handles release', async () => {
  const events = [];
  const controller = new LiveNoteController({
    noteOn: (midi, source, velocity) => events.push({ type: 'on', midi, source, velocity }),
    noteOff: (midi, source) => events.push({ type: 'off', midi, source }),
  });

  // Pointer down on C4 (MIDI 60)
  controller.pointerDown(1, 60, 'ui');
  assert.equal(events.length, 1);
  assert.equal(events[0].midi, 60);

  // Fast swipe to E4 (MIDI 64): crossed keys are 61, 62, 63, 64
  controller.pointerMove(1, 64, 'ui');

  // Wait for glissando micro-spread timers to resolve
  await new Promise((resolve) => setTimeout(resolve, 80));

  const noteOns = events.filter((e) => e.type === 'on');
  const midiList = noteOns.map((e) => e.midi);

  assert.deepEqual(midiList, [60, 61, 62, 63, 64]);
  assert.equal(controller.getCurrentMidi(1), 64);

  // Clean up
  controller.releaseAll();
});

test('trimLeadingSilence: removes leading silent samples and applies smooth pre-roll ramp', () => {
  // Mock BaseAudioContext
  const mockContext = {
    createBuffer(channels, length, sampleRate) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData(ch) {
          return channelData[ch];
        },
      };
    },
  };

  const sampleRate = 44100;
  const totalLength = 4410; // 100ms
  const silentSamples = 441; // 10ms of initial silence

  const rawBuffer = {
    numberOfChannels: 1,
    length: totalLength,
    sampleRate,
    getChannelData() {
      const data = new Float32Array(totalLength);
      for (let i = silentSamples; i < totalLength; i++) {
        data[i] = 0.5; // active audio
      }
      return data;
    },
  };

  const trimmed = trimLeadingSilence(rawBuffer, mockContext, 0.0015, 1.5);
  // Pre-roll for 1.5ms at 44.1kHz is ~66 samples
  // So trimStart should be approx 441 - 66 = 375 samples
  assert.ok(trimmed.length < totalLength);
  assert.ok(trimmed.length > totalLength - silentSamples);

  // Check smooth micro-ramp at head (channel 0, first few samples)
  const destData = trimmed.getChannelData(0);
  assert.equal(destData[0], 0);
});

test('GrandAudio: LIVE vs DEMO profile switching and transport lifecycle integration', () => {
  const audio = new GrandAudio();
  assert.equal(audio.profile, 'live');

  audio.setProfile('demo');
  assert.equal(audio.profile, 'demo');
  assert.equal(audio.metrics().profile, 'demo');

  audio.setProfile('live');
  assert.equal(audio.profile, 'live');
  assert.equal(audio.metrics().profile, 'live');

  // Verify transport switches profile
  const state = new PianoState({ attack() {}, release() {}, silence() {} });
  const transport = new PianoTransport(audio, state);

  const dummyScore = {
    title: 'Test',
    duration: 1.0,
    voices: [],
    events: [],
    warnings: [],
  };

  // Mock AudioContext for headless node test environment
  audio.context = {
    currentTime: 0,
    state: 'running',
    close: () => Promise.resolve(),
    createBufferSource: () => ({ connect: () => {}, start: () => {}, stop: () => {} }),
    createGain: () => ({ connect: () => {}, gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
    createBiquadFilter: () => ({ connect: () => {}, frequency: { value: 20000 }, Q: { value: 0.2 } }),
    createStereoPanner: () => ({ connect: () => {}, pan: { value: 0 } }),
  };

  transport.play(dummyScore, () => {}, () => {}, 0, 0);
  assert.equal(audio.profile, 'demo');

  transport.stop();
  assert.equal(audio.profile, 'live');

  audio.dispose();
});
