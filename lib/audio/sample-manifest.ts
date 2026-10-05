/**
 * N&Mstudio Grand Piano - Audio V2 Sample Manifest
 * Multi-velocity layer definitions, note anchors, and fallback resolvers.
 * License attribution: Alexander Holm's Salamander Grand Piano V3 (CC BY 3.0)
 */

export type VelocityLayer = 'pp' | 'p' | 'mf' | 'f' | 'ff';

export interface SampleEntry {
  midi: number;
  note: string;
  layers: Partial<Record<VelocityLayer, string>>;
}

export const VELOCITY_LAYERS: VelocityLayer[] = ['pp', 'p', 'mf', 'f', 'ff'];

export const NOTE_NAMES = [
  'C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B',
] as const;

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Standard 30 Salamander Grand Piano anchor notes (minor thirds)
 */
export const DEFAULT_ANCHORS: { midi: number; note: string }[] = [
  { midi: 21, note: 'A0' },
  ...Array.from({ length: 7 }, (_, i) =>
    ['C', 'Ds', 'Fs', 'A'].map((name, j) => ({
      midi: 24 + i * 12 + j * 3,
      note: name + (i + 1),
    })),
  ).flat(),
  { midi: 108, note: 'C8' },
];

/**
 * Audio V2 Sample Manifest
 * Supports multiple velocity layers per anchor note with graceful fallback.
 */
export const SAMPLE_MANIFEST: SampleEntry[] = DEFAULT_ANCHORS.map((anchor) => ({
  midi: anchor.midi,
  note: anchor.note,
  layers: {
    // Primary layer using optimized Salamander Grand recordings
    mf: `/audio/${anchor.note}.mp3`,
    // In M1, if separate layer recordings are missing, manifest resolver falls back to available layer
    pp: `/audio/${anchor.note}.mp3`,
    p: `/audio/${anchor.note}.mp3`,
    f: `/audio/${anchor.note}.mp3`,
    ff: `/audio/${anchor.note}.mp3`,
  },
}));

/**
 * Find the closest sample anchor for a given target MIDI note and velocity layer.
 * Resolves both note proximity and layer fallback.
 */
export function selectClosestSample(
  midi: number,
  layer: VelocityLayer = 'mf',
  manifest: SampleEntry[] = SAMPLE_MANIFEST,
  availableMidis?: Set<number>,
): { entry: SampleEntry; layer: VelocityLayer; url: string; pitchShiftSemitones: number } {
  const candidates = availableMidis && availableMidis.size > 0
    ? manifest.filter((s) => availableMidis.has(s.midi))
    : manifest;

  const pool = candidates.length > 0 ? candidates : manifest;

  let bestEntry = pool[0];
  let minDiff = Math.abs(pool[0].midi - midi);

  for (let i = 1; i < pool.length; i++) {
    const diff = Math.abs(pool[i].midi - midi);
    if (diff < minDiff) {
      minDiff = diff;
      bestEntry = pool[i];
    }
  }

  // Layer fallback hierarchy
  const layerPriority: Record<VelocityLayer, VelocityLayer[]> = {
    pp: ['pp', 'p', 'mf', 'f', 'ff'],
    p: ['p', 'pp', 'mf', 'f', 'ff'],
    mf: ['mf', 'p', 'f', 'pp', 'ff'],
    f: ['f', 'mf', 'ff', 'p', 'pp'],
    ff: ['ff', 'f', 'mf', 'p', 'pp'],
  };

  let resolvedLayer: VelocityLayer = layer;
  let url = bestEntry.layers[layer];

  if (!url) {
    const preferences = layerPriority[layer];
    for (const alt of preferences) {
      if (bestEntry.layers[alt]) {
        resolvedLayer = alt;
        url = bestEntry.layers[alt];
        break;
      }
    }
  }

  return {
    entry: bestEntry,
    layer: resolvedLayer,
    url: url || `/audio/${bestEntry.note}.mp3`,
    pitchShiftSemitones: midi - bestEntry.midi,
  };
}
