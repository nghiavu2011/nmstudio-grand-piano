import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';
import { OBB } from 'three/addons/math/OBB.js';

const T = createRequire(import.meta.url)('three');
// Canvas is intentionally stubbed: this suite verifies geometry, not painting.
globalThis.document = {
  // oxlint-disable-next-line typescript/no-deprecated
  createElement: () => ({ getContext: () => new Proxy({}, {
    get: (target, key) => target[key] ?? (() => {}),
    set: (target, key, value) => { target[key] = value; return true; },
  }) }),
};
const { PianoModel } = await loadTs('../lib/piano-model.ts');
const { bridgeRibbon, soundboardShape, subtractShapes, stringScale } = await loadTs('../lib/piano-acoustics.ts');
const {pedalTransmission}=await loadTs('../lib/piano-pedals.ts');
const {KEYBOARD}=await loadTs('../lib/music.ts');
const model = new PianoModel();
const empty = new Set();

test('Damper stems clear their own and adjacent string choirs through full lift',()=>{
  for(const key of model.keys.filter(k=>k.midi<89)) {
    const stem=key.damper.getObjectByName('Damper wire vertical stem');
    assert.ok(stem);
    const x=key.damper.position.x+stem.position.x,z=key.damper.position.z;
    for(const midi of [key.midi,key.midi+1]) {
      const scale=stringScale(midi);
      const t=(z-scale.start.z)/(scale.bridge.z-scale.start.z);
      const centre=T.MathUtils.lerp(scale.start.x,scale.bridge.x,t);
      for(let i=0;i<scale.count;i++)assert.ok(Math.abs(x-centre-(i-(scale.count-1)/2)*.0045)>.0012,
        `MIDI ${key.midi} stem intersects choir ${midi}`);
    }
    const bend=key.damper.getObjectByName('Damper wire lower bend');
    bend.updateMatrix();
    const p=bend.geometry.attributes.position;
    const scale=stringScale(key.midi);
    const stringY=T.MathUtils.lerp(scale.start.y,scale.bridge.y,(z-scale.start.z)/(scale.bridge.z-scale.start.z));
    for(let i=0;i<p.count;i++) {
      const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(bend.matrix);
      assert.ok(v.y+.9604+(key.midi<45?.025:0)+.04<stringY);
    }
  }
});

test('Damper wire shafts clear the peripheral left plate through full lift',()=>{
  model.group.updateMatrixWorld(true);
  const obstacles=[];
  model.group.traverse(mesh=>{
    if(mesh.name==='Peripheral plate with hammer-well opening') obstacles.push({mesh,bounds:new T.Box3().setFromObject(mesh)});
  });
  assert.ok(obstacles.length);
  const ray=new T.Raycaster(),direction=new T.Vector3(.013,1,.007).normalize();
  for(const key of model.keys.filter(k=>k.midi<89)) {
    const rest=.9604+(key.midi<45?.025:0);
    try {
      for(let lift=0;lift<=40;lift+=5) {
        key.damper.position.y=rest+lift/1000;
        key.damper.updateWorldMatrix(true,true);
        for(const name of ['Damper wire lower bend','Damper wire vertical stem']) {
          const wire=key.damper.getObjectByName(name);
          const {height,radiusTop:radius}=wire.geometry.parameters;
          for(let row=0;row<=24;row++)for(let side=0;side<12;side++) {
            const angle=side*Math.PI/6;
            const p=new T.Vector3(radius*Math.cos(angle),height*(row/24-.5),radius*Math.sin(angle)).applyMatrix4(wire.matrixWorld);
            for(const {mesh,bounds} of obstacles) {
              if(!bounds.containsPoint(p))continue;
              const materialSide=mesh.material.side;
              mesh.material.side=T.DoubleSide;
              ray.set(p,direction);
              const hits=ray.intersectObject(mesh,false);
              mesh.material.side=materialSide;
              const distances=hits.map(hit=>hit.distance).filter((d,i,a)=>!i||d-a[i-1]>1e-7);
              assert.equal(distances.length%2,0,`MIDI ${key.midi}, ${name}, lift ${lift}mm at ${p.toArray()}`);
            }
          }
        }
      }
    } finally { key.damper.position.y=rest; key.damper.updateWorldMatrix(true,true); }
  }
});

