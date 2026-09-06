import * as T from 'three';
import { KEYBOARD, KEY_LAYOUT } from './music';

/** Ivory outlines have real shoulders around their neighbouring sharps. */
export function whiteKeyOutline(midi: number, originZ: number) {
  const key = KEY_LAYOUT[midi - 21];
  if (!key || key.black) throw Error('Expected a white piano key');
  const halfWidth = (KEYBOARD.whitePitch - KEYBOARD.whiteGap) / 2;
  let left = -halfWidth, right = halfWidth;
  for (const neighbour of KEY_LAYOUT.filter(k => k.black && Math.abs(k.midi - midi) === 1)) {
    const relativeX = neighbour.x - key.x;
    const clearance = KEYBOARD.blackWidth / 2 + KEYBOARD.notchClearance;
    if (relativeX < 0) left = relativeX + clearance;
    else right = relativeX - clearance;
  }
  const front = KEYBOARD.frontZ - originZ;
  const shoulder = KEYBOARD.blackFrontZ - KEYBOARD.notchClearance - originZ;
  const rear = KEYBOARD.whiteRearZ - originZ;
  const shape = new T.Shape([
    new T.Vector2(-halfWidth, front), new T.Vector2(halfWidth, front),
    new T.Vector2(halfWidth, shoulder), new T.Vector2(right, shoulder),
    new T.Vector2(right, rear), new T.Vector2(left, rear),
    new T.Vector2(left, shoulder), new T.Vector2(-halfWidth, shoulder),
  ]);
  shape.closePath();
  return shape;
}
