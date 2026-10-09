/**
 * llParticleSystem simulation, ported from the official viewer so particles behave as the
 * simulator's scripts expect. Sources, all github.com/secondlife/viewer @ 7dd6de6120ce (2026-10-07):
 *  - `indra/llmessage/llpartdata.h` / `.cpp`: flag and pattern values, defaults, the binary block;
 *  - `indra/newview/llviewerpartsource.cpp` `LLViewerPartSourceScript::update`: burst timing and the
 *    emission patterns;
 *  - `indra/newview/llviewerpartsim.cpp` `LLViewerPartGroup::updateParticles`: wind, target
 *    interpolation, motion, bounce, colour / scale / glow interpolation, expiry;
 *  - `app_settings/settings.xml` `RenderMaxPartCount` (4096).
 *
 * Left out, because they need camera or sim state we do not have here: the distance and pixel-size
 * throttles that skip tiny or far sources, particle-group batching, HUD particles, and the region
 * wind layer (pass `windAt` when it is available; with none, particles feel no wind).
 *
 * Pattern values are bit flags, not an enumeration: DROP 0x01, EXPLODE 0x02, ANGLE 0x04, ANGLE_CONE
 * 0x08. ANGLE_CONE_EMPTY (0x10) is defined but the viewer never handles it, so such particles are
 * emitted at the source with no velocity, as in the viewer.
 */

import { IDENTITY, axisAngle, multiply, rotate, type Quat } from './sl-math';

/** `LLPartData` flag masks. */
export const PARTICLE_FLAGS = {
  interpColor: 0x01,
  interpScale: 0x02,
  bounce: 0x04,
  wind: 0x08,
  followSource: 0x10,
  followVel: 0x20,
  target: 0x40,
  targetLinear: 0x80,
  emissive: 0x100,
  beam: 0x200,
  ribbon: 0x400,
  dataGlow: 0x10000,
  dataBlend: 0x20000,
} as const;

/** `LLPartSysData` source pattern bit flags. */
export const PARTICLE_PATTERN = {
  DROP: 0x01,
  EXPLODE: 0x02,
  ANGLE: 0x04,
  ANGLE_CONE: 0x08,
  ANGLE_CONE_EMPTY: 0x10,
} as const;

/** `LLPartSysData` system flags (the block's `psflags`). */
export const PARTICLE_SYSTEM_FLAGS = { OBJECT_RELATIVE: 0x01, USE_NEW_ANGLE: 0x02 } as const;

/** `LLPartData` blend factors. */
export const BLEND_FACTOR = {
  ONE: 0,
  ZERO: 1,
  DEST_COLOR: 2,
  SOURCE_COLOR: 3,
  ONE_MINUS_DEST_COLOR: 4,
  ONE_MINUS_SOURCE_COLOR: 5,
  SOURCE_ALPHA: 7,
  ONE_MINUS_SOURCE_ALPHA: 9,
} as const;

/** `RenderMaxPartCount`. */
export const MAX_PARTICLES = 4096;

export interface ParticleConfig {
  /** A `PARTICLE_PATTERN` bit flag. */
  pattern: number;
  /** Seconds the source lives; 0 for forever. */
  maxAge: number;
  startAge?: number;
  /** CRC of the particle block; a change means a new particle system. */
  crc?: number;
  /** Seconds between bursts (the viewer enforces at least 0.01). */
  burstRate: number;
  burstRadius: number;
  burstSpeedMin: number;
  burstSpeedMax: number;
  burstPartCount: number;
  /** Radians; used by ANGLE and ANGLE_CONE. */
  innerAngle?: number;
  outerAngle?: number;
  /** Radians per second about this axis (the magnitude is the rate). */
  angularVelocity?: number[];
  acceleration: number[];
  targetId?: string | null;
  textureId?: string | null;
  /** `LLPartData` flags for each particle. */
  dataFlags: number;
  /** `PARTICLE_SYSTEM_FLAGS`. */
  flags?: number;
  partMaxAge: number;
  startColor: number[];
  endColor: number[];
  startScale: number[];
  endScale: number[];
  startGlow?: number;
  endGlow?: number;
  blendSource?: number;
  blendDest?: number;
  /** Overrides the blend mode derived from the blend factors. */
  blendMode?: 'BLEND' | 'ADD' | 'ALPHA_MASK';
}

export interface ParticleFrame {
  id: string;
  sourceId: string;
  position: number[];
  scale: number[];
  color: number[];
  glow: number;
  textureId?: string | null;
  emissive: boolean;
  blendMode?: 'BLEND' | 'ADD' | 'ALPHA_MASK';
  /** Heading about the view axis for `followVel` particles. */
  rotation?: number;
  ribbon?: boolean;
  beam?: boolean;
  targetPosition?: number[];
  prevPosition?: number[];
  velocity?: number[];
}

