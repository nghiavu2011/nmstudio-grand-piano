import * as T from 'three';
import { pedalLinkage } from './piano-action';

const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const TRAVEL=.18;
export const TRAY_PIVOT=v(0,.805,-.115);
export const SOSTENUTO_PIVOT=v(0,.8384,-.137);
export const SOFT_PIVOT=v(-.743,.785,-.39);

function circleAngle(a:number,b:number,radius:number,length:number) {
  const distance=Math.hypot(a,b);
  const cosine=(distance*distance+radius*radius-length*length)/(2*distance*radius);
  if(cosine < -1-1e-8 || cosine > 1+1e-8) throw Error('Pedal linkage has no rigid closure');
  return Math.atan2(b,a)+Math.acos(T.MathUtils.clamp(cosine,-1,1));
}

export function transmissionInput(pedalAngle:number,index:number) {
  const x=(index-1)*.087;
  const front=pedalLinkage(pedalAngle);
  const angle=front.rockerAngle;
  const frontEnd=v(x,.65-.06*Math.sin(angle),-.77+.06*Math.cos(angle));
  const rearEnd=frontEnd.clone().add(v(0,0,.5));
  const output=v(x,.65+.12*Math.sin(angle),-.27-.12*Math.cos(angle));
  return {frontEnd,rearEnd,output,angle};
}

function liftLink(input:T.Vector3,pivot:T.Vector3) {
  const radius=.025;
  const rest=v(input.x,.65,-.39);
  const fixedPivot=pivot.clone().setX(input.x);
  const length=rest.distanceTo(fixedPivot.clone().add(v(0,0,-radius)));
  const theta=circleAngle(input.y-pivot.y,input.z-pivot.z,radius,length);
  const top=v(input.x,pivot.y+radius*Math.cos(theta),pivot.z+radius*Math.sin(theta));
  return {top,length,angle:theta+Math.PI/2};
}

function softLink(input:T.Vector3) {
  const radius=.025;
  const rest=v(-.087,.65,-.39);
  const length=rest.distanceTo(SOFT_PIVOT.clone().add(v(radius,0,0)));
  const planarLength=Math.sqrt(length*length-(input.z-SOFT_PIVOT.z)**2);
  const theta=circleAngle(input.x-SOFT_PIVOT.x,input.y-SOFT_PIVOT.y,radius,planarLength);
  return {top:SOFT_PIVOT.clone().add(v(radius*Math.cos(theta),radius*Math.sin(theta),0)),length,angle:theta};
}

const fullSoftAngle=softLink(transmissionInput(-TRAVEL,0).output).angle;
export const SOFT_OUTPUT_RADIUS=.006/Math.sin(fullSoftAngle);

export function pedalTransmission(pedalAngles:number[]) {
  const inputs=pedalAngles.map(transmissionInput);
  const soft=softLink(inputs[0].output);
  const sostenuto=liftLink(inputs[1].output,SOSTENUTO_PIVOT);
  const sustain=liftLink(inputs[2].output,TRAY_PIVOT);
  const softContact=SOFT_PIVOT.clone().add(v(SOFT_OUTPUT_RADIUS*Math.sin(soft.angle),-SOFT_OUTPUT_RADIUS*Math.cos(soft.angle),0));
  return {inputs,links:[soft,sostenuto,sustain],softContact,shift:softContact.x-SOFT_PIVOT.x,
    sustainAngle:sustain.angle,sostenutoAngle:sostenuto.angle};
}

type Box=(parent:T.Object3D,size:number[],pos:number[],material:T.Material,radius?:number)=>T.Mesh;
type Rod=(parent:T.Object3D,from:T.Vector3,to:T.Vector3,radius:number,material:T.Material,sides?:number)=>T.Mesh;
type Materials={wood:T.Material; brass:T.Material; steel:T.Material; felt:T.Material};

function poseRod(mesh:T.Mesh,a:T.Vector3,b:T.Vector3) {
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());
}