test('Folding music desk clears the front case wall above the logo panel',()=>{
  const front=model.group.getObjectByName('Bent laminated outer rim');
  const hole=front.geometry.parameters.shapes.holes[0];
  const backOfFrontWall=Math.min(...hole.getPoints().map(p=>p.y))+.007;
  front.updateMatrix();
  const rimBounds=new T.Box3().setFromBufferAttribute(front.geometry.attributes.position).applyMatrix4(front.matrix);
  for(let step=0;step<=110;step++) {
    model.lidAngle=step/200;
    model.animate(0,0,empty,empty,[false,false,false],empty);
    model.group.updateMatrixWorld(true);
    for(const part of model.desk.children.filter(o=>o.geometry)) {
      const matrix=model.group.matrixWorld.clone().invert().multiply(part.matrixWorld);
      const p=part.geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        const point=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);
        if(point.y>=rimBounds.min.y&&point.y<=rimBounds.max.y)
          assert.ok(point.z>backOfFrontWall,`Desk crosses front wall at lid ${step/200}: z=${point.z}, wall=${backOfFrontWall}`);
      }
    }
  }
});

test('Entrance starts at half opening, finishes smoothly and yields to lid controls',()=>{
  model.lidOpen=true;
  model.startEntrance();
  assert.equal(model.lid.rotation.z,.275);
  let last=.275;
  for(let i=0;i<100;i++) {
    model.animate(1/60,i/60,empty,empty,[false,false,false],empty);
    assert.ok(model.lid.rotation.z>=last&&model.lid.rotation.z<=.55);
    last=model.lid.rotation.z;
  }
  assert.equal(last,.55);
  model.startEntrance();model.lidOpen=false;
  model.animate(.1,0,empty,empty,[false,false,false],empty);
  assert.ok(model.lid.rotation.z<.275);
  model.lidOpen=true;model.startEntrance(true);
  assert.equal(model.lid.rotation.z,.55);
});

test('Outer felt crowns clear the walnut liner and peripheral plate throughout flight and una corda',()=>{
  const obstacles=[];
  model.group.traverse(o=>{
    if(o.isMesh && ['Inner walnut rim with action clearance','Peripheral plate with hammer-well opening'].includes(o.name))obstacles.push(o);
  });
  assert.ok(obstacles.length>=2);
  model.group.updateMatrixWorld(true);
  const ray=new T.Raycaster(), direction=new T.Vector3(.013,1,.007).normalize();
  const inside=(mesh,p)=>{
    const side=mesh.material.side;mesh.material.side=T.DoubleSide;
    ray.set(p,direction);
    const hits=ray.intersectObject(mesh,false);
    mesh.material.side=side;
    const distances=hits.map(h=>h.distance).filter((d,i,a)=>!i||d-a[i-1]>1e-7);
    return distances.length%2===1;
  };
  for(const key of model.keys) {
    const crown=key.hammer.getObjectByName('Hammer felt crown');
    const positions=crown.geometry.attributes.position;
    for(const shift of [0,.003])for(let step=0;step<=12;step++) {
      model.action.position.x=shift;
      key.hammer.rotation.x=key.contactAngle*step/12;
      key.hammer.updateWorldMatrix(true,true);
      for(let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/20))) {
        const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(crown.matrixWorld);
        for(const obstacle of obstacles)assert.ok(!inside(obstacle,p),
          `MIDI ${key.midi}, flight ${step}/12, shift ${shift}: ${obstacle.name}`);
      }
    }
    key.hammer.rotation.x=0;
  }
  model.action.position.x=0;
});

test('Conventional keyboard pitch and notched white heads clear neighbouring sharps in independent motion',()=>{
  assert.ok(Math.abs(model.keys[51].x-model.keys[39].x-.1651)<1e-9,'C4 to C5 span');
  const whites=model.keys.filter(k=>k.midi%12!==1&&k.midi%12!==3&&k.midi%12!==6&&k.midi%12!==8&&k.midi%12!==10);
  const boxFor=(points)=>new T.Box3().setFromPoints(points);
  const boundsInModel=(bounds,mesh)=>{
    mesh.updateWorldMatrix(true,false);
    const matrix=model.group.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    return new OBB().fromBox3(bounds).applyMatrix4(matrix);
  };
  for(const white of whites) {
    const substrate=white.key.getObjectByName('Notched wooden key head');
    assert.ok(substrate,'white key needs a shaped wooden substrate, not an overlapping cuboid');
    const geometries=[white.mesh,substrate];
    for(const mesh of geometries) {
      const points=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i));
      const shoulder=KEYBOARD.blackFrontZ-KEYBOARD.notchClearance+.65;
      const front=boxFor(points.filter(p=>p.z<=shoulder+.0003));
      const neck=boxFor(points.filter(p=>p.z>=shoulder+.0003));
      assert.ok(front.max.z-front.min.z<.056,'front head must not retain the old 138 mm length');
      assert.ok(Math.abs(new T.Box3().setFromPoints(points).getSize(new T.Vector3()).z-.155)<.001);
      for(const black of model.keys.filter(k=>Math.abs(k.midi-white.midi)===1&&k.mesh.name==='Ebony sharp keytop')) {
        black.mesh.geometry.computeBoundingBox();
        for(const a of [0,.25,.5,.75,1])for(const b of [0,.25,.5,.75,1]) {
          white.key.rotation.x=-.023*a;
          black.key.rotation.x=-.023*b;
          const blackBox=boundsInModel(black.mesh.geometry.boundingBox,black.mesh);
          for(const part of [front,neck])assert.ok(!boundsInModel(part,mesh).intersectsOBB(blackBox),`White/sharp collision ${white.midi}/${black.midi}, ${a}/${b}`);
        }
        black.key.rotation.x=0;
      }
    }
    white.key.rotation.x=0;
  }
  model.animate(0,0,empty,empty,[false,false,false],empty);
});

