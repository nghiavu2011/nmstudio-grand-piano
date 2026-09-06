import * as T from 'three';

/** Dimensions in metres; Y/Z form the side elevation, X is the centre pin axis. */
export const ACTION = {
  keyPivotZ: -.695, keyAngle: .023, capstanArm: .275,
  wippenY: .805, wippenZ: -.34,
  hammerY: .859, hammerZ: -.39,
  knuckleZ: -.04, knuckleY: -.01, knuckleRadius: .007,
  jackY: .01, jackZ: -.09, jackLength: .0265,
  repetitionY: .025, repetitionZ: -.025, repetitionLength: .078,
} as const;

export function hammerContactAngle(crown: T.Mesh, start: T.Vector3, bridge: T.Vector3, checkingGap=0) {
  crown.updateMatrix();
  const positions=crown.geometry.attributes.position;
  const vertices=Array.from({length:positions.count},(_,i)=>
    new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(crown.matrix));
  const clearance=(angle:number)=> {
    const c=Math.cos(angle),s=Math.sin(angle);
    let gap=Infinity;
    for(const p of vertices) {
      const y=ACTION.hammerY+p.y*c-p.z*s;
      const z=ACTION.hammerZ+p.y*s+p.z*c;
      const stringY=T.MathUtils.lerp(start.y,bridge.y,(z-start.z)/(bridge.z-start.z));
      gap=Math.min(gap,stringY-y);
    }
    return gap-checkingGap;
  };
  let lo=0,hi=.35;
  if(clearance(lo)<=0||clearance(hi)>0)throw new Error('Hammer contact lies outside the regulated travel');
  for(let i=0;i<40;i++) {
    const mid=(lo+hi)/2;
    if(clearance(mid)>0)lo=mid;else hi=mid;
  }
  return (lo+hi)/2;
}

export const HAMMER_STROKE_SECONDS=.13;
export const HAMMER_ATTACK_SECONDS=.027;
export function hammerStroke(elapsed:number, startAngle:number, contactAngle:number, restingAngle:number) {
  if(elapsed<=HAMMER_ATTACK_SECONDS) {
    return T.MathUtils.lerp(startAngle,contactAngle,
      T.MathUtils.smoothstep(elapsed,0,HAMMER_ATTACK_SECONDS));
  }
  return T.MathUtils.lerp(contactAngle,restingAngle,T.MathUtils.smoothstep(elapsed,HAMMER_ATTACK_SECONDS,.085));
}

export function actionPose(depression: number, hammerAngle: number) {
  const d = T.MathUtils.clamp(depression, 0, 1);
  // The capstan travels with the rear of the key; escapement only begins near let-off.
  const keyAngle=d*ACTION.keyAngle;
  const capstanY=.821-.025*Math.cos(keyAngle)+ACTION.capstanArm*Math.sin(keyAngle);
  const capstanZ=ACTION.keyPivotZ+.025*Math.sin(keyAngle)+ACTION.capstanArm*Math.cos(keyAngle);
  const capY=capstanY-ACTION.wippenY,capZ=capstanZ-ACTION.wippenZ;
  const wippen=Math.max(0,Math.atan2(capZ,capY)+Math.acos(-.009/Math.hypot(capY,capZ)));
  const escape = T.MathUtils.smoothstep(d, .78, .97);
  const jack = .24 * escape;
  const rollerY = ACTION.hammerY + ACTION.knuckleY * Math.cos(hammerAngle)
    - ACTION.knuckleZ * Math.sin(hammerAngle);
  const rollerZ = ACTION.hammerZ + ACTION.knuckleY * Math.sin(hammerAngle)
    + ACTION.knuckleZ * Math.cos(hammerAngle);
  const dy = rollerY - ACTION.wippenY;
  const dz = rollerZ - ACTION.wippenZ;
  const localY = dy * Math.cos(wippen) + dz * Math.sin(wippen);
  const localZ = -dy * Math.sin(wippen) + dz * Math.cos(wippen);
  // A repetition fork follows the roller only within its regulated lift; it
  // cannot follow the hammer into flight and hold it against the string.
  const ry=localY-ACTION.repetitionY,rz=localZ-ACTION.repetitionZ;
  // Tangency to the felted fork, including its 3 mm top surface, not an
  // approximate line aimed at the bottom of the roller.
  const repetition = T.MathUtils.clamp(Math.atan2(rz,ry)+Math.acos(T.MathUtils.clamp(
    (ACTION.knuckleRadius+.003)/Math.hypot(ry,rz),-1,1)), -.12, .17);
  return { wippen, jack, repetition, escape };
}

