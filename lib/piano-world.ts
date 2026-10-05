import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PianoModel, box, rod } from './piano-model';
import { PianoSheet } from './piano-sheet';

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
  setFinish(finish: 'black' | 'white') {
    this.model.setFinish(finish);
  }

  private buildEnvironments() {
    const matte = (color: string, roughness = 0.85, metalness = 0) =>
      new T.MeshStandardMaterial({ color, roughness, metalness });

    for (let index = 0; index < 3; index++) {
      const group = new T.Group();
      group.name = ['Concert hall', 'Daylight studio', 'Moonlit terrace'][index];
      this.environments.push(group);
      this.scene.add(group);

      // Floor plane
      const floor = box(
        group,
        [40, 0.08, 40],
        [0, -0.04, -0.2],
        matte(
          ['#111413', '#ede7de', '#0b1118'][index],
          index === 0 ? 0.32 : index === 1 ? 0.65 : 0.4,
          index === 0 ? 0.06 : 0.02,
        ),
      );
      floor.name = 'Ground plane';

      if (index === 0) {
        // --- 1. CONCERT HALL (Đại sảnh Hòa nhạc Đẳng cấp) ---
        // Solemn raised concert stage dais (Bục diễn trang trọng tôn vinh cây đàn)
        const stage = box(group, [5.8, 0.08, 4.8], [0, 0.04, -0.2], matte('#181b19', 0.26, 0.06), 0.025);
        stage.name = 'Concert stage dais';
        // Champagne gold brass edge trim
        box(group, [5.92, 0.02, 4.92], [0, 0.01, -0.2], matte('#c4a25a', 0.28, 0.75));

        // Curving Acoustic shell backdrop with warm timber slats
        const shellBack = box(group, [18, 8, 0.2], [0, 3.9, 4.4], matte('#1a1612', 0.65));
        shellBack.name = 'Acoustic Shell Backdrop';

        // Architectural fluted timber acoustic fins
        const finMatA = matte('#33281e', 0.55);
        const finMatB = matte('#271f17', 0.55);
        for (let i = -45; i <= 45; i++) {
          box(group, [0.06, 6.2, 0.12], [i * 0.18, 3.1, 4.25], i % 2 === 0 ? finMatA : finMatB);
        }

        // Grand architectural stage columns on flanks
        for (const side of [-5.8, 5.8]) {
          const col = new T.Mesh(new T.CylinderGeometry(0.38, 0.42, 8, 32), matte('#171411', 0.6));
          col.position.set(side, 3.9, 4.1);
          group.add(col);
          // Column capital trim in brass
          box(group, [0.9, 0.15, 0.9], [side, 6.8, 4.1], matte('#a68846', 0.35, 0.6));
        }

        // Warm stage uplights along the backdrop
        const glow = new T.MeshBasicMaterial({ color: '#f3c77c' });
        for (const x of [-4.5, -2.2, 2.2, 4.5]) {
          box(group, [0.018, 5.6, 0.02], [x, 2.8, 4.15], glow);
          const lamp = new T.PointLight('#e8bd69', 5.5, 6, 2);
          lamp.position.set(x, 2.5, 3.8);
          group.add(lamp);
        }

        // Dramatic soft spotlight beam shining down on the grand piano
        const beam = new T.Mesh(
          new T.CylinderGeometry(0.08, 1.35, 6.5, 48, 1, true),
          new T.MeshBasicMaterial({
            color: '#ffeed1',
            transparent: true,
            opacity: 0.028,
            depthWrite: false,
            side: T.DoubleSide,
          }),
        );
        beam.position.set(0, 3.1, -0.2);
        group.add(beam);

      } else if (index === 1) {
        // --- 2. DAYLIGHT STUDIO (Studio nền be sáng với bục trang trọng) ---
        // Warm bright beige gallery back wall
        const wallBeige = matte('#f4eee6', 0.85);
        box(group, [18, 7.5, 0.2], [0, 3.65, 4.5], wallBeige);
        box(group, [0.2, 7.5, 16], [-6.2, 3.65, 0], wallBeige);

        // Raised solemn travertine dais for piano and bench (Bục trang trọng)
        const podium = box(group, [5.6, 0.08, 4.6], [0, 0.04, -0.2], matte('#ded6ca', 0.52), 0.025);
        podium.name = 'Beige studio podium';
        // Blonde Scandinavian oak trim
        box(group, [5.72, 0.02, 4.72], [0, 0.01, -0.2], matte('#b89d7e', 0.42));

        // Floor-to-ceiling architectural window opening with sheer light
        const frameMat = matte('#4e4943', 0.4, 0.1);
        const skyMat = new T.MeshBasicMaterial({ color: '#f8fafc' });
        for (let i = -2; i <= 2; i++) {
          box(group, [1.42, 4.4, 0.02], [i * 1.55, 2.9, 4.38], skyMat);
          box(group, [0.045, 4.5, 0.07], [i * 1.55 - 0.74, 2.9, 4.3], frameMat);
          box(group, [1.5, 0.045, 0.07], [i * 1.55, 2.9, 4.29], frameMat);
        }
        box(group, [8.2, 0.08, 0.1], [0, 0.7, 4.26], frameMat);
        box(group, [8.2, 0.08, 0.1], [0, 5.1, 4.26], frameMat);

        // Soft sunbeams cast onto the floor
        const sunbeamMat = new T.MeshBasicMaterial({
          color: '#fff5e4',
          transparent: true,
          opacity: 0.07,
          depthWrite: false,
        });
        for (let i = 0; i < 4; i++) {
          const p = box(
            group,
            [0.72, 0.002, 5.8],
            [i * 1.35 - 1.8, 0.001, 0.4],
            sunbeamMat,
          );
          p.rotation.y = 0.42;
          p.castShadow = false;
          p.receiveShadow = false;
        }

        // Minimalist ceramic pedestal with ikebana floral branch in far corner (non-intrusive)
        const plinth = new T.Mesh(new T.CylinderGeometry(0.24, 0.28, 0.75, 32), matte('#c8beb1', 0.5));
        plinth.position.set(3.8, 0.375, 2.2);
        group.add(plinth);
        const vase = new T.Mesh(new T.CylinderGeometry(0.1, 0.14, 0.35, 24), matte('#8e8476', 0.4));
        vase.position.set(3.8, 0.92, 2.2);
        group.add(vase);
        const branchMat = matte('#504236', 0.6);
        rod(group, V(3.8, 1.05, 2.2), V(3.95, 1.6, 2.1), 0.008, branchMat);
        rod(group, V(3.9, 1.3, 2.15), V(3.65, 1.52, 2.25), 0.006, branchMat);

      } else {
        // --- 3. MIDNIGHT (Đêm giữa trời sao, bục trang trọng, núi đồi cây cối) ---
        // Raised solemn obsidian / dark marble podium for piano and bench
        const nightPodium = box(group, [5.6, 0.08, 4.6], [0, 0.04, -0.2], matte('#0e1520', 0.22, 0.15), 0.025);
        nightPodium.name = 'Midnight solemn podium';
        // Brushed silver-platinum trim
        box(group, [5.72, 0.02, 4.72], [0, 0.01, -0.2], matte('#728a9e', 0.3, 0.5));

        // Calm nocturnal lake beyond terrace
        const water = new T.Mesh(
          new T.PlaneGeometry(160, 160, 80, 80),
          new T.MeshPhysicalMaterial({
            color: '#091522',
            roughness: 0.2,
            metalness: 0.3,
            envMapIntensity: 0.4,
          }),
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, -0.3, 38);
        group.add(water);

        // Glowing moon
        const moon = new T.Mesh(
          new T.SphereGeometry(0.82, 40, 24),
          new T.MeshBasicMaterial({ color: '#f2f6ff' }),
        );
        moon.position.set(-6.5, 2.2, 11);
        group.add(moon);
        const moonHalo = new T.Mesh(
          new T.SphereGeometry(1.2, 32, 16),
          new T.MeshBasicMaterial({ color: '#d8e7ff', transparent: true, opacity: 0.12, side: T.BackSide }),
        );
        moonHalo.position.copy(moon.position);
        group.add(moonHalo);

        // Starfield in midnight sky (850 twinkling stars)
        let seed = 37;
        const rnd = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const stars = [];
        for (let i = 0; i < 850; i++)
          stars.push((rnd() - 0.5) * 110, 5 + rnd() * 35, (rnd() - 0.5) * 110);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(stars, 3));
        group.add(
          new T.Points(
            geo,
            new T.PointsMaterial({
              color: '#dbe7f7',
              size: 0.048,
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.88,
            }),
          ),
        );

        // Mountain ridges (Núi đồi hùng vĩ)
        const mountainMat = matte('#070e17', 0.85);
        const terrain = new T.PlaneGeometry(120, 35, 180, 40);
        terrain.rotateX(-Math.PI / 2);
        const terrainVertices = terrain.attributes.position;
        for (let i = 0; i < terrainVertices.count; i++) {
          const x = terrainVertices.getX(i), z = terrainVertices.getZ(i);
          const envelope = Math.sin(((z + 17.5) / 35) * Math.PI);
          const ridge = 3.6 + 1.5 * Math.sin(x * 0.25) + 0.8 * Math.sin(x * 0.65 + z * 0.2) + 0.4 * Math.sin(x * 1.5 - z * 0.35);
          terrainVertices.setY(i, Math.max(0, envelope * ridge) - 0.3);
        }
        terrain.computeVertexNormals();
        const mountains = new T.Mesh(terrain, mountainMat);
        mountains.position.z = 38;
        mountains.name = 'Continuous layered mountain ridge';
        group.add(mountains);

        // Pine trees framing the flanks (Cây cối bao quanh)
        const pineFoliage = matte('#0e2118', 0.9);
        const pineTrunk = matte('#241c15', 0.9);
        for (const [px, pz, scale] of [
          [-6.2, 2.0, 1.25], [-7.4, 3.4, 1.55], [-8.0, 1.5, 1.05], [-8.8, 4.0, 1.65],
          [6.2, 2.0, 1.15], [7.4, 3.4, 1.45], [8.0, 1.6, 1.25], [8.8, 3.8, 1.75],
          [-4.8, 4.6, 1.35], [4.8, 4.6, 1.35]
        ]) {
          box(group, [0.08 * scale, 0.8 * scale, 0.08 * scale], [px, 0.4 * scale, pz], pineTrunk);
          for (let l = 0; l < 3; l++) {
            const cone = new T.Mesh(
              new T.ConeGeometry((0.55 - l * 0.12) * scale, (0.75 - l * 0.1) * scale, 7),
              pineFoliage,
            );
            cone.position.set(px, (0.7 + l * 0.45) * scale, pz);
            group.add(cone);
          }
        }

        // Warm ground lanterns beside terrace dais
        const lanternMat = new T.MeshBasicMaterial({ color: '#f3c273' });
        for (const x of [-2.9, 2.9]) {
          box(group, [0.12, 0.2, 0.12], [x, 0.14, 2.2], lanternMat, 0.01);
          const p = new T.PointLight('#f0be6e', 2.5, 4.0);
          p.position.set(x, 0.3, 2.2);
          group.add(p);
        }
      }
    }
  }

  setEnvironment(index: number) {
    this.environments.forEach((g, i) => (g.visible = i === index));
    const backgrounds = ['#0c0f0d', '#ece5db', '#040914'];
    this.scene.background = new T.Color(backgrounds[index]);
    this.scene.fog = new T.FogExp2(
      backgrounds[index],
      index === 1 ? 0.022 : index === 0 ? 0.038 : 0.032,
    );
    this.light.color.set(['#ffdfaa', '#fff6e4', '#c2dcff'][index]);
    this.light.intensity = [2.9, 4.2, 2.6][index];
    this.light.position.set(
      ...([
        [-3.2, 6.5, -2],
        [3.5, 7.2, 3],
        [-4.5, 5.8, 3],
      ][index] as [number, number, number]),
    );
    this.fill.color.set(['#e6e0d2', '#e2efff', '#cad8f5'][index]);
    this.fill.intensity = [1.8, 2.4, 2.0][index];
    this.ambient.intensity = [0.85, 2.0, 0.75][index];
    this.scene.environmentIntensity = [0.85, 0.9, 0.72][index];
    this.renderer.toneMappingExposure = [0.95, 1.05, 1.05][index];
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
