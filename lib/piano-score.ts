import { parseMidi } from 'midi-file';

export type ScoreEvent =
  | { type: 'on'; time: number; id: string; midi: number; velocity: number; beat?: number }
  | { type: 'off'; time: number; id: string; midi: number; beat?: number }
  | { type: 'pedal'; time: number; id: string; index: number; down: boolean; beat?: number };
export type ScoreNotation = {
  meters: { beat: number; numerator: number; denominator: number }[];
  keys: { beat: number; key: number; minor: boolean }[];
  tempos: { beat: number; time: number; bpm: number }[];
};
export type ScoreVoice = {
  id: string;
  midi: number;
  time: number;
  release: number;
  velocity: number;
  soft: boolean;
};
export type PianoScore = {
  title: string;
  events: ScoreEvent[];
  voices: ScoreVoice[];
  duration: number;
  noteCount: number;
  tempoChanges: number;
  warnings: string[];
  notation?: ScoreNotation;
};

/** Resolve pedal-held durations before scheduling audio; visual key-off times
 * remain unchanged. Stable event order preserves simultaneous MIDI events. */
export function compileScore(title: string, input: ScoreEvent[]): PianoScore {
  const events = [...input].sort((a, b) => a.time - b.time);
  const duration = events.at(-1)?.time ?? 0;
  const voices: ScoreVoice[] = [];
  const sounding = new Map<string, ScoreVoice>();
  const held = new Set<string>();
  const captured = new Set<string>();
  const pedals = [new Set<string>(), new Set<string>(), new Set<string>()];
  const damp = (time: number) => {
    for (const [id, voice] of sounding) {
      if (
        !held.has(id) &&
        !pedals[2].size &&
        !(pedals[1].size && captured.has(id))
      ) {
        voice.release = time;
        sounding.delete(id);
      }
    }
  };
  for (const e of events) {
    if (!Number.isFinite(e.time) || e.time < 0)
      throw Error('Invalid score time');
    if (e.type === 'on') {
      if (
        !Number.isInteger(e.midi) ||
        e.midi < 21 ||
        e.midi > 108 ||
        e.velocity <= 0 ||
        e.velocity > 1
      )
        throw Error('Invalid piano note');
      for (const [id, old] of sounding) {
        if (old.midi === e.midi) {
          old.release = e.time;
          sounding.delete(id);
        }
      }
      const voice = { ...e, release: duration, soft: !!pedals[0].size };
      voices.push(voice);
      sounding.set(e.id, voice);
      held.add(e.id);
    } else if (e.type === 'off') {
      held.delete(e.id);
      damp(e.time);
    } else {
      const before = !!pedals[e.index].size;
      if (e.down) pedals[e.index].add(e.id);
      else pedals[e.index].delete(e.id);
      const after = !!pedals[e.index].size;
      if (e.index === 1 && before !== after) {
        captured.clear();
        if (after) held.forEach((id) => captured.add(id));
      }
      damp(e.time);
    }
  }
  return {
    title,
    events,
    voices,
    duration,
    noteCount: voices.length,
    tempoChanges: 0,
    warnings: [],
  };
}

