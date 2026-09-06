import * as T from 'three';
import VexFlow from 'vexflow';
import { compileScore, type PianoScore, type ScoreEvent } from './piano-score';
import { measuresFor, drawMeasure, layoutMeasures, type Measure, type NotationPage } from './piano-notation';

type WrittenNote = { midi: number; time: number; length: number; beats: number };
type SheetPage = { start: number; notes: WrittenNote[] };
const { Renderer, Stave, StaveNote, TickContext, Accidental } = VexFlow;
const WIDTH = 840, HEIGHT = 1188, GROUPS = 40;
const PAGE_WIDTH = .21, PAGE_HEIGHT = .297;
const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

export function paginateScore(score: PianoScore): SheetPage[] {
  const ends = new Map(score.events.filter(e => e.type === 'off').map(e => [e.id, e]));
  const groups = new Map<number, WrittenNote[]>();
  for (const e of score.events) {
    if (e.type !== 'on') continue;
    const end = ends.get(e.id);
    const notes = groups.get(e.time) ?? [];
    notes.push({ midi: e.midi, time: e.time, length: (end?.time ?? e.time + .25) - e.time,
      beats: e.beat !== undefined && end?.beat !== undefined ? end.beat - e.beat : ((end?.time ?? e.time + .25) - e.time) * 2 });
    groups.set(e.time, notes);
  }
  const onsets = [...groups.values()];
  const pages: SheetPage[] = [];
  for (let i = 0; i < onsets.length; i += GROUPS) {
    const notes = onsets.slice(i, i + GROUPS).flat();
    pages.push({ start: notes[0].time, notes });
  }
  return pages.length ? pages : [{ start: 0, notes: [] }];
}