test('Interleaved strikes and independent pedals retain neighbouring hammer clearance during lid travel',()=>{
  const previous={lidOpen:model.lidOpen,exposed:model.exposed};
  let priorHeld=empty;
  let minimumNeighbourGap=Infinity;
  try {
    model.setExposed(false);
    for(let frame=0;frame<360;frame++) {
      model.lidOpen=frame>=180;
      const held=new Set(model.keys.filter((_,i)=>(frame+i*7)%37<19).map(k=>k.midi));
      const pedals=[frame%120<60,frame%90<45,frame%72<36];
      const captured=new Set(model.keys.filter((_,i)=>i%3===0).map(k=>k.midi));
      for(const midi of held)if(!priorHeld.has(midi))model.strike(midi);
      model.animate(1/120,frame/120,held,held,pedals,captured);
      const hammerBounds=model.keys.map(key=>new T.Box3().setFromObject(key.hammer));
      for(let i=1;i<hammerBounds.length;i++) {
        const a=hammerBounds[i-1],b=hammerBounds[i];
        const gap=model.group.scale.x<0?a.min.x-b.max.x:b.min.x-a.max.x;
        minimumNeighbourGap=Math.min(minimumNeighbourGap,gap);
        assert.ok(gap>0,`Adjacent hammers ${i+20}/${i+21}, frame ${frame}: ${gap}`);
      }
      const inverse=model.lid.matrixWorld.clone().invert();
      for(const key of model.keys) {
        for(const part of [...key.hammer.children,...(key.midi<89?key.damper.children:[])]) {
          const matrix=inverse.clone().multiply(part.matrixWorld);
          assert.ok(matrix.elements.every(Number.isFinite),'combined motion matrix must remain finite');
          const positions=part.geometry.attributes.position;
          for(let i=0;i<positions.count;i++) {
            const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix);
            assert.ok(p.y<=-.0449,`Combined motion/lid MIDI ${key.midi}, frame ${frame}: ${p.y}`);
          }
        }
      }
      priorHeld=held;
    }
    assert.ok(minimumNeighbourGap>.001,'neighbouring hammer assemblies need a positive one-millimetre margin');
  } finally {
    model.lidOpen=previous.lidOpen;
    model.setExposed(previous.exposed);
    for(let i=0;i<120;i++)model.animate(1/120,i/120,empty,empty,[false,false,false],empty);
  }
});

test('Bass, middle and treble actions repeat at 15 Hz from partial key release',()=>{
  const held=new Set([21,60,108]);
  for(let frame=0;frame<240;frame++) {
    const down=frame%16<10?held:empty;
    if(frame%16===0)held.forEach(m=>model.strike(m));
    model.animate(1/240,frame/240,down,down,[false,false,false],empty);
    for(const midi of held) {
      const key=model.keys[midi-21];
      const roller=key.jack.worldToLocal(key.hammer.localToWorld(new T.Vector3(0,-.01,-.04)));
      const y=T.MathUtils.clamp(roller.y,.026,.027),z=T.MathUtils.clamp(roller.z,-.003,.003);
      assert.ok(Math.hypot(roller.y-y,roller.z-z)>=.007-1e-8,`repetition jack ${midi}/${frame}`);
      assert.ok(key.hammer.rotation.x<=key.contactAngle+1e-9);
      const {check,tail,flex}=key.backcheck;
      assert.ok(Math.abs(flex.rotation.x)<.04,'backcheck wire must remain within its elastic regulation');
      const matrix=check.matrixWorld.clone().invert().multiply(tail.matrixWorld);
      for(let i=0;i<tail.geometry.attributes.position.count;i++) {
        const p=new T.Vector3().fromBufferAttribute(tail.geometry.attributes.position,i).applyMatrix4(matrix);
        assert.ok(!(p.y>-.012+1e-5&&p.y<.012-1e-5&&p.z< -1e-5&&p.z>-.008),`repeated tail ${midi}/${frame}`);
      }
    }
  }
  for(let i=0;i<120;i++)model.animate(1/240,i/240,empty,empty,[false,false,false],empty);
});