export function jackRollerClearance(depression:number,hammerAngle:number) {
  const pose=actionPose(depression,hammerAngle);
  const roller=new T.Vector3(0,ACTION.knuckleY,ACTION.knuckleZ)
    .applyAxisAngle(new T.Vector3(1,0,0),hammerAngle)
    .add(new T.Vector3(0,ACTION.hammerY-ACTION.wippenY,ACTION.hammerZ-ACTION.wippenZ))
    .applyAxisAngle(new T.Vector3(1,0,0),-pose.wippen)
    .sub(new T.Vector3(0,ACTION.jackY,ACTION.jackZ))
    .applyAxisAngle(new T.Vector3(1,0,0),-pose.jack);
  const y=T.MathUtils.clamp(roller.y,ACTION.jackLength-.0005,ACTION.jackLength+.0005);
  const z=T.MathUtils.clamp(roller.z,-.003,.003);
  return Math.hypot(roller.y-y,roller.z-z)-ACTION.knuckleRadius;
}

export function supportedHammerAngle(depression:number,requested:number,contact:number) {
  if(jackRollerClearance(depression,requested)>=-1e-9)return requested;
  let lo=requested,hi=contact;
  for(let i=0;i<20;i++) {
    const mid=(lo+hi)/2;
    if(jackRollerClearance(depression,mid)<0)lo=mid;else hi=mid;
  }
  return hi;
}

export function pedalLinkage(pedalAngle: number) {
  const lower = new T.Vector3(0, .179 - .04 * Math.sin(pedalAngle), -1.02 + .04 * Math.cos(pedalAngle));
  const pivot = new T.Vector3(0, .65, -.77);
  const length = Math.hypot(.65 - .179, -.86 + .98);
  const dy = lower.y - pivot.y, dz = lower.z - pivot.z;
  const distance = Math.hypot(dy, dz), radius = .09;
  // Circle/circle intersection closes the rigid pushrod and rocker linkage.
  const theta = Math.atan2(dz, dy) + Math.acos(T.MathUtils.clamp(
    (distance * distance + radius * radius - length * length) / (2 * distance * radius), -1, 1,
  ));
  const upper = new T.Vector3(0, pivot.y + radius * Math.cos(theta), pivot.z + radius * Math.sin(theta));
  return { lower, upper, length, rockerAngle: theta + Math.PI / 2 };
}

type Materials = { wood: T.Material; walnut: T.Material; brass: T.Material;
  steel: T.Material; red: T.Material; felt: T.Material; leather:T.Material };
type Box = (parent: T.Object3D, size: number[], pos: number[], material: T.Material, radius?: number) => T.Mesh;
type Rod = (parent: T.Object3D, from: T.Vector3, to: T.Vector3, radius: number, material: T.Material, sides?: number) => T.Mesh;
const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);

const SPRING_LENGTH = .016;
const SPRING_SEGMENTS = 16;
const SPRING_SIDES = 6;
export function updateRepetitionSpring(geometry: T.BufferGeometry, angle: number) {
  const a = v(.0037, .026, -.043);
  const b = v(0, -.001, -.006).applyAxisAngle(v(1,0,0), angle)
    .add(v(0, ACTION.repetitionY, ACTION.repetitionZ));
  const chord = b.clone().sub(a), distance = chord.length();
  if (distance >= SPRING_LENGTH) throw new Error('Repetition spring exceeds its wire length');
  const tangent = chord.normalize();
  const normal = v(1,0,0).cross(tangent).normalize();
  const binormal = tangent.clone().cross(normal);
  // A circular elastic bow preserves wire length while both anchors move.
  let lo = 0, hi = Math.PI;
  for(let i=0;i<32;i++) {
    const mid=(lo+hi)/2;
    if(Math.sin(mid)/mid > distance/SPRING_LENGTH) lo=mid; else hi=mid;
  }
  const theta=(lo+hi)/2, radius=SPRING_LENGTH/(2*theta);
  const centre=a.clone().add(b).multiplyScalar(.5).addScaledVector(normal,-radius*Math.cos(theta));
  const positions=geometry.getAttribute('position') as T.BufferAttribute;
  const normals=geometry.getAttribute('normal') as T.BufferAttribute;
  for(let i=0;i<=SPRING_SEGMENTS;i++) {
    const t=-theta+2*theta*i/SPRING_SEGMENTS;
    const radial=normal.clone().multiplyScalar(Math.cos(t)).addScaledVector(tangent,Math.sin(t));
    const p=centre.clone().addScaledVector(radial,radius);
    for(let j=0;j<SPRING_SIDES;j++) {
      const phi=2*Math.PI*j/SPRING_SIDES;
      const n=radial.clone().multiplyScalar(Math.cos(phi)).addScaledVector(binormal,Math.sin(phi));
      const k=i*SPRING_SIDES+j;
      positions.setXYZ(k,p.x+n.x*.00035,p.y+n.y*.00035,p.z+n.z*.00035);
      normals.setXYZ(k,n.x,n.y,n.z);
    }
  }
  positions.needsUpdate=normals.needsUpdate=true;
  geometry.computeBoundingSphere();
}

