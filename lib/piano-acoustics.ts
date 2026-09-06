import * as T from 'three';
import clipping, { type Polygon } from 'polygon-clipping';

export const SOUNDBOARD_TOP = .892;
export const SOUNDBOARD_THICKNESS = .012;

export function stringScale(midi: number) {
  const t = (midi - 21) / 87;
  const x = -.713 + t * 1.426;
  const bass = midi < 45;
  const start = new T.Vector3(x, .953 + (bass ? .025 : 0), -.65);
  const bridge = new T.Vector3(x + (bass ? .25 * (1 - t) : -.025),
    .946 + (bass ? .025 : 0), 1.44 - 1.77 * Math.pow(t, 1.55));
  const hitch = bridge.clone().add(new T.Vector3(0, -.009, .06));
  return { start, bridge, hitch, count: midi < 29 ? 1 : bass ? 2 : 3 };
}

export function bridgeRibbon(first: number, last: number, halfDepth: number, zOffset = 0) {
  const points = Array.from({ length: last - first + 1 }, (_, i) => stringScale(first + i).bridge);
  points.unshift(points[0].clone().add(new T.Vector3(-.012, 0, 0)));
  points.push(points.at(-1)!.clone().add(new T.Vector3(.012, 0, 0)));
  const shape = new T.Shape();
  const perimeter = [
    ...points.map(p => new T.Vector2(p.x, p.z + zOffset - halfDepth)),
    ...points.slice().reverse().map(p => new T.Vector2(p.x, p.z + zOffset + halfDepth)),
  ];
  shape.setFromPoints(perimeter);
  shape.closePath();
  return shape;
}

function polygon(shape: T.Shape): Polygon {
  return [shape.getPoints(96), ...shape.holes.map(h => h.getPoints(96))]
    .map(ring => ring.map(p => [p.x, p.y] as [number, number]));
}

/** Real cutouts, including open-ended channels, rather than overlapping meshes. */
export function subtractShapes(subject: T.Shape, cutters: T.Shape[]) {
  return shapesFromPolygons(clipping.difference(polygon(subject), ...cutters.map(polygon)));
}

export function intersectShapes(subject: T.Shape, boundary: T.Shape) {
  return shapesFromPolygons(clipping.intersection(polygon(subject), polygon(boundary)));
}

function shapesFromPolygons(polygons: Polygon[]) {
  return polygons.map(rings => {
    const shape = new T.Shape(rings[0].map(([x,y]) => new T.Vector2(x,y)));
    shape.holes = rings.slice(1).map(ring => new T.Path(ring.map(([x,y]) => new T.Vector2(x,y))));
    return shape;
  });
}

export function soundboardShape() {
  const s = new T.Shape();
  // The action/damper well remains open; only the undamped treble has a front tongue.
  s.moveTo(-.73, -.115);
  s.lineTo(.43, -.115);
  s.lineTo(.43, -.355);
  s.lineTo(.735, -.355);
  s.bezierCurveTo(.735, .02, .45, .28, .335, .57);
  s.bezierCurveTo(.24, .83, .36, 1.26, .08, 1.47);
  s.bezierCurveTo(-.15, 1.69, -.65, 1.60, -.73, 1.36);
  s.closePath();
  return s;
}
