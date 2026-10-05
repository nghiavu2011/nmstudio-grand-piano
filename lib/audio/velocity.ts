/**
 * N&Mstudio Grand Piano - Audio V2 Velocity & Dynamics Engine
 * Maps input strike velocities to physical dynamics layers, amplitude response,
 * and acoustic harmonic balance.
 */

import type { VelocityLayer } from './sample-manifest';

export type VelocityCurve = 'soft' | 'normal' | 'hard';

/**
 * Clamps input velocity to safe normalized range [0.001, 1.0].
 * If given an integer MIDI velocity [2..127], it normalizes to [0..1].
 */
export function normalizeVelocity(val: number): number {
  if (typeof val !== 'number' || isNaN(val)) return 0.7;
  // If explicitly a MIDI integer velocity between 2 and 127
  let v = val;
  if (Number.isInteger(val) && val >= 2 && val <= 127) {
    v = val / 127;
  }
  return Math.max(0.001, Math.min(1.0, v));
}

/**
 * Maps normalized velocity (0..1) to discrete velocity layers:
 * 0.00 - 0.24 -> pp (pianissimo, subtle & warm)
 * 0.25 - 0.44 -> p  (piano, gentle)
 * 0.45 - 0.68 -> mf (mezzo-forte, nominal core)
 * 0.69 - 0.86 -> f  (forte, assertive)
 * 0.87 - 1.00 -> ff (fortissimo, full resonant hammer impact)
 */
export function velocityToLayer(velocity: number): VelocityLayer {
  const norm = normalizeVelocity(velocity);
  if (norm < 0.25) return 'pp';
  if (norm < 0.45) return 'p';
  if (norm < 0.69) return 'mf';
  if (norm < 0.87) return 'f';
  return 'ff';
}

/**
 * Calculates perceived acoustic amplitude based on velocity and acoustic curve.
 * Balances dynamic headroom so pp remains audible and ff has physical punch without digital distortion.
 */
export function velocityToAmplitude(
  velocity: number,
  curve: VelocityCurve = 'normal',
): number {
  const v = normalizeVelocity(velocity);

  switch (curve) {
    case 'soft':
      // Gentle curve prioritizing expressive low-to-mid dynamics
      return Math.pow(v, 1.4) * 0.95 + 0.05 * v;
    case 'hard':
      // Direct aggressive curve for bold rock/pop articulation
      return Math.pow(v, 0.9) * 1.0;
    case 'normal':
    default:
      // Concert grand acoustic response (concave acoustic curve)
      // Produces ~0.15 at pp (0.1), ~0.45 at mf (0.6), ~1.0 at ff (1.0)
      return Math.pow(v, 1.25) * 0.92 + 0.08 * Math.sqrt(v);
  }
}

/**
 * Calculates natural harmonic filter settings for the voice.
 * Complements sample timbre rather than relying solely on harsh low-pass.
 */
export function velocityToAcousticFilter(
  velocity: number,
  soft: boolean,
  midi: number,
): { frequency: number; Q: number } {
  const v = normalizeVelocity(velocity);
  
  // Base frequency increases with higher notes on the soundboard
  const noteFreq = 440 * Math.pow(2, (midi - 69) / 12);
  const baseCutoff = Math.max(3000, noteFreq * 3.5);

  if (soft) {
    // Una corda: softer hammer strike, shifts cutoff down gently
    const cutoff = Math.min(12000, baseCutoff * 0.75 + v * 4000);
    return { frequency: cutoff, Q: 0.35 };
  }

  // Normal strike: wide acoustic bandwidth with subtle brightness scaling
  const cutoff = Math.min(20000, baseCutoff + v * 9000);
  return { frequency: cutoff, Q: 0.4 };
}