function repetitionSpringGeometry() {
  const geometry=new T.BufferGeometry();
  const vertices=(SPRING_SEGMENTS+1)*SPRING_SIDES;
  geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(vertices*3),3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(new Float32Array(vertices*3),3));
  const indices:number[]=[];
  for(let i=0;i<SPRING_SEGMENTS;i++) for(let j=0;j<SPRING_SIDES;j++) {
    const a=i*SPRING_SIDES+j,b=i*SPRING_SIDES+(j+1)%SPRING_SIDES;
    indices.push(a,b,a+SPRING_SIDES,b,b+SPRING_SIDES,a+SPRING_SIDES);
  }
  geometry.setIndex(indices);
  updateRepetitionSpring(geometry,0);
  return geometry;
}

export function buildActionDetail(
  key: T.Group, hammer: T.Group, wippen: T.Group, jack: T.Group,
  fixed: T.Group, x: number, m: Materials, box: Box, rod: Rod,
) {
  const existingKeyParts = new Set(key.children);
  wippen.position.set(x, ACTION.wippenY, ACTION.wippenZ);
  hammer.position.set(x, ACTION.hammerY, ACTION.hammerZ);
  jack.position.set(0, ACTION.jackY, ACTION.jackZ);
  wippen.name = 'Wippen, heel and repetition assembly';
  jack.name = 'Escapement jack';
  hammer.name = 'Hammer shank, flange and leather knuckle';
  box(wippen, [.008, .012, .145], [0, 0, -.06], m.wood, .002);
  box(wippen, [.009, .003, .018], [0, -.0075, -.08], m.felt, .001);
  box(jack, [.005, ACTION.jackLength, .005], [0, ACTION.jackLength / 2, 0], m.wood, .001);
  box(jack, [.006, .005, .017], [0, .003, .008], m.wood, .001);
  box(jack, [.0055, .001, .006], [0, ACTION.jackLength, 0], m.walnut);

  const repetition = new T.Group();
  repetition.name = 'Slotted repetition lever';
  repetition.position.set(0, ACTION.repetitionY, ACTION.repetitionZ);
  wippen.add(repetition);
  // Two cheeks form a real open slot for the jack, rather than intersecting solids.
  for (const side of [-1, 1]) {
    box(repetition, [.0018, .004, ACTION.repetitionLength],
      [side * .004, 0, -ACTION.repetitionLength / 2], m.wood, .0006);
    box(repetition, [.0018, .001, .026], [side * .004, .0025, -.065], m.felt);
  }
  box(repetition, [.01, .004, .01], [0, 0, -.005], m.wood, .001);
  box(wippen, [.005, .025, .009], [0, .0125, ACTION.repetitionZ], m.wood, .001);

  for (const [parent, y, z, width] of [
    [wippen, 0, 0, .012], [jack, 0, 0, .009],
    [repetition, 0, 0, .013], [hammer, 0, 0, .013],
  ] as const) {
    rod(parent, v(-width / 2, y, z), v(width / 2, y, z), .0011, m.steel, 12).name = 'Centre pin';
  }
  for (const [y, z] of [[ACTION.wippenY, ACTION.wippenZ], [ACTION.hammerY, ACTION.hammerZ]]) {
    for (const side of [-1, 1]) {
      box(fixed, [.002, .012, .016], [x + side * .0055, y - .002, z + .003], m.wood, .001);
      rod(fixed, v(x + side * .0055, y - .001, z), v(x + side * .0055, y + .001, z), .002, m.red, 12);
    }
    box(fixed, [.012, .007, .015], [x, y - .011, z + .006], m.wood, .001);
    const screw = rod(fixed, v(x, y - .007, z + .009), v(x, y - .004, z + .009), .002, m.brass, 12);
    screw.name = 'Flange fixing screw';
  }

  rod(hammer, v(-.0045, ACTION.knuckleY, ACTION.knuckleZ),
    v(.0045, ACTION.knuckleY, ACTION.knuckleZ), ACTION.knuckleRadius, m.leather, 24).name = 'Leather-covered roller';
  box(hammer, [.007, .007, .009], [0, -.003, ACTION.knuckleZ], m.walnut, .001);

  const springPoints = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64, a = t * Math.PI * 8;
    return v(.0037 * Math.cos(a), .014 + t * .012, -.043 + .0037 * Math.sin(a));
  });
  const spring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints), 64, .00035, 5, false), m.brass);
  spring.name = 'Repetition spring coil';
  wippen.add(spring);
  rod(wippen, springPoints[0], v(0, .006, -.052), .00035, m.brass);
  const springLead=new T.Mesh(repetitionSpringGeometry(),m.brass);
  springLead.name='Flexible repetition spring arm';
  springLead.userData.deforming=true;
  springLead.castShadow=true;
  wippen.add(springLead);
  rod(wippen, v(0, .012, -.014), v(0, .041, -.014), .001, m.steel);
  rod(wippen, v(0, .037, -.014), v(0, .04, -.014), .0028, m.brass, 16).name = 'Repetition regulating screw';

  // Key heel, capstan and backcheck all move with the wooden key, not the case.
  rod(key, v(0, -.028, .23), v(0, -.027, .23), .0018, m.brass, 12);
  rod(key, v(0, -.027, .23), v(0, -.025, .23), .0035, m.brass, 16).name = 'Capstan';
  for (const part of key.children) if (!existingKeyParts.has(part)) part.position.x += x - key.position.x;
  rod(fixed, v(key.position.x, .807, ACTION.keyPivotZ), v(key.position.x, .831, ACTION.keyPivotZ), .0015, m.steel, 12).name = 'Balance pin';
  rod(fixed, v(key.position.x, .798, ACTION.keyPivotZ), v(key.position.x, .801, ACTION.keyPivotZ), .005, m.red, 16);
  return { repetition, springLead };
}