export class PedalTransmission {
  group=new T.Group();
  tray=new T.Group();
  sostenuto=new T.Group();
  soft=new T.Group();
  rearRockers:T.Group[]=[];
  longRods:T.Mesh[]=[];
  liftRods:T.Mesh[]=[];
  sostenutoShelf:T.Mesh;
  constructor(box:Box,rod:Rod,m:Materials) {
    this.group.name='Complete pedal trapwork';
    this.tray.name='Sustain lift tray';
    this.tray.position.copy(TRAY_PIVOT);
    this.group.add(this.tray);
    box(this.tray,[1.43,.014,.115],[0,-.011,-.051],m.wood,.002);
    box(this.tray,[1.43,.001,.101],[0,-.0035,-.053],m.felt);
    rod(this.group,v(-.74,.805,-.115),v(.74,.805,-.115),.002,m.steel,16);
    for(const x of [-.735,.735]) {
      box(this.group,[.018,.032,.032],[x,.79,-.115],m.brass,.002);
      box(this.group,[.035,.016,.07],[x,.766,-.115],m.wood,.002);
    }
    this.sostenuto.name='Rotating sostenuto capture shaft';
    this.sostenuto.position.copy(SOSTENUTO_PIVOT);
    this.group.add(this.sostenuto);
    rod(this.sostenuto,v(-.73,0,0),v(.73,0,0),.0025,m.brass,16);
    const catchAngle=pedalTransmission([0,-.18,0]).sostenutoAngle;
    const contact=v(0,.805+.033*Math.sin(.317)-.002*Math.cos(.317),-.115-.033*Math.cos(.317)-.002*Math.sin(.317));
    const localContact=contact.sub(SOSTENUTO_PIVOT).applyAxisAngle(v(1,0,0),-catchAngle);
    const blade=box(this.sostenuto,[1.43,localContact.length(),.0015],localContact.clone().multiplyScalar(.5).toArray(),m.brass);
    blade.quaternion.setFromUnitVectors(v(0,1,0),localContact.clone().normalize());
    this.sostenutoShelf=box(this.sostenuto,[1.43,.0015,.003],[0,localContact.y-.00075,localContact.z],m.brass);
    this.sostenutoShelf.name='Sostenuto catching lip';
    for(const x of [-.735,.735]) {
      box(this.group,[.014,.037,.02],[x,SOSTENUTO_PIVOT.y-.02,SOSTENUTO_PIVOT.z],m.wood,.002);
      rod(this.group,SOSTENUTO_PIVOT.clone().setX(x-.009),SOSTENUTO_PIVOT.clone().setX(x+.009),.0035,m.steel,12);
    }
    this.soft.name='Soft pedal bellcrank and action-frame follower';
    this.soft.position.copy(SOFT_PIVOT);
    this.group.add(this.soft);
    rod(this.soft,v(0,0,0),v(.025,0,0),.003,m.brass,12);
    rod(this.soft,v(0,0,0),v(0,-SOFT_OUTPUT_RADIUS,0),.003,m.brass,12);
    rod(this.soft,v(0,-SOFT_OUTPUT_RADIUS,-.005),v(0,-SOFT_OUTPUT_RADIUS,.005),.006,m.felt,20);
    rod(this.group,SOFT_PIVOT.clone().add(v(0,0,-.01)),SOFT_PIVOT.clone().add(v(0,0,.01)),.003,m.steel,16);
    box(this.group,[.023,.044,.024],[SOFT_PIVOT.x,.763,SOFT_PIVOT.z],m.wood,.002);
    const rest=pedalTransmission([0,0,0]);
    for(let i=0;i<3;i++) {
      const x=(i-1)*.087;
      const rocker=new T.Group();
      rocker.name='Rear trapwork rocker';
      rocker.position.set(x,.65,-.27);
      box(rocker,[.018,.014,.19],[0,0,-.025],m.wood,.002);
      rod(rocker,v(-.014,0,0),v(.014,0,0),.0035,m.steel,16);
      for(const z of [-.12,.06]) rod(rocker,v(-.014,0,z),v(.014,0,z),.0025,m.steel,12);
      this.rearRockers.push(rocker);
      this.group.add(rocker);
      for(const side of [-1,1]) box(this.group,[.006,.045,.028],[x+side*.017,.668,-.27],m.brass,.002);
      const long=rod(this.group,rest.inputs[i].frontEnd,rest.inputs[i].rearEnd,.0025,m.steel,12);
      long.name='Fixed-length parallel trapwork rod';
      this.longRods.push(long);
      const lift=rod(this.group,rest.inputs[i].output,rest.links[i].top,.0025,m.steel,12);
      lift.name='Fixed-length output link';
      this.liftRods.push(lift);
      const target=i===0?this.soft:i===1?this.sostenuto:this.tray;
      if(i>0) {
        rod(target,v(x,0,0),v(x,0,-.025),.003,m.brass,12);
        rod(target,v(x-.008,0,-.025),v(x+.008,0,-.025),.0025,m.steel,12);
      }
    }
  }
  update(angles:number[]) {
    const pose=pedalTransmission(angles);
    pose.inputs.forEach((input,i)=> {
      this.rearRockers[i].rotation.x=input.angle;
      poseRod(this.longRods[i],input.frontEnd,input.rearEnd);
      poseRod(this.liftRods[i],input.output,pose.links[i].top);
    });
    this.tray.rotation.x=pose.sustainAngle;
    this.sostenuto.rotation.x=pose.sostenutoAngle;
    this.soft.rotation.z=pose.links[0].angle;
    return pose;
  }
}
