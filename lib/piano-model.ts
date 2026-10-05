import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { KEYBOARD, KEY_LAYOUT, noteName } from './music';
import { whiteKeyOutline } from './piano-keyboard';
import { ACTION, actionPose, buildActionDetail, buildBackcheck, updateBackcheck, pedalLinkage, updateRepetitionSpring, hammerContactAngle, hammerStroke, supportedHammerAngle, HAMMER_STROKE_SECONDS, HAMMER_ATTACK_SECONDS } from './piano-action';
import { bridgeRibbon, intersectShapes, SOUNDBOARD_TOP, SOUNDBOARD_THICKNESS, soundboardShape, stringScale, subtractShapes } from './piano-acoustics';
import { PedalTransmission, SOFT_OUTPUT_RADIUS } from './piano-pedals';
import { feltMaterial, leatherMaterial, pianoSurfaces } from './piano-materials';
const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const LID_HINGE_Y=1.089;
const PROP_BASE=v(.64,1.032,.04);
const MUSIC_DESK_Y=1.005;
const MUSIC_DESK_HEIGHT=.33;
const MUSIC_DESK_DEPTH=.022;
const MUSIC_DESK_OPEN_Z=-.49;
const MUSIC_DESK_FRONT_CLEARANCE_Z=-.68;
const PERIPHERAL_PLATE_TOP=.917;
const PERIPHERAL_PLATE_DEPTH=.026;
const DAMPER_WIRE_RADIUS=.0012;
const DAMPER_MAX_LIFT=.04;
export function box(
  parent: T.Object3D,
  size: number[],
  pos: number[],
  mat: T.Material,
  radius = 0,
) {
  const geometry = radius
    ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius)
    : new T.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new T.Mesh(geometry, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function rod(
  parent: T.Object3D,
  from: T.Vector3,
  to: T.Vector3,
  radius: number,
  mat: T.Material,
  sides = 8,
) {
  const direction = to.clone().sub(from);
  const mesh = new T.Mesh(
    new T.CylinderGeometry(radius, radius, direction.length(), sides),
    mat,
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(v(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function outline() {
  const s = new T.Shape();
  s.moveTo(-0.8, -0.77);
  s.lineTo(0.8, -0.77);
  s.lineTo(0.8, -0.35);
  s.bezierCurveTo(0.8, 0.02, 0.49, 0.28, 0.37, 0.57);
  s.bezierCurveTo(0.27, 0.83, 0.4, 1.28, 0.12, 1.52);
  s.bezierCurveTo(-0.13, 1.76, -0.69, 1.71, -0.8, 1.4);
  s.lineTo(-0.8, -0.77);
  return s;
}
function slab(
  parent: T.Object3D,
  shape: T.Shape,
  depth: number,
  y: number,
  mat: T.Material,
  bevel = 0.007,
) {
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: 4,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 96,
  });
  g.rotateX(Math.PI / 2);
  const m = new T.Mesh(g, mat);
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const a = c.getContext('2d')!;
  a.fillStyle = '#c2aa83';
  a.fillRect(0, 0, 256, 1024);
  let seed = 43;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1200; i++) {
    a.strokeStyle = `rgba(${rnd() > 0.5 ? '112,85,53' : '232,215,181'},${rnd() * 0.11})`;
    a.lineWidth = rnd() * 1.5 + 0.3;
    a.beginPath();
    const x = rnd() * 256;
    a.moveTo(x, 0);
    a.bezierCurveTo(x + 7 * rnd(), 300, x - 9 * rnd(), 700, x + 3, 1024);
    a.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}
function textPlate(
  parent: T.Object3D,
  text: string,
  width: number,
  height: number,
  pos: number[],
  rotation: number[],
) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  if (text.includes('N&M') || text.includes('GRAND')) {
    const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 1024, 0) : null;
    if (grad) {
      grad.addColorStop(0, '#d4af37');
      grad.addColorStop(0.3, '#f7e7a9');
      grad.addColorStop(0.5, '#fff6d6');
      grad.addColorStop(0.7, '#f7e7a9');
      grad.addColorStop(1, '#d4af37');
      ctx.fillStyle = grad;
      ctx.strokeStyle = grad;
    } else {
      ctx.fillStyle = '#d4af37';
      ctx.strokeStyle = '#d4af37';
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Golden decorative lines
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(80, 64);
    ctx.lineTo(210, 64);
    ctx.arc(220, 64, 3.5, 0, Math.PI * 2);
    ctx.moveTo(814, 64);
    ctx.lineTo(944, 64);
    ctx.arc(804, 64, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px "Cinzel", "Times New Roman", Georgia, serif';
    ctx.letterSpacing = '5px';
    ctx.fillText(text, 512, 64);
  } else if (text === 'G A' || text === 'N&M') {
    const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 1024, 0) : null;
    if (grad) {
      grad.addColorStop(0, '#d4af37');
      grad.addColorStop(0.5, '#fff6d6');
      grad.addColorStop(1, '#d4af37');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#d4af37';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('N&M', 512, 64);
  } else {
    ctx.fillStyle = '#d6b77f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '48px Georgia';
    ctx.fillText(text, 512, 64);
  }

  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(
    new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  m.position.set(...(pos as [number, number, number]));
  m.rotation.set(...(rotation as [number, number, number]));
  m.scale.x = -1;
  parent.add(m);
  return m;
}
function mergeStatic(parent: T.Group) {
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  parent.updateMatrixWorld(true);
  for (const obj of parent.children.slice())
    if (obj instanceof T.Mesh && !Array.isArray(obj.material)) {
      const geo = (
        obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
      ).applyMatrix4(obj.matrix);
      const list = batches.get(obj.material) || [];
      list.push(geo);
      batches.set(obj.material, list);
      obj.geometry.dispose();
      parent.remove(obj);
    }
  for (const [material, geos] of batches) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) {
      const m = new T.Mesh(merged, material);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
    }
  }
}
export type ActionKey = {
  midi: number;
  x: number;
  key: T.Group;
  mesh: T.Mesh;
  hammer: T.Group;
  wippen: T.Group;
  jack: T.Group;
  repetition: T.Group;
  springLead: T.Mesh;
  damper: T.Group;
  underlever: T.Group;
  captureTab:T.Group;
  strings: T.Line;
  energy: number;
  strike: number;
  strikeStart: number;
  strikeDepression: number;
  contactAngle: number;
  checkingAngle: number;
  backcheck: ReturnType<typeof buildBackcheck>;
  depression: number;
  lift: number;
};
export class PianoModel {
  group = new T.Group();
  action = new T.Group();
  lid = new T.Group();
  lidProp = new T.Group();
  desk = new T.Group();
  deskSupport = new T.Group();
  ironBraces = new T.Group();
  acoustics = new T.Group();
  transmission: PedalTransmission;
  groundHardware=new T.Group();
  benchSeat:T.Mesh;
  private deskBraces: T.Mesh[] = [];
  keys: ActionKey[] = [];
  pickables: T.Mesh[] = [];
  pedals: T.Group[] = [];
  private pedalRods: T.Mesh[] = [];
  private pedalRockers: T.Group[] = [];
  removable: T.Object3D[] = [];
  caseMaterial: T.MeshPhysicalMaterial;
  lidOpen = true;
  exposed = false;
  private lidAngle = 0.55;
  private entranceTime: number | null = null;
  private actionOffset = 0;
  private inverseRoot = new T.Matrix4();
  private instanceLocal = new T.Matrix4();
  private instances: { mesh: T.InstancedMesh; objects: T.Mesh[] }[] = [];
  springWires!: T.Mesh;
  private springNormal = new T.Matrix3();
  private springVertex = new T.Vector3();
  constructor() {
    // The pianist faces +Z, so their right is world -X. Mirror the complete
    // instrument (including bass rim and pedals), not just MIDI labels.
    this.group.scale.x = -1;
    const surfaces=pianoSurfaces();
    const black = new T.MeshPhysicalMaterial({
      color: '#080b0b',
      metalness: 0,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
    });
    this.caseMaterial = black;
    const wood = new T.MeshStandardMaterial({
      map: woodTexture(),
      color: '#f1e2c7',
      roughness: 0.52,
    });
    const walnut = new T.MeshStandardMaterial({
      color: '#482819',
      roughness: 0.4,
    });
    const brass = new T.MeshStandardMaterial({
      color: '#c99b49',
      metalness: 0.78,
      roughness: 0.26,
    });
    const iron = new T.MeshStandardMaterial({
      color: '#aa813e',
      metalness: 0.58,
      roughness: 0.4,
      bumpMap:surfaces.cast,
      bumpScale:.0003,
    });
    const steel = new T.MeshPhysicalMaterial({
      color: '#aeb4ae',
      metalness: 0.92,
      roughness: 0.34,
      anisotropy:.4,
      bumpMap:surfaces.brushed,
      bumpScale:.000018,
    });
    const ivory = new T.MeshPhysicalMaterial({
      color: '#f3eee0',
      roughness: 0.24,
      clearcoat: 0.6,
    });
    const ebony = new T.MeshPhysicalMaterial({
      color: '#0b0c0c',
      roughness: 0.25,
      clearcoat: 0.7,
    });
    const red = feltMaterial(surfaces.fibre,'#761f22');
    const felt = feltMaterial(surfaces.fibre);
    const leather=leatherMaterial(surfaces.leather);
    const tread=new T.MeshStandardMaterial({color:'#1b1c19',roughness:.83});
    this.groundHardware.name='Ground-contact casters and bench glides';
    this.group.add(this.groundHardware);
    const stat = new T.Group();
    this.group.add(stat);
    this.action.name = 'Action assembly';
    this.group.add(this.action);
    const actionFrame = new T.Group();
    actionFrame.name = 'Moving action frame and centre-pin flanges';
    this.action.add(actionFrame);
    box(actionFrame, [1.46, .012, .026], [0, .785, -.334], walnut, .002).name = 'Wippen flange rail';
    box(actionFrame, [1.46, .014, .014], [0, .849, -.372], brass, .002).name = 'Hammer flange rail';
    for (const x of [-.729, .729]) {
      box(actionFrame, [.014, .071, .032], [x, .8165, -.367], brass, .002).name = 'Action-frame bracket';
      box(actionFrame, [.014, .012, .08], [x, .787, -.355], brass, .002);
    }
    const belly = outline();
    belly.holes.push(new T.Path(outline().getPoints(80).map(p=>new T.Vector2(p.x*.86,p.y*.88+.02))));
    const bottom = slab(stat, belly, 0.085, 0.755, black);
    bottom.name = 'Open laminated belly frame';
    box(stat,[1.48,.018,.045],[0,.6995,-.27],wood,.002).name='Trapwork mounting beam';
    box(stat,[1.46,.025,.03],[0,.78,-.115],wood,.002).name='Damper flange rail';
    box(actionFrame,[.014,.018,.026],[-.73,.785-SOFT_OUTPUT_RADIUS,-.39],wood,.001).name='Soft pedal follower face';
    box(actionFrame,[.014,.026,.045],[-.73,.78,-.373],brass,.001);
    const rimShape = outline();
    const inner = new T.Path(
      outline()
        .getPoints(80)
        .map((p) => new T.Vector2(p.x * 0.91, p.y * 0.93 + 0.025)),
    );
    rimShape.holes.push(inner);
    const rim = slab(this.group, rimShape, 0.343, 1.073, black);
    rim.name = 'Bent laminated outer rim';
    this.removable.push(rim);
    const innerLinerShape = outline();
    innerLinerShape.holes.push(new T.Path(outline().getPoints(80)
      .map(p => new T.Vector2(p.x * .95, p.y * .93 + .025))));
    const inRim = slab(this.group, innerLinerShape, 0.08, 0.958, walnut);
    inRim.name = 'Inner walnut rim with action clearance';
    inRim.scale.set(0.965, 1, 0.974);
    this.removable.push(inRim);
    this.acoustics.name = 'Soundboard, bridges and string terminations';
    this.group.add(this.acoustics);
    slab(this.acoustics, soundboardShape(), SOUNDBOARD_THICKNESS, SOUNDBOARD_TOP, wood, 0).name = 'Spruce soundboard';
    for (let z = .02; z < 1.4; z += 0.16) {
      const rib = new T.Shape([new T.Vector2(-.75,z-.02),new T.Vector2(.75,z-.02),
        new T.Vector2(.75,z+.02),new T.Vector2(-.75,z+.02)]);
      for (const shape of intersectShapes(rib,soundboardShape()))
        slab(this.acoustics,shape,.02,SOUNDBOARD_TOP-SOUNDBOARD_THICKNESS,wood,0).name='Soundboard underside rib';
    }
    // The scaled peripheral plate otherwise runs through the outer hammer
    // lanes. A real action-well opening leaves their entire flight unobstructed.
    const strikeWell = new T.Shape([
      new T.Vector2(-.82,-.735), new T.Vector2(.82,-.735),
      new T.Vector2(.82,-.57), new T.Vector2(-.82,-.57),
    ]);
    for (const shape of subtractShapes(rimShape, [strikeWell])) {
      const plate = slab(this.group, shape, PERIPHERAL_PLATE_DEPTH, PERIPHERAL_PLATE_TOP, iron, 0);
      plate.name = 'Peripheral plate with hammer-well opening';
      plate.scale.set(0.91, 1, 0.915);
      this.removable.push(plate);
    }
    this.removable.push(
      // Leave the hammer strike corridor open behind the tuning-pin block.
      box(this.group, [1.46, 0.078, 0.043], [0, 0.886, -0.693], iron, 0.008),
    );
    const beams = [
      [-0.65, -0.10, -0.57, 1.42],
      [-0.26, -0.10, -0.25, 1.47],
      [0.1, -0.10, 0.1, 1.34],
      [0.49, -0.10, 0.22, 0.72],
    ];
    this.group.add(this.ironBraces);
    this.ironBraces.name = 'Plate braces behind the damper-wire corridor';
    const castPlate = new T.Shape();
    castPlate.moveTo(-.73, -.1);
    castPlate.lineTo(.7, -.1);
    castPlate.bezierCurveTo(.55, .22, .3, .38, .28, .78);
    castPlate.bezierCurveTo(.31, 1.16, .27, 1.36, .08, 1.47);
    castPlate.bezierCurveTo(-.18, 1.63, -.65, 1.55, -.73, 1.31);
    castPlate.lineTo(-.73, -.1);
    for (const [x, z, rx, rz] of [[-.44,.68,.13,.59],[-.075,.65,.105,.53],[.24,.29,.075,.22]]) {
      const aperture = new T.Path();
      aperture.absellipse(x, z, rx, rz, 0, Math.PI * 2, true);
      castPlate.holes.push(aperture);
    }
    const bridgeClearances = [bridgeRibbon(21,44,.025),bridgeRibbon(45,108,.025)];
    for (const shape of subtractShapes(castPlate, bridgeClearances))
      slab(this.ironBraces, shape, .014, .92, iron, .002).name = 'Cast iron web with bridge clearances';
    for (const [x, z, x2, z2] of [...beams,[-.74,-.10,.66,-.10]]) {
      const direction = new T.Vector2(x2-x,z2-z).normalize();
      const n = new T.Vector2(-direction.y,direction.x).multiplyScalar(.022);
      const rib = new T.Shape([new T.Vector2(x+n.x,z+n.y),new T.Vector2(x2+n.x,z2+n.y),
        new T.Vector2(x2-n.x,z2-n.y),new T.Vector2(x-n.x,z-n.y)]);
      for(const shape of subtractShapes(rib,bridgeClearances))
        slab(this.ironBraces,shape,.034,.94,iron,.002).name = 'Cast rib with bridge passage';
    }
    for (const [x, z] of [[-.69,.02],[-.64,.52],[-.6,1.31],[-.25,1.42],[.14,1.19],[.32,.43],[.61,-.05]]) {
      rod(stat, v(x,.917,z), v(x,.93,z), .016, iron, 24).name = 'Cast plate mounting boss';
      rod(stat, v(x,.93,z), v(x,.936,z), .0055, steel, 6).name = 'Plate bolt head';
      const washer = new T.Mesh(new T.TorusGeometry(.008,.001,6,20),steel);
      washer.rotation.x = Math.PI / 2;
      washer.position.set(x,.931,z);
      stat.add(washer);
    }
    for(const [first,last] of [[21,44],[45,108]]) {
      const top = stringScale(first).bridge.y;
      const footprint = bridgeRibbon(first,last,.017);
      slab(this.acoustics,footprint,top - .003 - SOUNDBOARD_TOP,top - .003,wood,0).name = first===21 ? 'Bass bridge root' : 'Treble bridge root';
      slab(this.acoustics,footprint,.003,top,walnut,0).name = first===21 ? 'Bass bridge cap' : 'Treble bridge cap';
      const hitchRail = bridgeRibbon(first,last,.015,.06);
      slab(this.acoustics,hitchRail,top-.012-.906,top-.012,iron,0).name = 'Hitch-pin plate rail';
    }
    const keyboardHalfWidth = KEYBOARD.whitePitch * 26;
    const cheekInner = keyboardHalfWidth + .008;
    const cheekWidth = .827 - cheekInner;
    box(stat, [1.55, 0.11, .405], [0, 0.733, -.9225], black, 0.014);
    for (const x of [-(cheekInner + cheekWidth/2), cheekInner + cheekWidth/2]) {
      box(stat, [cheekWidth, 0.12, .425], [x, 0.823, -.9175], black, 0.019);
      box(stat, [0.009, 0.008, .365], [x, 0.889, -.9175], brass, 0.002);
    }
    const keySlipZ = KEYBOARD.frontZ-.0175;
    box(stat, [1.48, .035, .029], [0, .772, keySlipZ], black, .003).name='Keyboard front slip';
    box(stat, [1.48, .002, .002], [0, .788, keySlipZ-.014], brass, .0005).name='Key-slip brass bead';
    const fall = box(
      this.group,
      [1.45, 0.12, 0.065],
      [0, 0.912, -0.925],
      black,
      0.008,
    );
    fall.rotation.x = -0.2;
    this.removable.push(fall);
    const brand = textPlate(
      this.group,
      'N&Mstudio  Musical instrument',
      0.65,
      0.05,
      [0, 0.925, -0.965],
      [0.2, Math.PI, 0],
    );
    this.removable.push(brand);
    this.removable.push(
      box(this.group, [1.46, 0.06, 0.19], [0, 0.844, -0.81], black, 0.006),
    );
    box(stat, [keyboardHalfWidth*2, 0.008, 0.014], [0, 0.842, -0.972], red);
    box(stat, [1.38, 0.025, 0.023], [0, 0.827, -0.5], walnut);
    box(stat, [1.38, 0.018, 0.02], [0, 0.798, ACTION.keyPivotZ], wood);
    for (const { midi, black: isBlack, x } of KEY_LAYOUT) {
      const actionX = -.713 + (midi - 21) * 1.426 / 87;
      const key = new T.Group();
      key.position.set(x, 0.821, -0.65);
      key.name = noteName(midi);
      this.action.add(key);
      const mesh = isBlack
        ? box(key, [KEYBOARD.blackWidth, .022, KEYBOARD.blackRearZ-KEYBOARD.blackFrontZ],
          [0,.019,(KEYBOARD.blackRearZ+KEYBOARD.blackFrontZ)/2-key.position.z],ebony.clone(),.001)
        : slab(key,whiteKeyOutline(midi,key.position.z),.002,.017,ivory.clone(),.00025);
      mesh.name = isBlack ? 'Ebony sharp keytop' : 'Notched ivory keytop';
      if (!isBlack) {
        slab(key,whiteKeyOutline(midi,key.position.z),.032,.015,wood,.0002).name='Notched wooden key head';
        box(key,[KEYBOARD.whitePitch-KEYBOARD.whiteGap,.032,.002],
          [0,-.001,KEYBOARD.frontZ-key.position.z-.0006],ivory,.0002).name='Ivory key front';
      }
      mesh.userData.midi = midi;
      this.pickables.push(mesh);
      if (midi === 60) {
        const label = textPlate(
          key,
          'C4',
          0.017,
          0.009,
          [0, 0.0174, KEYBOARD.frontZ-key.position.z+.022],
          [-Math.PI / 2, 0, Math.PI],
        );
        label.name = 'Middle C - MIDI 60 - 261.626 Hz';
      }
      box(key, [.011, .02, .275], [0, -.038, -.3335], wood, .002);
      rod(key, v(0, -.038, -.196), v(actionX - x, -.038, .31), .006, wood, 4).name = 'Fanned wooden key tail';
      box(key, [.011, .031, .165], [0, -.0325, -.3885], wood, .001);
      const wippen = new T.Group();
      wippen.position.set(x, 0.825, -0.595);
      this.action.add(wippen);
      const jack = new T.Group();
      jack.position.set(0, 0.01, 0.115);
      wippen.add(jack);
      rod(stat, v(x, 0.768, -0.95), v(x, 0.818, -0.95), 0.0017, brass, 5);
      const hammer = new T.Group();
      hammer.position.set(x, 0.859, -0.39);
      this.action.add(hammer);
      rod(hammer, v(0, 0, 0), v(0, 0, -0.225), 0.0027, wood, 6);
      box(hammer, [0.01, 0.014, 0.032], [0, 0.008, -0.233], walnut, 0.004);
      const crown=box(hammer, [0.014, midi < 45 ? 0.069 : 0.044, 0.033], [0, midi < 45 ? 0.0325 : 0.02, -0.234], felt, 0.007);
      crown.name='Hammer felt crown';
      box(hammer, [0.014, 0.004, 0.034], [0, 0.004, -0.234], red, 0.001);
      const { repetition, springLead } = buildActionDetail(key, hammer, wippen, jack,
        actionFrame, actionX, { wood, walnut, brass, steel, red, felt, leather }, box, rod);
      const pivotCorrection=key.position.z-ACTION.keyPivotZ;
      key.children.forEach(child=>{child.position.z+=pivotCorrection;});
      key.position.z=ACTION.keyPivotZ;
      const { start, bridge: end, hitch, count } = stringScale(midi);
      const contactAngle=hammerContactAngle(crown,start,end);
      const checkingAngle=hammerContactAngle(crown,start,end,.015);
      const backcheck=buildBackcheck(key,hammer,actionX,checkingAngle,{wood,walnut,brass,steel,red,felt,leather},box,rod);
      const damper = new T.Group();
      damper.position.set(
        x,
        0.9604 + (midi < 45 ? 0.025 : 0),
        -0.22 + ((midi - 21) / 87) * 0.05,
      );
      damper.position.x = T.MathUtils.lerp(start.x, end.x, (damper.position.z - start.z) / (end.z - start.z));
      const wireFootX = actionX + .01 - damper.position.x;
      const wireFootY = .814 - damper.position.y;
      this.group.add(damper);
      box(damper, [0.013, 0.019, 0.074], [0, 0.008, 0], ebony, 0.003);
      box(damper, [0.014, 0.008, 0.063], [0, -0.005, 0], felt, 0.001);
      // Route the lower bend beneath the peripheral plate even at full lift.
      // Only the vertical stem rises inside the action well and string gap.
      const nextScale = stringScale(Math.min(108,midi+1));
      const nextX = T.MathUtils.lerp(nextScale.start.x,nextScale.bridge.x,
        (damper.position.z-nextScale.start.z)/(nextScale.bridge.z-nextScale.start.z));
      const choirEdge=(count-1)*.0045/2;
      const nextEdge=nextX-damper.position.x-(nextScale.count-1)*.0045/2;
      const stemX=(choirEdge+nextEdge)/2;
      const elbowY=PERIPHERAL_PLATE_TOP-PERIPHERAL_PLATE_DEPTH-DAMPER_MAX_LIFT-DAMPER_WIRE_RADIUS-.004;
      const elbow=v(stemX,elbowY-damper.position.y,0);
      rod(damper, v(wireFootX, wireFootY, 0), elbow, DAMPER_WIRE_RADIUS, steel, 12).name='Damper wire lower bend';
      rod(damper, elbow, v(stemX, .003, 0), DAMPER_WIRE_RADIUS, steel, 12).name='Damper wire vertical stem';
      rod(damper, v(stemX, .003, 0), v(0, .003, 0), DAMPER_WIRE_RADIUS, steel, 5);
      rod(damper, v(wireFootX, wireFootY-.004, 0), v(wireFootX, wireFootY+.004, 0), .0035, brass, 12).name = 'Damper wire collet';
      box(damper, [.008, .008, .012], [wireFootX, wireFootY, 0], walnut, .001).name = 'Damper lift block';
      damper.visible = midi < 89;
      const underlever = new T.Group();
      underlever.name = 'Damper underlever with weighted tail';
      underlever.position.set(x + .01, .805, -.115);
      box(underlever, [.007, .006, .145], [0, 0, -.0585], wood, .001);
      box(underlever, [.007, .002, .075], [0, .004, -.085], felt, .0005);
      rod(underlever, v(-.003, 0, .009), v(.003, 0, .009), .005, steel, 12);
      const captureTab=new T.Group();
      captureTab.name='Flexible sostenuto capture tab';
      captureTab.position.set(0,-.001,-.0275);
      box(captureTab,[.007,.002,.015],[0,0,-.0075],brass,.0005);
      underlever.add(captureTab);
      const underleverAxle = rod(stat, v(x + .004, .805, -.115), v(x + .016, .805, -.115), .0013, steel, 12);
      const underleverFlange = box(stat, [.012, .018, .016], [x + .01, .794, -.115], wood, .001);
      underlever.visible = midi < 89;
      this.group.add(underlever);
      underlever.position.x = actionX + .01;
      underleverAxle.position.x = underlever.position.x;
      underleverFlange.position.x = underlever.position.x;
      const segments: number[] = [];
      for (let c = 0; c < count; c++) {
        const dx = (c - (count - 1) * 0.5) * 0.0045;
        for (let j = 0; j < 12; j++) {
          const a = start.clone().lerp(end, j / 12);
          const b = start.clone().lerp(end, (j + 1) / 12);
          segments.push(a.x + dx, a.y, a.z, b.x + dx, b.y, b.z);
        }
        const exit = end.clone().add(v(dx,.0,.012));
        const anchor = hitch.clone().add(v(dx,0,0));
        segments.push(end.x+dx,end.y,end.z,...exit.toArray(),...exit.toArray(),...anchor.toArray());
        for(const offset of [-.002,.011]) {
          rod(stat,v(end.x+dx+.001,end.y-.008,end.z+offset),v(end.x+dx+.001,end.y+.002,end.z+offset),.0009,steel,10).name = 'Bridge pin';
        }
        rod(stat,anchor.clone().add(v(0,-.01,0)),anchor.clone().add(v(0,.004,0)),.0015,steel,12).name = 'Hitch pin';
        const loop = new T.Mesh(new T.TorusGeometry(.0018,.00035,5,12,Math.PI),steel);
        loop.rotation.x=Math.PI/2;
        loop.position.copy(anchor);
        stat.add(loop);
        const pinZ = -.67 - (c % 2) * .012;
        const pinTop = start.y + .003;
        segments.push(actionX+dx,pinTop-.005,pinZ,...start.clone().add(v(dx,0,0)).toArray());
        const winding = Array.from({length:49},(_,i)=> {
          const a=i/48*Math.PI*6;
          return v(actionX+dx+Math.cos(a)*.0023,pinTop-.007+i/48*.005,pinZ+Math.sin(a)*.0023);
        });
        stat.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(winding),48,.00035,4,false),steel));
        rod(
          stat,
          v(actionX + dx, 0.915, pinZ),
          v(actionX + dx, pinTop, pinZ),
          0.0019,
          steel,
          5,
        );
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(segments, 3),
      );
      geometry.userData.rest = Float32Array.from(segments);
      geometry.userData.choirStride = 30;
      const strings = new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({
          color: midi < 45 ? '#956839' : '#8d897a',
          transparent: true,
          opacity: 0.6,
        }),
      );
      this.group.add(strings);
      this.keys.push({
        midi,
        x,
        key,
        mesh,
        hammer,
        wippen,
        jack,
        repetition,
        damper,
        underlever,
        captureTab,
        strings,
        energy: 0,
        springLead,
        strike: 0,
        strikeStart: 0,
        strikeDepression: 0,
        contactAngle,
        checkingAngle,
        backcheck,
        depression: 0,
        lift: 0,
      });
    }
    // The lid opens about the straight bass-side hinge, not its center.
    this.lid.position.set(-0.8, LID_HINGE_Y, 0);
    this.group.add(this.lid);
    const lidTop = slab(this.lid, outline(), 0.041, 0.01, black);
    lidTop.position.x = 0.8;
    const lidLining = slab(this.lid, outline(), 0.004, -0.034, walnut);
    lidLining.scale.set(0.97, 1, 0.975);
    lidLining.position.x = 0.8;
    for (const z of [-0.3, 0.42, 1.16])
      this.removable.push(
        rod(
          this.group,
          v(-0.8, LID_HINGE_Y+.003, z - 0.035),
          v(-0.8, LID_HINGE_Y+.003, z + 0.035),
          0.008,
          brass,
        ),
      );
    this.lidProp.position.copy(PROP_BASE);
    const propMount=new T.Group();
    this.group.add(propMount);
    this.removable.push(propMount);
    box(propMount,[.05,.03,.06],[.66,1.017,.04],brass,.003).name='Lid prop rim-mounted shoe';
    rod(propMount,PROP_BASE.clone().add(v(0,0,-.022)),PROP_BASE.clone().add(v(0,0,.022)),.008,brass,16).name='Lid prop hinge pin';
    this.group.add(this.lidProp);
    rod(
      this.lidProp,
      v(0, 0, 0),
      v(-0.78, 0, 0),
      0.011,
      black,
    );
    this.lidProp.name = 'Lid prop';
    this.removable.push(this.lidProp);
    const desk = this.desk;
    desk.position.set(0, MUSIC_DESK_Y, MUSIC_DESK_OPEN_Z);
    desk.rotation.x = 0.35;
    this.group.add(desk);
    this.removable.push(desk);
    this.group.add(this.deskSupport);
    this.deskSupport.name = 'Music desk carriage and hinged supports';
    this.removable.push(this.deskSupport);
    // The carriage bridges the case rims and slides back as the desk folds.
    box(this.deskSupport, [1.57, .035, .07], [0, MUSIC_DESK_Y-.0235, MUSIC_DESK_OPEN_Z], black, .005).name='Sliding music-desk carriage';
    for (const x of [-.22, .22]) {
      box(this.deskSupport, [.028, .014, .23], [x, MUSIC_DESK_Y-.006, -.405], black, .003);
      rod(this.deskSupport, v(x - .025, MUSIC_DESK_Y, MUSIC_DESK_OPEN_Z), v(x + .025, MUSIC_DESK_Y, MUSIC_DESK_OPEN_Z), .009, brass).name='Sliding music-desk hinge';
      const brace = rod(this.deskSupport, v(0, 0, 0), v(0, .21, 0), .006, brass);
      this.deskBraces.push(brace);
    }
    box(desk, [0.59, MUSIC_DESK_HEIGHT, MUSIC_DESK_DEPTH], [0, MUSIC_DESK_HEIGHT/2, 0], black, 0.006).name='Music-desk panel';
    box(desk, [0.72, 0.022, 0.073], [0, 0.013, -0.025], black, 0.004);
    textPlate(desk, 'N&M', 0.1, 0.05, [0, 0.13, -0.012], [0, Math.PI, 0]);
    for (const [x, z] of [
      [-0.66, -0.99],
      [0.66, -0.99],
      [-0.29, 1.36],
    ]) {
      const leg = new T.Mesh(
        new T.CylinderGeometry(0.073, 0.041, 0.61, 4),
        black,
      );
      leg.position.set(x, 0.39, z);
      leg.rotation.y = Math.PI / 4;
      stat.add(leg);
      const caster=new T.Group();
      caster.name='Twin-wheel concert caster';
      caster.position.set(x,0,z);
      this.groundHardware.add(caster);
      box(caster,[.086,.02,.086],[0,.085,0],brass,.004);
      rod(caster,v(0,.056,0),v(0,.088,0),.012,brass,24);
      for(const side of [-1,1]) {
        box(caster,[.005,.044,.033],[side*.008,.05,0],brass,.003);
        const wheelX=side*.024;
        rod(caster,v(wheelX-.009,.027,0),v(wheelX+.009,.027,0),.022,brass,32);
        const tire=new T.Mesh(new T.TorusGeometry(.021,.006,12,48),tread);
        tire.rotation.y=Math.PI/2;
        tire.position.set(wheelX,.027,0);
        tire.castShadow=true;
        tire.name='Ground-contact wheel tread';
        caster.add(tire);
        rod(caster,v(wheelX-.010,.027,0),v(wheelX+.010,.027,0),.006,steel,20);
      }
      rod(caster,v(-.038,.027,0),v(.038,.027,0),.003,steel,16);
      box(stat, [0.17, 0.06, 0.18], [x, 0.711, z], black, 0.02);
    }
    const lyre = new T.Group();
    stat.add(lyre);
    box(lyre, [0.29, 0.047, 0.16], [0, 0.66, -1.0], black, 0.006);
    for (const x of [-0.102, 0.102])
      rod(lyre, v(x, 0.18, -1.015), v(x, 0.658, -0.963), 0.02, black, 12);
    box(lyre, [0.34, 0.055, 0.17], [0, 0.173, -1.04], black, 0.01);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.087;
      const p = new T.Group();
      p.position.set(x, 0.179, -1.02);
      this.group.add(p);
      box(p, [0.048, 0.019, 0.15], [0, -0.015, -0.098], brass, 0.011);
      box(p, [.025,.014,.1], [0,0,0], brass,.005).name = 'Pedal heel';
      rod(p,v(-.016,0,.04),v(.016,0,.04),.003,steel,16).name = 'Pushrod clevis pin';
      const linkage = pedalLinkage(0);
      const pushrod = rod(this.group, linkage.lower.clone().setX(x), linkage.upper.clone().setX(x), .004, brass, 16);
      pushrod.name = 'Rigid pedal pushrod';
      this.pedalRods.push(pushrod);
      const rocker = new T.Group();
      rocker.name = 'Pedal trapwork rocker';
      rocker.position.set(x,.65,-.77);
      box(rocker,[.022,.014,.16],[0,0,-.015],walnut,.003);
      rod(rocker,v(-.015,0,-.09),v(.015,0,-.09),.003,steel,16);
      rod(rocker,v(-.016,0,0),v(.016,0,0),.0035,steel,16);
      this.group.add(rocker);
      this.pedalRockers.push(rocker);
      for(const side of [-1,1]) box(stat,[.006,.036,.026],[x+side*.017,.661,-.77],brass,.002);
      this.pedals.push(p);
    }
    this.transmission = new PedalTransmission(box,rod,{wood,brass,steel,felt});
    this.group.add(this.transmission.group);
    for (const x of [-0.33, 0.33])
      for (const z of [-1.83, -1.49]) {
        box(stat, [0.043, 0.44, 0.043], [x, 0.235, z], black, 0.005);
        box(this.groundHardware,[.044,.016,.044],[x,.008,z],tread,.002).name='Bench floor glide';
      }
    box(stat, [0.8, 0.07, 0.45], [0, 0.455, -1.66], black, 0.016);
    const upholstery=new T.BoxGeometry(.78,.045,.435,80,8,48);
    const positions=upholstery.attributes.position,normals=upholstery.attributes.normal;
    const core=v(.37,.0025,.1975);
    for(let i=0;i<positions.count;i++) {
      const point=v(positions.getX(i),positions.getY(i),positions.getZ(i));
      const corner=point.clone().clamp(core.clone().negate(),core);
      const normal=point.sub(corner).normalize();
      const rounded=corner.addScaledVector(normal,.02);
      positions.setXYZ(i,...rounded.toArray());
      normals.setXYZ(i,...normal.toArray());
    }
    const tufts:T.Vector2[]=[];
    for(let x=-.3;x<=.31;x+=.15) for(let z=-1.8;z<=-1.51;z+=.14) tufts.push(new T.Vector2(x,z+1.66));
    for(let i=0;i<positions.count;i++) {
      if(normals.getY(i)<.7) continue;
      const x=positions.getX(i),z=positions.getZ(i);
      let depth=0,gx=0,gz=0;
      for(const tuft of tufts) {
        const dx=x-tuft.x,dz=z-tuft.y;
        const weight=Math.exp(-(dx*dx+dz*dz)/(.022*.022));
        depth+=.005*weight;
        gx+=.010*dx/(.022*.022)*weight;
        gz+=.010*dz/(.022*.022)*weight;
      }
      positions.setY(i,positions.getY(i)-depth);
      const normal=v(normals.getX(i)-gx,normals.getY(i),normals.getZ(i)-gz).normalize();
      normals.setXYZ(i,...normal.toArray());
    }
    const seatGrain=surfaces.leather.clone();
    seatGrain.repeat.set(24,12);
    seatGrain.needsUpdate=true;
    this.benchSeat=new T.Mesh(upholstery,leatherMaterial(seatGrain,'#171613'));
    this.benchSeat.name='Tufted leather bench cushion';
    this.benchSeat.position.set(0,.5,-1.66);
    this.benchSeat.castShadow=this.benchSeat.receiveShadow=true;
    this.group.add(this.benchSeat);
    for (let x = -0.3; x <= 0.31; x += 0.15)
      for (let z = -1.8; z <= -1.51; z += 0.14) {
        const b = new T.Mesh(new T.SphereGeometry(0.009, 8, 6), black);
        b.scale.y = 0.35;
        b.position.set(x, 0.518, z);
        stat.add(b);
      }
    mergeStatic(stat);
    this.lid.rotation.z = 0.55;
    this.instanceActions();
    const springGeometry=mergeGeometries(this.keys.map(k=>k.springLead.geometry),false)!;
    (springGeometry.attributes.position as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
    (springGeometry.attributes.normal as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
    this.springWires=new T.Mesh(springGeometry,brass);
    this.springWires.name='Independent flexible spring wires';
    this.springWires.castShadow=true;
    this.springWires.frustumCulled=false;
    this.group.add(this.springWires);
    this.keys.forEach(k=>{k.springLead.visible=false;});
    this.group.updateMatrixWorld(true);
    this.updateSpringWires();
  }
  private updateSpringWires() {
    this.inverseRoot.copy(this.group.matrixWorld).invert();
    const positions=this.springWires.geometry.attributes.position;
    const normals=this.springWires.geometry.attributes.normal;
    let offset=0;
    for(const k of this.keys) {
      const source=k.springLead.geometry.attributes;
      this.instanceLocal.multiplyMatrices(this.inverseRoot,k.springLead.matrixWorld);
      this.springNormal.getNormalMatrix(this.instanceLocal);
      for(let i=0;i<source.position.count;i++) {
        const p=this.springVertex.fromBufferAttribute(source.position,i).applyMatrix4(this.instanceLocal);
        positions.setXYZ(offset+i,p.x,p.y,p.z);
        p.fromBufferAttribute(source.normal,i).applyNormalMatrix(this.springNormal);
        normals.setXYZ(offset+i,p.x,p.y,p.z);
      }
      offset+=source.position.count;
    }
    positions.needsUpdate=normals.needsUpdate=true;
  }
  private instanceActions() {
    const batches = new Map<string, T.Mesh[]>();
    const excluded = new Set(this.pickables);
    const collect = (obj: T.Object3D) => {
      if (
        !(obj instanceof T.Mesh) ||
        obj.userData.deforming ||
        excluded.has(obj) ||
        Array.isArray(obj.material)
      )
        return;
      obj.geometry.computeBoundingBox();
      const size = obj.geometry
        .boundingBox!.getSize(new T.Vector3())
        .toArray()
        .map((n: number) => n.toFixed(7));
      const key = `${obj.geometry.type}:${obj.geometry.attributes.position.count}:${size}:${obj.material.uuid}`;
      const batch = batches.get(key) ?? [];
      batch.push(obj);
      batches.set(key, batch);
    };
    this.action.traverse(collect);
    this.keys
      .filter((k) => k.midi < 89)
      .forEach((k) => { k.damper.traverse(collect); k.underlever.traverse(collect); });
    for (const objects of batches.values()) {
      if (objects.length < 2) continue;
      const mesh = new T.InstancedMesh(
        objects[0].geometry,
        objects[0].material,
        objects.length,
      );
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = 'Instanced piano action';
      objects.forEach((o) => (o.visible = false));
      this.group.add(mesh);
      this.instances.push({ mesh, objects });
    }
  }
  setExposed(value: boolean) {
    this.exposed = value;
    this.removable.forEach((o) => (o.visible = !value));
    this.lid.visible = !value;
  }
  startEntrance(reducedMotion = false) {
    this.entranceTime = reducedMotion ? null : 0;
    this.lidAngle = reducedMotion ? .55 : .275;
    this.animate(0,0,new Set(),new Set(),[false,false,false],new Set());
  }
  animate(
    dt: number,
    time: number,
    held: Set<number>,
    sounding: Set<number>,
    pedal: boolean[],
    captured: Set<number>,
  ) {
    if (!this.lidOpen || this.exposed) this.entranceTime = null;
    if (this.entranceTime !== null) {
      this.entranceTime += dt;
      this.lidAngle=T.MathUtils.lerp(.275,.55,T.MathUtils.smoothstep(this.entranceTime,0,1.6));
      if(this.entranceTime>=1.6)this.entranceTime=null;
    } else this.lidAngle = T.MathUtils.damp(
      this.lidAngle,
      this.lidOpen ? 0.55 : 0,
      7,
      dt,
    );
    this.lid.rotation.z = this.lidAngle;
    // Constrain the fixed-length prop to the lid underside, including its
    // radius and lining bevel. It folds across the case rather than clipping.
    const contact = ((PROP_BASE.x+.8) * Math.sin(this.lidAngle) +
      (LID_HINGE_Y-PROP_BASE.y) * Math.cos(this.lidAngle) - 0.056) / 0.78;
    this.lidProp.rotation.z = this.lidAngle - Math.asin(contact);
    this.lidProp.visible = !this.exposed;
    const deskOpening = Math.pow(this.lidAngle / 0.55, 10);
    this.desk.rotation.x = T.MathUtils.lerp(-Math.PI / 2, 0.35, deskOpening);
    this.desk.position.y = MUSIC_DESK_Y;
    // Keep the entire panel behind the front wall, not just its pivot.
    const forwardExtent=Math.min(0,Math.sin(this.desk.rotation.x)*MUSIC_DESK_HEIGHT)
      -Math.abs(Math.cos(this.desk.rotation.x))*MUSIC_DESK_DEPTH/2;
    this.desk.position.z=Math.max(MUSIC_DESK_OPEN_Z,MUSIC_DESK_FRONT_CLEARANCE_Z-forwardExtent);
    for(const part of this.deskSupport.children) {
      if(part.name==='Sliding music-desk carriage'||part.name==='Sliding music-desk hinge')
        part.position.z=this.desk.position.z;
    }
    this.desk.updateMatrix();
    this.deskBraces.forEach((brace, i) => {
      const top = v(i === 0 ? -.22 : .22, .2, .014).applyMatrix4(this.desk.matrix);
      // Fixed-length stays slide along the carriage as the desk folds down.
      const footY=MUSIC_DESK_Y;
      const foot = v(top.x, footY, top.z + Math.sqrt(Math.max(0, .21 ** 2 - (top.y - footY) ** 2)));
      brace.position.copy(top).add(foot).multiplyScalar(.5);
      brace.quaternion.setFromUnitVectors(v(0, 1, 0), top.sub(foot).normalize());
    });
    this.pedals.forEach(
      (p, i) =>
        (p.rotation.x = T.MathUtils.damp(
          p.rotation.x,
          pedal[i] ? -0.18 : 0,
          20,
          dt,
        )),
    );
    this.pedals.forEach((p,i) => {
      const linkage = pedalLinkage(p.rotation.x);
      const pushrod = this.pedalRods[i];
      pushrod.position.copy(linkage.lower).add(linkage.upper).multiplyScalar(.5).setX(p.position.x);
      pushrod.quaternion.setFromUnitVectors(v(0,1,0),linkage.upper.sub(linkage.lower).normalize());
      this.pedalRockers[i].rotation.x = linkage.rockerAngle;
    });
    const transmission = this.transmission.update(this.pedals.map(p=>p.rotation.x));
    this.actionOffset=transmission.shift;
    this.action.position.x=this.actionOffset;
    for (const k of this.keys) {
      const pressed = held.has(k.midi);
      k.depression = pressed&&k.strike>0
        ? T.MathUtils.lerp(k.strikeDepression,1,T.MathUtils.smoothstep(HAMMER_STROKE_SECONDS-k.strike+dt,0,.03))
        : T.MathUtils.damp(k.depression,pressed?1:0,pressed?60:20,dt);
      k.key.rotation.x = -k.depression * ACTION.keyAngle;
      const elapsedBefore=HAMMER_STROKE_SECONDS-k.strike;
      k.strike = Math.max(0, k.strike - dt);
      const elapsed=HAMMER_STROKE_SECONDS-k.strike;
      k.hammer.rotation.x = k.strike>0
        ? elapsedBefore<HAMMER_ATTACK_SECONDS&&elapsed>=HAMMER_ATTACK_SECONDS
          ? k.contactAngle
          : hammerStroke(elapsed,k.strikeStart,k.contactAngle,k.depression*k.checkingAngle)
        : T.MathUtils.damp(k.hammer.rotation.x,k.depression*k.checkingAngle,65,dt);
      k.hammer.rotation.x=supportedHammerAngle(k.depression,k.hammer.rotation.x,k.contactAngle);
      const pose = actionPose(k.depression, k.hammer.rotation.x);
      k.wippen.rotation.x = pose.wippen;
      k.jack.rotation.x = pose.jack;
      if(Math.abs(k.repetition.rotation.x-pose.repetition)>1e-7) {
        updateRepetitionSpring(k.springLead.geometry,pose.repetition);
      }
      k.repetition.rotation.x = pose.repetition;
      updateBackcheck(k.key,k.hammer,k.backcheck);
      const individual = pressed || (pedal[1] && captured.has(k.midi));
      k.underlever.rotation.x = Math.max(transmission.sustainAngle,
        T.MathUtils.damp(k.underlever.rotation.x, individual ? .317 : 0, 22, dt));
      const leverAngle=k.underlever.rotation.x;
      const deflection=pedal[1]&&!captured.has(k.midi)?-.95*T.MathUtils.smoothstep(leverAngle,.10,.16):0;
      k.captureTab.rotation.x=T.MathUtils.damp(k.captureTab.rotation.x,deflection,70,dt);
      const contactDistance=-.115-k.damper.position.z;
      k.lift=contactDistance*Math.tan(leverAngle)+.005*(1/Math.cos(leverAngle)-1);
      k.damper.position.y = 0.9604 + (k.midi < 45 ? 0.025 : 0) + k.lift;
      const m = k.mesh.material as T.MeshPhysicalMaterial;
      m.emissive.setHex(pressed ? 0xb57827 : 0);
      m.emissiveIntensity = pressed ? 0.25 : 0;
      k.energy = Math.max(0, k.energy - dt * (sounding.has(k.midi) ? 0.08 : 3));
      if (k.energy > 0) {
        const pos = k.strings.geometry.attributes.position;
        const rest = k.strings.geometry.userData.rest as Float32Array;
        for (let j = 0; j < pos.count; j++) {
          const segmentIndex = j % (k.strings.geometry.userData.choirStride as number);
          const first = j - segmentIndex;
          const phase = segmentIndex < 24
            ? (rest[j*3+2] - rest[first*3+2]) / (rest[(first+23)*3+2] - rest[first*3+2])
            : 0;
          pos.setY(
            j,
            rest[j * 3 + 1] +
              Math.sin(phase * Math.PI) *
                Math.sin(time * 65 + k.midi) *
                0.0024 *
                k.energy,
          );
        }
        pos.needsUpdate = true;
      }
    }
    this.group.updateMatrixWorld(true);
    this.updateSpringWires();
    this.inverseRoot.copy(this.group.matrixWorld).invert();
    for (const { mesh, objects } of this.instances) {
      objects.forEach((o, i) =>
        mesh.setMatrixAt(
          i,
          this.instanceLocal.multiplyMatrices(this.inverseRoot, o.matrixWorld),
        ),
      );
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  strike(midi: number) {
    const k = this.keys[midi - 21];
    if (k) {
      k.strikeStart=k.hammer.rotation.x;
      k.strikeDepression=k.depression;
      k.strike = HAMMER_STROKE_SECONDS;
      k.energy = 1;
    }
  }
  setFinish(finish: 'black' | 'white') {
    if (finish === 'white') {
      this.caseMaterial.color.set('#f7f6f2');
      this.caseMaterial.roughness = 0.13;
      this.caseMaterial.clearcoat = 1.0;
      this.caseMaterial.clearcoatRoughness = 0.04;
      if (this.benchSeat?.material && 'color' in this.benchSeat.material) {
        (this.benchSeat.material as T.MeshStandardMaterial).color.set('#ebe5d8');
      }
    } else {
      this.caseMaterial.color.set('#080b0b');
      this.caseMaterial.roughness = 0.16;
      this.caseMaterial.clearcoat = 1.0;
      this.caseMaterial.clearcoatRoughness = 0.055;
      if (this.benchSeat?.material && 'color' in this.benchSeat.material) {
        (this.benchSeat.material as T.MeshStandardMaterial).color.set('#171613');
      }
    }
    this.caseMaterial.needsUpdate = true;
  }
}