type Vec = number[];

const rotVec = (v: Vec, angle: number, x: number, y: number, z: number) =>
  rotate(v, axisAngle(angle, [x, y, z]));

/** Blend mode the renderer can draw for a pair of blend factors (the common ones; anything else is normal alpha). */
export function blendModeFor(
  source: number | undefined,
  dest: number | undefined,
): 'BLEND' | 'ADD' {
  return dest === BLEND_FACTOR.ONE && source !== BLEND_FACTOR.ZERO ? 'ADD' : 'BLEND';
}

/** What a particle remembers about its source, the viewer's `mPartSourcep`: it outlives the emitter. */
interface SourceState {
  pos: Vec;
  targetPos: Vec;
}

interface Particle {
  id: string;
  sourceId: string;
  source: SourceState;
  flags: number;
  pos: Vec;
  posOffset: Vec;
  prevPos: Vec;
  velocity: Vec;
  accel: Vec;
  /** `mLastUpdateTime`: seconds this particle has lived. */
  age: number;
  maxAge: number;
  startColor: Vec;
  endColor: Vec;
  color: Vec;
  startScale: Vec;
  endScale: Vec;
  scale: Vec;
  startGlow: number;
  endGlow: number;
  glow: number;
  textureId?: string | null;
  blendMode: 'BLEND' | 'ADD' | 'ALPHA_MASK';
  previousId?: string;
}

interface Emitter {
  config: ParticleConfig;
  source: SourceState;
  /** `mLastUpdateTime`, `mLastPartTime`: source clocks. */
  lastUpdate: number;
  lastPart: number;
  rotation: Quat;
  serial: number;
  lastParticleId?: string;
  /** False until the first emission pass (the viewer's `first_run`). */
  started: boolean;
}

export interface ParticleSourceInfo {
  /** Orientation of each source object, an SL-frame quaternion [x, y, z, w]. Missing means unrotated. */
  rotations?: Map<string, number[]>;
  /** Region wind at a position (m/s); omit when the simulator's wind layer is unknown. */
  windAt?: (position: Vec) => Vec;
}

export class ParticleEngine {
  private emitters = new Map<string, Emitter>();
  private particles = new Map<string, Particle>();
  private lastNow: number | null = null;

  constructor(
    private random: () => number = Math.random,
    private limit = MAX_PARTICLES,
  ) {}

  setEmitter(id: string, config: ParticleConfig | null, now = 0) {
    void now;
    if (!config || config.burstPartCount <= 0) {
      this.removeEmitter(id);
      return;
    }
    const previous = this.emitters.get(id);
    let old = previous;
    // A different CRC is a new particle system: the viewer starts a fresh source for it.
    if (
      old &&
      config.crc !== undefined &&
      old.config.crc !== undefined &&
      old.config.crc !== config.crc
    )
      old = undefined;
    this.emitters.set(id, {
      config: { ...config, burstRate: Math.max(0.01, config.burstRate || 0) },
      source: old?.source ?? { pos: [0, 0, 0], targetPos: [0, 0, 0] },
      lastUpdate: old?.lastUpdate ?? 0,
      lastPart: old?.lastPart ?? 0,
      rotation: old?.rotation ?? [...IDENTITY],
      serial: previous?.serial ?? 0, // never reuse an id: older particles of the previous system are still alive
      lastParticleId: old?.lastParticleId,
      started: old?.started ?? false,
    });
  }

  removeEmitter(id: string) {
    this.emitters.delete(id);
    for (const [key, p] of this.particles) if (p.sourceId === id) this.particles.delete(key);
  }

  clear() {
    this.emitters.clear();
    this.particles.clear();
    this.lastNow = null;
  }

  /** Advance to `now` (seconds) and return the live particles. */
  update(
    now: number,
    positions: Map<string, number[]>,
    windVector?: number[],
    info: ParticleSourceInfo = {},
  ): ParticleFrame[] {
    const dt = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    const windAt = info.windAt ?? (windVector ? () => windVector : undefined);

    for (const [sourceId, emitter] of this.emitters) {
      const position = positions.get(sourceId);
      if (!position) continue;
      emitter.source.pos = [...position];
      const targetId = emitter.config.targetId;
      const targetPos =
        targetId && /[1-9a-f]/i.test(targetId.replace(/-/g, ''))
          ? positions.get(targetId)
          : undefined;
      emitter.source.targetPos = targetPos ? [...targetPos] : [...position];
      if (!this.emit(sourceId, emitter, dt, info.rotations?.get(sourceId)))
        this.emitters.delete(sourceId);
    }

    for (const [id, p] of this.particles) {
      if (!this.step(p, dt, windAt)) this.particles.delete(id);
    }
    return [...this.particles.values()].map((p) => this.frame(p));
  }

