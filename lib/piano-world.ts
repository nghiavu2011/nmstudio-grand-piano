import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PianoModel, box, rod } from './piano-model';
import { PianoSheet } from './piano-sheet';
import { buildRoomDetail } from './piano-room-detail';

export type View = 'overview' | 'perform' | 'mechanism';
const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
export class PianoWorld {
  scene = new T.Scene();
  renderer: T.WebGLRenderer;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  model: PianoModel;
  sheet: PianoSheet;
  sheetTime = 0;
  sheetPlaying = false;
  immersive = false;
  environments: T.Group[] = [];
  held = new Set<number>();
  sounding = new Set<number>();
  captured = new Set<number>();
  pedal = [false, false, false];
  view: View = 'overview';
  slow = false;
  onNoteOn?: (midi: number, source: string, velocity: number) => void;
  onNoteOff?: (midi: number, source: string) => void;
  onHover?: (midi: number | null, x: number, y: number) => void;
  onFrame?: () => void;
  private captureSize: { width: number; height: number } | null = null;
  private animation = 0;
  private last = 0;
  private observer: ResizeObserver;
  private envMap: T.WebGLRenderTarget;
  private light: T.DirectionalLight;
  private fill: T.DirectionalLight;
  private ambient: T.HemisphereLight;
  private targetPosition: T.Vector3 | null = null;
  private targetLook: T.Vector3 | null = null;
  private ray = new T.Raycaster();
  private pointer = new T.Vector2();
  private pointers = new Map<number, number>();
  private cleaned = false;
  private wasMobile: boolean | null = null;
  constructor(private host: HTMLElement) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      'aria-label',
      '三角钢琴：拖动旋转，滚轮缩放，点击琴键弹奏',
    );
    this.camera = new T.PerspectiveCamera(37, 1, 0.035, 80);
    this.camera.position.set(-3.45, 2.6, -4.25);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0.13, 0.84, -0.04);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.48;
    this.controls.maxDistance = 10;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = 0.045;
    this.controls.enablePan = true;
    this.controls.zoomSpeed = 0.8;
    this.controls.addEventListener('start', () => {
      this.targetPosition = null;
      this.targetLook = null;
    });
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.035);
    this.scene.environment = this.envMap.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = 0.68;
    this.ambient = new T.HemisphereLight('#eee4ca', '#222317', 1.1);
    this.scene.add(this.ambient);
    this.light = new T.DirectionalLight('#ffe0aa', 4);
    this.light.position.set(-3, 6, -2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.left = -4;
    this.light.shadow.camera.right = 4;
    this.light.shadow.camera.top = 4;
    this.light.shadow.camera.bottom = -4;
    // Millimetre-scale feet need contact shadows, not a centimetre of offset.
    this.light.shadow.camera.far = 30;
    this.light.shadow.bias = -0.00004;
    this.light.shadow.normalBias = 0.001;
    this.light.shadow.radius = 3;
    this.scene.add(this.light);
    this.fill = new T.DirectionalLight('#edf4e9', 2.5);
    this.fill.position.set(4, 3, 3);
    this.scene.add(this.fill);
    this.model = new PianoModel();
    this.sheet = new PianoSheet(this.model.desk);
    this.scene.add(this.model.group);
    this.buildEnvironments();
    this.setEnvironment(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.down, true);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerleave', this.leave);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('lostpointercapture', this.up);
    el.addEventListener('contextmenu', this.preventContext);
    this.animation = requestAnimationFrame(this.animate);
  }
  private buildEnvironments() {
    const matte = (color: string, roughness = 0.85, metalness = 0) =>
      new T.MeshStandardMaterial({ color, roughness, metalness });
    for (let index = 0; index < 3; index++) {
      const group = new T.Group();
      group.name = ['Concert hall', 'Daylight studio', 'Moonlit terrace'][
        index
      ];
      this.environments.push(group);
      this.scene.add(group);
      const floor=box(
        group,
        [40, 0.08, index === 2 ? 10 : 40],
        [0, -0.04, index === 2 ? -0.2 : 0],
        matte(
          ['#171d19', '#b3aaa0', '#27343c'][index],
          index === 0 ? 0.32 : 0.55,
          0.08,
        ),
      );
      floor.name='Ground plane';
      if (index === 0) {
        const grain = matte('#222a22', 0.65);
        for (let i = -18; i <= 18; i++)
          box(group, [0.004, 0.002, 16], [i * 0.31, 0.001, 0], grain);
        const dark = matte('#181f19');
        box(group, [18, 8, 0.15], [0, 3.9, 4.3], dark);
        const slatMats = [matte('#44402d', 0.75), matte('#303326', 0.75)];
        for (let i = -55; i <= 55; i++)
          box(
            group,
            [0.055, 6, 0.11],
            [i * 0.16, 2.98, 4.17],
            slatMats[i % 3 === 0 ? 0 : 1],
          );
        const glow = new T.MeshBasicMaterial({ color: '#debc79' });
        for (const x of [-4.7, -2.7, 2.7, 4.7]) {
          box(group, [0.017, 5.3, 0.025], [x, 2.65, 4.02], glow);
          const lamp = new T.PointLight('#e5bf70', 8, 7, 2);
          lamp.position.set(x, 2.6, 3.7);
          group.add(lamp);
        }
        const beam = new T.Mesh(
          new T.CylinderGeometry(0.06, 1.05, 5, 48, 1, true),
          new T.MeshBasicMaterial({
            color: '#e6d6a7',
            transparent: true,
            opacity: 0.016,
            depthWrite: false,
            side: T.DoubleSide,
          }),
        );
        beam.position.set(0, 2.4, -0.1);
        group.add(beam);
      } else if (index === 1) {
        const wall = matte('#c3c7be');
        box(group, [18, 7, 0.2], [0, 3.45, 4.5], wall);
        box(group, [0.2, 7, 15], [-6, 3.45, 0], wall);
        const frame = matte('#666b5c', 0.4, 0.2);
        const sky = new T.MeshBasicMaterial({ color: '#e1eef0' });
        for (let i = -2; i <= 2; i++) {
          box(group, [1.45, 4.0, 0.02], [i * 1.58, 2.7, 4.36], sky);
          box(group, [0.045, 4.2, 0.07], [i * 1.58 - 0.77, 2.7, 4.28], frame);
          box(group, [1.55, 0.045, 0.07], [i * 1.58, 2.7, 4.27], frame);
        }
        box(group, [8.4, 0.1, 0.12], [0, 0.68, 4.23], frame);
        box(group, [8.4, 0.1, 0.12], [0, 4.73, 4.23], frame);
        const sunbeam = new T.MeshBasicMaterial({
          color: '#e1c490',
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
        });
        for (let i = 0; i < 4; i++) {
          const p = box(
            group,
            [0.68, 0.002, 5],
            [i * 1.4 - 1.8, 0.001, 0.5],
            sunbeam,
          );
          p.rotation.y = 0.43;
          p.castShadow = false;
          p.receiveShadow = false;
        }
        const pot = new T.Mesh(
          new T.CylinderGeometry(0.33, 0.24, 0.6, 32),
          matte('#6f7868'),
        );
        pot.position.set(3, 0.3, 2.1);
        group.add(pot);
        const green = matte('#3e5736');
        for (let i = 0; i < 22; i++) {
          const a = i * 2.399;
          const stem = V(
            3 + Math.sin(a) * 0.35,
            1.0 + (i % 5) * 0.17,
            2.1 + Math.cos(a) * 0.35,
          );
          rod(group, V(3, 0.54, 2.1), stem, 0.013, green);
          const leafShape = new T.Shape();
          leafShape.moveTo(0,-1);
          leafShape.bezierCurveTo(-.65,-.55,-.6,.45,0,1);
          leafShape.bezierCurveTo(.6,.45,.65,-.55,0,-1);
          const leafGeometry = new T.ShapeGeometry(leafShape,12);
          const positions = leafGeometry.attributes.position;
          for(let j=0;j<positions.count;j++)positions.setZ(j,.18*positions.getY(j)**2+.15*Math.abs(positions.getX(j)));
          leafGeometry.computeVertexNormals();
          const leaf = new T.Mesh(leafGeometry, green);
          green.side=T.DoubleSide;
          leaf.position.copy(stem);
          leaf.scale.set(0.19, 0.3, 0.2);
          leaf.rotation.set(0.5, a, 0.5);
          group.add(leaf);
        }
      } else {
        const water = new T.Mesh(
          new T.PlaneGeometry(140, 140, 100, 100),
          new T.MeshPhysicalMaterial({
            color: '#182e41',
            roughness: 0.38,
            metalness: 0.2,
            envMapIntensity: 0.2,
          }),
        );
        water.rotation.x = -Math.PI / 2;
        const waterVertices=water.geometry.attributes.position;
        for(let i=0;i<waterVertices.count;i++) {
          const x=waterVertices.getX(i),y=waterVertices.getY(i);
          waterVertices.setZ(i,.018*Math.sin(x*1.6+y*.7)+.009*Math.cos(y*2.2-x*.8));
        }
        water.geometry.computeVertexNormals();
        water.position.set(0, -0.3, 38);
        group.add(water);
        const railing = matte('#6e7c7e', 0.28, 0.8);
        for (let x = -12; x <= 12; x += 1.8)
          rod(group, V(x, 0, 4.8), V(x, 0.86, 4.8), 0.013, railing);
        rod(group, V(-14, 0.86, 4.8), V(14, 0.86, 4.8), 0.018, railing);
        const moon = new T.Mesh(
          new T.SphereGeometry(0.63, 40, 24),
          new T.MeshBasicMaterial({ color: '#e1e5df' }),
        );
        moon.position.set(-6, 0.8, 8);
        group.add(moon);
        let seed = 19;
        const rnd = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const stars = [];
        for (let i = 0; i < 450; i++)
          stars.push((rnd() - 0.5) * 80, 8 + rnd() * 25, (rnd() - 0.5) * 80);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(stars, 3));
        group.add(
          new T.Points(
            geo,
            new T.PointsMaterial({
              color: '#e3e5ef',
              size: 0.043,
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.7,
            }),
          ),
        );
        const mountainMat = matte('#132330');
        const terrain=new T.PlaneGeometry(100,30,160,32);
        terrain.rotateX(-Math.PI/2);
        const terrainVertices=terrain.attributes.position;
        for(let i=0;i<terrainVertices.count;i++) {
          const x=terrainVertices.getX(i),z=terrainVertices.getZ(i);
          const envelope=Math.sin((z+15)/30*Math.PI);
          const ridge=2.8+1.1*Math.sin(x*.28)+.65*Math.sin(x*.71+z*.22)+.3*Math.sin(x*1.63-z*.4);
          terrainVertices.setY(i,Math.max(0,envelope*ridge)-.35);
        }
        terrain.computeVertexNormals();
        const mountains=new T.Mesh(terrain,mountainMat);
        mountains.position.z=35;
        mountains.name='Continuous layered mountain ridge';
        group.add(mountains);
        const lantern = new T.MeshBasicMaterial({ color: '#e2b96d' });
        for (const x of [-2.6, 2.6]) {
          box(group, [0.11, 0.19, 0.11], [x, 0.12, 2.4], lantern, 0.01);
          const p = new T.PointLight('#ebba6a', 2, 3);
          p.position.set(x, 0.28, 2.4);
          group.add(p);
        }
      }
      buildRoomDetail(group, index);
    }
  }
  setEnvironment(index: number) {
    this.environments.forEach((g, i) => (g.visible = i === index));
    const backgrounds = ['#1d241d', '#788781', '#091a2a'];
    this.scene.background = new T.Color(backgrounds[index]);
    this.scene.fog = new T.FogExp2(
      backgrounds[index],
      index === 1 ? 0.025 : 0.045,
    );
    this.light.color.set(['#ffdfac', '#fff2dd', '#b9d5ff'][index]);
    this.light.intensity = [2.4, 4.2, 2.8][index];
    this.light.position.set(
      ...([
        [-3, 6, -2],
        [3, 7, 3],
        [-4, 6, 2],
      ][index] as [number, number, number]),
    );
    this.fill.color.set(['#e1e6dc', '#dfefff', '#d4dfff'][index]);
    this.fill.intensity = [1.7, 2.2, 2.2][index];
    this.ambient.intensity = [0.7, 1.8, 0.7][index];
    this.scene.environmentIntensity = [0.8, 0.86, 0.7][index];
    this.renderer.toneMappingExposure = [0.9, 1.05, 1.08][index];
  }
  setView(view: View) {
    this.view = view;
    this.model.setExposed(view === 'mechanism');
    const mobile = !this.captureSize && this.host.clientWidth < 700;
    const positions = {
      overview: mobile ? V(-4.7, 3.6, -5.7) : V(-3.45, 2.6, -4.25),
      perform: V(0, 1.62, -2.65),
      mechanism: V(-1.15, 1.64, -1.68),
    };
    const targets = {
      overview: V(0.16, 0.82, -0.05),
      perform: V(0, 0.835, -0.9),
      mechanism: V(0, 0.87, -0.48),
    };
    this.targetPosition = positions[view];
    this.targetLook = targets[view];
    this.frameCamera();
  }
  private frameCamera() {
    const w = this.captureSize?.width ?? this.host.clientWidth,
      h = this.captureSize?.height ?? this.host.clientHeight;
    if (this.immersive && !this.captureSize) {
      this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(
      w,
      h,
      this.captureSize || w < 700
        ? 0
        : -w * (this.view === 'overview' ? 0.1 : 0.025),
      h * (w < 700 ? -0.018 : 0.055),
      w,
      h,
    );
  }
  setImmersive(value: boolean) {
    this.immersive = value;
    this.frameCamera();
  }
  private resize() {
    if (this.captureSize) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 43 : 37;
    this.frameCamera();
    const mobile = w < 700;
    if (this.wasMobile !== mobile) {
      this.wasMobile = mobile;
      this.setView(this.view);
    }
  }
  beginCapture(width: number, height: number) {
    const ratio = this.renderer.getPixelRatio();
    const oldView = this.view;
    this.captureSize = { width, height };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = 37;
    this.frameCamera();
    return () => {
      this.captureSize = null;
      this.renderer.setPixelRatio(ratio);
      this.resize();
      this.setView(oldView);
    };
  }
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(this.model.pickables, false)[0];
    return hit ? (hit.object.userData.midi as number) : null;
  }
  private down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const midi = this.pick(e);
    if (midi !== null) {
      this.controls.enabled = false;
      this.pointers.set(e.pointerId, midi);
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.onNoteOn?.(
        midi,
        `3d:${e.pointerId}`,
        e.pointerType === 'pen' ? Math.max(0.2, e.pressure) : 0.78,
      );
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  private move = (e: PointerEvent) => {
    const midi = this.pick(e);
    this.renderer.domElement.style.cursor = midi !== null ? 'pointer' : 'grab';
    this.onHover?.(midi, e.clientX, e.clientY);
    const old = this.pointers.get(e.pointerId);
    if (old !== undefined && midi !== old) {
      if (old >= 21) this.onNoteOff?.(old, `3d:${e.pointerId}`);
      if (midi !== null) {
        this.pointers.set(e.pointerId, midi);
        this.onNoteOn?.(midi, `3d:${e.pointerId}`, 0.72);
      } else this.pointers.set(e.pointerId, -1);
    }
  };
  private up = (e: PointerEvent) => {
    const midi = this.pointers.get(e.pointerId);
    if (midi !== undefined) {
      if (midi >= 21) this.onNoteOff?.(midi, `3d:${e.pointerId}`);
      this.pointers.delete(e.pointerId);
    }
    if (!this.pointers.size) this.controls.enabled = true;
  };
  private leave = () => this.onHover?.(null, 0, 0);
  private preventContext = (e: Event) => e.preventDefault();
  private animate = (ms: number) => {
    if (this.cleaned) return;
    const dt = Math.min((ms - this.last) / 1000, 0.04);
    this.last = ms;
    if (this.targetPosition && this.targetLook) {
      const t = 1 - Math.exp(-5 * dt);
      this.camera.position.lerp(this.targetPosition, t);
      this.controls.target.lerp(this.targetLook, t);
      if (this.camera.position.distanceTo(this.targetPosition) < 0.002) {
        this.targetPosition = null;
        this.targetLook = null;
      }
    }
    this.controls.update();
    this.model.animate(
      dt * (this.slow ? 0.22 : 1),
      ms / 1000,
      this.held,
      this.sounding,
      this.pedal,
      this.captured,
    );
    this.sheet.update(dt, this.sheetTime, this.sheetPlaying);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
    this.animation = requestAnimationFrame(this.animate);
  };
  releasePointers() {
    for (const [id, midi] of this.pointers) this.onNoteOff?.(midi, `3d:${id}`);
    this.pointers.clear();
    this.controls.enabled = true;
  }
  dispose() {
    this.sheet.dispose();
    this.cleaned = true;
    cancelAnimationFrame(this.animation);
    this.observer.disconnect();
    this.controls.dispose();
    this.envMap.dispose();
    const materials = new Set<T.Material>();
    const textures = new Set<T.Texture>();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    materials.forEach((m) => {
      for (const val of Object.values(m))
        if (val instanceof T.Texture) textures.add(val);
      m.dispose();
    });
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