test('All 88 backchecks meet hammer tails at checking height and clear attack/release',()=>{
  const held=new Set(model.keys.map(k=>k.midi));
  for(const midi of held)model.strike(midi);
  for(let frame=0;frame<180;frame++) {
    const down=frame<90?held:empty;
    model.animate(1/240,frame/240,down,down,[false,false,false],empty);
    for(const midi of held) {
      const key=model.keys[midi-21],check=key.key.getObjectByName('Backcheck');
      const tail=key.hammer.getObjectByName('Rounded hornbeam hammer tail');
      const roller=key.jack.worldToLocal(key.hammer.localToWorld(new T.Vector3(0,-.01,-.04)));
      const nearestY=T.MathUtils.clamp(roller.y,.026,.027),nearestZ=T.MathUtils.clamp(roller.z,-.003,.003);
      assert.ok(Math.hypot(roller.y-nearestY,roller.z-nearestZ)>=.007-1e-8,`jack cap MIDI ${midi}, frame ${frame}, depression ${key.depression}, hammer ${key.hammer.rotation.x}, roller ${roller.y}/${roller.z}`);
      const matrix=check.matrixWorld.clone().invert().multiply(tail.matrixWorld);
      let minimum=Infinity;
      for(let i=0;i<tail.geometry.attributes.position.count;i++) {
        const p=new T.Vector3().fromBufferAttribute(tail.geometry.attributes.position,i).applyMatrix4(matrix);
        minimum=Math.min(minimum,p.z);
        assert.ok(!(p.y>-.012+1e-5&&p.y<.012-1e-5&&p.z< -1e-5&&p.z>-.008),
          `tail/backcheck penetration MIDI ${midi}, frame ${frame}, y/z ${p.y}/${p.z}`);
      }
      if(frame===89) assert.ok(Math.abs(minimum)<1e-6,`checking gap ${minimum}`);
    }
  }
});

test('Repetition fork is tangent to the roller in regulated support states',()=>{
  const key=model.keys[39];
  for(let frame=0;frame<240;frame++) {
    const held=frame<120?new Set([60]):empty;
    if(frame===0)model.strike(60);
    model.animate(1/240,frame/240,held,held,[false,false,false],empty);
    const roller=key.hammer.localToWorld(new T.Vector3(0,-.01,-.04));
    const p=key.repetition.worldToLocal(roller);
    assert.ok(p.y>=.01-1e-7,`roller penetrates felt: ${p.y}`);
    if(key.repetition.rotation.x<.16999&&key.repetition.rotation.x>-.11999) {
      assert.ok(Math.abs(p.y-.01)<1e-7,'regulated fork must meet the roller');
      assert.ok(p.z>=-.078&&p.z<=-.052,`contact must lie on the actual felt patch: frame ${frame}, z ${p.z}`);
    }
  }
});

test('Relocated key balance gives a ten-millimetre dip and keeps the capstan on the heel',()=>{
  const key=model.keys[39];
  key.key.rotation.x=0;
  key.key.updateWorldMatrix(true,true);
  const tip=new T.Vector3(0,.017,KEYBOARD.frontZ-key.key.position.z);
  const rest=key.key.localToWorld(tip.clone());
  key.key.rotation.x=-.023;
  key.key.updateWorldMatrix(true,true);
  const down=key.key.localToWorld(tip.clone());
  assert.ok(rest.y-down.y>.0097&&rest.y-down.y<.0099);
  for(let i=0;i<180;i++) {
    const held=i<90?new Set([60]):empty;
    model.animate(1/120,i/120,held,held,[false,false,false],empty);
    const capstan=key.key.getObjectByName('Capstan');
    const p=capstan.localToWorld(new T.Vector3(0,.001,0));
    key.wippen.worldToLocal(p);
    assert.ok(Math.abs(p.y+.009)<1e-8,`heel gap ${p.y+.009}`);
    assert.ok(p.z>=-.089&&p.z<=-.071);
  }
});

test('Every felt crown reaches its own string plane without penetrating it, including at 60 Hz',()=>{
  for(const key of model.keys) {
    const crown=key.hammer.getObjectByName('Hammer felt crown');
    const {start,bridge}=stringScale(key.midi);
    let gap=Infinity;
    crown.updateMatrix();
    for(let i=0;i<crown.geometry.attributes.position.count;i++) {
      const p=new T.Vector3().fromBufferAttribute(crown.geometry.attributes.position,i)
        .applyMatrix4(crown.matrix).applyAxisAngle(new T.Vector3(1,0,0),key.contactAngle)
        .add(new T.Vector3(0,.859,-.39));
      const stringY=T.MathUtils.lerp(start.y,bridge.y,(p.z-start.z)/(bridge.z-start.z));
      gap=Math.min(gap,stringY-p.y);
    }
    assert.ok(Math.abs(gap)<1e-10,`MIDI ${key.midi}: contact gap ${gap}`);
    assert.ok(key.contactAngle>.15&&key.contactAngle<.3);
    model.strike(key.midi);
  }
  const held=new Set(model.keys.map(k=>k.midi));
  model.animate(1/60,0,held,held,[false,false,false],empty);
  model.animate(1/60,1/60,held,held,[false,false,false],empty);
  for(const key of model.keys) assert.equal(key.hammer.rotation.x,key.contactAngle);
  for(let i=0;i<30;i++)model.animate(1/60,i/60,empty,empty,[false,false,false],empty);
});