/** The notation is a MIDI-derived reading aid; audio never reads its layout. */
export class PianoSheet {
  group = new T.Group();
  private left: T.Mesh;
  private right: T.Mesh;
  private turning: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private turningBack: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private pages: SheetPage[] = [{ start: 0, notes: [] }];
  private textures = new Map<number, T.CanvasTexture>();
  private title = 'Grand Atelier';
  private spread = -1;
  private turn = 1;
  private live: WrittenNote[] = [];
  private held = new Map<number, WrittenNote>();
  private liveStart = 0;
  private lastTime = 0;
  private isLive = false;
  private dirty = false;
  private score?: PianoScore;
  private measures: Measure[] = [];
  private notationPages: NotationPage[] = [];
  private livePedals: ScoreEvent[] = [];
  private pedalState = [false,false,false];
  constructor(parent: T.Group) {
    parent.add(this.group);
    this.group.position.set(0, .169, -.019);
    const material = () => new T.MeshStandardMaterial({ color: '#ffffff', roughness: .95, side: T.DoubleSide });
    const page = (x: number) => {
      const m = new T.Mesh(new T.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT), material());
      m.position.x = x;
      m.rotation.y = Math.PI;
      m.scale.x = -1;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.left = page(-.107);
    this.right = page(.107);
    this.turning = new T.Mesh(new T.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 32, 4), material());
    this.turning.geometry.translate(PAGE_WIDTH / 2, 0, 0);
    this.turning.position.z = -.002;
    this.turning.material.side = T.BackSide;
    this.turning.visible = false;
    this.group.add(this.turning);
    this.turningBack = new T.Mesh(this.turning.geometry.clone(), material());
    this.turningBack.material.side = T.FrontSide;
    const backUV = this.turningBack.geometry.attributes.uv;
    for (let i = 0; i < backUV.count; i++) backUV.setX(i, 1 - backUV.getX(i));
    this.turningBack.position.copy(this.turning.position);
    this.turningBack.visible = false;
    this.group.add(this.turningBack);
    this.show(0, false);
  }
  setScore(score: PianoScore) {
    this.clearTextures();
    this.score = score;
    this.measures = measuresFor(score);
    this.title = score.title;
    this.layout();
    this.isLive = false;
    this.spread = -1;
    this.show(0, false);
  }
  private texture(index: number) {
    const cached = this.textures.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const raw = canvas.getContext('2d')!;
    raw.fillStyle = '#fffefb'; raw.fillRect(0, 0, WIDTH, HEIGHT);
    raw.fillStyle = '#151515'; raw.textAlign = 'center'; raw.font = '30px Georgia, serif';
    raw.fillText(this.title, WIDTH / 2, 48, WIDTH - 100);
    raw.font = '16px sans-serif';
    raw.fillText(this.isLive ? 'LIVE TRANSCRIPTION · 120 BPM' : 'MIDI PERFORMANCE SCORE', WIDTH / 2, 74);
    const ctx = new Renderer(canvas, Renderer.Backends.CANVAS).getContext();
    const page = this.pages[index];
    const groups = [...new Set(page?.notes.map(n => n.time) ?? [])];
    if (this.score) {
      this.notationPages[index]?.systems.forEach((system, row) => {
        const total = system.weights.reduce((a,b) => a+b, 0);
        let x = 32;
        system.bars.forEach((bar, column) => {
          const width = (WIDTH - 64) * system.weights[column] / total;
          drawMeasure(raw, ctx, bar, this.score!, 120 + row * 253, width + 64, system.first + column + 1, x, column === 0);
          x += width;
        });
      });
    } else for (let row = 0; row < 5; row++) {
      const treble = new Stave(32, 110 + row * 206, WIDTH - 64).addClef('treble').setContext(ctx).draw();
      const bass = new Stave(32, 190 + row * 206, WIDTH - 64).addClef('bass').setContext(ctx).draw();
      const times = groups.slice(row * 8, row * 8 + 8);
      times.forEach((time, column) => {
        for (const low of [false, true]) {
          const notes = page!.notes.filter(n => n.time === time && (n.midi < 60) === low);
          if (!notes.length) continue;
          const durations = ['w', 'h', 'q', '8', '16', '32', '64'];
          const beats = [4, 2, 1, .5, .25, .125, .0625];
          const length = Math.max(...notes.map(n => n.beats));
          const closest = beats.reduce((best, beat, i) => Math.abs(beat - length) < Math.abs(beats[best] - length) ? i : best, 0);
          const sorted = [...new Set(notes.map(n => n.midi))].sort((a,b) => a-b);
          const note = new StaveNote({ clef: low ? 'bass' : 'treble', keys: sorted.map(m => `${names[m % 12]}/${Math.floor(m / 12) - 1}`), duration: durations[closest], auto_stem: true });
          sorted.forEach((m, i) => { if (names[m % 12].includes('#')) note.addModifier(new Accidental('#'), i); });
          note.setStave(low ? bass : treble).setContext(ctx);
          new TickContext().addTickable(note).preFormat().setX(105 + column * 82);
          note.draw();
        }
      });
      if (times.length) {
        raw.fillStyle = '#333'; raw.textAlign = 'left'; raw.font = '13px sans-serif';
        raw.fillText(`${Math.floor(times[0] / 60)}:${String(Math.floor(times[0] % 60)).padStart(2, '0')}`, 34, 110 + row * 206);
      }
    }
    raw.textAlign = 'center'; raw.fillStyle = '#222'; raw.font = '16px Georgia';
    raw.fillText(`${index + 1}`, WIDTH / 2, HEIGHT - 12);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(index, texture);
    // Bound GPU memory even for long imported MIDI files.
    if (this.textures.size > 8) for (const [key, old] of this.textures) {
      const active = [this.left, this.right, this.turning, this.turningBack].some(m => (m.material as T.MeshStandardMaterial).map === old);
      if (!active && Math.abs(key - index) > 3) { old.dispose(); this.textures.delete(key); }
    }
    return texture;
  }
  private show(spread: number, animate: boolean) {
    if (spread === this.spread) return;
    const previous = this.spread;
    this.spread = spread;
    const flipping = animate && spread === previous + 1 && this.turn >= 1;
    if (!flipping) (this.left.material as T.MeshStandardMaterial).map = this.texture(spread * 2);
    (this.right.material as T.MeshStandardMaterial).map = this.texture(spread * 2 + 1);
    (this.left.material as T.Material).needsUpdate = true;
    (this.right.material as T.Material).needsUpdate = true;
    this.turn = flipping ? 0 : 1;
    this.turning.visible = this.turn < 1;
    this.turningBack.visible = this.turning.visible;
    if (this.turning.visible) {
      this.turning.material.map = this.texture(previous * 2 + 1);
      this.turning.material.needsUpdate = true;
      this.turningBack.material.map = this.texture(spread * 2);
      this.turningBack.material.needsUpdate = true;
      this.bendPage(0);
    }
  }
  update(dt: number, time: number, playing: boolean) {
    if (this.dirty) {
      this.dirty = false;
      const current = this.spread;
      this.clearTextures(); this.spread = -1; this.show(current, false);
    }
    if (!this.isLive) {
      let page = 0;
      while (page + 1 < this.pages.length && this.pages[page + 1].start <= time + .3) page++;
      this.show(Math.floor(page / 2), playing && Math.abs(time - this.lastTime) < 1);
      this.lastTime = time;
    }
    if (this.turn >= 1) return;
    this.turn = Math.min(1, this.turn + dt / .95);
    this.bendPage(this.turn);
    this.turning.visible = this.turn < 1;
    this.turningBack.visible = this.turning.visible;
    if (this.turn === 1) {
      (this.left.material as T.MeshStandardMaterial).map = this.turningBack.material.map;
      (this.left.material as T.Material).needsUpdate = true;
    }
  }
  private bendPage(progress: number) {
    const angle = Math.PI * (progress * progress * (3 - 2 * progress));
    const positions = this.turning.geometry.attributes.position;
    const uv = this.turning.geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const bend = Math.sin(angle) * Math.sin(u * Math.PI) * .047;
      positions.setXYZ(i, (u * PAGE_WIDTH + .002) * Math.cos(angle), (v - .5) * PAGE_HEIGHT,
        -(u * PAGE_WIDTH + .002) * Math.sin(angle) - bend);
    }
    positions.needsUpdate = true;
    this.turning.geometry.computeVertexNormals();
    (this.turningBack.geometry.attributes.position as T.BufferAttribute).copy(positions as T.BufferAttribute);
    this.turningBack.geometry.attributes.position.needsUpdate = true;
    this.turningBack.geometry.computeVertexNormals();
  }
  record(midi: number, now: number) {
    if (!this.isLive) {
      this.isLive = true; this.live = []; this.held.clear(); this.liveStart = now;
      this.livePedals = []; this.pedalState = [false,false,false];
      this.title = 'Live performance';
    }
    const note = { midi, time: now - this.liveStart, length: .25, beats: .5 };
    this.live.push(note); this.held.set(midi, note);
    if (this.live.length > 400) this.live.splice(0, 80);
    this.refreshLive();
    const spread = Math.floor((this.pages.length - 1) / 2);
    if (spread === this.spread) this.spread = -1;
    this.show(spread, true);
  }
  release(midi: number, now: number) {
    const note = this.held.get(midi);
    if (note) { note.length = now - this.liveStart - note.time; note.beats = note.length * 2; this.held.delete(midi); this.refreshLive(); this.dirty = true; }
  }
  private refreshLive() {
    const events: ScoreEvent[] = this.live.flatMap((n,i) => [
      { type: 'on', id: `live:${i}`, time: n.time, beat: n.time * 2, midi: n.midi, velocity: .7 },
      { type: 'off', id: `live:${i}`, time: n.time + n.length, beat: (n.time + n.length) * 2, midi: n.midi },
    ]);
    this.score = compileScore(this.title, [...events, ...this.livePedals]);
    this.measures = measuresFor(this.score);
    this.clearTextures(); this.layout();
  }
  private layout() {
    this.notationPages = layoutMeasures(this.measures, WIDTH);
    this.pages = this.notationPages.map(p => ({ start: p.start, notes: [] }));
  }
  syncManual(held: number[], pedals: boolean[], now: number) {
    if (!this.isLive) return;
    for (const midi of this.held.keys()) if (!held.includes(midi)) this.release(midi,now);
    let changed = false;
    pedals.forEach((down,index) => {
      if (down === this.pedalState[index]) return;
      this.pedalState[index] = down; changed = true;
      const time = Math.max(0,now - this.liveStart);
      this.livePedals.push({type:'pedal',id:`live:pedal:${index}`,index,down,time,beat:time*2});
    });
    if (changed) { this.refreshLive(); this.dirty = true; }
  }
  private clearTextures() { this.textures.forEach(t => t.dispose()); this.textures.clear(); }
  dispose() {
    this.clearTextures();
    for (const mesh of [this.left, this.right, this.turning, this.turningBack]) { mesh.geometry.dispose(); (mesh.material as T.Material).dispose(); }
    this.group.removeFromParent();
  }
}
