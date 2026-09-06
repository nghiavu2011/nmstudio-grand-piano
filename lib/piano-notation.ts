import VexFlow from 'vexflow';
import type { PianoScore, ScoreEvent } from './piano-score';

const { Stave, StaveNote, TickContext, Accidental, StaveTie, StaveConnector, Beam, Dot } = VexFlow;
const GRID = 8; // 32nd-note display grid; playback retains the original timing.
export type EngravedNote = { id: string; midi: number; start: number; end: number };
export type Measure = { start: number; end: number; time: number; numerator: number; denominator: number; key: number; minor: boolean; notes: EngravedNote[] };
export type Fragment = { start: number; end: number; notes: EngravedNote[]; duration: string; dotted: boolean };
const majorKeys = ['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
const minorKeys = ['Abm','Ebm','Bbm','Fm','Cm','Gm','Dm','Am','Em','Bm','F#m','C#m','G#m','D#m','A#m'];

export function beatTime(score: PianoScore, beat: number) {
  const tempo = score.notation?.tempos.filter(t => t.beat <= beat).at(-1);
  return tempo ? tempo.time + (beat - tempo.beat) * 60 / tempo.bpm : beat / 2;
}
export function tempoAt(score: PianoScore, beat: number) {
  return score.notation?.tempos.filter(t => t.beat <= beat).at(-1)?.bpm ?? 120;
}
export function measuresFor(score: PianoScore): Measure[] {
  const ends = new Map(score.events.filter(e => e.type === 'off').map(e => [e.id, e]));
  const notes: EngravedNote[] = score.events.filter(e => e.type === 'on').map(e => {
    const start = Math.round((e.beat ?? e.time * 2) * GRID) / GRID;
    const off = ends.get(e.id);
    return { id: e.id, midi: e.midi, start, end: Math.max(start + 1 / GRID, Math.round((off?.beat ?? (off?.time ?? e.time + .25) * 2) * GRID) / GRID) };
  });
  const last = Math.max(1, ...notes.map(n => n.end));
  const bars: Measure[] = [];
  for (let start = 0; start < last;) {
    const meter = score.notation?.meters.filter(m => m.beat <= start).at(-1) ?? { numerator: 4, denominator: 4 };
    const key = score.notation?.keys.filter(k => k.beat <= start).at(-1) ?? { key: 0, minor: false };
    const change = score.notation?.meters.find(m => m.beat > start);
    const end = Math.min(start + meter.numerator * 4 / meter.denominator, change?.beat ?? Infinity);
    if (end <= start) throw Error('Invalid notation meter');
    bars.push({ start, end, time: beatTime(score, start), ...meter, key: key.key, minor: key.minor, notes: notes.filter(n => n.start < end && n.end > start) });
    start = end;
  }
  return bars;
}

export function fragmentsFor(bar: Measure, low: boolean): Fragment[] {
  const notes = bar.notes.filter(n => (n.midi < 60) === low);
  const boundaries = [...new Set([bar.start, bar.end, ...notes.flatMap(n => [Math.max(bar.start, n.start), Math.min(bar.end, n.end)])])].sort((a,b) => a-b);
  const fragments: Fragment[] = [];
  const values: [number,string,boolean][] = [[4,'w',false],[3,'h',true],[2,'h',false],[1.5,'q',true],[1,'q',false],[.75,'8',true],[.5,'8',false],[.375,'16',true],[.25,'16',false],[.125,'32',false]];
  for (let i = 0; i < boundaries.length - 1; i++) {
    let start = boundaries[i]; const end = boundaries[i + 1];
    while (start < end - 1e-7) {
      const remaining = end - start;
      const value = values.find(([v]) => v <= remaining + 1e-7) ?? values.at(-1)!;
      const next = Math.min(end, start + value[0]);
      fragments.push({ start, end: next, duration: value[1], dotted: value[2], notes: notes.filter(n => n.start <= start && n.end >= next) });
      start = next;
    }
  }
  return fragments;
}

export function voicesFor(bar: Measure, low: boolean): Fragment[][] {
  const chords = new Map<string,EngravedNote[]>();
  for (const n of bar.notes.filter(n => (n.midi < 60) === low)) {
    const key = `${n.start}:${n.end}`;
    chords.set(key,[...(chords.get(key) ?? []),n]);
  }
  const lanes: EngravedNote[][] = [];
  for (const chord of [...chords.values()].sort((a,b) => a[0].start-b[0].start || b[0].end-a[0].end)) {
    let lane = lanes.find(l => l.at(-1)!.end <= chord[0].start);
    if (!lane) { lane = []; lanes.push(lane); }
    lane.push(...chord);
  }
  return (lanes.length ? lanes : [[]]).map(notes => fragmentsFor({...bar,notes},low));
}

function pitch(midi: number, key: number) {
  const names = key < 0 ? ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'] : ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
  const name = names[midi % 12];
  return { name, letter: name[0], accidental: name.slice(1) || 'n', octave: Math.floor(midi / 12) - 1 };
}

export type NotationSystem = { first: number; bars: Measure[]; weights: number[] };
export type NotationPage = { start: number; systems: NotationSystem[] };

/** Pack by engraving density, not elapsed time: short meters must not waste a row. */
export function layoutMeasures(bars: Measure[], width = 840): NotationPage[] {
  const systems: NotationSystem[] = [];
  for (let i = 0; i < bars.length;) {
    const system: NotationSystem = { first: i, bars: [], weights: [] };
    let used = 0;
    while (i < bars.length) {
      const bar = bars[i];
      const columns = new Set([false, true].flatMap(low => voicesFor(bar, low).flat().map(f => f.start))).size;
      const previous = system.bars.at(-1);
      // Keep meter/key changes at system boundaries so their signatures remain explicit.
      if (previous && (previous.key !== bar.key || previous.minor !== bar.minor || previous.numerator !== bar.numerator || previous.denominator !== bar.denominator)) break;
      const weight = (previous ? 30 : 115 + Math.abs(bar.key) * 10) + columns * 24;
      if (previous && (used + weight > width - 64 || system.bars.length >= 4)) break;
      system.bars.push(bar); system.weights.push(weight); used += weight; i++;
    }
    systems.push(system);
  }
  const pages: NotationPage[] = [];
  for (let i = 0; i < systems.length; i += 4)
    pages.push({ start: systems[i].bars[0].time, systems: systems.slice(i, i + 4) });
  return pages;
}

export function drawMeasure(raw: CanvasRenderingContext2D, ctx: ReturnType<InstanceType<typeof VexFlow.Renderer>['getContext']>, bar: Measure, score: PianoScore, y: number, width: number, number: number, x = 32, first = true) {
  const keyName = (bar.minor ? minorKeys : majorKeys)[bar.key + 7] ?? 'C';
  const stave = (low: boolean) => {
    const s = new Stave(x, y + (low ? 80 : 0), width - 64);
    if (first) s.addClef(low ? 'bass' : 'treble').addKeySignature(keyName).addTimeSignature(`${bar.numerator}/${bar.denominator}`);
    return s.setContext(ctx).draw();
  };
  const treble = stave(false), bass = stave(true);
  if (first) new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
  new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
  new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
  const left = Math.max(treble.getNoteStartX(), bass.getNoteStartX()) + 10;
  const usable = x + width - 82 - left;
  const columns = [...new Set([...voicesFor(bar,false).flat(), ...voicesFor(bar,true).flat()].map(f => f.start).concat(bar.end))].sort((a,b) => a-b);
  const xAt = (beat: number) => {
    const index = Math.max(0, columns.findIndex((b,i) => b <= beat && (columns[i+1] ?? Infinity) > beat));
    const fraction = index === columns.length - 1 ? 0 : (beat - columns[index]) / (columns[index+1] - columns[index]);
    return left + (index + fraction) / (columns.length - 1) * usable;
  };
  for (const low of [false,true]) {
    const stave = low ? bass : treble;
    const lanes = voicesFor(bar,low);
    lanes.forEach((fragments,laneIndex) => {
    const accidentalState = new Map<string,string>();
    const keyState = new Map<string,string>();
    const order = bar.key < 0 ? 'beadgcf' : 'fcgdaeb';
    order.split('').slice(0, Math.abs(bar.key)).forEach(letter => keyState.set(letter, bar.key < 0 ? 'b' : '#'));
    const rendered = fragments.map(f => {
      const midis = [...new Set(f.notes.map(n => n.midi))].sort((a,b) => a-b);
      const rest = midis.length === 0;
      const note = new StaveNote({ clef: low ? 'bass' : 'treble', keys: rest ? [low ? 'd/3' : 'b/4'] : midis.map(m => { const p = pitch(m,bar.key); return `${p.name}/${p.octave}`; }), duration: f.duration + (rest ? 'r' : ''), auto_stem: lanes.length === 1, stem_direction: laneIndex % 2 ? -1 : 1 });
      if (rest && laneIndex > 0) note.setStyle({fillStyle:'transparent',strokeStyle:'transparent'});
      if (f.dotted) Dot.buildAndAttach([note], { all: true });
      midis.forEach((m,i) => {
        const p = pitch(m,bar.key), location = p.letter + p.octave;
        const previous = accidentalState.get(location) ?? keyState.get(p.letter) ?? 'n';
        if (previous !== p.accidental) note.addModifier(new Accidental(p.accidental),i);
        accidentalState.set(location,p.accidental);
      });
      note.setStave(stave).setContext(ctx);
      new TickContext().addTickable(note).preFormat().setX(xAt(f.start) - stave.getNoteStartX());
      return { note, fragment: f, midis };
    });
    const beams = Beam.generateBeams(rendered.map(r => r.note), {stem_direction: lanes.length > 1 ? (laneIndex % 2 ? -1 : 1) : undefined});
    rendered.forEach(r => r.note.draw());
    beams.forEach(b => b.setContext(ctx).draw());
    rendered.forEach((r,i) => {
      r.midis.forEach((m,index) => {
        const n = r.fragment.notes.find(n => n.midi === m)!;
        if (n.start < r.fragment.start) {
          const prev = rendered[i-1];
          new StaveTie({ first_note: prev?.note, last_note: r.note, first_indices: [prev?.midis.indexOf(m) ?? index], last_indices: [index] }).setContext(ctx).draw();
        }
        if (r.fragment.end === bar.end && n.end > bar.end)
          new StaveTie({ first_note: r.note, first_indices: [index], last_indices: [index] }).setContext(ctx).draw();
      });
    });
    });
  }
  raw.fillStyle = '#161616'; raw.textAlign = 'left'; raw.font = '13px sans-serif';
  raw.fillText(String(number), x + 1, y - 5);
  // MIDI may contain a default and a real tempo at beat zero. Last event wins,
  // exactly as in playback; showing the first one mislabeled 156 BPM as 120.
  if (first || score.notation?.tempos.some(t => t.beat === bar.start))
    raw.fillText(`quarter = ${Math.round(tempoAt(score, bar.start))}`, x + 33, y - 5);
  for (const index of [0,1,2]) {
    const pedal = score.events.filter((e): e is Extract<ScoreEvent, {type: 'pedal'}> => e.type === 'pedal' && e.index === index);
    const at = (e: typeof pedal[number]) => e.beat ?? e.time * 2;
    const ids = new Set<string>();
    pedal.filter(e => at(e) < bar.start).forEach(e => { if (e.down) ids.add(e.id); else ids.delete(e.id); });
    let start = ids.size ? bar.start : null;
    const lineY = y + 186 + (2 - index) * 15;
    const draw = (a: number,b: number, released: boolean) => {
      raw.beginPath(); raw.moveTo(xAt(a),lineY-5); raw.lineTo(xAt(a),lineY); raw.lineTo(xAt(b),lineY);
      if (released) raw.lineTo(xAt(b),lineY-5);
      raw.strokeStyle = '#222'; raw.lineWidth = 1; raw.stroke();
      raw.font = '11px serif'; raw.fillText(index === 2 ? 'Ped.' : index === 1 ? 'Sost.' : 'una corda',xAt(a),lineY-7);
    };
    pedal.filter(e => at(e) >= bar.start && at(e) < bar.end).forEach(e => {
      const was = ids.size > 0;
      if (e.down) ids.add(e.id); else ids.delete(e.id);
      if (!was && ids.size) start = at(e);
      if (was && !ids.size && start !== null) { draw(start,at(e),true); start = null; }
    });
    if (start !== null) draw(start,bar.end,false);
  }
}
