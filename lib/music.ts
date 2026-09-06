export const BLACK = new Set([1, 3, 6, 8, 10]);
export const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];
export const noteName = (midi: number) =>
  `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const midiFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const KEYBOARD = {
  whitePitch: .1651 / 7,
  whiteGap: .00085,
  blackWidth: .0135,
  frontZ: -1.121,
  whiteRearZ: -.966,
  blackFrontZ: -1.066,
  blackRearZ: -.957,
  notchClearance: .0015,
};

export const KEY_LAYOUT = (() => {
  let white = 0;
  return Array.from({ length: 88 }, (_, i) => {
    const midi = i + 21;
    const black = BLACK.has(midi % 12);
    const whiteIndex = black ? white - 0.5 : white++;
    return { midi, black, whiteIndex, x: (whiteIndex - 25.5) * KEYBOARD.whitePitch };
  });
})();