export function backcheckPlacement(keyPosition:T.Vector3,tail:T.Mesh,x:number,checkingAngle:number,
  checkAngle:number,contactOffset:number) {
  tail.updateMatrix();
  const normal=v(0,0,1).applyAxisAngle(v(1,0,0),checkAngle-ACTION.keyAngle);
  let contact=v(0,0,0),minimum=Infinity;
  const positions=tail.geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(tail.matrix)
      .applyAxisAngle(v(1,0,0),checkingAngle).add(v(x,ACTION.hammerY,ACTION.hammerZ));
    const distance=p.dot(normal);
    if(distance<minimum){minimum=distance;contact=p;}
  }
  // Centre the contact across the action rather than choosing a mesh corner.
  contact.x=x;
  return contact.sub(keyPosition).applyAxisAngle(v(1,0,0),ACTION.keyAngle)
    .add(v(0,contactOffset,0).applyAxisAngle(v(1,0,0),checkAngle));
}

export function buildBackcheck(key:T.Group,hammer:T.Group,x:number,checkingAngle:number,
  m:Materials,box:Box,rod:Rod) {
  const tail=box(hammer,[.009,.048,.022],[0,-.012,-.239],m.walnut,.003);
  tail.name='Rounded hornbeam hammer tail';
  const checkAngle=-.28;
  const check=new T.Group();
  check.name='Backcheck';
  check.rotation.x=checkAngle;
  check.position.copy(backcheckPlacement(key.position,tail,x,checkingAngle,checkAngle,.012));
  box(check,[.011,.024,.007],[0,0,-.0045],m.walnut,.001);
  box(check,[.011,.024,.001],[0,0,-.0005],m.leather);
  key.add(check);
  const bottom=v(0,-.011,-.0045).applyAxisAngle(v(1,0,0),checkAngle).add(check.position);
  const foot=v(x-key.position.x,-.028,bottom.z+.012);
  const bend=foot.clone().add(v(0,.018,0));
  rod(key,foot,bend,.0015,m.steel,12);
  const flex=new T.Group();
  flex.name='Backcheck wire elastic bend';
  flex.position.copy(bend);
  key.add(flex);
  flex.add(check);
  check.position.sub(bend);
  rod(flex,v(0,0,0),bottom.sub(bend),.0015,m.steel,12).name='Bent backcheck wire';
  return {flex,check,tail};
}

/** The spring-wire mount yields during the passing stroke, then seats at check. */
export function updateBackcheck(key:T.Group,hammer:T.Group,mount:ReturnType<typeof buildBackcheck>) {
  const {flex,check,tail}=mount;
  key.updateMatrix();hammer.updateMatrix();check.updateMatrix();tail.updateMatrix();
  const relative=new T.Matrix4().copy(key.matrix).invert().multiply(hammer.matrix).multiply(tail.matrix);
  const transform=new T.Matrix4(),p=new T.Vector3(),positions=tail.geometry.attributes.position;
  const penetrates=(angle:number)=> {
    flex.rotation.x=-angle;flex.updateMatrix();
    transform.copy(flex.matrix).multiply(check.matrix).invert().multiply(relative);
    for(let i=0;i<positions.count;i++) {
      p.fromBufferAttribute(positions,i).applyMatrix4(transform);
      if(p.y>-.012+1e-6&&p.y<.012-1e-6&&p.z < -1e-7)return true;
    }
    return false;
  };
  if(!penetrates(0))return;
  let lo=0,hi=.04;
  for(let i=0;i<18;i++) {
    const mid=(lo+hi)/2;
    if(penetrates(mid))lo=mid;else hi=mid;
  }
  flex.rotation.x=-hi;
}
