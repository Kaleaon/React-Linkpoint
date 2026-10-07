/** A bounded client-side implementation of the full llParticleSystem behaviours. */
export const PARTICLE_FLAGS = {
  interpColor: 1,
  interpScale: 2,
  bounce: 4,
  wind: 8,
  followSource: 16,
  followVel: 32,
  target: 64,
  targetLinear: 128,
  emissive: 256,
  beam: 512,
  ribbon: 1024,
} as const;

export interface ParticleConfig {
  pattern: number;
  maxAge: number;
  burstRate: number;
  burstRadius: number;
  burstSpeedMin: number;
  burstSpeedMax: number;
  burstPartCount: number;
  acceleration: number[];
  targetId?: string | null;
  textureId?: string | null;
  dataFlags: number;
  partMaxAge: number;
  startColor: number[];
  endColor: number[];
  startScale: number[];
  endScale: number[];
  startAlpha?: number;
  endAlpha?: number;
  angleBegin?: number;
  angleEnd?: number;
  omega?: number[];
  blendMode?: 'BLEND' | 'ADD' | 'ALPHA_MASK';
}

export interface ParticleFrame {
  id: string;
  sourceId: string;
  position: number[];
  scale: number[];
  color: number[];
  textureId?: string | null;
  emissive: boolean;
  blendMode?: 'BLEND' | 'ADD' | 'ALPHA_MASK';
  rotation?: number;
  ribbon?: boolean;
  beam?: boolean;
  targetPosition?: number[];
  prevPosition?: number[];
}

interface Particle extends ParticleFrame {
  born: number;
  life: number;
  velocity: number[];
  origin: number[];
  lastSourcePos: number[];
  acceleration: number[];
  updated?: number;
  flags: number;
  startColor: number[];
  endColor: number[];
  startScale: number[];
  endScale: number[];
  targetId?: string | null;
}

interface Emitter {
  config: ParticleConfig;
  started: number;
  lastBurst: number;
  serial: number;
}

export class ParticleEngine {
  private emitters = new Map<string, Emitter>();
  private particles = new Map<string, Particle>();
  constructor(private random: () => number = Math.random, private limit = 512) {}

  setEmitter(id: string, config: ParticleConfig | null, now = 0) {
    if (!config || config.burstPartCount <= 0) {
      this.removeEmitter(id);
      return;
    }
    const old = this.emitters.get(id);
    this.emitters.set(id, {
      config,
      started: old?.started ?? now,
      lastBurst: old?.lastBurst ?? -Infinity,
      serial: old?.serial ?? 0,
    });
  }

  removeEmitter(id: string) {
    this.emitters.delete(id);
    for (const [key, p] of this.particles) {
      if (p.sourceId === id) this.particles.delete(key);
    }
  }

  clear() {
    this.emitters.clear();
    this.particles.clear();
  }

  update(now: number, positions: Map<string, number[]>, windVector: number[] = [0, 0, 0]): ParticleFrame[] {
    for (const [sourceId, emitter] of this.emitters) {
      const c = emitter.config;
      if (c.maxAge > 0 && now - emitter.started > c.maxAge) {
        this.emitters.delete(sourceId);
        continue;
      }
      const rate = Math.max(0.01, c.burstRate || 0.1);
      if (now - emitter.lastBurst >= rate && positions.has(sourceId)) {
        emitter.lastBurst = now;
        for (let i = 0; i < Math.min(32, c.burstPartCount); i++) {
          this.spawn(sourceId, emitter, now, positions.get(sourceId)!);
        }
      }
    }

    for (const [id, p] of this.particles) {
      const age = now - p.born;
      if (age >= p.life) {
        this.particles.delete(id);
        continue;
      }
      const dt = Math.min(0.05, Math.max(0, p.updated == null ? 0 : now - p.updated));
      p.updated = now;

      // Follow source: shift position if source emitter moved
      if (p.flags & PARTICLE_FLAGS.followSource) {
        const sourcePos = positions.get(p.sourceId);
        if (sourcePos && p.lastSourcePos) {
          for (let axis = 0; axis < 3; axis++) {
            const shift = sourcePos[axis] - p.lastSourcePos[axis];
            p.position[axis] += shift;
            p.origin[axis] += shift;
          }
          p.lastSourcePos = [...sourcePos];
        }
      }

      // Wind effect
      if (p.flags & PARTICLE_FLAGS.wind) {
        for (let axis = 0; axis < 3; axis++) {
          p.velocity[axis] += (windVector[axis] || 0) * dt * 0.5;
        }
      }

      // Target attraction
      if (p.flags & (PARTICLE_FLAGS.target | PARTICLE_FLAGS.targetLinear)) {
        const targetPos = p.targetId ? positions.get(p.targetId) : null;
        if (targetPos) {
          p.targetPosition = [...targetPos];
          const distVec = targetPos.map((v, i) => v - p.position[i]);
          const dist = Math.hypot(...distVec) || 0.001;

          if (p.flags & PARTICLE_FLAGS.targetLinear) {
            const speed = Math.hypot(...p.velocity) || 1.0;
            for (let axis = 0; axis < 3; axis++) {
              p.velocity[axis] = (distVec[axis] / dist) * speed;
            }
          } else {
            for (let axis = 0; axis < 3; axis++) {
              p.velocity[axis] += (distVec[axis] / dist) * dt * 4.0;
            }
          }
        }
      }

      // Acceleration & velocity
      for (let axis = 0; axis < 3; axis++) {
        p.velocity[axis] += (p.acceleration[axis] || 0) * dt;
      }

      p.prevPosition = [...p.position];
      for (let axis = 0; axis < 3; axis++) {
        p.position[axis] += p.velocity[axis] * dt;
      }

      // Bounce
      if ((p.flags & PARTICLE_FLAGS.bounce) && p.position[2] < 0) {
        p.position[2] = 0;
        p.velocity[2] = Math.abs(p.velocity[2]);
      }

      // Follow velocity rotation angle
      if (p.flags & PARTICLE_FLAGS.followVel) {
        p.rotation = Math.atan2(p.velocity[1], p.velocity[0]);
      }

      // Color, scale, and alpha interpolation
      const t = Math.max(0, Math.min(1, age / p.life));
      if (p.flags & PARTICLE_FLAGS.interpColor) {
        p.color = p.startColor.map((v, i) => v + (p.endColor[i] - v) * t);
      } else {
        p.color = [...p.startColor];
      }

      if (p.flags & PARTICLE_FLAGS.interpScale) {
        p.scale = p.startScale.map((v, i) => v + (p.endScale[i] - v) * t);
      } else {
        p.scale = [...p.startScale];
      }
    }

    return [...this.particles.values()];
  }