test('Repetition spring keeps both rendered anchors and wire length during repeated strikes',()=>{
  const key=model.keys[39];
  for(let f=0;f<120;f++) {
    const down=f%12<6;
    if(f%12===0)model.strike(60);
    model.animate(1/240,f/240,down?new Set([60]):empty,empty,[false,false,false],empty);
    const positions=key.springLead.geometry.attributes.position;
    const centres=[];
    for(let ring=0;ring<17;ring++) {
      const p=new T.Vector3();
      for(let j=0;j<6;j++) p.add(new T.Vector3().fromBufferAttribute(positions,ring*6+j));
      centres.push(p.multiplyScalar(1/6));
    }
    assert.ok(centres[0].distanceTo(new T.Vector3(.0037,.026,-.043))<1e-8);
    const tip=key.repetition.localToWorld(new T.Vector3(0,-.001,-.006));
    assert.ok(key.wippen.localToWorld(centres.at(-1).clone()).distanceTo(tip)<1e-8);
    const length=centres.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(centres[i]),0);
    assert.ok(Math.abs(length-.016)<.000025,`spring length ${length}`);
    const rendered=model.springWires.geometry.attributes.position;
    const offset=39*positions.count;
    for(const i of [0,positions.count-1]) {
      const actual=model.group.localToWorld(new T.Vector3().fromBufferAttribute(rendered,offset+i));
      const expected=key.springLead.localToWorld(new T.Vector3().fromBufferAttribute(positions,i));
      assert.ok(actual.distanceTo(expected)<1e-7,'batched wire must retain its independent deformation');
    }
  }
});

test('All six caster treads and all four bench glides touch the floor',()=>{
  model.group.updateMatrixWorld(true);
  const contacts=[];
  model.groundHardware.traverse(o=>{
    if(o.name==='Ground-contact wheel tread'||o.name==='Bench floor glide')contacts.push(o);
  });
  assert.equal(contacts.length,10);
  for(const part of contacts) {
    const bounds=new T.Box3().setFromObject(part);
    assert.ok(Math.abs(bounds.min.y)<1e-8,`${part.name}: floor gap ${bounds.min.y}`);
  }
});

test('Tufted cushion normals remain finite and normalized; lacquer stays dielectric',()=>{
  assert.equal(model.caseMaterial.metalness,0);
  assert.ok(model.benchSeat.material.bumpMap);
  const positions=model.benchSeat.geometry.attributes.position,normals=model.benchSeat.geometry.attributes.normal;
  let centralTuft=false;
  for(let i=0;i<positions.count;i++) {
    assert.ok(Number.isFinite(positions.getY(i)));
    const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));
    assert.ok(Math.abs(length-1)<1e-6);
    if(Math.abs(positions.getX(i))<1e-7&&Math.abs(positions.getZ(i))<1e-7&&normals.getY(i)>.99) {
      assert.ok(positions.getY(i)<.018,'centre tuft must have a real depression');
      centralTuft=true;
    }
  }
  assert.equal(centralTuft,true);
});

test('Soft pedal roller stays on the action follower rather than pushing through or detaching',()=>{
  const face=model.action.getObjectByName('Soft pedal follower face');
  for(let f=0;f<180;f++) {
    model.animate(1/60,f/60,empty,empty,[f<90,false,false],empty);
    const pose=pedalTransmission(model.pedals.map(p=>p.rotation.x));
    const point=pose.softContact.clone().add(new T.Vector3(.006,0,0)).applyMatrix4(model.group.matrixWorld);
    const local=face.worldToLocal(point);
    assert.ok(Math.abs(local.x+.007)<1e-8);
    assert.ok(Math.abs(local.y)<.009);
    assert.ok(Math.abs(local.z)<.013);
  }
});

