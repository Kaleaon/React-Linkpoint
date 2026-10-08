/**
 * Vector and quaternion helpers with the official viewer's conventions
 * (`indra/llmath/llquaternion.cpp`, `v3math.cpp` @ secondlife/viewer 7dd6de6120ce):
 *  - quaternions are [x, y, z, w];
 *  - `multiply(a, b)` is the viewer's `a * b`, which is the standard product b x a ("a, then b");
 *  - `rotate(v, q)` is the viewer's `v * q`, the standard q v q^-1.
 */

export type Vec3 = number[];
export type Quat = [number, number, number, number];

export const IDENTITY: Readonly<Quat> = [0, 0, 0, 1];
const FP_MAG_THRESHOLD = 0.0000001;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The viewer's `normVec`: leaves a near-zero vector unchanged. */
export function normalize(a: Vec3): Vec3 {
  const mag = length(a);
  return mag > FP_MAG_THRESHOLD ? scale(a, 1 / mag) : [...a];
}

/** The viewer's `v * q`. */
export function rotate(v: Vec3, q: Readonly<Quat>): Vec3 {
  const [qx, qy, qz, qw] = q;
  const rw = -qx * v[0] - qy * v[1] - qz * v[2];
  const rx = qw * v[0] + qy * v[2] - qz * v[1];
  const ry = qw * v[1] + qz * v[0] - qx * v[2];
  const rz = qw * v[2] + qx * v[1] - qy * v[0];
  return [-rw * qx + rx * qw - ry * qz + rz * qy, -rw * qy + ry * qw - rz * qx + rx * qz, -rw * qz + rz * qw - rx * qy + ry * qx];
}

/** The viewer's `LLQuaternion(angle, axis)`. */
export function axisAngle(angle: number, axis: Vec3): Quat {
  const mag = length(axis);
  if (mag <= FP_MAG_THRESHOLD) return [...IDENTITY] as Quat;
  const half = angle * 0.5, s = Math.sin(half) / mag;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** The viewer's `a * b`. */
export function multiply(a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  return [
    b[3] * a[0] + b[0] * a[3] + b[1] * a[2] - b[2] * a[1],
    b[3] * a[1] + b[1] * a[3] + b[2] * a[0] - b[0] * a[2],
    b[3] * a[2] + b[2] * a[3] + b[0] * a[1] - b[1] * a[0],
    b[3] * a[3] - b[0] * a[0] - b[1] * a[1] - b[2] * a[2],
  ];
}

/** The viewer's `~q`. */
export const conjugate = (q: Readonly<Quat>): Quat => [-q[0], -q[1], -q[2], q[3]];

/** The viewer's `LLQuaternion::shortestArc(a, b)`: the smallest rotation taking direction a to direction b. */
export function shortestArc(a: Vec3, b: Vec3): Quat {
  const ab = dot(a, b);
  const c = cross(a, b);
  const cc = dot(c, c);
  if (ab * ab + cc) {
    if (cc > 0) {
      const s = Math.sqrt(ab * ab + cc) + ab;
      const m = 1 / Math.sqrt(cc + s * s);
      return [c[0] * m, c[1] * m, c[2] * m, s * m];
    }
    if (ab < 0) { // anti-parallel: choose an axis in the XY plane
      const d = sub(a, b);
      const m = Math.hypot(d[0], d[1]);
      if (m > FP_MAG_THRESHOLD) return [-d[1] / m, d[0] / m, 0, 0];
      return [1, 0, 0, 0];
    }
  }
  return [...IDENTITY] as Quat;
}

/** The viewer's `getAngleAxis`: angle in [0, 2pi) with the axis flipped so w >= 0. */
export function angleAxis(q: Readonly<Quat>): { angle: number; axis: Vec3 } {
  const v = Math.hypot(q[0], q[1], q[2]);
  if (v > FP_MAG_THRESHOLD) {
    let oomag = 1 / v, w = q[3];
    if (q[3] < 0) { w = -w; oomag = -oomag; }
    return { angle: 2 * Math.atan2(v, w), axis: [q[0] * oomag, q[1] * oomag, q[2] * oomag] };
  }
  return { angle: 0, axis: [0, 0, 1] };
}

/** The viewer's `slerp(u, a, b)`. */
export function slerp(u: number, a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let flip = false;
  if (cos < 0) { cos = -cos; flip = true; }
  let alpha: number, beta: number;
  if (1 - cos < 0.00001) { beta = 1 - u; alpha = u; }
  else {
    const theta = Math.acos(cos), sin = Math.sin(theta);
    beta = Math.sin(theta - u * theta) / sin;
    alpha = Math.sin(u * theta) / sin;
  }
  if (flip) beta = -beta;
  return [beta * a[0] + alpha * b[0], beta * a[1] + alpha * b[1], beta * a[2] + alpha * b[2], beta * a[3] + alpha * b[3]];
}
