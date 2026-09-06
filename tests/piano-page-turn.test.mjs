import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { loadTs } from './load-ts.mjs';
const { PianoSheet } = await loadTs('../lib/piano-sheet.ts');
// Isolate page geometry/state from font rasterization.
PianoSheet.prototype.texture = function(index) {
  if (!this.textures.has(index)) { const t = new T.Texture(); t.name = String(index); this.textures.set(index,t); }
  return this.textures.get(index);
};
test('Turning sheet retains old left page until landing and has distinct front/back content', () => {
  const sheet = new PianoSheet(new T.Group());
  sheet.pages = [0,4,8,12].map(start => ({start,notes:[]}));
  const oldLeft = sheet.left.material.map;
  const oldRight = sheet.right.material.map;
  sheet.show(1,true);
  assert.equal(sheet.left.material.map,oldLeft);
  assert.equal(sheet.turning.material.map,oldRight);
  assert.equal(sheet.turningBack.material.map.name,'2');
  assert.equal(sheet.right.material.map.name,'3');
  sheet.update(.45,8,true);
  assert.equal(sheet.left.material.map,oldLeft);
  assert.equal(sheet.turning.visible,true);
  sheet.update(.6,8.6,true);
  assert.equal(sheet.left.material.map.name,'2');
  assert.equal(sheet.turning.visible,false);
  assert.equal(sheet.turningBack.visible,false);
  sheet.dispose();
});
test('Back-face UV is reversed so text reads normally after a 180-degree turn', () => {
  const sheet = new PianoSheet(new T.Group());
  sheet.bendPage(1);
  const front = sheet.turning.geometry.attributes.uv;
  const back = sheet.turningBack.geometry.attributes.uv;
  const p = sheet.turningBack.geometry.attributes.position;
  for (let i=0;i<front.count;i++) {
    assert.ok(Math.abs(front.getX(i)+back.getX(i)-1)<1e-7);
    assert.ok(Math.abs((p.getX(i)+.212)/.21-back.getX(i))<1e-6);
  }
  assert.equal(sheet.turning.material.side,T.BackSide);
  assert.equal(sheet.turningBack.material.side,T.FrontSide);
  sheet.dispose();
});