  private spawn(sourceId: string, emitter: Emitter, now: number, source: number[]) {
    if (this.particles.size >= this.limit) {
      this.particles.delete(this.particles.keys().next().value!);
    }
    const c = emitter.config;
    const azimuth = this.random() * Math.PI * 2;
    const pattern = c.pattern;

    let direction = [0, 0, 0];
    if (pattern === 0) {
      // DROP
      direction = [0, 0, 0];
    } else if (pattern === 1) {
      // EXPLODE
      const radial = Math.asin(this.random() * 2 - 1);
      direction = [Math.cos(azimuth) * Math.cos(radial), Math.sin(azimuth) * Math.cos(radial), Math.sin(radial)];
    } else if (pattern === 2) {
      // ANGLE
      const begin = c.angleBegin ?? 0;
      const end = c.angleEnd ?? Math.PI;
      const angle = begin + this.random() * (end - begin);
      direction = [Math.cos(angle), Math.sin(angle), 0];
    } else if (pattern === 4 || pattern === 8) {
      // ANGLE_CONE / ANGLE_CONE_EMPTY
      const begin = c.angleBegin ?? 0;
      const end = c.angleEnd ?? (Math.PI / 4);
      const angle = pattern === 8 ? end : begin + this.random() * (end - begin);
      direction = [Math.cos(azimuth) * Math.sin(angle), Math.sin(azimuth) * Math.sin(angle), Math.cos(angle)];
    } else {
      const radial = (this.random() - 0.5) * Math.PI;
      direction = [Math.cos(azimuth) * Math.cos(radial), Math.sin(azimuth) * Math.cos(radial), Math.sin(radial)];
    }

    const speed = c.burstSpeedMin + (c.burstSpeedMax - c.burstSpeedMin) * this.random();
    const position = source.map((v, i) => v + direction[i] * c.burstRadius);
    const id = `${sourceId}:${emitter.serial++}`;
    const emissive = Boolean(c.dataFlags & PARTICLE_FLAGS.emissive);
    const blendMode = c.blendMode || (emissive ? 'ADD' : 'BLEND');

    this.particles.set(id, {
      id,
      sourceId,
      born: now,
      life: Math.max(0.05, c.partMaxAge),
      position,
      prevPosition: [...position],
      origin: [...source],
      lastSourcePos: [...source],
      velocity: direction.map((v) => v * speed),
      scale: [...c.startScale],
      color: [...c.startColor],
      textureId: c.textureId,
      emissive,
      blendMode,
      flags: c.dataFlags,
      startColor: c.startColor,
      endColor: c.endColor,
      startScale: c.startScale,
      endScale: c.endScale,
      targetId: c.targetId,
      acceleration: c.acceleration || [0, 0, 0],
      beam: Boolean(c.dataFlags & PARTICLE_FLAGS.beam),
      ribbon: Boolean(c.dataFlags & PARTICLE_FLAGS.ribbon),
    });
  }
}