export function parsePianoMidi(bytes: Uint8Array, title: string): PianoScore {
  if (
    bytes.length < 14 ||
    bytes.length > 2_000_000 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd'
  )
    throw Error('请选择有效的 MIDI 文件（最大 2 MB）。');
  const file = parseMidi(bytes);
  const ppq = file.header.ticksPerBeat;
  if (file.header.format === 2 || !ppq || ppq <= 0)
    throw Error(
      '支持 Format 0/1、PPQ 时基的 MIDI；不支持异步轨道或 SMPTE 时基。',
    );
  const timed = file.tracks
    .flatMap((track, trackIndex) => {
      let tick = 0;
      return track.map((event) => {
        if (!Number.isInteger(event.deltaTime) || event.deltaTime < 0)
          throw Error('MIDI 时间数据损坏。');
        tick += event.deltaTime;
        return { event, tick, trackIndex };
      });
    })
    .sort((a, b) => a.tick - b.tick);
  if (timed.length > 100_000)
    throw Error('MIDI 事件过多，请导出更短的钢琴片段。');
  const events: ScoreEvent[] = [];
  const notes = new Map<string, { id: string; time: number }[]>();
  const programs = new Map<number, number>();
  const warnings = new Set<string>();
  const notation: ScoreNotation = { meters: [], keys: [], tempos: [{ beat: 0, time: 0, bpm: 120 }] };
  let tick = 0,
    seconds = 0,
    tempo = 500_000,
    serial = 0,
    tempoChanges = 0;
  for (const item of timed) {
    seconds += ((item.tick - tick) * tempo) / ppq / 1_000_000;
    tick = item.tick;
    const e = item.event;
    if (e.type === 'setTempo') {
      if (e.microsecondsPerBeat <= 0) throw Error('MIDI 速度数据无效。');
      tempo = e.microsecondsPerBeat;
      tempoChanges++;
      notation.tempos.push({ beat: tick / ppq, time: seconds, bpm: 60_000_000 / tempo });
    } else if (e.type === 'timeSignature') {
      notation.meters.push({ beat: tick / ppq, numerator: e.numerator, denominator: e.denominator });
    } else if (e.type === 'keySignature') {
      notation.keys.push({ beat: tick / ppq, key: e.key, minor: e.scale === 1 });
    } else if (e.type === 'programChange')
      programs.set(e.channel, e.programNumber);
    else if (e.type === 'pitchBend' && e.value !== 0)
      throw Error('此文件包含弯音，不能在固定音高的钢琴上准确还原。');
    else if (e.type === 'noteOn' || e.type === 'noteOff') {
      const key = `${item.trackIndex}:${e.channel}:${e.noteNumber}`;
      const queue = notes.get(key) ?? [];
      if (e.type === 'noteOn' && e.velocity > 0) {
        if (e.channel === 9 || (programs.get(e.channel) ?? 0) > 7)
          throw Error('请导出仅含钢琴的 MIDI；此文件包含打击乐或非钢琴音轨。');
        if (e.noteNumber < 21 || e.noteNumber > 108)
          throw Error('文件含超出 A0–C8 的音符；不会静默移调或丢弃。');
        const id = `demo:note:${serial++}`;
        queue.push({ id, time: seconds });
        notes.set(key, queue);
        events.push({
          type: 'on',
          time: seconds,
          beat: tick / ppq,
          id,
          midi: e.noteNumber,
          velocity: e.velocity / 127,
        });
      } else {
        const start = queue.shift();
        if (!start) throw Error('MIDI 含未配对的松键事件。');
        if (seconds <= start.time) throw Error('MIDI 含零时长或负时长音符。');
        events.push({
          type: 'off',
          time: seconds,
          beat: tick / ppq,
          id: start.id,
          midi: e.noteNumber,
        });
      }
    } else if (e.type === 'controller') {
      const index = ({ 67: 0, 66: 1, 64: 2 } as Record<number, number>)[
        e.controllerType
      ];
      if (index !== undefined) {
        events.push({
          type: 'pedal',
          time: seconds,
          beat: tick / ppq,
          index,
          down: e.value >= 64,
          id: `demo:pedal:${e.channel}:${index}`,
        });
        if (e.value !== 0 && e.value !== 127)
          warnings.add(
            '连续踏板值按 MIDI 标准阈值 64 转为踩下/松开，不模拟半踏板。',
          );
      } else if (![0, 32, 91, 93].includes(e.controllerType)) {
        warnings.add(
          '音符、力度、变速与三踏板已保留；其他控制器不参与音色处理。',
        );
      }
    }
  }
  if ([...notes.values()].some((q) => q.length))
    throw Error('MIDI 含缺失松键的音符，请先修复原文件。');
  if (!serial) throw Error('文件中没有可演奏的钢琴音符。');
  const score = compileScore(
    title.replace(/\.(mid|midi)$/i, '').slice(0, 100),
    events,
  );
  if (score.duration > 1200 || serial > 20_000)
    throw Error('请使用不超过 20 分钟、20,000 音符的钢琴 MIDI。');
  score.tempoChanges = tempoChanges;
  score.warnings = [...warnings];
  score.notation = notation;
  return score;
}

export function originalScore(repeats = 1): PianoScore {
  const chords = [
    [48, 60, 64, 67, 72, 67, 64, 60],
    [45, 57, 60, 64, 69, 64, 60, 57],
    [41, 57, 60, 65, 69, 65, 60, 57],
    [43, 55, 59, 62, 67, 62, 59, 55],
  ];
  const events: ScoreEvent[] = [];
  for (let r = 0; r < repeats; r++)
    chords.forEach((chord, bar) => {
      const start = (r * 4 + bar) * 2.72;
      events.push({
        type: 'pedal',
        time: start,
        id: 'demo:pedal',
        index: 2,
        down: true,
      });
      chord.forEach((midi, i) => {
        const id = `demo:${r}:${bar}:${i}`;
        events.push({
          type: 'on',
          time: start + i * 0.34,
          midi,
          id,
          velocity: i === 0 ? 0.62 : 0.54 + (i % 3) * 0.09,
        });
        events.push({ type: 'off', time: start + i * 0.34 + 0.23, midi, id });
      });
      events.push({
        type: 'pedal',
        time: start + 2.695,
        id: 'demo:pedal',
        index: 2,
        down: false,
      });
    });
  return compileScore('Atelier Prelude · 原创示奏', events);
}

export const formatTime = (time: number) =>
  `${Math.floor(Math.max(0, time) / 60)}:${String(Math.floor(Math.max(0, time) % 60)).padStart(2, '0')}`;
