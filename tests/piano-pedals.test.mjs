import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {pedalTransmission,SOFT_PIVOT}=await loadTs('../lib/piano-pedals.ts');

test('Complete transmission closes every fixed-length rod through 181 pedal positions',()=>{
  for(let step=0;step<=180;step++) {
    const pose=pedalTransmission([-step/1000,-step/1000,-step/1000]);
    for(let i=0;i<3;i++) {
      const input=pose.inputs[i],link=pose.links[i];
      assert.ok(Math.abs(input.frontEnd.distanceTo(input.rearEnd)-.5)<1e-10);
      assert.ok(Math.abs(input.output.distanceTo(link.top)-link.length)<1e-10);
      assert.ok(Number.isFinite(link.angle));
    }
    assert.ok(pose.sustainAngle>=-1e-10&&pose.sustainAngle<.33);
    assert.ok(pose.shift>=-1e-10&&pose.shift<=.0060000001);
    assert.ok(Math.abs(pose.softContact.x-SOFT_PIVOT.x-pose.shift)<1e-10);
  }
});

test('Independent pedals do not move the other two transmission outputs',()=>{
  for(let mask=0;mask<8;mask++) {
    const pose=pedalTransmission([0,1,2].map(i=>mask&(1<<i)?-.18:0));
    const rest=pedalTransmission([0,0,0]);
    for(let i=0;i<3;i++) if(!(mask&(1<<i))) {
      assert.ok(pose.links[i].top.distanceTo(rest.links[i].top)<1e-10);
    }
  }
});