test('Sostenuto lip supports captured tabs while later notes flex past and release',()=>{
  const captured=new Set([60]);
  for(let f=0;f<90;f++) model.animate(1/60,f/60,captured,captured,[false,false,false],empty);
  for(let f=0;f<90;f++) model.animate(1/60,f/60,captured,captured,[false,true,false],captured);
  const key=model.keys[39],late=model.keys[43];
  const shelf=model.transmission.sostenutoShelf;
  const point=new T.Vector3(key.underlever.position.x,.00075,0).applyMatrix4(shelf.matrixWorld);
  const local=key.underlever.worldToLocal(point);
  assert.ok(Math.abs(local.y+.002)<1e-7);
  assert.ok(Math.abs(local.z+.033)<1e-7);
  for(let f=0;f<90;f++) model.animate(1/60,f/60,new Set([64]),new Set([60,64]),[false,true,false],captured);
  assert.ok(Math.abs(key.captureTab.rotation.x)<1e-7);
  assert.ok(Math.abs(late.captureTab.rotation.x+.95)<1e-7);
  for(let f=0;f<90;f++) model.animate(1/60,f/60,empty,captured,[false,true,false],captured);
  assert.ok(key.lift>.02);
  assert.ok(late.lift<1e-7);
  for(let f=0;f<90;f++) model.animate(1/60,f/60,empty,empty,[false,false,false],empty);
});

test('All dampers at full lift and all hammers in flight clear the lid and folded music desk',()=>{
  const held=new Set(model.keys.map(k=>k.midi));
  for(let frame=0;frame<90;frame++) model.animate(1/60,frame/60,held,held,[true,true,true],held);
  for(const angle of [0,.1,.2,.3,.4,.5,.55]) {
    model.lidAngle=angle;
    model.animate(0,0,held,held,[true,true,true],held);
    const inverse=model.lid.matrixWorld.clone().invert();
    const desk=[...model.desk.children,...model.deskSupport.children].map(o=>new T.Box3().setFromObject(o));
    for(const key of model.keys) {
      for(const hammerAngle of [0,.25,.5,.75,1].map(t=>t*key.contactAngle)) {
        key.hammer.rotation.x=hammerAngle;
        key.hammer.updateWorldMatrix(true,true);
        for(const mesh of key.hammer.children) {
          for(const obstruction of desk) assert.ok(!new T.Box3().setFromObject(mesh).intersectsBox(obstruction),`Hammer/desk MIDI ${key.midi}, lid ${angle}, hammer ${hammerAngle}`);
        }
      }
      for(const object of [...key.hammer.children,...(key.midi<89?key.damper.children:[])]) {
        const matrix=inverse.clone().multiply(object.matrixWorld);
        const positions=object.geometry.attributes.position;
        for(let i=0;i<positions.count;i++) {
          const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix);
          assert.ok(p.y<=-.0449,`Moving mechanism/lid MIDI ${key.midi}, lid ${angle}: ${p.y}`);
        }
      }
    }
  }
  for(let frame=0;frame<90;frame++) model.animate(1/60,frame/60,empty,empty,[false,false,false],empty);
});

test('Damper lift blocks remain on their felted underlevers during key and pedal travel',()=>{
  for(let frame=0;frame<180;frame++) {
    const pedal=frame<90;
    const held=new Set(frame>=90&&frame<135?[48,60,72]:[]);
    model.animate(1/60,frame/60,held,held,[false,false,pedal],empty);
    for(const key of model.keys.filter(k=>k.midi<89)) {
      const block=key.damper.getObjectByName('Damper lift block');
      const world=new T.Vector3(0,-.004,0).applyMatrix4(block.matrixWorld);
      const contact=key.underlever.worldToLocal(world);
      assert.ok(Math.abs(contact.y-.005)<1e-7,`MIDI ${key.midi} contact gap`);
      assert.ok(contact.z>=-.123&&contact.z<=-.047,`MIDI ${key.midi} falls off lever`);
      assert.ok(key.underlever.rotation.x+1e-10>=model.transmission.tray.rotation.x);
    }
  }
});

test('Rendered transmission rods keep their original geometry length',()=>{
  for(let frame=0;frame<90;frame++) {
    model.animate(1/60,frame/60,empty,empty,[true,true,true],empty);
    for(const rod of [...model.transmission.longRods,...model.transmission.liftRods]) {
      assert.deepEqual(rod.scale.toArray(),[1,1,1]);
      assert.ok(rod.geometry.parameters.height>0);
    }
  }
  for(let frame=0;frame<90;frame++) model.animate(1/60,frame/60,empty,empty,[false,false,false],empty);
});

test('Soundboard ribs stay inside the soundboard and plate geometry leaves open bridge channels',()=>{
  const area=shapes=>shapes.reduce((a,s)=>a+Math.abs(T.ShapeUtils.area(s.getPoints(96)))-s.holes.reduce((b,h)=>b+Math.abs(T.ShapeUtils.area(h.getPoints(96))),0),0);
  for(const rib of model.acoustics.children.filter(o=>o.name==='Soundboard underside rib')) {
    assert.ok(area(subtractShapes(rib.geometry.parameters.shapes,[soundboardShape()]))<1e-8);
  }
  for(const part of model.ironBraces.children) {
    const shape=part.geometry.parameters.shapes;
    for(const [first,last] of [[21,44],[45,108]]) {
      const whole=area([shape]);
      const outside=area(subtractShapes(shape,[bridgeRibbon(first,last,.017)]));
      assert.ok(Math.abs(whole-outside)<1e-8,part.name);
    }
  }
});