  /** `LLViewerPartSourceScript::update`. Returns false once the source has outlived its max age. */
  private emit(sourceId: string, e: Emitter, dt: number, rotation: number[] | undefined): boolean {
    const c = e.config;
    e.lastUpdate += dt;
    let dtUpdate = e.lastUpdate - e.lastPart;
    if (c.maxAge && (c.startAge ?? 0) + e.lastUpdate + dtUpdate > c.maxAge) return false;

    let firstRun = !e.started;
    e.started = true;
    dtUpdate = Math.min(Math.max(1, 10 * c.burstRate), dtUpdate);
    const sourceRotation: Quat =
      rotation && rotation.length === 4
        ? [rotation[0], rotation[1], rotation[2], rotation[3]]
        : ([...IDENTITY] as Quat);
    const av = c.angularVelocity ?? [0, 0, 0];
    while (dtUpdate > c.burstRate || firstRun) {
      firstRun = false;
      const avMag = Math.hypot(av[0], av[1], av[2]);
      e.rotation = avMag !== 0 ? multiply(e.rotation, axisAngle(dt * avMag, av)) : [...IDENTITY];
      if (this.particles.size >= this.limit) {
        e.lastPart = e.lastUpdate;
        break;
      }
      for (let i = 0; i < c.burstPartCount; i++) this.spawn(sourceId, e, sourceRotation);
      e.lastPart = e.lastUpdate;
      dtUpdate -= c.burstRate;
    }
    return true;
  }

  private spawn(sourceId: string, e: Emitter, sourceRotation: Quat) {
    const c = e.config;
    const flags = c.dataFlags;
    const position = [...e.source.pos];
    let velocity: Vec = [0, 0, 0];
    const speed = () => c.burstSpeedMin + this.random() * (c.burstSpeedMax - c.burstSpeedMin);

    if (c.pattern & PARTICLE_PATTERN.DROP) {
      // at the source, at rest
    } else if (c.pattern & PARTICLE_PATTERN.EXPLODE) {
      let dir: Vec, mvs: number;
      do {
        dir = [this.random() * 2 - 1, this.random() * 2 - 1, this.random() * 2 - 1];
        mvs = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
      } while (mvs > 1 || mvs < 0.01);
      const len = Math.sqrt(mvs);
      dir = dir.map((v) => v / len);
      for (let k = 0; k < 3; k++) position[k] += c.burstRadius * dir[k];
      velocity = dir.map((v) => v * speed());
    } else if (c.pattern & (PARTICLE_PATTERN.ANGLE | PARTICLE_PATTERN.ANGLE_CONE)) {
      const inner = c.innerAngle ?? 0,
        outer = c.outerAngle ?? 0;
      let angle = inner + this.random() * (outer - inner);
      if (this.random() < 0.5) angle = -angle;
      let dir = rotVec([0, 0, 1], angle, 1, 0, 0); // both patterns rotate about the x axis first
      if (c.pattern & PARTICLE_PATTERN.ANGLE_CONE)
        dir = rotVec(dir, this.random() * 4 * Math.PI, 0, 0, 1);
      if (!((c.flags ?? 0) & PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE))
        dir = rotVec(dir, outer, 1, 0, 0); // deprecated angles
      dir = rotate(dir, sourceRotation);
      dir = rotate(dir, e.rotation);
      for (let k = 0; k < 3; k++) position[k] += c.burstRadius * dir[k];
      velocity = dir.map((v) => v * speed());
    }
    // any other pattern (including ANGLE_CONE_EMPTY): at the source, no velocity

    const id = `${sourceId}:${e.serial++}`;
    const blendMode =
      c.blendMode ??
      (flags & PARTICLE_FLAGS.dataBlend ? blendModeFor(c.blendSource, c.blendDest) : 'BLEND');
    const startGlow = flags & PARTICLE_FLAGS.dataGlow ? (c.startGlow ?? 0) : 0;
    const endGlow = flags & PARTICLE_FLAGS.dataGlow ? (c.endGlow ?? 0) : 0;
    this.particles.set(id, {
      id,
      sourceId,
      source: e.source,
      flags,
      pos: position,
      posOffset: [0, 0, 0],
      prevPos: [...position],
      velocity,
      accel: c.acceleration || [0, 0, 0],
      age: 0,
      maxAge: Math.max(0.001, c.partMaxAge),
      startColor: c.startColor,
      endColor: c.endColor,
      color: [...c.startColor],
      startScale: c.startScale,
      endScale: c.endScale,
      scale: [...c.startScale],
      startGlow,
      endGlow,
      glow: startGlow,
      textureId: c.textureId,
      blendMode,
      previousId: flags & PARTICLE_FLAGS.ribbon ? e.lastParticleId : undefined,
    });
    e.lastParticleId = id;
    // `FOLLOW_SRC` and `TARGET_LINEAR` sources stop spreading particles out from the source.
    if (flags & (PARTICLE_FLAGS.followSource | PARTICLE_FLAGS.targetLinear)) c.burstRadius = 0;
  }

