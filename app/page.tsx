import { DonationWidget } from '@/components/donation-widget';
'use client';
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Maximize2,
  RotateCcw,
  Piano,
  Sun,
  Moon,
  AudioLines,
  ArrowUpRight,
  VolumeX,
  Play,
  Square,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  CircleHelp,
  Headphones,
  SlidersHorizontal,
  X,
  Layers,
  Check,
  Music2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { REPERTOIRE } from '@/lib/repertoire';
import { browserLocale, pieceTitle, translate, type Locale } from '@/lib/piano-i18n';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PianoWorld, View } from '@/lib/piano-world';
import {
  PianoState,
  KEY_MAP,
  KEY_LABELS,
  PEDAL_KEYS,
  type PianoSnapshot,
} from '@/lib/piano-state';
import { GrandAudio, type AudioStatus } from '@/lib/piano-audio';
import { BLACK, noteName, midiFrequency } from '@/lib/music';
import {
  originalScore,
  parsePianoMidi,
  formatTime,
  type PianoScore,
} from '@/lib/piano-score';
import { PianoTransport } from '@/lib/piano-transport';
import { LiveNoteController } from '@/lib/live-note-controller';

const EMPTY: PianoSnapshot = {
  held: [],
  sounding: [],
  pedals: [false, false, false],
  captured: [],
  lastNote: null,
};
const SCENES = ['音乐厅', '日光工作室', '月夜露台'];
const ENV_SUBTITLES_VI = [
  'ĐẠI SẢNH HÒA NHẠC',
  'STUDIO ÁNH SÁNG',
  'ĐÊM TRĂNG SAO',
];
const ENV_SUBTITLES_EN = [
  'THE CONCERT HALL',
  'THE DAYLIGHT STUDIO',
  'THE MOONLIT TERRACE',
];
const PRELUDE = originalScore();
const PEDALS = [
  {
    name: '柔音',
    en: 'UNA CORDA',
    key: '左 Shift',
    detail: '移动击弦机构，降低音量并柔化音色',
  },
  {
    name: '选择延音',
    en: 'SOSTENUTO',
    key: '右 Shift',
    detail: '仅保持踩下瞬间已按住的音符',
  },
  {
    name: '延音',
    en: 'SUSTAIN',
    key: 'Space',
    detail: '抬起全部制音器，松开后止音',
  },
];
export default function Home() {
  const [locale, setLocale] = useState<Locale>('vi');
  const localeRef = useRef<Locale>('vi');
  const t = (text: string) => translate(locale, text);
  const applyLocale = useCallback((next: Locale) => {
    localeRef.current = next;
    setLocale(next);
    document.documentElement.lang = next === 'vi' ? 'vi' : 'en';
    document.title = next === 'vi' ? 'N&Mstudio Musical instrument | Đàn Grand Piano 3D' : 'N&Mstudio Musical instrument | 3D Grand Piano';
  }, []);
  useEffect(() => {
    const update = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('atelier-language'); } catch { /* Storage can be disabled. */ }
      if (saved === 'vi' || saved === 'en') { applyLocale(saved); return; }
      const next = browserLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
      applyLocale(next);
    };
    update();
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, [applyLocale]);
  const toggleLanguage = () => {
    const next = locale === 'vi' ? 'en' : 'vi';
    applyLocale(next);
    try { localStorage.setItem('atelier-language', next); } catch { /* Switching still works without persistence. */ }
  };
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<PianoWorld | null>(null);
  const [scene, setScene] = useState(0);
  const [error, setError] = useState('');
  const audio = useRef<GrandAudio | null>(null);
  const player = useRef<PianoState | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [view, setView] = useState<View>('overview');
  const [volume, setVolume] = useState(65);
  const [reverb, setReverb] = useState(28);
  const [velocity, setVelocity] = useState(78);
  const [lid, setLid] = useState(true);
  const [slow, setSlow] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [dockMinimized, setDockMinimized] = useState(true);
  const [immersiveControls, setImmersiveControls] = useState(false);
  const [finish, setFinish] = useState<'black' | 'white'>('black');
  const changeFinish = (next: 'black' | 'white') => {
    setFinish(next);
    world.current?.setFinish(next);
    try { localStorage.setItem('atelier-finish', next); } catch { /* ignore */ }
  };
  const toggleImmersive = (value: boolean) => {
    setImmersive(value);
    setImmersiveControls(false);
    setSettings(false);
    world.current?.setImmersive(value);
  };
  const [audioEngine, setAudioEngine] = useState<'v1' | 'v2'>('v2');
  const changeAudioEngine = (ver: 'v1' | 'v2') => {
    setAudioEngine(ver);
    audio.current?.setEngineVersion(ver);
  };
  const [octave, setOctave] = useState(4);
  const octaveRef = useRef(4);
  const velocityRef = useRef(0.78);
  const helpRef = useRef(false);
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(false);
  const transport = useRef<PianoTransport | null>(null);
  const [selection, setSelection] = useState('prelude');
  const currentPieceMeta = useMemo(() => REPERTOIRE.find(p => p.id === selection), [selection]);
  const [builtin, setBuiltin] = useState<Record<string, PianoScore>>({});
  const [imported, setImported] = useState<PianoScore | null>(null);
  const [position, setPosition] = useState(0);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const midiInput = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const recordingTask = useRef<{ cancel: () => void } | null>(null);
  const videoUrlRef = useRef('');
  const [ready, setReady] = useState(false);
  const tooltip = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLCanvasElement>(null);
  const activePointers = useRef(new Map<number, number>());
  const keysDown = useRef(new Map<string, number>());
  const uiLiveController = useRef<LiveNoteController | null>(null);
  const config = useRef({
    scene: 0,
    view: 'overview' as View,
    lid: true,
    slow: false,
  });
  const stopDemo = () => {
    demoRef.current = false;
    transport.current?.stop();
    setDemo(false);
  };
  const changeScene = (i: number) => {
    config.current.scene = i;
    setScene(i);
    world.current?.setEnvironment(i);
    audio.current?.setEnvironment(i);
  };
  const changeView = (v: View) => {
    config.current.view = v;
    setView(v);
    world.current?.setView(v);
  };
  const changeOctave = (n: number) => {
    const o = Math.max(1, Math.min(6, n));
    uiLiveController.current?.releaseAll();
    player.current?.releaseSource('key:');
    player.current?.releaseSource('ui:');
    keysDown.current.clear();
    activePointers.current.clear();
    octaveRef.current = o;
    setOctave(o);
  };
  const allOff = () => {
    recordingTask.current?.cancel();
    stopDemo();
    uiLiveController.current?.releaseAll();
    player.current?.allOff();
    world.current?.releasePointers();
    activePointers.current.clear();
    keysDown.current.clear();
  };
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const scoreAbort = new AbortController();
    const loadScore = async (piece: (typeof REPERTOIRE)[number]) => {
      if (!piece.hasPerformance || !piece.file || piece.file === 'prelude') return;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`/midi/${piece.file}`, {
            signal: AbortSignal.any([
              scoreAbort.signal,
              AbortSignal.timeout(15000),
            ]),
          });
          if (!response.ok) throw Error(`MIDI HTTP ${response.status}`);
          const score = parsePianoMidi(
            new Uint8Array(await response.arrayBuffer()),
            piece.title,
          );
          if (!disposed) setBuiltin(previous => ({ ...previous, [piece.id]: score }));
          return;
        } catch {
          if (disposed) return;
          if (attempt === 1)
            setError(localeRef.current === 'vi'
              ? `${pieceTitle('vi', piece.title)} tải không thành công, vui lòng thử lại hoặc chọn bài khác.`
              : `${pieceTitle('en', piece.title)} failed to load. Refresh to retry, or choose another piece.`);
        }
      }
    };
    REPERTOIRE.forEach(piece => { void loadScore(piece); });
    const sound = new GrandAudio();
    audio.current = sound;
    sound.onStatus = setStatus;
    const state = new PianoState({
      attack: (m, v, soft) => {
        sound.attack(m, v, soft);
        if (!demoRef.current) world.current?.sheet.record(m, performance.now() / 1000);
      },
      release: m => sound.release(m),
      silence: () => sound.silenceManual(),
    });
    uiLiveController.current = new LiveNoteController({
      noteOn: (m, s, v) => state.noteOn(m, s, v),
      noteOff: (m, s) => state.noteOff(m, s),
    });
    const demoState = new PianoState({ attack() {}, release() {}, silence() {} });
    player.current = state;
    transport.current = new PianoTransport(sound, demoState);
    sound.onEnd = (m) => state.ended(m);
    const refresh = () => {
      if (disposed) return;
      const manual = state.snapshot(), demo = demoState.snapshot();
      if (!demoRef.current) world.current?.sheet.syncManual(manual.held, manual.pedals, performance.now() / 1000);
      const s = {
        held: [...new Set([...manual.held, ...demo.held])],
        sounding: [...new Set([...manual.sounding, ...demo.sounding])],
        captured: [...new Set([...manual.captured, ...demo.captured])],
        pedals: manual.pedals.map((down, i) => down || demo.pedals[i]),
        lastNote: manual.held.length ? manual.lastNote : demo.lastNote,
      };
      setSnapshot(s);
      s.pedals.forEach((down, i) => {
        sound.setPedal(i, down);
      });
      if (world.current) {
        world.current.held = new Set(s.held);
        world.current.sounding = new Set(s.sounding);
        world.current.pedal = s.pedals;
        world.current.captured = new Set(s.captured);
      }
    };
    state.onChange = refresh;
    demoState.onChange = refresh;
    state.onStrike = (m) => world.current?.model.strike(m);
    demoState.onStrike = state.onStrike;
    import('@/lib/piano-world')
      .then(({ PianoWorld }) => {
        if (!disposed && host.current) {
          const w = new PianoWorld(host.current);
          world.current = w;
          w.setEnvironment(config.current.scene);
          w.setView(config.current.view);
          w.model.lidOpen = config.current.lid;
          w.slow = config.current.slow;
          let savedFinish: 'black' | 'white' = 'black';
          try {
            const f = localStorage.getItem('atelier-finish');
            if (f === 'black' || f === 'white') savedFinish = f;
          } catch {}
          setFinish(savedFinish);
          w.setFinish(savedFinish);
          w.model.startEntrance(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          state.emit();
          setReady(true);
          w.onNoteOn = (m, s, v) => {
            if (recordingTask.current) return;
            state.noteOn(m, s, v);
          };
          w.onNoteOff = (m, s) => state.noteOff(m, s);
          w.onHover = (m, x, y) => {
            if (!tooltip.current) return;
            tooltip.current.style.opacity = m === null ? '0' : '1';
            tooltip.current.style.transform = `translate(${x + 15}px,${y - 38}px)`;
            tooltip.current.textContent =
              m === null
                ? ''
                : `${noteName(m)} · ${midiFrequency(m).toFixed(2)} Hz`;
          };
          if (process.env.NODE_ENV !== 'production')
            (window as unknown as Record<string, unknown>).__grandAtelier = {
              state,
              sound,
              world: w,
              transport: transport.current,
            };
        }
      })
      .catch((e) => {
        console.error(e);
        setError(
          '3D 场景不可用。请启用浏览器硬件加速并刷新；下方琴键仍可演奏。',
        );
      });
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.isComposing ||
        helpRef.current
      )
        return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[role="slider"],[contenteditable="true"]',
        )
      )
        return;
      if (e.code === 'Escape') {
        allOff();
        return;
      }
      if (recordingTask.current) return;
      if (e.code in PEDAL_KEYS) {
        e.preventDefault();
        state.pedal(PEDAL_KEYS[e.code], true, `key:${e.code}`);
        return;
      }
      if (e.code in KEY_MAP) {
        e.preventDefault();
        const midi = (octaveRef.current + 1) * 12 + KEY_MAP[e.code];
        keysDown.current.set(e.code, midi);
        state.noteOn(midi, `key:${e.code}`, velocityRef.current);
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        changeOctave(octaveRef.current + (e.code === 'ArrowRight' ? 1 : -1));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code in PEDAL_KEYS) {
        state.pedal(PEDAL_KEYS[e.code], false, `key:${e.code}`);
      }
      const midi = keysDown.current.get(e.code);
      if (midi !== undefined) {
        state.noteOff(midi, `key:${e.code}`);
        keysDown.current.delete(e.code);
      }
    };
    const blur = () => {
      // Only release physical input; the independent score clock keeps running.
      uiLiveController.current?.releaseAll();
      state.allOff();
      world.current?.releasePointers();
      activePointers.current.clear();
      keysDown.current.clear();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    const data = new Uint8Array(256);
    const draw = () => {
      if (disposed) return;
      const c = meter.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        const w = c.width,
          h = c.height;
        ctx.clearRect(0, 0, w, h);
        if (sound.analyser) sound.analyser.getByteFrequencyData(data);
        ctx.fillStyle = '#c9b07a';
        for (let i = 0; i < 22; i++) {
          const height = Math.max(2, ((data[i * 3] || 0) / 255) * h * 0.95);
          ctx.fillRect(i * 5, (h - height) / 2, 2, height);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      scoreAbort.abort();
      cancelAnimationFrame(frame);
      demoRef.current = false;
      recordingTask.current?.cancel();
      transport.current?.stop();
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      uiLiveController.current?.releaseAll();
      sound.dispose();
      world.current?.dispose();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      delete (window as unknown as Record<string, unknown>).__grandAtelier;
    };
  }, []);
  const changeHelp = (open: boolean) => {
    helpRef.current = open;
    if (open) allOff();
    setHelp(open);
  };
  useEffect(() => {
    if (!ready) return;
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_piano_state',
      title: translate(localeRef.current, '读取钢琴状态'),
      description:
        'Read current held notes, ringing notes and three pedal states.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => player.current?.snapshot(),
    });
    register({
      name: 'configure_piano_room',
      title: translate(localeRef.current, '调整钢琴环境与视角'),
      description:
        'Change the visible piano environment and camera. Does not play audio.',
      inputSchema: {
        type: 'object',
        properties: {
          environment: { type: 'integer', minimum: 0, maximum: 2 },
          view: { type: 'string', enum: ['overview', 'perform', 'mechanism'] },
        },
        required: ['environment', 'view'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = input as { environment: number; view: View };
        if (
          !p ||
          !Number.isInteger(p.environment) ||
          p.environment < 0 ||
          p.environment > 2 ||
          !['overview', 'perform', 'mechanism'].includes(p.view)
        )
          throw Error('Invalid environment or view');
        changeScene(p.environment);
        changeView(p.view);
        return { environment: translate(localeRef.current, SCENES[p.environment]), view: p.view };
      },
    });
    return () => lifecycle.abort();
  }, [ready]);
  const chosenScore = useMemo(() => {
    if (selection === 'imported') return imported;
    const score = selection === 'prelude' ? PRELUDE : builtin[selection];
    return score ? { ...score, title: pieceTitle(locale, score.title) } : null;
  }, [builtin, imported, selection, locale]);
  const startDemo = async () => {
    if (recordingTask.current) return;
    if (demoRef.current) {
      setPosition(transport.current?.pause() ?? position);
      demoRef.current = false;
      setDemo(false);
      return;
    }
    if (!chosenScore) {
      setError(t("内置乐谱尚未载入，请稍后重试。"));
      return;
    }
    demoRef.current = true;
    setDemo(true);
    try {
      await audio.current?.unlock();
    } catch {
      stopDemo();
      return;
    }
    if (!demoRef.current) return;
    world.current?.sheet.setScore(chosenScore);
    transport.current?.play(chosenScore, setPosition, () => {
      demoRef.current = false;
      setDemo(false);
    }, 0.15, position >= chosenScore.duration ? 0 : position);
  };
  useEffect(() => {
    if (chosenScore && world.current) world.current.sheet.setScore(chosenScore);
  }, [chosenScore, ready]);
  useEffect(() => {
    if (world.current) {
      world.current.sheetTime = position;
      world.current.sheetPlaying = demo || recording;
      world.current.setImmersive(immersive);
    }
  }, [position, demo, recording, immersive, ready]);
  const seekDemo = (seconds: number) => {
    if (!chosenScore) return;
    const target = Math.max(0, Math.min(chosenScore.duration, seconds));
    setScrubPosition(null);
    setPosition(target);
    if (demoRef.current) {
      transport.current?.play(chosenScore, setPosition, () => {
        demoRef.current = false;
        setDemo(false);
      }, 0.03, target);
    }
  };
  const importMidi = async (file?: File) => {
    if (!file) return;
    stopDemo();
    try {
      if (file.size > 2_000_000) throw Error(t("MIDI 最大 2 MB。"));
      const score = parsePianoMidi(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
      );
      setImported(score);
      setSelection('imported');
      setPosition(0);
      setError(score.warnings.map(t).join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("MIDI 读取失败，请检查文件。"));
    }
    if (midiInput.current) midiInput.current.value = '';
  };
  const recordVideo = async (rawScene = false) => {
    if (recordingTask.current) {
      recordingTask.current.cancel();
      return;
    }
    if (!chosenScore) {
      setError(t("请等待乐谱载入完成。"));
      return;
    }
    if (
      !world.current ||
      !audio.current ||
      !player.current ||
      !transport.current
    )
      return;
    stopDemo();
    const abort = new AbortController();
    recordingTask.current = { cancel: () => abort.abort() };
    setRecording(true);
    const previous = { ...config.current };
    try {
      await audio.current.unlock();
      const { recordPiano } = await import('@/lib/piano-capture');
      abort.signal.throwIfAborted();
      const score = selection === 'prelude' ? originalScore(3) : chosenScore;
      const blob = await recordPiano(
        world.current,
        audio.current,
        transport.current,
        score,
        {
          signal: abort.signal,
          onProgress: seconds => setPosition(Math.max(0, seconds - 1)),
          onScene: changeScene,
          onView: changeView,
          rawScene,
        },
      );
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = URL.createObjectURL(blob);
      return videoUrlRef.current;
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : t("录制失败，请使用支持 MediaRecorder 的浏览器。"),
        );
    } finally {
      recordingTask.current = null;
      setRecording(false);
      changeScene(previous.scene);
      changeView(previous.view);
    }
  };
  // Owner capture is available only in the local development build; it is not
  // a general-purpose recording control and is never shown to visitors.
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const scope = window as unknown as { __recordAtelier?: typeof recordVideo };
      scope.__recordAtelier = recordVideo;
      return () => { delete scope.__recordAtelier; };
    }
  });
  const pointerNote = (
    event: ReactPointerEvent<HTMLElement>,
    down: boolean,
  ) => {
    const id = event.pointerId;
    if (!down) {
      uiLiveController.current?.pointerUp(id);
      return;
    }
    if (recordingTask.current) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(id);
    } catch {
      // Ignore pointer capture exceptions in sandbox environments
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-midi]',
    );
    if (target) {
      const midi = Number(target.dataset.midi);
      uiLiveController.current?.pointerDown(
        id,
        midi,
        'ui',
        event.pointerType === 'pen' ? event.pressure : undefined,
      );
    }
  };
  const slideNote = (event: ReactPointerEvent<HTMLElement>) => {
    if (!uiLiveController.current?.hasPointer(event.pointerId)) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-midi]');
    const midi = target ? Number(target.dataset.midi) : null;
    uiLiveController.current.pointerMove(
      event.pointerId,
      midi,
      'ui',
      event.pointerType === 'pen' ? event.pressure : undefined,
    );
  };
  const screenKeys = [];
  let white = 0;
  for (let offset = 0; offset < 25; offset++) {
    const midi = (octave + 1) * 12 + offset;
    const black = BLACK.has(midi % 12);
    screenKeys.push({
      midi,
      offset,
      black,
      left: black ? white - 0.31 : white,
    });
    if (!black) white++;
  }
  return (
    <main className={`atelier environment-${scene} view-${view}${immersive ? ' immersive' : ''}${ready ? ' scene-ready' : error ? ' scene-error' : ''}`}>
      <input
        ref={midiInput}
        type="file"
        accept=".mid,.midi,audio/midi"
        hidden
        onChange={(e) => void importMidi(e.target.files?.[0])}
      />
      <div ref={host} className="world" aria-label={t("可交互三角钢琴 3D 场景")} />
      <div className="scene-vignette" />
      <header className="topbar">
        <Link className="brand" href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="N&Mstudio Logo" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
          <span style={{ fontWeight: 800, letterSpacing: '0.04em' }}>N&Mstudio Musical instrument</span>
        </Link>
        <span className="top-caption">{locale === 'vi' ? 'TRẢI NGHIỆM ĐÀN PIANO TƯƠNG TÁC' : 'THE INTERACTIVE PIANO EXPERIENCE'}</span>
        <div className="header-actions">
          <button className="language-switch" onClick={toggleLanguage}
            aria-label={locale === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
            title={locale === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}>
            <span lang="vi" className={locale === 'vi' ? 'active' : ''}>VN</span>
            <span aria-hidden="true">/</span>
            <span lang="en" className={locale === 'en' ? 'active' : ''}>EN</span>
          </button>
          <button className="icon-button immersion-entry" aria-label={t("进入沉浸模式")} title={t("沉浸模式")} onClick={() => toggleImmersive(true)}>
            <Maximize2 size={17} />
            <span>{t("沉浸")}</span>
          </button>
          <button
            className={`sound-status ${status}`}
            onClick={() => void audio.current?.unlock().catch(() => {})}
          >
            <span />
            <span className="sound-status-label">{status === 'ready'
              ? t("立体声采样已就绪")
              : status === 'loading'
                ? t("音色加载中…")
                : status === 'error'
                  ? t("重试加载音色")
                  : t("开启声音")}</span>
            <Headphones size={14} />
          </button>
          <button
            className="icon-button"
            aria-label={t("演奏指南")}
            onClick={() => changeHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("全屏")}
            onClick={() => {
              const task = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen?.();
              void task?.catch(() =>
                setError(t("当前窗口不支持全屏，可在浏览器中打开演奏。")),
              );
            }}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </header>
      {immersive && <>
        <div className={`immersive-reveal${immersiveControls ? ' pinned' : ''}`}>
          <button className="immersive-handle" aria-label={t("显示沉浸模式控制")} aria-expanded={immersiveControls} onClick={() => setImmersiveControls(!immersiveControls)}><span /></button>
          <nav className="immersive-controls" aria-label={t("沉浸模式控制")}>
            <select aria-label={t("沉浸环境")} value={scene} onChange={e => changeScene(Number(e.target.value))}>
              {SCENES.map((name, i) => <option key={name} value={i}>{t(name)}</option>)}
            </select>
            <select aria-label={t("沉浸视角")} value={view} onChange={e => changeView(e.target.value as View)}>
              <option value="overview">{t("全景")}</option><option value="perform">{t("靠近演奏")}</option><option value="mechanism">{t("机械观察")}</option>
            </select>
            <button onClick={() => { setLid(!lid); config.current.lid = !lid; if (world.current) world.current.model.lidOpen = !lid; }} disabled={view === 'mechanism'}>{lid ? t("合盖") : t("开盖")}</button>
            <button onClick={() => void startDemo()} disabled={!chosenScore}>{demo ? t("暂停示奏") : position > 0 ? t("继续示奏") : t("聆听示奏")}</button>
          </nav>
        </div>
        <button className="immersive-exit" aria-label={t("退出沉浸模式")} title={t("退出沉浸模式")} onClick={() => toggleImmersive(false)}><X size={19} /></button>
      </>}
      <section className="instrument-heading">
        <p className="eyebrow">
          <span />
          {locale === 'vi' ? 'BỘ SƯU TẬP HÒA NHẠC · 01' : 'THE CONCERT COLLECTION · 01'}
        </p>
        <h1 className="nm-brand-title">
          <span className="brand-nm">N&amp;M</span>
          <br />
          <em className="brand-studio">studio.</em>
        </h1>
        <p className="instrument-subtitle">{t("指尖之下，万千共鸣。")}</p>
        <div className="finish-pill-selector">
          <button
            type="button"
            className={`finish-pill ${finish === 'black' ? 'active' : ''}`}
            onClick={() => changeFinish('black')}
            title={locale === 'vi' ? 'Sơn đen bóng hoàng gia (Ebony)' : 'Ebony gloss finish'}
          >
            <span className="finish-dot finish-dot-ebony" />
            <span>{locale === 'vi' ? 'Đen bóng' : 'Ebony'}</span>
          </button>
          <button
            type="button"
            className={`finish-pill ${finish === 'white' ? 'active' : ''}`}
            onClick={() => changeFinish('white')}
            title={locale === 'vi' ? 'Sơn trắng sứ ngọc trai (Ivory)' : 'Ivory white finish'}
          >
            <span className="finish-dot finish-dot-white" />
            <span>{locale === 'vi' ? 'Trắng sứ' : 'Ivory White'}</span>
          </button>
        </div>
        <div className="instrument-spec">
          <span>
            88 <small>{locale === 'vi' ? 'PHÍM' : 'KEYS'}</small>
          </span>
          <i />
          <span>
            3 <small>{locale === 'vi' ? 'BÀN ĐẠP' : 'PEDALS'}</small>
          </span>
        </div>
      </section>
      <nav className="scene-selector" aria-label={t("环境选择")}>
        <p className="eyebrow">{locale === 'vi' ? 'CHỌN KHÔNG GIAN' : 'CHOOSE YOUR ATMOSPHERE'}</p>
        {SCENES.map((name, i) => (
          <button
            key={name}
            aria-pressed={scene === i}
            className={'scene-option ' + (scene === i ? 'selected' : '')}
            onClick={() => changeScene(i)}
          >
            <span className={'scene-icon scene-' + i}>
              {i === 0 ? (
                <AudioLines size={21} />
              ) : i === 1 ? (
                <Sun size={21} />
              ) : (
                <Moon size={21} />
              )}
            </span>
            <span>
              <strong>{t(name)}</strong>
              <small>{locale === 'vi' ? ENV_SUBTITLES_VI[i] : ENV_SUBTITLES_EN[i]}</small>
            </span>
            <span className="scene-index">
              {scene === i ? <Check size={13} /> : <>0{i + 1}</>}
            </span>
          </button>
        ))}
      </nav>
      <Tabs
        className="camera-bar"
        value={view}
        onValueChange={(v) => changeView(v as View)}
      >
        <TabsList>
          <TabsTrigger value="overview">{t("全景")}</TabsTrigger>
          <TabsTrigger value="perform">
            <Piano size={15} />{t("靠近演奏")}</TabsTrigger>
          <TabsTrigger value="mechanism">{t("机械观察")}<ArrowUpRight size={14} />
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <button
        className={'settings-toggle icon-button ' + (settings ? 'active' : '')}
        aria-label={t("音色与琴盖设置")}
        aria-expanded={settings}
        onClick={() => setSettings(!settings)}
      >
        <SlidersHorizontal size={18} />
      </button>
      <aside
        className={'sound-panel ' + (settings ? 'expanded' : '')}
        inert={!settings}
        aria-hidden={!settings}
      >
        <div className="panel-heading">
          <span>{t("声音与细节")}</span>
          <button aria-label={t("关闭设置")} onClick={() => setSettings(false)}>
            <X size={15} />
          </button>
        </div>
        <div className="range-label">
          <span>{t("音量")}</span>
          <span>{volume}%</span>
        </div>
        <Slider
          aria-label={t("音量")}
          value={[volume]}
          min={0}
          max={100}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            setVolume(n);
            audio.current?.setVolume(n / 100);
          }}
        />
        <div className="range-label">
          <span>{t("空间混响")}</span>
          <span>{reverb}%</span>
        </div>
        <Slider
          aria-label={t("空间混响")}
          value={[reverb]}
          min={0}
          max={100}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            setReverb(n);
            audio.current?.setReverb(n / 100);
          }}
        />
        <div className="range-label">
          <span>{t("击键力度")}</span>
          <span>
            {velocity < 45 ? t("轻柔") : velocity < 80 ? t("适中") : t("有力")}
          </span>
        </div>
        <Slider
          aria-label={t("击键力度")}
          value={[velocity]}
          min={15}
          max={100}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            setVelocity(n);
            velocityRef.current = n / 100;
          }}
        />
        <label className="switch-row" htmlFor="lid-switch">
          <span>{t("开启琴盖")}</span>
          <Switch
            id="lid-switch"
            checked={lid}
            disabled={view === 'mechanism'}
            onCheckedChange={(v) => {
              setLid(v);
              config.current.lid = v;
              if (world.current) world.current.model.lidOpen = v;
            }}
            aria-label={t("开启琴盖")}
          />
        </label>
        <div className="finish-settings-row">
          <div className="range-label" style={{ marginTop: 14, marginBottom: 8 }}>
            <span>{locale === 'vi' ? 'Màu vỏ đàn' : 'Piano Finish'}</span>
            <span>{finish === 'white' ? (locale === 'vi' ? 'Trắng sứ' : 'Ivory White') : (locale === 'vi' ? 'Đen bóng' : 'Ebony Gloss')}</span>
          </div>
          <div className="finish-buttons">
            <button
              type="button"
              className={`finish-btn ${finish === 'black' ? 'selected' : ''}`}
              onClick={() => changeFinish('black')}
            >
              <span className="finish-swatch swatch-black" />
              <span>{locale === 'vi' ? 'Đen bóng' : 'Ebony'}</span>
            </button>
            <button
              type="button"
              className={`finish-btn ${finish === 'white' ? 'selected' : ''}`}
              onClick={() => changeFinish('white')}
            >
              <span className="finish-swatch swatch-white" />
              <span>{locale === 'vi' ? 'Trắng sứ' : 'Ivory'}</span>
            </button>
          </div>
        </div>
        <div className="audio-engine-settings-row" style={{ marginTop: 14, marginBottom: 8 }}>
          <div className="range-label" style={{ marginBottom: 6 }}>
            <span>{locale === 'vi' ? 'Bộ xử lý âm thanh (A/B)' : 'Audio Engine (A/B)'}</span>
            <span style={{ fontSize: 11, color: audioEngine === 'v2' ? '#d4b26f' : '#9ba69f' }}>
              {audioEngine === 'v2' ? 'V2 (Calibrated)' : 'V1 (Legacy)'}
            </span>
          </div>
          <div className="finish-buttons">
            <button
              type="button"
              className={`finish-btn ${audioEngine === 'v2' ? 'selected' : ''}`}
              onClick={() => changeAudioEngine('v2')}
              title={locale === 'vi' ? 'Audio V2: Đa lớp dynamic, dải động chuẩn, âm sắc giàu nhạc tính' : 'Audio V2: Calibrated gain staging & dynamic multi-velocity'}
            >
              <span>⭐ Audio V2</span>
            </button>
            <button
              type="button"
              className={`finish-btn ${audioEngine === 'v1' ? 'selected' : ''}`}
              onClick={() => changeAudioEngine('v1')}
              title={locale === 'vi' ? 'Audio V1: Bản gốc trước đây để so sánh A/B' : 'Audio V1: Legacy engine for A/B comparison'}
            >
              <span>Audio V1</span>
            </button>
          </div>
        </div>
        <p className="settings-note">{t("环境切换会同步改变光照与空间声学。")}</p>
      </aside>
      {view === 'mechanism' && (
        <aside className="mechanism-panel">
          <p className="eyebrow">{locale === 'vi' ? 'BÊN TRONG BỘ CƠ ĐÀN' : 'INSIDE THE INSTRUMENT'}</p>
          <h2>{t("看见声音的诞生")}</h2>
          <p>{t("外壳已揭开。按下琴键，观察击弦过程。")}</p>
          <ol>
            {[
              t("琴键下沉 · 后端抬起"),
              t("联动杆推动顶杆"),
              t("琴槌上击后回落"),
              t("制音器抬起 · 琴弦振动"),
            ].map((s, i) => (
              <li className={snapshot.held.length ? 'engaged' : ''} key={s}>
                <span>0{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <label className="switch-row" htmlFor="slow-switch">
            <span>{t("慢动作观察")}<small>{t("仅放慢机械动画")}</small>
            </span>
            <Switch
              id="slow-switch"
              checked={slow}
              aria-label={t("慢动作观察")}
              onCheckedChange={(v) => {
                setSlow(v);
                config.current.slow = v;
                if (world.current) world.current.slow = v;
              }}
            />
          </label>
        </aside>
      )}
      <div className="orbit-hint">
        <span>
          {view === 'perform'
            ? t("点击 3D 琴键即可弹奏 · 也可使用下方键盘")
            : t("拖动旋转 · 滚轮拉近 · 双指缩放")}
        </span>
        <button aria-label={t("重置视角")} onClick={() => changeView('overview')}>
          <RotateCcw size={15} />
        </button>
      </div>
      <section className={`performance-dock${dockMinimized ? ' minimized' : ''}`} aria-label={t("演奏控制台")}>
        <div className="repertoire-row">
          <label className="repertoire-select">
            <Music2 size={14} />
            <select
              aria-label={t("示奏曲目")}
              value={selection}
              disabled={recording}
              onChange={(e) => {
                stopDemo();
                setSelection(e.target.value);
                setPosition(0);
              }}
            >
              <optgroup label={locale === 'vi' ? '★ Độc quyền N&Mstudio' : '★ N&Mstudio Originals'}>
                <option value="prelude">Atelier Prelude · Original</option>
              </optgroup>
              <optgroup label={locale === 'vi' ? '🇻🇳 Tuyệt phẩm Việt Nam' : '🇻🇳 Vietnamese Masterpieces'}>
                {REPERTOIRE.filter(p => p.category === 'VIETNAMESE').map(piece => (
                  <option key={piece.id} value={piece.id} disabled={!piece.hasPerformance}>
                    {piece.title} — {piece.composer}
                  </option>
                ))}
              </optgroup>
              <optgroup label={locale === 'vi' ? '🌍 Quốc tế & Bất hủ' : '🌍 International Classics'}>
                {REPERTOIRE.filter(p => p.category === 'INTERNATIONAL POP').map(piece => (
                  <option key={piece.id} value={piece.id} disabled={!piece.hasPerformance}>
                    {piece.title} — {piece.composer}
                  </option>
                ))}
              </optgroup>
              <optgroup label={locale === 'vi' ? '🌸 Nhạc Châu Á' : '🌸 Asian Hits'}>
                {REPERTOIRE.filter(p => p.category === 'ASIAN POP').map(piece => (
                  <option key={piece.id} value={piece.id} disabled={!piece.hasPerformance}>
                    {piece.title} — {piece.composer}
                  </option>
                ))}
              </optgroup>
              <optgroup label={locale === 'vi' ? '🎬 Nhạc phim & Điện ảnh' : '🎬 Cinematic Themes'}>
                {REPERTOIRE.filter(p => p.category === 'CINEMATIC').map(piece => (
                  <option key={piece.id} value={piece.id} disabled={!piece.hasPerformance}>
                    {piece.title} — {piece.composer}
                  </option>
                ))}
              </optgroup>
              {imported && (
                <optgroup label={locale === 'vi' ? '📁 Tệp MIDI cá nhân' : '📁 Imported MIDI'}>
                  <option value="imported">{t("导入 ·")}{imported.title}</option>
                </optgroup>
              )}
            </select>
          </label>
          <span className="score-time">
            {formatTime(scrubPosition ?? position)} / {formatTime(chosenScore?.duration ?? 0)}
          </span>
          <button
            className="import-button"
            aria-label={t("导入 MIDI")}
            disabled={recording}
            onClick={() => midiInput.current?.click()}
            title={t("文件仅在当前浏览器会话中读取，不上传")}
          >
            <Upload size={13} />
            <span>{t("导入 MIDI")}</span>
          </button>
          <button
            className="dock-toggle"
            aria-label={dockMinimized ? t("展开演奏面板") : t("最小化演奏面板")}
            aria-expanded={!dockMinimized}
            title={dockMinimized ? t("展开演奏面板") : t("最小化演奏面板")}
            onClick={() => setDockMinimized(v => !v)}
          >
            {dockMinimized ? <Maximize2 size={15} /> : <span aria-hidden="true">−</span>}
          </button>
        </div>
        {currentPieceMeta && !dockMinimized && (
          <div className="repertoire-meta-bar">
            <span className="repertoire-meta-title">{currentPieceMeta.title}</span>
            <span className="repertoire-meta-sep">·</span>
            <span className="repertoire-meta-composer">{currentPieceMeta.composer}</span>
            <span className="repertoire-meta-sep">·</span>
            <span className="repertoire-meta-tag">{currentPieceMeta.style}</span>
            <span className="repertoire-meta-sep">·</span>
            <span className="repertoire-meta-tag">{currentPieceMeta.duration}</span>
          </div>
        )}
        <Slider
          className="playback-seek"
          aria-label={t("示奏进度，可拖动跳转")}
          min={0}
          max={chosenScore?.duration || 1}
          step={0.1}
          disabled={!chosenScore || recording}
          value={[scrubPosition ?? position]}
          onValueChange={v => setScrubPosition(Array.isArray(v) ? v[0] : v)}
          onValueCommitted={v => seekDemo(Array.isArray(v) ? v[0] : v)}
        />
        <div className="dock-top">
          <div className="dock-title">
            <Keyboard size={17} />
            <span>{recording ? t("实录中") : demo ? t("自动演奏") : t("自由演奏")}</span>
            <span className="dock-separator" />
            <span className="note-output" aria-live="off">
              {snapshot.held.length
                ? snapshot.held.map(noteName).join(' · ')
                : snapshot.lastNote
                  ? noteName(snapshot.lastNote)
                  : `${noteName((octave + 1) * 12)} — ${noteName((octave + 3) * 12)}`}
            </span>
          </div>
          <div className="octave">
            <button
              aria-label={t("降低八度")}
              disabled={octave === 1}
              onClick={() => changeOctave(octave - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              {locale === 'vi' ? 'QUÃNG' : 'OCTAVE'} <b>{octave}</b>
            </span>
            <button
              aria-label={t("升高八度")}
              disabled={octave === 6}
              onClick={() => changeOctave(octave + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            className={'demo-button ' + (demo ? 'playing' : '')}
            disabled={recording || !chosenScore}
            onClick={() => void startDemo()}
          >
            {demo ? <Square size={12} /> : <Play size={12} />}
            <span>
              {demo ? t("暂停示奏") : !chosenScore ? t("乐谱载入中") : position > 0 && position < chosenScore.duration ? t("继续示奏") : t("聆听示奏")}
            </span>
          </button>
        </div>
        <div
          className="keyboard-surface"
          onPointerDown={(e) => pointerNote(e, true)}
          onPointerMove={slideNote}
          onPointerUp={(e) => pointerNote(e, false)}
          onPointerCancel={(e) => pointerNote(e, false)}
          onLostPointerCapture={(e) => pointerNote(e, false)}
        >
          {screenKeys.map((k) => (
            <button
              key={k.midi}
              data-midi={k.midi}
              tabIndex={-1}
              aria-label={`${locale === 'vi' ? 'Chơi phím' : 'Play'} ${noteName(k.midi)}`}
              className={`piano-key ${k.black ? 'black-key' : 'white-key'} ${snapshot.held.includes(k.midi) ? 'pressed' : ''}`}
              style={{
                left: `${(k.left / white) * 100}%`,
                width: `${((k.black ? 0.62 : 1) / white) * 100}%`,
              }}
            >
              <span className="key-letter">{KEY_LABELS[k.offset] ?? ''}</span>
              {!k.black && <span className="key-note">{noteName(k.midi)}</span>}
            </button>
          ))}
        </div>
        <div className="dock-bottom">
          <span>
            <span className="status-dot" />{t("按住弹奏，松开止音")}</span>
          <div className="pedals">
            {PEDALS.map((p, i) => (
              <button
                key={p.name}
                title={t(p.detail)}
                aria-label={locale === 'vi' ? `${t(p.name)}, nhấn giữ để đạp, nhả để thả` : `${t(p.name)} pedal; hold to press, release to lift`}
                aria-pressed={snapshot.pedals[i]}
                className={'pedal ' + (snapshot.pedals[i] ? 'depressed' : '')}
                onPointerDown={(e) => {
                  if (recordingTask.current) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  player.current?.pedal(i, true, `pedal-ui:${e.pointerId}`);
                }}
                onPointerUp={(e) =>
                  player.current?.pedal(i, false, `pedal-ui:${e.pointerId}`)
                }
                onPointerCancel={(e) =>
                  player.current?.pedal(i, false, `pedal-ui:${e.pointerId}`)
                }
                onLostPointerCapture={(e) =>
                  player.current?.pedal(i, false, `pedal-ui:${e.pointerId}`)
                }
              >
                <span className="pedal-led" />
                <span>{t(p.name)}</span>
                <kbd>{t(p.key)}</kbd>
              </button>
            ))}
          </div>
          <button
            className="panic"
            aria-label={t("释放全部音符与踏板")}
            title={t("Esc · 释放全部")}
            onClick={allOff}
          >
            <VolumeX size={14} />
          </button>
        </div>
      </section>
      <div className="live-meter">
        <canvas ref={meter} width={110} height={24} />
        <span>
          {snapshot.sounding.length
            ? `${snapshot.sounding.length} ${locale === 'vi' ? 'DÂY RUNG' : 'VOICES'}`
            : 'A4 = 440 Hz'}
        </span>
      </div>
      <div ref={tooltip} className="note-tooltip" />
      {!ready && !error && (
        <div className="scene-loading">
          <span />{locale === 'vi' ? 'Đang chuẩn bị không gian & ánh sáng…' : 'Tuning strings and lighting…'}</div>
      )}
      {error && (
        <div role="alert" className="load-error">
          {t(error)}
          <button aria-label={locale === 'vi' ? 'Đóng thông báo' : 'Dismiss'} onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <footer className="bottom-signature">
        <span>NMstudio + <a href="https://github.com/Anionex" target="_blank" rel="noopener noreferrer">anionex</a> + astra</span>
        <button onClick={() => changeHelp(true)}>
          {locale === 'vi' ? 'Hướng dẫn chơi & Nguồn âm' : 'Guide & credits'}<ArrowUpRight size={10} />
        </button>
      </footer>
      <Dialog open={help} onOpenChange={changeHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>
            {locale === 'vi' ? 'Để mỗi lần chạm phím, đều ngân vang.' : 'Let every touch resonate.'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'vi' ? 'N&Mstudio · Hướng dẫn chơi đàn & Khám phá cơ học' : 'N&Mstudio · Playing & exploration guide'}
          </DialogDescription>
          {locale === 'vi' ? (
            <>
              <div className="help-section">
                <h3><Piano size={17} />Bắt đầu chơi đàn</h3>
                <p>Nhấp vào nút «Bật âm thanh» ở góc trên. Chọn góc nhìn «Góc người chơi» để trực tiếp chạm vào phím đàn 3D, hoặc sử dụng bàn phím ảo bên dưới. Bạn có thể kéo rê chuột để vuốt phím (glissando) và nhấn nhiều ngón/phím cùng lúc để chơi hợp âm.</p>
                <p>Theo góc nhìn nghệ sĩ: phím trầm bên trái, phím cao bên phải. Phím Đô trung (Middle C - C4 / MIDI 60 / 261.63 Hz) nằm ở phím trắng thứ 24 từ trái sang và có ký hiệu C4 trên mặt phím.</p>
                <p>
                  <kbd>A S D F G H J K L ; &apos;</kbd> tương ứng các phím trắng; hàng trên{' '}
                  <kbd>W E T Y U O P ]</kbd> tương ứng các phím đen. Phím mũi tên <kbd>← →</kbd> chuyển quãng tám (octave), phím <kbd>Esc</kbd> nhả tức thì toàn bộ phím và pedal.
                </p>
              </div>
              <div className="help-section">
                <h3><Music2 size={17} />Tác phẩm mẫu &amp; Tệp MIDI</h3>
                <p>Hệ thống tích hợp sẵn các kiệt tác quốc tế kinh điển (Canon in D, Für Elise, River Flows in You) và làn điệu Việt Nam bất hủ (Bèo Dạt Mây Trôi, Diễm Xưa, Mẹ Yêu Con). Bạn có thể chọn để đàn tự động tấu khúc với bộ cơ búa gõ chân thực.</p>
                <p>Bạn cũng có thể tải lên tệp MIDI của riêng mình: hệ thống phân tích cao độ, lực gõ, tốc độ và bàn đạp pedal thời gian thực hoàn toàn cục bộ trên trình duyệt, không gửi dữ liệu ra ngoài.</p>
              </div>
              <div className="help-section">
                <h3><Music2 size={17} />Hệ thống 3 Bàn đạp (Pedals)</h3>
                {PEDALS.map((p) => (
                  <p key={p.name}>
                    <strong>{t(p.name)}</strong> <kbd>{t(p.key)}</kbd> — {t(p.detail)}. Nhấn giữ để kích hoạt, nhả để thả bàn đạp.
                  </p>
                ))}
              </div>
              <div className="help-section">
                <h3><Layers size={17} />Khám phá Bộ cơ học 3D</h3>
                <p>Chuyển sang góc nhìn «Bộ cơ học» để mở thùng đàn. Mỗi phím bấm đều liên kết cơ học với đòn bẩy wippen, chốt jack, búa gõ bọc nỉ đập dây và đòn nâng damper ngắt vang. Bật chế độ «Chuyển động chậm» để quan sát chi tiết từng micro-giây vận hành.</p>
              </div>
              <p className="credits">Âm thanh mẫu: <a href="https://sfzinstruments.github.io/pianos/salamander/" target="_blank" rel="noreferrer">Salamander Grand Piano</a> · Alexander Holm · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. 30 bộ mẫu MP3 chất lượng cao đa tầng lực gõ qua Tone.js &amp; Three.js kết xuất 3D thời gian thực.</p>
            </>
          ) : (
            <>
              <div className="help-section">
                <h3><Piano size={17} />Start Playing</h3>
                <p>Click «Enable sound» in the top header. Select «Play close-up» to play the 3D keys directly, or use the interactive onscreen keyboard below. Drag across keys for glissando, and use multi-touch or multiple keys for rich chords.</p>
                <p>From the pianist perspective, pitch rises from left to right. Middle C is the 40th key and 24th white key from the left: C4 / MIDI 60 / 261.63 Hz, labeled on the key slip.</p>
                <p>
                  <kbd>A S D F G H J K L ; &apos;</kbd> map to white keys; the upper row{' '}
                  <kbd>W E T Y U O P ]</kbd> maps to black keys. Arrow keys <kbd>← →</kbd> shift octaves, and <kbd>Esc</kbd> instantly releases all keys and pedals.
                </p>
              </div>
              <div className="help-section">
                <h3><Music2 size={17} />Repertoire &amp; Custom MIDI</h3>
                <p>Enjoy built-in masterworks (Canon in D, Für Elise, River Flows in You, Vietnamese folk pieces). You can also import your own piano MIDI files: timing, velocity, and pedals are processed directly in your browser without uploading to any server.</p>
              </div>
              <div className="help-section">
                <h3><Music2 size={17} />Three Physical Pedals</h3>
                {PEDALS.map((p) => (
                  <p key={p.name}>
                    <strong>{t(p.name)}</strong> <kbd>{t(p.key)}</kbd> — {t(p.detail)}. Hold to press, release to lift.
                  </p>
                ))}
              </div>
              <div className="help-section">
                <h3><Layers size={17} />Action Mechanism Inspection</h3>
                <p>Switch to «Inside the action» to reveal the internal escapement mechanism: key lever, wippen, repetition lever, jack, felt hammer, and string dampers. Turn on «Slow motion» to study the rapid strike and rebound sequence.</p>
              </div>
              <p className="credits">Sound engine: <a href="https://sfzinstruments.github.io/pianos/salamander/" target="_blank" rel="noreferrer">Salamander Grand Piano</a> · Alexander Holm · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. High-fidelity velocity samples processed via Tone.js with real-time Three.js rendering.</p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <DonationWidget locale={locale} />
    </main>
  );
}