test('Vibrating string segments share vertices and all hitch/tuning spans stay anchored',()=>{
  model.strike(60);
  model.animate(.016,.123,new Set([60]),new Set([60]),[false,false,false],empty);
  const geometry=model.keys[39].strings.geometry,rest=geometry.userData.rest,pos=geometry.attributes.position;
  for(let base=0;base<pos.count;base+=30) {
    for(let j=1;j<23;j+=2) assert.equal(pos.getY(base+j),pos.getY(base+j+1));
    for(let j=24;j<30;j++) assert.equal(pos.getY(base+j),rest[(base+j)*3+1]);
    assert.equal(pos.getY(base),rest[base*3+1]);
    assert.equal(pos.getY(base+23),rest[(base+23)*3+1]);
  }
});

test('Bridge roots touch the soundboard and their caps meet the speaking string plane',()=>{
  const board=model.acoustics.getObjectByName('Spruce soundboard');
  assert.ok(board);
  for(const [bank,midi] of [['Bass',21],['Treble',45]]) {
    const root=model.acoustics.getObjectByName(`${bank} bridge root`);
    const cap=model.acoustics.getObjectByName(`${bank} bridge cap`);
    const rootBottom=root.position.y-root.geometry.parameters.options.depth;
    assert.ok(Math.abs(rootBottom-board.position.y)<1e-10);
    assert.ok(Math.abs(cap.position.y-.003-root.position.y)<1e-10);
    const string=model.keys[midi-21].strings.geometry.userData.rest;
    assert.ok(Math.abs(cap.position.y-string[70])<1e-6);
  }
});

test('Every string choir continues from bridge to hitch and from tuning pin to speaking start',()=>{
  for(const key of model.keys) {
    const geometry=key.strings.geometry,rest=geometry.userData.rest;
    assert.equal(geometry.userData.choirStride,30);
    const choirs=key.midi<29?1:key.midi<45?2:3;
    assert.equal(geometry.attributes.position.count,choirs*30);
    for(let c=0;c<choirs;c++) {
      const o=c*90;
      assert.deepEqual(Array.from(rest.slice(o+69,o+72)),Array.from(rest.slice(o+72,o+75)));
      assert.deepEqual(Array.from(rest.slice(o,o+3)),Array.from(rest.slice(o+87,o+90)));
      assert.ok(rest[o+82]<rest[o+70],`MIDI ${key.midi}: hitch must lie below bridge`);
    }
  }
});

test('All 88 actions have separate repetition forks, rollers, springs and backchecks', () => {
  for (const key of model.keys) {
    assert.equal(key.repetition.parent, key.wippen);
    assert.ok(key.hammer.getObjectByName('Leather-covered roller'));
    assert.ok(key.wippen.getObjectByName('Repetition spring coil'));
    assert.ok(key.key.getObjectByName('Backcheck'));
    assert.ok(key.key.getObjectByName('Capstan'));
  }
});

test('Action centres are uniformly spaced independently of black/white key centres', () => {
  for (let i = 1; i < model.keys.length; i++) {
    const gap = model.keys[i].hammer.position.x - model.keys[i - 1].hammer.position.x;
    assert.ok(Math.abs(gap - 1.426 / 87) < 1e-10);
    assert.ok(gap > .014, 'adjacent hammer felt must have clearance');
  }
});

test('Damper heads are centred over their own string choirs rather than the keyboard X coordinates', () => {
  for (const key of model.keys.filter(k => k.midi < 89)) {
    const rest = key.strings.geometry.userData.rest;
    const count = key.midi < 29 ? 1 : key.midi < 45 ? 2 : 3;
    const firstX = rest[0] + (count - 1) * .0045 / 2;
    const endX = rest[69] + (count - 1) * .0045 / 2;
    const fraction = (key.damper.position.z - rest[2]) / (rest[71] - rest[2]);
    const expected = firstX + fraction * (endX - firstX);
    assert.ok(Math.abs(key.damper.position.x - expected) < 1e-6, `MIDI ${key.midi}`);
    assert.equal(key.underlever.position.x, key.hammer.position.x + .01);
  }
});

test('Soft pedal translates the centre-pin frame along with the hammers', () => {
  const frame = model.action.getObjectByName('Moving action frame and centre-pin flanges');
  assert.ok(frame);
  assert.equal(frame.parent, model.action);
  for (let i = 0; i < 90; i++) model.animate(1 / 60, i / 60, empty, empty, [true,false,false], empty);
  assert.ok(Math.abs(model.action.position.x - .006) < 1e-6);
  for (let i = 0; i < 90; i++) model.animate(1 / 60, i / 60, empty, empty, [false,false,false], empty);
  assert.ok(model.action.position.x < 1e-6);
});

