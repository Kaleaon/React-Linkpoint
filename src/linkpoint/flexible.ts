/**
 * Flexible prim simulation, ported from the official viewer's `LLVolumeImplFlexible::doFlexibleUpdate`
 * (`indra/newview/llflexibleobject.cpp`), with its constants from `indra/llprimitive/llprimitive.cpp`
 * and the parameter layout from `LLFlexibleObjectData::unpack`. Source: github.com/secondlife/viewer
 * @ 7dd6de6120ce (2026-10-07).
 *
 * A flexible prim is a chain of 2^softness segments anchored at the base of the prim. Each step the
 * chain is pushed by gravity, wind and the user force, pulled straight by tension, carried on by its
 * momentum, then every segment is clamped to its length and to a maximum bend per segment. It is
 * simulated in world space, so the owner supplies the prim's world position, rotation and scale.
 *
 * Left out: the distance-based throttling of how often a flexi updates (it needs the camera) and the
 * per-section scale and twist of tapered or twisted paths (those are baked into the mesh).
 */
import {
  IDENTITY,
  add,
  angleAxis,
  axisAngle,
  conjugate,
  length,
  lerpVec,
  multiply,
  normalize,
  rotate,
  scale,
  shortestArc,
  slerp,
  sub,
  type Quat,
  type Vec3,
} from './sl-math';

/** `FLEXIBLE_OBJECT_MAX_SECTIONS`: at most 2^3 = 8 segments. */
export const FLEXIBLE_MAX_SECTIONS = 3;
/** `FLEXIBLE_OBJECT_MAX_INTERNAL_TENSION_FORCE`. */
export const FLEXIBLE_MAX_INTERNAL_TENSION_FORCE = 0.99;
/** A frame longer than this is treated as this long (`secondsThisFrame > 0.2f`). */
export const FLEXIBLE_MAX_FRAME_SECONDS = 0.2;

export interface FlexibleParams {
  /** The "simulate LOD" 0..3: the chain has 2^softness segments. */
  softness: number;
  tension: number;
  /** Air friction (`Drag` in the extra-parameter block). */
  friction: number;
  /** Gravity; positive pulls down. */
  gravity: number;
  /** Wind sensitivity. */
  wind: number;
  /** User force, in m/s^2-like units per the viewer (applied as `force * section_length * dt`). */
  force: number[];
}

/** The prim's pose in the world. `scale[2]` is the length of the chain. */
export interface FlexibleFrame {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface FlexibleSection {
  position: Vec3;
  direction: Vec3;
  rotation: Quat;
  velocity: Vec3;
  /** Derivative of position along the chain, used to interpolate extra render sections. */
  dPosition: Vec3;
}

const blank = (): FlexibleSection => ({
  position: [0, 0, 0],
  direction: [0, 0, 1],
  rotation: [...IDENTITY] as Quat,
  velocity: [0, 0, 0],
  dPosition: [0, 0, 0],
});
const copy = (s: FlexibleSection): FlexibleSection => ({
  position: [...s.position],
  direction: [...s.direction],
  rotation: [...s.rotation] as Quat,
  velocity: [...s.velocity],
  dPosition: [...s.dPosition],
});

/**
 * `LLVolumeImplFlexible::remapSections`. `sourceRes` -1 means "build a straight chain from section 0".
 * Positions between sections use the viewer's cubic interpolation.
 */
export function remapSections(
  source: FlexibleSection[],
  sourceRes: number,
  destRes: number,
  totalLength: number,
): FlexibleSection[] {
  const outCount = 1 << destRes;
  const sectionLength = totalLength / outCount;
  const dest: FlexibleSection[] = Array.from({ length: outCount + 1 }, blank);
  if (sourceRes === -1) {
    dest[0] = copy(source[0]);
    for (let i = 0; i < outCount; i++) {
      dest[i + 1] = copy(dest[i]);
      dest[i + 1].position = add(dest[i].position, scale(dest[i].direction, sectionLength));
      dest[i + 1].velocity = [0, 0, 0];
    }
  } else if (sourceRes > destRes) {
    const steps = 1 << (sourceRes - destRes);
    for (let i = 0; i < outCount; i++) dest[i + 1] = copy(source[(i + 1) * steps]);
    dest[0] = copy(source[0]);
  } else if (sourceRes < destRes) {
    const shift = destRes - sourceRes;
    const steps = 1 << shift;
    const sourceLength = totalLength / (1 << sourceRes);
    for (let section = outCount - steps; section >= 0; section -= steps) {
      const last = source[section >> shift];
      const next = source[(section >> shift) + 1];
      // Cubic: A t^3 + B t^2 + C t + D
      const D = last.position;
      const C = scale(last.dPosition, sourceLength);
      const Y = sub(scale(next.dPosition, sourceLength), C);
      const X = sub(sub(next.position, D), C);
      const A = sub(Y, scale(X, 2));
      const B = sub(X, A);
      const tInc = 1 / steps;
      let t = tInc;
      for (let step = 1; step < steps; step++) {
        const tSq = t * t;
        dest[section + step] = {
          position: add(add(scale(add(scale(A, t), B), tSq), scale(C, t)), D),
          rotation: slerp(t, last.rotation, next.rotation),
          velocity: lerpVec(last.velocity, next.velocity, t),
          direction: lerpVec(last.direction, next.direction, t),
          dPosition: lerpVec(last.dPosition, next.dPosition, t),
        };
        dest[section + steps] = copy(next);
        t += tInc;
      }
      if (steps === 1) dest[section + 1] = copy(next);
    }
    dest[0] = copy(source[0]);
  } else {
    for (let i = 0; i <= outCount; i++) dest[i] = copy(source[i]);
  }
  return dest;
}

export class FlexibleChain {
  private sections: FlexibleSection[] = [];
  private initializedRes = -1;

