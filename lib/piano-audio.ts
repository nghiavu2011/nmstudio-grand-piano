import type { PianoAudio } from './piano-state';
import type { ScoreVoice } from './piano-score';
import {
  SAMPLE_MANIFEST,
  selectClosestSample,
  DEFAULT_ANCHORS,
  type SampleEntry,
  type VelocityLayer,
} from './audio/sample-manifest';
import {
  velocityToLayer,
  velocityToAmplitude,
  velocityToAcousticFilter,
  normalizeVelocity,
} from './audio/velocity';
import {
  volumeToMasterGain,
  setupDynamicProcessing,
  AUDIO_V2_GAIN_CONFIG,
} from './audio/gain-staging';
import {
  calculateReleaseDuration,
  applyDamperTouchEnvelope,
} from './audio/release';
import { SympatheticResonanceBus } from './audio/resonance';

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error';
export type AudioEngineVersion = 'v1' | 'v2';

// Legacy V1 anchor definitions for A/B comparison fallback
const LEGACY_V1_SAMPLES = DEFAULT_ANCHORS.map((s) => ({
  midi: s.midi,
  name: s.note,
}));

type Voice = {
  midi: number;
  source?: AudioBufferSourceNode;
  gain?: GainNode;
  filter?: BiquadFilterNode;
  pan?: StereoPannerNode;
  released: boolean;
  id: number;
  score?: boolean;
  startAt?: number;
  releaseAt?: number;
  layer?: VelocityLayer;
};

export class GrandAudio implements PianoAudio {
  context: AudioContext | null = null;
  status: AudioStatus = 'idle';
  onStatus?: (s: AudioStatus) => void;
  onEnd?: (midi: number) => void;
  analyser: AnalyserNode | null = null;

  // Active audio engine version (default: v2)
  version: AudioEngineVersion = 'v2';

  private buffers = new Map<number, AudioBuffer>();
  private raw = new Map<number, ArrayBuffer>();
  private voices = new Map<number, Voice>();
  private nextId = 0;
  private unlockPromise: Promise<void> | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private input: GainNode | null = null;
  private resonanceBus: SympatheticResonanceBus | null = null;
  private dynamicsCompressor: DynamicsCompressorNode | null = null;
  private safetyLimiter: DynamicsCompressorNode | null = null;
  private volume = 0.65;
  private reverb = 0.28;
  private environment = 0;
  private isSustained = false;
  private disposed = false;
  private abort = new AbortController();

  constructor(preferredVersion?: AudioEngineVersion) {
    this.detectEngineVersion(preferredVersion);
    void this.prefetch();
  }

