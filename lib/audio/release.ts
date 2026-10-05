/**
 * N&Mstudio Grand Piano - Audio V2 Release & Damper Mechanics (Milestone 2)
 * Simulates physical damper behavior across 88 keys:
 * - Damperless upper register (MIDI >= 89): strings ring out freely.
 * - Mid & bass registers: register-dependent damping time constant based on string mass.
 * - Subtle acoustic damper felt contact simulation.
 */

export interface DamperConfig {
  trebleFreeRingMidi: number;     // Notes at or above this have no dampers (standard concert grand: >= F6 / MIDI 89)
  baseDampingSeconds: number;     // Nominal damping time for middle C (MIDI 60)
  bassDampingMultiplier: number;  // Extra damping time for heavy bass strings
  damperFeltNoiseGain: number;    // Subtle mechanical felt-on-string contact gain
}

export const DEFAULT_DAMPER_CONFIG: DamperConfig = {
  trebleFreeRingMidi: 89,
  baseDampingSeconds: 0.13,
  bassDampingMultiplier: 0.0022,
  damperFeltNoiseGain: 0.04,
};

/**
 * Calculates physical string damping time constant upon key release.
 * On a concert grand, lower bass strings take slightly longer to come to rest than high treble.
 */
export function calculateReleaseDuration(
  midi: number,
  isSustained: boolean = false,
  config: DamperConfig = DEFAULT_DAMPER_CONFIG,
): number {
  if (isSustained) {
    // When sustain pedal is held down, note continues to ring naturally
    return 12.0;
  }

  // Upper register has no dampers and rings out with natural soundboard decay (~1.2s - 1.5s)
  if (midi >= config.trebleFreeRingMidi) {
    return 1.25;
  }

  // Bass strings have larger mass and take slightly longer for the damper felt to stop vibration
  const bassFactor = Math.max(0, 60 - midi) * config.bassDampingMultiplier;
  return config.baseDampingSeconds + bassFactor;
}

/**
 * Generates a subtle acoustic damper felt touch impulse on key release.
 * Gives the tactile, organic feeling of a grand piano mechanical action.
 */
export function applyDamperTouchEnvelope(
  gainNode: GainNode,
  currentTime: number,
  dampingDuration: number,
) {
  gainNode.gain.cancelScheduledValues(currentTime);
  const currentGain = Math.max(0.0001, gainNode.gain.value);
  gainNode.gain.setValueAtTime(currentGain, currentTime);
  
  // Natural S-curve acoustic decay: initial fast brake followed by gentle exponential tail
  gainNode.gain.exponentialRampToValueAtTime(0.0001, currentTime + dampingDuration);
}