  constructor(public params: FlexibleParams) {}

  /** Segments in the simulated chain. */
  get segments() {
    return 1 << this.resolution();
  }

  private resolution() {
    return Math.max(0, Math.min(FLEXIBLE_MAX_SECTIONS, Math.round(this.params.softness) || 0));
  }

  /** Advance the chain by `dt` seconds for a prim in the given world pose. `windAt` gives region wind (m/s) at a point. */
  step(dt: number, frame: FlexibleFrame, windAt?: (position: Vec3) => Vec3) {
    const res = this.resolution();
    const n = 1 << res;
    const seconds = Math.min(Math.max(0, dt), FLEXIBLE_MAX_FRAME_SECONDS);
    const length_ = frame.scale[2];
    if (!(length_ > 0)) return;

    const baseRotation = frame.rotation;
    const anchorDirection = rotate([0, 0, 1], baseRotation);
    const anchorPosition = sub(frame.position, scale(anchorDirection, length_ / 2));

    if (this.initializedRes !== res) {
      // setAttributesOfAllSections: section 0 from the frame, the rest remapped from what we had.
      const first = this.sections[0] ? copy(this.sections[0]) : blank();
      first.position = anchorPosition;
      first.direction = anchorDirection;
      first.dPosition = anchorDirection;
      first.rotation = [...baseRotation] as Quat;
      first.velocity = [0, 0, 0];
      const source = this.sections.length ? [first, ...this.sections.slice(1)] : [first];
      this.sections = remapSections(source, this.initializedRes, res, length_);
      this.initializedRes = res;
    }

    const sectionLength = length_ / n;
    const invLength = 1 / sectionLength;
    const s = this.sections;
    s[0].position = anchorPosition;
    s[0].direction = anchorDirection;
    s[0].rotation = [...baseRotation] as Quat;

    let tFactor = this.params.tension * 0.1;
    tFactor *= 1 - Math.pow(0.85, seconds * 30);
    if (tFactor > FLEXIBLE_MAX_INTERNAL_TENSION_FORCE)
      tFactor = FLEXIBLE_MAX_INTERNAL_TENSION_FORCE;

    let frictionCoeff = this.params.friction * 2 + 1;
    frictionCoeff = Math.pow(10, frictionCoeff * seconds);
    frictionCoeff = frictionCoeff > 1 ? frictionCoeff : 1;
    const momentum = 1 / frictionCoeff;

    const windFactor = this.params.wind * 0.1 * sectionLength * seconds;
    const maxAngle = Math.atan(sectionLength * 2);
    const forceFactor = sectionLength * seconds;
    const userForce = this.params.force;

    let parentSegmentRotation: Quat = [...baseRotation] as Quat;
    for (let i = 1; i <= n; i++) {
      const lastPosition = [...s[i].position];
      // gravity
      s[i].position[2] -= this.params.gravity * forceFactor;
      // wind
      if (this.params.wind > 0.001 && windAt)
        s[i].position = add(s[i].position, scale(windAt(s[i].position), windFactor));
      // user-defined force
      s[i].position = add(s[i].position, scale(userForce, forceFactor));

      // tension (rigidity)
      const parentPosition = s[i - 1].position;
      const parentDirection = s[i - 1].direction;
      const parentSectionVector = i === 1 ? s[0].direction : s[i - 2].direction;
      const currentVector = sub(s[i].position, parentPosition);
      const difference = sub(scale(parentSectionVector, sectionLength), currentVector);
      s[i].position = add(s[i].position, scale(difference, tFactor));

      // inertia
      s[i].position = add(s[i].position, scale(s[i].velocity, momentum));

      // clamp length and rotation
      s[i].direction = normalize(sub(s[i].position, parentPosition));
      let deltaRotation = shortestArc(parentDirection, s[i].direction);
      let { angle, axis } = angleAxis(deltaRotation);
      if (angle > Math.PI) angle -= 2 * Math.PI;
      if (angle < -Math.PI) angle += 2 * Math.PI;
      if (angle > maxAngle) deltaRotation = axisAngle(maxAngle, axis);
      else if (angle < -maxAngle) deltaRotation = axisAngle(-maxAngle, axis);
      const segmentRotation = multiply(parentSegmentRotation, deltaRotation);
      parentSegmentRotation = segmentRotation;

      s[i].direction = rotate(parentDirection, deltaRotation);
      s[i].position = add(parentPosition, scale(s[i].direction, sectionLength));
      s[i].rotation = segmentRotation;

      if (i > 1) {
        // propagate half the rotation up to the parent
        s[i - 1].rotation = multiply(s[i - 1].rotation, axisAngle(angle / 2, axis));
      }

      // velocity
      s[i].velocity = sub(s[i].position, lastPosition);
      if (length(s[i].velocity) ** 2 > 1) s[i].velocity = normalize(s[i].velocity);
    }

    // derivatives, for interpolating extra render sections
    s[0].dPosition = scale(sub(s[1].position, s[0].position), invLength);
    for (let i = 1; i < n; i++) {
      const a = scale(
        add(sub(s[i - 1].position, s[i].position), sub(s[i + 1].position, s[i].position)),
        0.5 * invLength * invLength,
      );
      const b = sub(sub(s[i + 1].position, s[i].position), scale(a, sectionLength * sectionLength));
      s[i].dPosition = scale(b, invLength);
    }
    s[n].dPosition = scale(sub(s[n].position, s[n - 1].position), invLength);
    this.lastFrame = frame;
  }

  private lastFrame: FlexibleFrame | null = null;

  /**
   * The chain in the prim's own frame (origin at the prim centre, z along the prim), resampled to
   * 2^renderRes segments: what the viewer feeds the path generator. `rotation` is the section's
   * orientation relative to the prim; a straight chain gives identity rotations and z from -L/2 to +L/2.
   */
  localSections(renderRes = FLEXIBLE_MAX_SECTIONS): Array<{ position: Vec3; rotation: Quat }> {
    const frame = this.lastFrame;
    if (!frame || !this.sections.length) return [];
    const res = Math.max(0, Math.min(FLEXIBLE_MAX_SECTIONS, renderRes));
    const rendered = remapSections(this.sections, this.initializedRes, res, frame.scale[2]);
    const inverse = conjugate(frame.rotation);
    return rendered.map((section) => ({
      position: rotate(sub(section.position, frame.position), inverse),
      rotation: multiply(section.rotation, inverse),
    }));
  }
}
