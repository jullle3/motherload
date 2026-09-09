import { KEYS, type WeaponKey } from './config';
export type Point = [number, number, number];
export const RADIUS = 1.8,
  CORE_RADIUS = 1.38,
  CRUST_INNER = 1.68;
export const FIELD_WIDTH = 128,
  FIELD_HEIGHT = 64;
export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s, a[2] * s];
export const length = (a: Point) => Math.hypot(...a);
export const normal = (a: Point): Point => scale(a, 1 / (length(a) || 1));
export const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number, z: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let sum = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++)
        sum +=
          hash(ix + a, iy + b, iz + c) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz);
  return sum;
}
// One byte field, used verbatim by both the GPU and collision queries.
export const CRUST_FIELD = Uint8Array.from({ length: FIELD_WIDTH * FIELD_HEIGHT }, (_, i) => {
  const u = ((i % FIELD_WIDTH) + 0.5) / FIELD_WIDTH,
    v = (Math.floor(i / FIELD_WIDTH) + 0.5) / FIELD_HEIGHT;
  const p: Point = [
    -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI),
    Math.cos(v * Math.PI),
    Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI),
  ];
  return Math.round(noise(p[0] * 8.1 + 2, p[1] * 8.1 + 2, p[2] * 8.1 + 2) * 255);
});
export function uv(p: Point): [number, number] {
  p = normal(p);
  return [
    (Math.atan2(p[2], -p[0]) / (Math.PI * 2) + 1) % 1,
    Math.acos(Math.max(-1, Math.min(1, p[1]))) / Math.PI,
  ];
}
export function crustPresent(p: Point, fraction: number) {
  const [u, v] = uv(p),
    field =
      CRUST_FIELD[
        Math.min(FIELD_HEIGHT - 1, Math.floor(v * FIELD_HEIGHT)) * FIELD_WIDTH +
          Math.floor(u * FIELD_WIDTH)
      ] / 255;
  return field >= smooth((fraction - 0.3) / 0.65) * 0.75;
}
export function solid(p: Point, fraction: number) {
  const r = length(p);
  return r <= CORE_RADIUS || (r <= RADIUS && r >= CRUST_INNER && crustPresent(p, fraction));
}
// Match THREE Euler XYZ with x=0, y=angle, z=.12.
export function toWorld(p: Point, angle: number): Point {
  const cz = Math.cos(0.12),
    sz = Math.sin(0.12),
    cy = Math.cos(angle),
    sy = Math.sin(angle),
    x = p[0] * cz - p[1] * sz,
    y = p[0] * sz + p[1] * cz;
  return [x * cy + p[2] * sy, y, -x * sy + p[2] * cy];
}
export function toLocal(p: Point, angle: number): Point {
  const cy = Math.cos(angle),
    sy = Math.sin(angle),
    cz = Math.cos(0.12),
    sz = Math.sin(0.12),
    x = p[0] * cy - p[2] * sy;
  return [x * cz + p[1] * sz, -x * sz + p[1] * cz, p[0] * sy + p[2] * cy];
}
export function orbit(key: WeaponKey, index: number, elapsed: number): Point {
  const a = (KEYS.indexOf(key) * Math.PI) / 2 + index * 0.23 + elapsed * 0.04;
  // Keep the entire hull and muzzle outside the atmosphere at every phase.
  return [Math.cos(a) * (2.65 + index * 0.09), Math.sin(a) * 2.45, Math.sin(a * 1.3) * 0.9 + 0.5];
}
export function muzzle(key: WeaponKey, index: number, elapsed: number): Point {
  const center = orbit(key, index, elapsed);
  return add(center, scale(normal(center), key === 'siege' ? -0.38 : -0.28));
}
export function autoSource(motionTime: number): Point {
  return [-1.65 + Math.sin(motionTime * 0.2) * 0.25, 0.9, 3.2];
}
export type Trajectory = {
  path: Point[];
  point: Point;
  contact: Point;
  radius: number;
  duration: number;
  source: Point;
};
export function trace(
  source: Point,
  aim: Point,
  fraction: number,
  angle: number,
  angularSpeed: number,
  duration: number,
  curved = false,
): Trajectory | null {
  const distance = length(add(aim, scale(source, -1))),
    steps = Math.max(64, Math.ceil(distance / 0.008));
  const outward = normal(source);
  let previous = source,
    previousT = 0;
  const path: Point[] = [source];
  const sample = (t: number) =>
    add(lerp(source, aim, t), scale(outward, curved ? Math.sin(Math.PI * t) * 0.65 : 0));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      p = sample(t);
    if (solid(toLocal(p, angle + angularSpeed * duration * t), fraction)) {
      let lo = previousT,
        hi = t;
      for (let n = 0; n < 18; n++) {
        const mid = (lo + hi) / 2;
        if (solid(toLocal(sample(mid), angle + angularSpeed * duration * mid), fraction)) hi = mid;
        else lo = mid;
      }
      const contact = sample(hi),
        local = toLocal(contact, angle + angularSpeed * duration * hi);
      path.push(contact);
      return {
        path,
        point: normal(local),
        contact: local,
        radius: length(local),
        duration: Math.max(0.08, duration * hi),
        source,
      };
    }
    path.push(p);
    previous = p;
    previousT = t;
  }
  return null;
}
export function aimFor(source: Point, a: number, b: number): Point {
  const n = normal(source),
    axis: Point = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (x: Point, y: Point): Point => [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const right = normal(cross(n, axis)),
    up = cross(right, n),
    r = Math.sqrt(a) * 0.95;
  return add(scale(right, Math.cos(b * Math.PI * 2) * r), scale(up, Math.sin(b * Math.PI * 2) * r));
}
export function trajectoryPoint(path: Point[], t: number): Point {
  const n = Math.max(0, Math.min(1, t)) * (path.length - 1),
    i = Math.min(path.length - 2, Math.floor(n));
  return lerp(path[i], path[i + 1], n - i);
}
