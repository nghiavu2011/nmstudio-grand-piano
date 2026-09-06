import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {loadTs} from './load-ts.mjs';
const {buildRoomDetail}=await loadTs('../lib/piano-room-detail.ts');
for(let room=0;room<3;room++)test(`Room ${room}: detailed architecture is finite and statically batched`,()=>{
  const parent=new T.Group();
  const detail=buildRoomDetail(parent,room);
  assert.ok(detail.children.length>=4&&detail.children.length<=8);
  let vertices=0;
  detail.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.geometry.computeBoundingBox();
    assert.ok(Number.isFinite(mesh.geometry.boundingBox.min.x));
    vertices+=mesh.geometry.attributes.position.count;
  });
  assert.ok(vertices>5000);
  if(room===0) {
    const trim=detail.children.find(mesh=>mesh.material.color.getHexString()==='494031');
    const p=trim.geometry.attributes.position;
    const heights=[];
    for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<=5.01 &&
      p.getZ(i)>-3.76&&p.getZ(i)<-3.44&&p.getY(i)<.1)heights.push(p.getY(i));
    assert.ok(heights.length>0,'threshold geometry retained after batching');
    assert.ok(Math.min(...heights)>.0019,'threshold must not be coplanar with floor Y=0');
  }
});
