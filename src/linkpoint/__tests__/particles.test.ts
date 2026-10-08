import { describe, expect, it } from 'vitest';
import { ParticleEngine, PARTICLE_FLAGS, type ParticleConfig } from '../particles';

const config = (updates: Partial<ParticleConfig> = {}): ParticleConfig => ({
  pattern: 1,
  maxAge: 0,
  burstRate: 1,
  burstRadius: 0,
  burstSpeedMin: 0,
  burstSpeedMax: 0,
  burstPartCount: 1,
  acceleration: [0, 0, 1],
  targetId: null,
  textureId: 'particle-texture',
  dataFlags: PARTICLE_FLAGS.interpColor | PARTICLE_FLAGS.interpScale | PARTICLE_FLAGS.emissive,
  partMaxAge: 2,
  startColor: [1, 0, 0, 1],
  endColor: [0, 0, 1, 0],
  startScale: [1, 2],
  endScale: [3, 4],
  ...updates,
});

describe('Second Life particle simulation', () => {
  it('bursts, accelerates, interpolates appearance, and expires particles', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter('source', config({ burstRate: 10 }), 0);
    expect(engine.update(0, new Map([['source', [10, 20, 30]]]))).toHaveLength(1);
    const halfway = engine.update(1, new Map([['source', [10, 20, 30]]]))[0];
    expect(halfway.color).toEqual([0.5, 0, 0.5, 0.5]);
    expect(halfway.scale).toEqual([2, 3]);
    expect(halfway.textureId).toBe('particle-texture');
    expect(halfway.emissive).toBe(true);
    expect(engine.update(2.01, new Map([['source', [10, 20, 30]]]))).toEqual([]);
  });

  it('removes every live particle when its source is removed', () => {
    const engine = new ParticleEngine();
    engine.setEmitter('source', config(), 0);
    engine.update(0, new Map([['source', [0, 0, 0]]]));
    engine.removeEmitter('source');
    expect(engine.update(0.1, new Map())).toEqual([]);
  });

  it('applies wind vector when PARTICLE_FLAGS.wind is set', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter(
      'source',
      config({ dataFlags: PARTICLE_FLAGS.wind, acceleration: [0, 0, 0] }),
      0
    );
    engine.update(0, new Map([['source', [0, 0, 0]]]));
    const windVector = [10, 0, 0];
    const frame = engine.update(1.0, new Map([['source', [0, 0, 0]]]), windVector)[0];
    expect(frame.position[0]).toBeGreaterThan(0);
  });

  it('shifts particle position when source moves and followSource is enabled', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter(
      'source',
      config({ dataFlags: PARTICLE_FLAGS.followSource, acceleration: [0, 0, 0] }),
      0
    );
    engine.update(0, new Map([['source', [0, 0, 0]]]));

    // Emitter moves to [10, 20, 0]
    const updatedFrame = engine.update(1.0, new Map([['source', [10, 20, 0]]]))[0];
    expect(updatedFrame.position[0]).toBeCloseTo(10);
    expect(updatedFrame.position[1]).toBeCloseTo(20);
  });

  it('attracts particles towards target when PARTICLE_FLAGS.target or targetLinear is set', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter(
      'source',
      config({
        dataFlags: PARTICLE_FLAGS.target,
        targetId: 'target-object',
        acceleration: [0, 0, 0],
      }),
      0
    );
    engine.update(0, new Map([['source', [0, 0, 0]], ['target-object', [100, 0, 0]]]));

    const frame = engine.update(1.0, new Map([['source', [0, 0, 0]], ['target-object', [100, 0, 0]]]))[0];
    // Particle position should move towards target (+x)
    expect(frame.position[0]).toBeGreaterThan(0);
  });

  it('calculates rotation when followVel is enabled', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter(
      'source',
      config({
        dataFlags: PARTICLE_FLAGS.followVel,
        burstSpeedMin: 5,
        burstSpeedMax: 5,
      }),
      0
    );
    engine.update(0, new Map([['source', [0, 0, 0]]]));
    const frame = engine.update(0.1, new Map([['source', [0, 0, 0]]]))[0];
    expect(frame.rotation).toBeDefined();
    expect(typeof frame.rotation).toBe('number');
  });

  it('supports beam and ribbon styles and additive blend mode', () => {
    const engine = new ParticleEngine(() => 0.5);
    engine.setEmitter(
      'source',
      config({
        dataFlags: PARTICLE_FLAGS.beam | PARTICLE_FLAGS.ribbon | PARTICLE_FLAGS.emissive,
        blendMode: 'ADD',
      }),
      0
    );
    const frame = engine.update(0, new Map([['source', [0, 0, 0]]]))[0];
    expect(frame.beam).toBe(true);
    expect(frame.ribbon).toBe(true);
    expect(frame.blendMode).toBe('ADD');
  });
});