  /**
   * Resolves engine version from constructor param, URL search query, localStorage, or defaults to 'v2'.
   */
  private detectEngineVersion(preferred?: AudioEngineVersion) {
    if (preferred === 'v1' || preferred === 'v2') {
      this.version = preferred;
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        const search = new URLSearchParams(window.location.search);
        const urlAudio = search.get('audio')?.toLowerCase();
        if (urlAudio === 'v1' || urlAudio === 'v2') {
          this.version = urlAudio;
          return;
        }
        const storageAudio = localStorage.getItem('piano_audio_version')?.toLowerCase();
        if (storageAudio === 'v1' || storageAudio === 'v2') {
          this.version = storageAudio;
          return;
        }
        const winAudio = (window as unknown as { __NMSTUDIO_AUDIO_VERSION__?: string })
          .__NMSTUDIO_AUDIO_VERSION__?.toLowerCase();
        if (winAudio === 'v1' || winAudio === 'v2') {
          this.version = winAudio;
          return;
        }
      } catch {
        // Fall back to v2 if window/storage is inaccessible
      }
    }
    this.version = 'v2';
  }

  /**
   * Allows live developer switching between V1 and V2 engines for A/B listening tests.
   */
  setEngineVersion(version: AudioEngineVersion) {
    if (this.version === version) return;
    this.version = version;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('piano_audio_version', version);
      } catch {
        // Ignore storage errors in sandbox
      }
    }
    if (this.context && this.master) {
      this.rebuildDynamicGraph();
      this.setVolume(this.volume);
    }
  }

  private async fetchSample(midi: number, name: string) {
    if (this.raw.has(midi)) return;
    let error: unknown;
    for (let i = 0; i < 2; i++) {
      try {
        const response = await fetch(`/audio/${name}.mp3`, {
          signal: AbortSignal.any([
            this.abort.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!response.ok) throw Error(`Sample ${name}: ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 5000) throw Error('Incomplete sample');
        this.raw.set(midi, bytes);
        return;
      } catch (e) {
        error = e;
        if (this.abort.signal.aborted) throw e;
      }
    }
    throw error;
  }

  private async prefetch() {
    await Promise.allSettled(
      DEFAULT_ANCHORS.map((s) => this.fetchSample(s.midi, s.note)),
    );
  }

  async unlock() {
    if (this.disposed) throw Error('Audio disposed');
    if (this.context?.state === 'running' && this.status === 'ready') return;
    if (this.unlockPromise) return this.unlockPromise;
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.buildGraph();
    }
    const resume = this.context.resume();
    this.setStatus('loading');
    this.unlockPromise = (async () => {
      try {
        await resume;
        const context = this.context!;
        await Promise.all(
          DEFAULT_ANCHORS.map(async (s) => {
            if (this.buffers.has(s.midi)) return;
            await this.fetchSample(s.midi, s.note);
            const rawBytes = this.raw.get(s.midi);
            if (!rawBytes) return;
            const b = await context.decodeAudioData(rawBytes.slice(0));
            if (!this.disposed) this.buffers.set(s.midi, b);
          }),
        );
        if (this.disposed) return;
        this.setStatus('ready');
      } catch (e) {
        if (!this.disposed) this.setStatus('error');
        throw e;
      } finally {
        this.unlockPromise = null;
      }
    })();
    return this.unlockPromise;
  }

  private setStatus(status: AudioStatus) {
    this.status = status;
    this.onStatus?.(status);
  }

  private buildGraph() {
    const c = this.context!;
    this.input = c.createGain();
    this.master = c.createGain();
    this.dry = c.createGain();
    this.wet = c.createGain();
    this.convolver = c.createConvolver();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 512;

    this.input.connect(this.dry);
    this.dry.connect(this.master);
    this.input.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.wet.connect(this.master);

    // Milestone 2: Sympathetic Resonance Engine
    this.resonanceBus = new SympatheticResonanceBus(c);
    this.resonanceBus.connectSource(this.input);
    this.resonanceBus.connectDestination(this.dry);

    this.rebuildDynamicGraph();
    this.setVolume(this.volume);
    this.setReverb(this.reverb);
    this.setEnvironment(this.environment);
  }

  private rebuildDynamicGraph() {
    if (!this.context || !this.master || !this.analyser) return;
    const c = this.context;

    // Disconnect old dynamic chain
    try {
      this.master.disconnect();
      this.dynamicsCompressor?.disconnect();
      this.safetyLimiter?.disconnect();
    } catch {
      // Ignore disconnect errors if not connected
    }

    if (this.version === 'v1') {
      // Legacy V1: Master -> 20:1 Brickwall compressor -> Analyser -> Destination
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0;
      limiter.release.value = 0.18;

      this.master.connect(limiter);
      limiter.connect(this.analyser);
      this.analyser.connect(c.destination);
      this.safetyLimiter = limiter;
      this.dynamicsCompressor = null;
    } else {
      // Audio V2: Master -> Transparent Dynamics -> Safety Limiter -> Analyser -> Destination
      const { dynamics, limiter } = setupDynamicProcessing(
        c,
        this.master,
        this.analyser,
        AUDIO_V2_GAIN_CONFIG,
      );
      this.dynamicsCompressor = dynamics;
      this.safetyLimiter = limiter;
    }
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, typeof value === 'number' && !isNaN(value) ? value : 0.65));
    if (this.master && this.context) {
      const targetGain = this.version === 'v1'
        ? this.volume * 3.4
        : volumeToMasterGain(this.volume);

      this.master.gain.setTargetAtTime(
        targetGain,
        this.context.currentTime,
        0.025,
      );
    }
  }

  setReverb(value: number) {
    this.reverb = Math.max(0, Math.min(1, typeof value === 'number' && !isNaN(value) ? value : 0.28));
    if (this.wet && this.dry && this.context) {
      this.wet.gain.setTargetAtTime(
        this.reverb * 0.7,
        this.context.currentTime,
        0.08,
      );
      this.dry.gain.setTargetAtTime(
        1 - this.reverb * 0.17,
        this.context.currentTime,
        0.08,
      );
    }
  }

  setEnvironment(index: number) {
    this.environment = index;
    if (!this.context || !this.convolver) return;
    const seconds = [2.8, 1.1, 1.65][index] ?? 2.0;
    const len = Math.floor(this.context.sampleRate * seconds);
    const ir = this.context.createBuffer(2, len, this.context.sampleRate);
    let seed = 77;
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        data[i] =
          ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3.4) * 0.3;
      }
    }
    this.convolver.buffer = ir;
  }

  /**
   * Modulates pedal mechanics (Soft, Sostenuto, Sustain) in real time.
   */
  setPedal(index: number, down: boolean) {
    if (index === 2) {
      // Sustain pedal (CC64) lifts all dampers
      this.isSustained = down;
      this.resonanceBus?.setSustain(down, this.context?.currentTime);
    }
  }

  attack(midi: number, velocity: number, soft: boolean) {
    for (const voice of this.voices.values()) {
      if (!voice.score && voice.midi === midi) this.stopVoice(voice, 0.045);
    }
    const manualVoices = [...this.voices.values()].filter((v) => !v.score);
    while (manualVoices.length >= 80) {
      const oldest = manualVoices.shift()!;
      this.stopVoice(oldest, 0.025);
      this.voices.delete(oldest.id);
    }
    const voice: Voice = { midi, released: false, id: ++this.nextId };
    this.voices.set(voice.id, voice);
    const start = () => {
      if (voice.released || this.disposed || !this.context) return;
      this.startVoice(voice, velocity, soft, this.context.currentTime);
    };
    if (this.status === 'ready' && this.context?.state === 'running') {
      start();
    } else {
      void this.unlock()
        .then(start)
        .catch(() => {
          this.voices.delete(voice.id);
        });
    }
  }

  private startVoice(
    voice: Voice,
    velocity: number,
    soft: boolean,
    at: number,
    releaseAt?: number,
    sampleOffset = 0,
  ) {
    const c = this.context!;
    const midi = voice.midi;

    if (this.version === 'v1') {
      // ===== V1 LEGACY ENGINE =====
      const closest = LEGACY_V1_SAMPLES.reduce((best, s) =>
        Math.abs(s.midi - midi) < Math.abs(best.midi - midi) ? s : best,
      );
      const buffer = this.buffers.get(closest.midi);
      if (!buffer) return;

      const pitchShift = (midi - closest.midi) / 12;
      const rate = Math.pow(2, pitchShift);
      if (sampleOffset * rate >= buffer.duration) {
        this.voices.delete(voice.id);
        return;
      }

      const source = c.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;

      const gain = c.createGain();
      gain.gain.value = Math.pow(velocity, 1.65) * (soft ? 0.49 : 0.86);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value =
        (soft ? 2600 : 4500) + velocity * (soft ? 2200 : 11500);
      filter.Q.value = 0.4;

      const pan = c.createStereoPanner();
      pan.pan.value = ((midi - 64) / 88) * 0.6;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.input!);

      Object.assign(voice, { source, gain, filter, pan });
      voice.startAt = at;
      voice.releaseAt = releaseAt;

      if (releaseAt !== undefined) {
        const tail = midi >= 89 ? 1.2 : 0.13 + Math.max(0, 60 - midi) * 0.002;
        gain.gain.setValueAtTime(gain.gain.value, releaseAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + tail);
      }

      source.onended = () => {
        this.cleanupVoice(voice, midi);
      };

      source.start(at, sampleOffset * rate);
      if (releaseAt !== undefined) {
        const tail = midi >= 89 ? 1.2 : 0.13 + Math.max(0, 60 - midi) * 0.002;
        source.stop(releaseAt + tail + 0.02);
      }
    } else {
      // ===== V2 AUDIO ENGINE (Milestone 1 & 2) =====
      const targetLayer = velocityToLayer(velocity);
      const availableMidis = new Set(this.buffers.keys());
      const { entry, layer, pitchShiftSemitones } = selectClosestSample(
        midi,
        targetLayer,
        SAMPLE_MANIFEST,
        availableMidis,
      );

      const buffer = this.buffers.get(entry.midi);
      if (!buffer) return;

      const rate = Math.pow(2, pitchShiftSemitones / 12);
      if (sampleOffset * rate >= buffer.duration) {
        this.voices.delete(voice.id);
        return;
      }

      const source = c.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;

      // Acoustic amplitude response curve (balanced headroom)
      const baseAmp = velocityToAmplitude(velocity, 'normal');
      const softModifier = soft ? 0.72 : 1.0;
      const voiceGain = baseAmp * softModifier;

      const gain = c.createGain();
      gain.gain.value = voiceGain;

      // Dynamic acoustic harmonic filtering
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      const filterSettings = velocityToAcousticFilter(velocity, soft, midi);
      filter.frequency.value = filterSettings.frequency;
      filter.Q.value = filterSettings.Q;

      // Natural acoustic stereo spread (soundboard bass on left, treble on right)
      const pan = c.createStereoPanner();
      pan.pan.value = Math.max(-0.75, Math.min(0.75, ((midi - 60) / 72) * 0.65));

      source.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.input!);

      voice.layer = layer;
      Object.assign(voice, { source, gain, filter, pan });
      voice.startAt = at;
      voice.releaseAt = releaseAt;

      // Update soundboard sympathetic resonance polyphony
      this.resonanceBus?.setPolyphony(this.voices.size);

      if (releaseAt !== undefined) {
        const tail = calculateReleaseDuration(midi, false);
        gain.gain.setValueAtTime(gain.gain.value, releaseAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + tail);
      }

      source.onended = () => {
        this.cleanupVoice(voice, midi);
      };

      source.start(at, sampleOffset * rate);
      if (releaseAt !== undefined) {
        const tail = calculateReleaseDuration(midi, false);
        source.stop(releaseAt + tail + 0.02);
      }
    }
  }

  private cleanupVoice(voice: Voice, midi: number) {
    this.voices.delete(voice.id);
    voice.source?.disconnect();
    voice.gain?.disconnect();
    voice.filter?.disconnect();
    voice.pan?.disconnect();
    this.resonanceBus?.setPolyphony(this.voices.size);
    if (
      !voice.score &&
      ![...this.voices.values()].some((v) => v.midi === midi && !v.released)
    ) {
      this.onEnd?.(midi);
    }
  }

  scheduleNote(note: ScoreVoice, origin: number, resumeFrom = 0) {
    if (!this.context || this.status !== 'ready') {
      throw Error('Audio not ready');
    }
    const voice: Voice = {
      midi: note.midi,
      id: ++this.nextId,
      released: false,
      score: true,
    };
    this.voices.set(voice.id, voice);
    this.startVoice(
      voice,
      note.velocity,
      note.soft,
      origin + Math.max(note.time, resumeFrom),
      origin + note.release,
      Math.max(0, resumeFrom - note.time),
    );
  }

  cancelScore() {
    for (const voice of this.voices.values()) {
      if (voice.score) this.stopVoice(voice, 0.025);
    }
  }

  capture() {
    if (!this.context || !this.analyser) throw Error('Audio not ready');
    const output = this.context.createMediaStreamDestination();
    this.analyser.connect(output);
    return {
      stream: output.stream,
      disconnect: () => {
        this.analyser?.disconnect(output);
        output.stream.getTracks().forEach((track) => track.stop());
      },
    };
  }

  release(midi: number) {
    for (const v of this.voices.values()) {
      if (!v.score && v.midi === midi) {
        const duration = calculateReleaseDuration(midi, false);
        this.stopVoice(v, duration);
      }
    }
  }

  private stopVoice(voice: Voice, seconds: number) {
    if (voice.released) return;
    voice.released = true;
    if (!voice.source || !voice.gain || !this.context) {
      this.voices.delete(voice.id);
      return;
    }
    const t = this.context.currentTime;
    applyDamperTouchEnvelope(voice.gain, t, seconds);
    voice.source.stop(t + seconds + 0.02);
  }

  silence() {
    for (const v of this.voices.values()) this.stopVoice(v, 0.025);
  }

  silenceManual() {
    for (const v of this.voices.values()) {
      if (!v.score) this.stopVoice(v, 0.025);
    }
  }

  metrics() {
    return {
      status: this.status,
      version: this.version,
      context: this.context?.state ?? 'none',
      samples: this.buffers.size,
      voices: [...this.voices.values()].filter(
        (v) =>
          !v.released &&
          (v.startAt ?? 0) <= (this.context?.currentTime ?? 0) &&
          (v.releaseAt ?? Infinity) > (this.context?.currentTime ?? 0),
      ).length,
      latency: this.context?.baseLatency ?? null,
    };
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.silence();
    this.resonanceBus?.disconnect();
    void this.context?.close();
    this.raw.clear();
    this.buffers.clear();
  }
}