test('Lid prop and folded desk remain below lining throughout opening and closure', () => {
  let highest=-Infinity,diagnostic='';
  for (let step = 0; step <= 550; step++) {
    const a = step / 1000;
    model.lidAngle = a;
    model.animate(0, 0, empty, empty, [false, false, false], empty);
    const rod = model.lidProp.children[0];
    model.group.updateMatrixWorld(true);
    const inverse = model.lid.matrixWorld.clone().invert();
    for (const object of [rod, ...model.desk.children.filter(o => o.geometry), ...model.deskSupport.children]) {
      const matrix = inverse.clone().multiply(object.matrixWorld);
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const p = new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
        if(p.y>highest) {
          highest=p.y;
          diagnostic=`lid angle=${a}, part=${object.type}, width=${object.geometry.parameters.width}, y=${p.y}`;
        }
      }
    }
  }
  assert.ok(highest<=-.0449,diagnostic);
});

test('Music desk stays physically attached to its carriage throughout folding', () => {
  for (let step = 0; step <= 550; step++) {
    model.lidAngle = step / 1000;
    model.animate(0, 0, empty, empty, [false, false, false], empty);
    assert.equal(model.desk.position.y, 1.005);
    for(const part of model.deskSupport.children.filter(o=>o.name.startsWith('Sliding music-desk')))
      assert.equal(part.position.z,model.desk.position.z,'Carriage and hinges must move with the desk');
    model.deskBraces.forEach((brace, i) => {
      brace.updateMatrix();
      const top = new T.Vector3(0, .105, 0).applyMatrix4(brace.matrix);
      const foot = new T.Vector3(0, -.105, 0).applyMatrix4(brace.matrix);
      const pivot = new T.Vector3(i ? .22 : -.22, .2, .014).applyMatrix4(model.desk.matrix);
      assert.ok(top.distanceTo(pivot) < 1e-8);
      assert.ok(Math.abs(foot.y - 1.005) < 1e-8);
      assert.ok(foot.z >= -.52 && foot.z <= -.29);
    });
  }
});

test('Desk rails stop behind the front panel instead of piercing it', () => {
  const rails = model.deskSupport.children.filter(o => o.geometry.parameters.width === .028);
  assert.equal(rails.length,2);
  for (const rail of rails) {
    const half = rail.geometry.parameters.depth / 2;
    assert.ok(rail.position.z - half >= -.521);
    assert.ok(rail.position.z + half <= -.289);
  }
});

test('All 88 hammer heads clear the tuning block over the full strike range', () => {
  model.lidAngle = .55;
  model.animate(0,0,empty,empty,[false,false,false],empty);
  const block = model.removable.find(o => o.geometry?.parameters.width === 1.46 && o.geometry?.parameters.depth === .043);
  assert.ok(block, 'tuning block must exist');
  model.group.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(block);
  const supports = [...model.deskSupport.children, ...model.desk.children].map(o => new T.Box3().setFromObject(o));
  for (const key of model.keys) {
    for (let step = 0; step <= 220; step++) {
      key.hammer.rotation.x = step / 220 * key.contactAngle;
      key.hammer.updateWorldMatrix(true, true);
      for (const part of key.hammer.children) {
        const box = new T.Box3().setFromObject(part);
        assert.ok(box.min.z > bounds.max.z + .02, `MIDI ${key.midi}, angle ${step / 1000}`);
        for (const support of part.geometry.parameters.width ? supports : [])
          assert.ok(!box.intersectsBox(support), `Hammer hits desk support: MIDI ${key.midi}, angle ${step / 1000}`);
      }
    }
  }
});

test('Every damper and wire clears plate braces and desk rails through the full pedal travel', () => {
  model.lidAngle = .55;
  model.animate(0,0,empty,empty,[false,false,false],empty);
  model.group.updateMatrixWorld(true);
  const obstructions = [...model.ironBraces.children, ...model.deskSupport.children].map(o => new T.Box3().setFromObject(o));
  for (const key of model.keys.filter(k => k.midi < 89)) {
    for (let step = 0; step <= 40; step++) {
      key.damper.position.y = .9604 + (key.midi < 45 ? .025 : 0) + step / 1000;
      key.damper.updateWorldMatrix(true,true);
      for (const part of key.damper.children) {
        const bounds = new T.Box3().setFromObject(part);
        for (const obstruction of obstructions) assert.ok(!bounds.intersectsBox(obstruction), `Damper/plate collision: MIDI ${key.midi}, lift ${step}mm`);
      }
    }
  }
});
