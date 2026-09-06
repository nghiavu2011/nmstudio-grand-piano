import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {pianoSurfaces,feltMaterial,leatherMaterial}=await loadTs('../lib/piano-materials.ts');

test('Micro-surface maps are deterministic, mipmapped and opaque',()=>{
  const first=pianoSurfaces(),second=pianoSurfaces();
  for(const key of Object.keys(first)) {
    const a=first[key],b=second[key];
    assert.deepEqual(a.image.data,b.image.data);
    assert.equal(a.image.data.length,256*256*4);
    assert.equal(a.generateMipmaps,true);
    let min=255,max=0;
    for(let i=0;i<a.image.data.length;i+=4) {
      assert.equal(a.image.data[i+3],255);
      min=Math.min(min,a.image.data[i]);max=Math.max(max,a.image.data[i]);
    }
    assert.ok(max-min>30,key);
    a.dispose();b.dispose();
  }
});

test('Felt and leather use distinct physical surface responses',()=>{
  const maps=pianoSurfaces();
  const felt=feltMaterial(maps.fibre),leather=leatherMaterial(maps.leather);
  assert.ok(felt.roughness>leather.roughness);
  assert.ok(felt.sheen>leather.sheen);
  assert.ok(felt.bumpScale>0&&felt.bumpScale<.0005);
  assert.ok(leather.bumpScale>0&&leather.bumpScale<.0005);
  for(const texture of Object.values(maps))texture.dispose();
  felt.dispose();leather.dispose();
});
