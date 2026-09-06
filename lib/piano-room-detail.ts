import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, rod } from './piano-model';

/** Architectural detail is batched by material; no extra per-frame work. */
export function buildRoomDetail(parent: T.Group, room: number) {
  const detail = new T.Group();
  detail.name = 'Architectural joinery and furnishings';
  const material = (color: string, roughness = .65, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const wood = material(room === 0 ? '#494031' : '#9a8162');
  const dark = material('#232a29');
  const brass = material('#9c8756', .32, .72);
  const stone = material(room === 1 ? '#d3c9b8' : '#59636b');
  const cloth = material(room === 0 ? '#343f36' : '#d6cec0', .95);
  const light = new T.MeshStandardMaterial({ color: '#f8dca0', emissive: '#f8c67c', emissiveIntensity: 1.4 });
  const b = (size: number[], pos: number[], mat: T.Material, radius = 0) => box(detail, size, pos, mat, radius);
  if (room === 0) {
    // Recessed coffer ceiling, side-wall diffusers and a low timber threshold.
    b([14,.18,12],[0,6.15,-1.7],dark);
    for (let x=-6;x<=6;x+=2) {
      b([.12,.24,12],[x,5.96,-1.7],wood);
      for (let z=-6;z<=4;z+=2) {
        b([1.88,.12,.1],[x+.94,5.97,z],wood);
        b([.48,.016,.48],[x+.95,6.04,z-.8],brass);
        b([.32,.02,.32],[x+.95,6.025,z-.8],light);
      }
    }
    for (const side of [-1,1]) {
      b([.18,6.1,12],[side*6.4,3.05,-1.7],dark);
      for(let z=-6;z<=3;z+=.6) {
        b([.13,3.9,.42],[side*6.24,2.25,z],wood);
        for(let i=0;i<5;i++) b([.06+(i%3)*.025,3.65,.032],
          [side*6.15,2.27,z-.16+i*.08],cloth);
      }
      b([.2,.18,11],[side*6.22,.12,-1.4],wood);
      b([.035,.024,11],[side*6.1,.25,-1.4],brass);
    }
    // Keep both faces above the floor; the old step top was exactly at Y=0
    // and competed with the floor in the depth buffer as the camera moved.
    b([10,.004,.3],[0,.004,-3.6],wood).name='Raised timber threshold';
    for(let i=-18;i<18;i++)for(let z=-7;z<4;z+=1.55)
      b([.306,.0015,.003],[(i+.5)*.31,.002,z+((i%2)*.775)],dark);
    for(let x=-7;x<7;x+=1.1) {
      b([.65,.15,.62],[x,.35,-6.2],cloth,.045);
      b([.65,.7,.12],[x,.72,-6.48],cloth,.045);
      for(const dx of [-.25,.25]) b([.035,.29,.42],[x+dx,.145,-6.2],dark);
    }
  } else if(room === 1) {
    // Deep window reveals, sill, curtains, staggered boards and reading nook.
    b([8.5,.085,.38],[0,.64,4.15],stone,.015);
    for(let i=-2;i<=2;i++) {
      b([1.48,.045,.18],[i*1.58,4.7,4.24],stone);
      b([.035,3.94,.13],[i*1.58+.72,2.7,4.25],dark);
      b([.018,.17,.025],[i*1.58+.64,2.55,4.15],brass,.005);
      for(let z=0;z<2;z++) b([.024,1.88,.035],[i*1.58,1.72+z*1.97,4.25],dark);
    }
    for(const side of [-1,1]) {
      for(let i=0;i<16;i++) {
        const curtain = new T.Mesh(new T.CylinderGeometry(.048,.048,4.65,12,1,true),cloth);
        curtain.position.set(side*(4.05+i*.072),2.4,4.04+Math.sin(i*Math.PI/2)*.035);
        detail.add(curtain);
      }
      rod(detail,new T.Vector3(side*4,4.8,4.02),new T.Vector3(side*5.3,4.8,4.02),.025,brass,12);
    }
    b([12,.16,.06],[0,.08,4.35],stone);
    b([.06,.16,12],[-5.87,.08,-1.5],stone);
    for(let x=-5;x<6;x+=.6)for(let z=-5;z<4;z+=1.2) {
      b([.004,.0018,1.196],[x,.002,z],wood);
      b([.596,.0018,.004],[x+.3,.002,z+((Math.round(x/.6)%2)*.6)],wood);
    }
    b([1.25,.095,.55],[-3.8,.69,2.4],wood,.025);
    for(const x of [-4.3,-3.3])for(const z of [2.2,2.6]) b([.045,.64,.045],[x,.32,z],wood);
    for(let i=0;i<5;i++) b([.25-i*.012,.035,.32],[-4,.76+i*.035,2.4],i%2?cloth:dark,.004);
    const vase = new T.Mesh(new T.LatheGeometry([
      new T.Vector2(.09,0),new T.Vector2(.13,.08),new T.Vector2(.1,.22),new T.Vector2(.045,.31),
    ],32),stone);
    vase.position.set(-3.45,.74,2.4);detail.add(vase);
    b([.72,.12,.7],[-3.8,.43,1.2],cloth,.06);
    b([.72,.65,.1],[-3.8,.73,.89],cloth,.045);
    for(const dx of [-.28,.28])for(const dz of [-.26,.26]) b([.035,.37,.035],[-3.8+dx,.185,1.2+dz],wood);
  } else {
    // Laid stone, coping, glass clamps, planted troughs and framed lanterns.
    for(let x=-12;x<=12;x+=.8)for(let z=-4;z<=4;z+=.8) {
      b([.003,.002,.796],[x,.002,z],dark);
      b([.796,.002,.003],[x+.4,.002,z+.4],dark);
    }
    b([28,.12,.3],[0,-.01,4.65],stone,.015);
    for(let x=-12;x<12;x+=1.8) {
      b([.09,.035,.09],[x,.025,4.8],brass,.008);
      for(const y of [.2,.7]) b([.065,.035,.05],[x,y,4.8],brass,.005);
      const glass = box(parent,[1.72,.67,.012],[x+.9,.435,4.8],
        new T.MeshPhysicalMaterial({color:'#a7c7d5',transparent:true,opacity:.13,roughness:.1,depthWrite:false}));
      glass.name='Balustrade glass panel';glass.castShadow=false;
    }
    const foliage=material('#354d42');
    for(const x of [-3.6,3.6]) {
      b([1.35,.38,.48],[x,.19,3.7],stone,.025);
      b([1.23,.035,.37],[x,.38,3.7],dark);
      for(let i=0;i<32;i++) {
        const a=i*2.399,base=new T.Vector3(x+Math.sin(a)*.53,.38,3.7+Math.cos(a)*.12);
        const top=base.clone().add(new T.Vector3(Math.sin(a)*.15,.22+(i%5)*.065,Math.cos(a)*.13));
        rod(detail,base,top,.008,foliage,5);
      }
    }
    for(const x of [-2.6,2.6]) {
      b([.19,.035,.19],[x,.025,2.4],dark,.008);
      b([.19,.035,.19],[x,.255,2.4],dark,.008);
      for(const dx of [-.08,.08])for(const dz of [-.08,.08]) b([.012,.22,.012],[x+dx,.14,2.4+dz],brass);
      const handle=new T.Mesh(new T.TorusGeometry(.056,.005,6,20,Math.PI),brass);
      handle.position.set(x,.275,2.4);detail.add(handle);
    }
  }
  // Static details sharing a material become one draw call, not hundreds.
  const batches = new Map<T.Material,T.BufferGeometry[]>();
  detail.updateMatrixWorld(true);
  detail.traverse(object => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
    const geometry=(object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone())
      .applyMatrix4(object.matrixWorld);
    const list=batches.get(object.material)??[];list.push(geometry);batches.set(object.material,list);
    object.geometry.dispose();
  });
  const result=new T.Group();result.name=detail.name;
  for(const [mat,geometries] of batches) {
    const merged=mergeGeometries(geometries);
    if(!merged)throw new Error('Room detail geometry could not be batched');
    const mesh=new T.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;
    result.add(mesh);geometries.forEach(g=>g.dispose());
  }
  parent.add(result);
  return result;
}
