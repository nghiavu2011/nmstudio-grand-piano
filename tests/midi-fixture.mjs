import { writeMidi } from 'midi-file';

// Synthetic, non-musical sequences exercise timing without private arrangements.
export const fixturePieces = Array.from({ length: 5 }, (_, variant) => ({
  id: `fixture-${variant}`, title: `Synthetic sequence ${variant}`, variant,
}));
export function midiFixture(variant = 0) {
  const events = [];
  for (let i = 0; i < 128; i++) {
    const noteNumber = 36 + ((i * 13 + variant * 7) % 48);
    events.push({ type: 'noteOn', channel: 0, noteNumber, velocity: 40 + i % 80, deltaTime: 0 });
    events.push({ type: 'noteOff', channel: 0, noteNumber, velocity: 0, deltaTime: 120 + variant * 120 });
  }
  return Uint8Array.from(writeMidi({
    header: { format: 1, numTracks: 3, ticksPerBeat: 480 },
    tracks: [
      [
        { type: 'setTempo', deltaTime: 0, microsecondsPerBeat: 400000 },
        { type: 'keySignature', deltaTime: 0, key: -4, scale: 0 },
        { type: 'timeSignature', deltaTime: 0, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { type: 'setTempo', deltaTime: 1920, microsecondsPerBeat: 666667 },
        { type: 'timeSignature', deltaTime: 1920, numerator: 3, denominator: 4, metronome: 24, thirtyseconds: 8 },
      ],
      events,
      [
        { type: 'controller', channel: 0, controllerType: 64, value: 127, deltaTime: 0 },
        { type: 'controller', channel: 0, controllerType: 64, value: 0, deltaTime: 1920 },
      ],
    ],
  }));
}
