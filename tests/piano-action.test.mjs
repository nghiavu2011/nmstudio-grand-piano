import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { actionPose, pedalLinkage, hammerStroke, HAMMER_ATTACK_SECONDS } = await loadTs('../lib/piano-action.ts');

test('Hammer flight reaches contact, rebounds, and can reattack without resetting to the rail',()=>{
  for(const start of [0,.04,.075,.15,.21]) {
    assert.equal(hammerStroke(0,start,.225,.075),start);
    assert.equal(hammerStroke(HAMMER_ATTACK_SECONDS,start,.225,.075),.225);
    assert.equal(hammerStroke(.13,start,.225,.075),.075);
    for(let i=0;i<=130;i++) {
      const angle=hammerStroke(i/1000,start,.225,.075);
      assert.ok(angle>=Math.min(start,.075)&&angle<=.225);
    }
  }
});

test('All pedal positions close the linkage without changing pushrod length', () => {
  for (let i = 0; i <= 180; i++) {
    const { lower, upper, length, rockerAngle } = pedalLinkage(-i / 1000);
    assert.ok(Math.abs(lower.distanceTo(upper) - length) < 1e-10);
    assert.ok(rockerAngle >= -1e-10 && rockerAngle < .1);
    assert.ok(Math.abs(Math.hypot(upper.y - .65, upper.z + .77) - .09) < 1e-10);
  }
});

test('Escapement has a continuous late-key transition and resets on release', () => {
  let previous = actionPose(0, 0);
  for (let i = 1; i <= 1000; i++) {
    const d = i / 1000, pose = actionPose(d, d * .075);
    for (const field of ['wippen', 'jack', 'repetition', 'escape']) {
      assert.ok(Number.isFinite(pose[field]));
      assert.ok(Math.abs(pose[field] - previous[field]) < .01, field);
    }
    if (d <= .78) assert.equal(pose.escape, 0);
    previous = pose;
  }
  assert.equal(previous.escape, 1);
  assert.equal(Math.abs(actionPose(0, 0).jack), 0);
});

test('Repetition regulation prevents the fork following the hammer into flight', () => {
  for (let d = 0; d <= 1; d += .01) {
    for (let h = 0; h <= .22; h += .001) {
      const pose = actionPose(d, h);
      assert.ok(pose.repetition >= -.12 && pose.repetition <= .17);
      assert.ok(pose.wippen >= 0 && pose.wippen < .13);
    }
  }
});