  /** `LLViewerPartGroup::updateParticles` for one particle. Returns false when it has died. */
  private step(p: Particle, dt: number, windAt?: (position: Vec) => Vec): boolean {
    const time = p.age + dt;
    const frac = time / p.maxAge;
    p.prevPos = [...p.pos];

    if (p.flags & PARTICLE_FLAGS.followSource)
      for (let k = 0; k < 3; k++) p.pos[k] = p.source.pos[k] + p.posOffset[k];

    if (p.flags & PARTICLE_FLAGS.wind) {
      const wind = windAt ? windAt(p.pos) : [0, 0, 0];
      for (let k = 0; k < 3; k++)
        p.velocity[k] = p.velocity[k] * (1 - 0.1 * dt) + 0.1 * dt * (wind[k] || 0);
    }

    if (p.flags & PARTICLE_FLAGS.target) {
      const remaining = p.maxAge - p.age;
      const step = Math.min(Math.max(remaining > 0 ? dt / remaining : 0, 0), 0.1) * 5;
      for (let k = 0; k < 3; k++) {
        const delta = remaining > 0 ? (p.source.targetPos[k] - p.pos[k]) / remaining : 0;
        p.velocity[k] = p.velocity[k] * (1 - step) + step * delta;
      }
    }

    if (p.flags & PARTICLE_FLAGS.targetLinear) {
      for (let k = 0; k < 3; k++) {
        const delta = p.source.targetPos[k] - p.source.pos[k];
        p.pos[k] = p.source.pos[k] + frac * delta;
        p.velocity[k] = delta;
      }
    } else {
      for (let k = 0; k < 3; k++) {
        p.pos[k] += dt * p.velocity[k] + 0.5 * dt * dt * p.accel[k];
        p.velocity[k] += p.accel[k] * dt;
      }
    }

    if (p.flags & PARTICLE_FLAGS.bounce) {
      // The viewer bounces off the height of the source object, not the ground.
      const dz = p.pos[2] - p.source.pos[2];
      if (dz < 0) {
        p.pos[2] += -2 * dz;
        p.velocity[2] *= -0.75;
      }
    }

    if (p.flags & PARTICLE_FLAGS.followSource)
      for (let k = 0; k < 3; k++) p.posOffset[k] = p.pos[k] - p.source.pos[k];

    if (p.flags & PARTICLE_FLAGS.interpColor)
      p.color = p.startColor.map((v, i) => v * (1 - frac) + (p.endColor[i] ?? v) * frac);
    if (p.flags & PARTICLE_FLAGS.interpScale)
      p.scale = p.startScale.map((v, i) => v * (1 - frac) + (p.endScale[i] ?? v) * frac);
    p.glow = p.startGlow + (p.endGlow - p.startGlow) * frac;

    p.age = time;
    return p.age <= p.maxAge;
  }

  private frame(p: Particle): ParticleFrame {
    const out: ParticleFrame = {
      id: p.id,
      sourceId: p.sourceId,
      position: [...p.pos],
      scale: [...p.scale],
      color: [...p.color],
      glow: p.glow,
      textureId: p.textureId,
      emissive: Boolean(p.flags & PARTICLE_FLAGS.emissive),
      blendMode: p.blendMode,
      prevPosition: [...p.prevPos],
      velocity: [...p.velocity],
    };
    if (p.flags & PARTICLE_FLAGS.followVel) out.rotation = Math.atan2(p.velocity[1], p.velocity[0]);
    if (p.flags & PARTICLE_FLAGS.beam) {
      out.beam = true;
      out.targetPosition = [...p.source.targetPos];
    }
    if (p.flags & PARTICLE_FLAGS.ribbon) out.ribbon = true;
    return out;
  }
}
