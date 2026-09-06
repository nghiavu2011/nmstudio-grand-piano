import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';
const T = createRequire(import.meta.url)('three');
const { bridgeRibbon, soundboardShape, stringScale, subtractShapes } = await loadTs('../lib/piano-acoustics.ts');

function area(shapes) {
  return shapes.reduce((sum,s)=>sum+Math.abs(T.ShapeUtils.area(s.getPoints(96)))-s.holes.reduce((a,h)=>a+Math.abs(T.ShapeUtils.area(h.getPoints(96))),0),0);
}

test('Both complete bridge footprints are supported by the soundboard',()=>{
  for(const [first,last] of [[21,44],[45,108]]) {
    const unsupported=area(subtractShapes(bridgeRibbon(first,last,.017),[soundboardShape()]));
    assert.ok(unsupported<1e-8,`${first}-${last}: unsupported ${unsupported} square metres`);
  }
});

test('String choirs have positive speaking lengths and downward hitch bearing',()=>{
  for(let midi=21;midi<=108;midi++) {
    const {start,bridge,hitch,count}=stringScale(midi);
    assert.ok(start.distanceTo(bridge)>.3);
    assert.ok(hitch.z>bridge.z);
    assert.ok(hitch.y<bridge.y);
    assert.ok(count>=1&&count<=3);
  }
});

test('Boolean channel cuts support a bridge crossing the plate boundary',()=>{
  const plate=new T.Shape([new T.Vector2(-1,-1),new T.Vector2(1,-1),new T.Vector2(1,1),new T.Vector2(-1,1)]);
  const cutter=new T.Shape([new T.Vector2(-.1,-2),new T.Vector2(.1,-2),new T.Vector2(.1,2),new T.Vector2(-.1,2)]);
  const result=subtractShapes(plate,[cutter]);
  assert.equal(result.length,2);
  assert.ok(Math.abs(area(result)-3.6)<1e-10);
});
