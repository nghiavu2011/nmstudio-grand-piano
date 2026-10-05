/**
 * N&Mstudio Grand Piano - Audio V2 Gain Staging & Dynamic Processing
 * Replaces the legacy volume * 3.4 overdrive into a 20:1 brickwall compressor.
 * Implements clean acoustic gain staging:
 * Voice -> Dry/Wet Convolver -> Master Stage (near unity) -> Gentle Dynamics -> Peak Limiter -> Analyser -> Output.
 */

export interface GainStagingConfig {
  nominalGain: number;
  dynamicsThreshold: number;
  dynamicsRatio: number;
  dynamicsKnee: number;
  dynamicsAttack: number;
  dynamicsRelease: number;
  limiterThreshold: number;
  limiterRatio: number;
  limiterKnee: number;
  limiterAttack: number;
  limiterRelease: number;
}

export const AUDIO_V2_GAIN_CONFIG: GainStagingConfig = {
  // Nominal master multiplier (clean headroom without excessive artificial boost)
  nominalGain: 1.15,
  // Transparent musical dynamics leveling
  dynamicsThreshold: -14,
  dynamicsRatio: 2.0,
  dynamicsKnee: 6,
  dynamicsAttack: 0.005,
  dynamicsRelease: 0.22,
  // Safety peak limiter
  limiterThreshold: -1.0,
  limiterRatio: 20.0,
  limiterKnee: 0,
  limiterAttack: 0.001,
  limiterRelease: 0.05,
};

/**
 * Maps normalized volume (0..1) to master gain value.
 * Uses an acoustic taper (smooth quadratic response) so low volumes are gradual
 * and full volume achieves unity acoustic presentation.
 */
export function volumeToMasterGain(volume: number, config: GainStagingConfig = AUDIO_V2_GAIN_CONFIG): number {
  const v = Math.max(0, Math.min(1.0, typeof volume === 'number' && !isNaN(volume) ? volume : 0.65));
  if (v <= 0.0001) return 0;
  // Acoustic taper: smooth curve with unity ceiling
  return Math.pow(v, 1.2) * config.nominalGain;
}

/**
 * Configure dynamic processing nodes in Web Audio graph
 */
export function setupDynamicProcessing(
  context: AudioContext,
  masterGainNode: GainNode,
  analyserNode: AnalyserNode,
  config: GainStagingConfig = AUDIO_V2_GAIN_CONFIG,
): { dynamics: DynamicsCompressorNode; limiter: DynamicsCompressorNode } {
  // Stage 1: Gentle musical dynamics compressor
  const dynamics = context.createDynamicsCompressor();
  dynamics.threshold.value = config.dynamicsThreshold;
  dynamics.ratio.value = config.dynamicsRatio;
  dynamics.knee.value = config.dynamicsKnee;
  dynamics.attack.value = config.dynamicsAttack;
  dynamics.release.value = config.dynamicsRelease;

  // Stage 2: Peak catcher safety limiter
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = config.limiterThreshold;
  limiter.ratio.value = config.limiterRatio;
  limiter.knee.value = config.limiterKnee;
  limiter.attack.value = config.limiterAttack;
  limiter.release.value = config.limiterRelease;

  // Signal graph routing: Master -> Dynamics -> Limiter -> Analyser -> Destination
  masterGainNode.connect(dynamics);
  dynamics.connect(limiter);
  limiter.connect(analyserNode);
  analyserNode.connect(context.destination);

  return { dynamics, limiter };
}
