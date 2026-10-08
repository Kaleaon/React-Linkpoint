import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  MAX_PARTICLES, PARTICLE_FLAGS, PARTICLE_PATTERN, PARTICLE_SYSTEM_FLAGS, ParticleEngine, blendModeFor, type ParticleConfig,
} from '../particles';

const require = createRequire(import.meta.url);
const { ParticleSystem } = require('@caspertech/node-metaverse/dist/lib/classes/ParticleSystem');

const base = (over: Partial<ParticleConfig> = {}): ParticleConfig => ({
  pattern: PARTICLE_PATTERN.DROP, maxAge: 0, burstRate: 10, burstRadius: 0, burstSpeedMin: 0, burstSpeedMax: 0, burstPartCount: 1,
  acceleration: [0, 0, 0], dataFlags: 0, partMaxAge: 4, startColor: [1, 0, 0, 1], endColor: [0, 0, 1, 0],
  startScale: [1, 1], endScale: [3, 3], ...over,
});
const at = (p: number[]) => new Map([['s', p]]);
const near = (a: number[], b: number[], digits = 5) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
/** A random source that returns the given values in turn, then repeats the last. */
const seq = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

describe('flag and pattern values (llpartdata.h)', () => {
  it('uses the protocol bit values', () => {
    expect(PARTICLE_PATTERN).toEqual({ DROP: 1, EXPLODE: 2, ANGLE: 4, ANGLE_CONE: 8, ANGLE_CONE_EMPTY: 16 });
    expect(PARTICLE_FLAGS).toMatchObject({ interpColor: 0x1, interpScale: 0x2, bounce: 0x4, wind: 0x8, followSource: 0x10, followVel: 0x20, target: 0x40, targetLinear: 0x80, emissive: 0x100, beam: 0x200, ribbon: 0x400, dataGlow: 0x10000, dataBlend: 0x20000 });
    expect(PARTICLE_SYSTEM_FLAGS).toEqual({ OBJECT_RELATIVE: 1, USE_NEW_ANGLE: 2 });
    expect(MAX_PARTICLES).toBe(4096);
  });
});

describe('emission patterns (LLViewerPartSourceScript::update)', () => {
  it('DROP leaves particles at the source at rest; an unknown pattern does the same', () => {
    for (const pattern of [PARTICLE_PATTERN.DROP, PARTICLE_PATTERN.ANGLE_CONE_EMPTY, 0]) {
      const e = new ParticleEngine(() => 0.5);
      e.setEmitter('s', base({ pattern, burstSpeedMin: 5, burstSpeedMax: 5, burstRadius: 2 }));
      const [p] = e.update(0, at([1, 2, 3]));
      expect(p.position).toEqual([1, 2, 3]);
      expect(p.velocity).toEqual([0, 0, 0]);
    }
  });

  it('EXPLODE sends particles out from a sphere at the burst radius with a random speed', () => {
    const e = new ParticleEngine(seq(0.75, 0.75, 0.75, 0.5));
    e.setEmitter('s', base({ pattern: PARTICLE_PATTERN.EXPLODE, burstRadius: 2, burstSpeedMin: 2, burstSpeedMax: 6 }));
    const [p] = e.update(0, at([10, 10, 10]));
    const d = 1 / Math.sqrt(3);
    near(p.position, [10 + 2 * d, 10 + 2 * d, 10 + 2 * d]);
    near(p.velocity!, [d * 4, d * 4, d * 4]); // speed = 2 + 0.5 * (6 - 2)
  });

  it('ANGLE picks a direction in the cone between the inner and outer angle, either side of the x axis', () => {
    const flags = PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE;
    // random: 0.25 -> angle = inner + 0.25 * (outer - inner); 0.25 < 0.5 -> negative side; then speed 0.5
    const e = new ParticleEngine(seq(0.25, 0.25, 0.5));
    e.setEmitter('s', base({ pattern: PARTICLE_PATTERN.ANGLE, innerAngle: 0, outerAngle: Math.PI / 2, burstSpeedMin: 10, burstSpeedMax: 10, flags }));
    const [p] = e.update(0, at([0, 0, 0]));
    const a = -Math.PI / 8; // rotating +z about +x by -a gives (0, sin|a|, cos|a|)
    near(p.velocity!, [0, -Math.sin(a) * 10, Math.cos(a) * 10]);
  });

  it('ANGLE applies the deprecated extra rotation by the outer angle unless USE_NEW_ANGLE is set', () => {
    const cfg = { pattern: PARTICLE_PATTERN.ANGLE, innerAngle: 0, outerAngle: Math.PI / 2, burstSpeedMin: 1, burstSpeedMax: 1 };
    const old = new ParticleEngine(seq(0.25, 0.25, 0.5));
    old.setEmitter('s', base({ ...cfg, flags: 0 }));
    const [a] = old.update(0, at([0, 0, 0]));
    const theta = -Math.PI / 8 + Math.PI / 2;
    near(a.velocity!, [0, -Math.sin(theta), Math.cos(theta)]);
  });

  it('ANGLE_CONE also spins the direction about z, and the source rotation orients the result', () => {
    const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2]; // +90 degrees about z
    const e = new ParticleEngine(seq(1, 0.9, 0, 0.5));
    // angle = outer (random 1), positive side (0.9), no cone spin (0)
    e.setEmitter('s', base({ pattern: PARTICLE_PATTERN.ANGLE_CONE, innerAngle: 0, outerAngle: Math.PI / 2, burstSpeedMin: 1, burstSpeedMax: 1, flags: PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE }));
    const [p] = e.update(0, at([0, 0, 0]), undefined, { rotations: new Map([['s', quarterTurn]]) });
    // (0,0,1) rotated PI/2 about x -> (0,-1,0); then +90 about z -> (1,0,0)
    near(p.velocity!, [1, 0, 0]);
  });

  it('accumulates the source rotation from its angular velocity', () => {
    const e = new ParticleEngine(seq(0.5, 0.9, 0, 0.5));
    e.setEmitter('s', base({ pattern: PARTICLE_PATTERN.ANGLE, innerAngle: 0, outerAngle: 0, angularVelocity: [0, 0, Math.PI], burstSpeedMin: 1, burstSpeedMax: 1, burstRate: 0.5, flags: PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE }));
    e.update(0, at([0, 0, 0]));
    const frames = e.update(0.51, at([0, 0, 0]));
    const newest = frames[frames.length - 1];
    // dt = 0.51 s at PI rad/s about z: the straight-up direction (0,0,1) is unchanged by a z spin
    near(newest.velocity!, [0, 0, 1]);
  });
});

describe('burst timing', () => {
  it('bursts once at start, then again each time a burst rate has passed', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ burstRate: 1, burstPartCount: 2, partMaxAge: 100 }));
    expect(e.update(0, at([0, 0, 0]))).toHaveLength(2);
    expect(e.update(0.5, at([0, 0, 0]))).toHaveLength(2);
    expect(e.update(1.01, at([0, 0, 0]))).toHaveLength(4);
    expect(e.update(3.5, at([0, 0, 0]))).toHaveLength(8); // 2.49 s since the last burst -> two more bursts
  });

  it('enforces a minimum burst rate of 0.01 s', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ burstRate: 0, partMaxAge: 100 }));
    e.update(0, at([0, 0, 0]));
    expect(e.update(0.05, at([0, 0, 0])).length).toBeLessThanOrEqual(1 + 5);
  });

  it('stops the source at its max age but lets live particles finish', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ maxAge: 2, burstRate: 1, partMaxAge: 10 }));
    e.update(0, at([0, 0, 0]));
    e.update(1.2, at([0, 0, 0]));
    const before = e.update(1.9, at([0, 0, 0])).length;
    const after = e.update(2.5, at([0, 0, 0])).length;
    expect(after).toBe(before); // no new bursts once the source has aged out
    expect(e.update(9, at([0, 0, 0])).length).toBe(before);
    expect(e.update(13, at([0, 0, 0]))).toEqual([]);
  });

  it('restarts when the particle block CRC changes, not when it is merely re-sent', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ crc: 1, burstRate: 5, partMaxAge: 100 }));
    e.update(0, at([0, 0, 0]));
    e.update(1, at([0, 0, 0]));
    e.setEmitter('s', base({ crc: 1, burstRate: 5, partMaxAge: 100 }));
    expect(e.update(1.1, at([0, 0, 0]))).toHaveLength(1); // same system: no extra first-run burst
    e.setEmitter('s', base({ crc: 2, burstRate: 5, partMaxAge: 100 }));
    expect(e.update(1.2, at([0, 0, 0]))).toHaveLength(2); // new system: fresh first-run burst
  });

  it('stops emitting at the particle limit', () => {
    const e = new ParticleEngine(() => 0.5, 3);
    e.setEmitter('s', base({ burstRate: 0.01, burstPartCount: 5, partMaxAge: 100 }));
    e.update(0, at([0, 0, 0]));
    expect(e.update(1, at([0, 0, 0])).length).toBeLessThanOrEqual(3 + 5);
  });
});

describe('particle motion (LLViewerPartGroup::updateParticles)', () => {
  const run = (config: ParticleConfig, dt: number, extra: Parameters<ParticleEngine['update']>[3] = {}, wind?: number[], pos = [0, 0, 0], others?: Map<string, number[]>) => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', config);
    const positions = new Map([['s', pos], ...(others ?? [])]);
    e.update(0, positions);
    return e.update(dt, positions, wind, extra)[0];
  };

  it('integrates position with 0.5 a dt^2 and velocity with a dt', () => {
    const p = run(base({ acceleration: [0, 0, 2] }), 1, {}, undefined, [1, 2, 3]);
    near(p.position, [1, 2, 4]);
    near(p.velocity!, [0, 0, 2]);
  });

  it('bounces off the height of the source, losing 25% of the vertical speed', () => {
    const p = run(base({ dataFlags: PARTICLE_FLAGS.bounce, acceleration: [0, 0, -10] }), 1, {}, undefined, [0, 0, 10]);
    near(p.position, [0, 0, 15]); // fell to 5, mirrored about z = 10
    near(p.velocity!, [0, 0, 7.5]); // -10 * -0.75
  });

  it('blends the velocity toward the region wind and damps it by 10% per second', () => {
    const p = run(base({ dataFlags: PARTICLE_FLAGS.wind }), 1, { windAt: () => [10, 0, 0] });
    near(p.velocity!, [1, 0, 0]); // 0 * 0.9 + 0.1 * 10
    near(p.position, [1, 0, 0]);
  });

  it('feels no wind when there is no wind data', () => {
    const p = run(base({ dataFlags: PARTICLE_FLAGS.wind }), 1);
    near(p.position, [0, 0, 0]);
  });

  it('steers toward the target over the particle life', () => {
    const target = 'bbbbbbbb-0000-0000-0000-000000000001';
    const p = run(base({ dataFlags: PARTICLE_FLAGS.target, targetId: target, partMaxAge: 2 }), 0.5, {}, undefined, [0, 0, 0], new Map([[target, [10, 0, 0]]]));
    near(p.velocity!, [2.5, 0, 0]); // step = clamp(0.5 / 2, 0, 0.1) * 5 = 0.5; delta = 10 / 2 = 5
    near(p.position, [1.25, 0, 0]);
  });

  it('TARGET_LINEAR moves along the source-to-target line by the fraction of life', () => {
    const target = 'bbbbbbbb-0000-0000-0000-000000000001';
    const p = run(base({ dataFlags: PARTICLE_FLAGS.targetLinear, targetId: target, partMaxAge: 2 }), 0.5, {}, undefined, [0, 0, 0], new Map([[target, [10, 0, 0]]]));
    near(p.position, [2.5, 0, 0]); // frac = 0.5 / 2
  });

  it('follows a moving source by keeping its offset', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ dataFlags: PARTICLE_FLAGS.followSource, acceleration: [1, 0, 0], partMaxAge: 100 }));
    e.update(0, at([0, 0, 0]));
    e.update(1, at([0, 0, 0]));
    const [p] = e.update(2, at([100, 0, 0]));
    expect(p.position[0]).toBeGreaterThan(99);
  });

  it('interpolates colour, scale and glow by the fraction of life, and only when flagged', () => {
    const flagged = run(base({ dataFlags: PARTICLE_FLAGS.interpColor | PARTICLE_FLAGS.interpScale | PARTICLE_FLAGS.dataGlow, startGlow: 0, endGlow: 1 }), 1);
    near(flagged.color, [0.75, 0, 0.25, 0.75]);
    near(flagged.scale, [1.5, 1.5]);
    expect(flagged.glow).toBeCloseTo(0.25);
    const plain = run(base({ startGlow: 0.5, endGlow: 1 }), 1);
    expect(plain.color).toEqual([1, 0, 0, 1]);
    expect(plain.glow).toBe(0); // glow is ignored without the glow flag
  });

  it('kills a particle once its age passes its max age', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ partMaxAge: 2 }));
    e.update(0, at([0, 0, 0]));
    expect(e.update(2, at([0, 0, 0]))).toHaveLength(1);
    expect(e.update(2.01, at([0, 0, 0]))).toEqual([]);
  });

  it('links ribbon particles to the previous one and marks beams with their target', () => {
    const e = new ParticleEngine(() => 0.5);
    e.setEmitter('s', base({ dataFlags: PARTICLE_FLAGS.ribbon | PARTICLE_FLAGS.beam, burstRate: 1, partMaxAge: 100 }));
    e.update(0, at([0, 0, 0]));
    const frames = e.update(1.1, at([0, 0, 0]));
    expect(frames.every((f) => f.ribbon && f.beam)).toBe(true);
    expect(frames[1].targetPosition).toEqual([0, 0, 0]);
  });

  it('maps blend factors to a drawable blend mode only when the blend flag is set', () => {
    expect(blendModeFor(7, 9)).toBe('BLEND');
    expect(blendModeFor(7, 0)).toBe('ADD');
    const withBlend = run(base({ dataFlags: PARTICLE_FLAGS.dataBlend, blendSource: 7, blendDest: 0 }), 0.1);
    expect(withBlend.blendMode).toBe('ADD');
    expect(run(base({ blendSource: 7, blendDest: 0 }), 0.1).blendMode).toBe('BLEND');
  });
});

describe('binary particle block (llpartdata.cpp)', () => {
  // Port of LLDataPacker::packFixed from indra/llmessage/lldatapacker.cpp.
  function packFixed(buf: Buffer, pos: number, value: number, signed: boolean, intBits: number, fracBits: number): number {
    let total = intBits + fracBits + (signed ? 1 : 0);
    const min = signed ? -(1 << intBits) : 0;
    const max = 1 << intBits;
    let fixed = Math.min(Math.max(value, min), max);
    if (signed) fixed += max;
    fixed *= 1 << fracBits;
    if (total <= 8) { buf.writeUInt8(Math.floor(fixed), pos); return 1; }
    if (total <= 16) { buf.writeUInt16LE(Math.floor(fixed), pos); return 2; }
    buf.writeUInt32LE(Math.floor(fixed), pos); return 4;
  }

  function block(opts: { glow?: [number, number]; blend?: [number, number] }): Buffer {
    const dataFlags = PARTICLE_FLAGS.interpColor | PARTICLE_FLAGS.wind | (opts.glow ? PARTICLE_FLAGS.dataGlow : 0) | (opts.blend ? PARTICLE_FLAGS.dataBlend : 0);
    const sys = Buffer.alloc(68);
    let p = 0;
    sys.writeUInt32LE(0xdeadbeef, p); p += 4;                      // pscrc
    sys.writeUInt32LE(PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE, p); p += 4; // psflags
    sys.writeUInt8(PARTICLE_PATTERN.ANGLE_CONE, p); p += 1;         // pspattern
    p += packFixed(sys, p, 12.5, false, 8, 8);                      // maxage
    p += packFixed(sys, p, 1.25, false, 8, 8);                      // startage
    p += packFixed(sys, p, 0.5, false, 3, 5);                       // innerangle
    p += packFixed(sys, p, 1.5, false, 3, 5);                       // outerangle
    p += packFixed(sys, p, 0.25, false, 8, 8);                      // burstrate
    p += packFixed(sys, p, 2.5, false, 8, 8);                       // burstradius
    p += packFixed(sys, p, 1, false, 8, 8);                         // burstspeedmin
    p += packFixed(sys, p, 4, false, 8, 8);                         // burstspeedmax
    sys.writeUInt8(7, p); p += 1;                                   // burstpartcount
    for (const v of [0.5, -1.5, 2]) p += packFixed(sys, p, v, true, 8, 7); // angular velocity
    for (const v of [0, 0, -9.5]) p += packFixed(sys, p, v, true, 8, 7);   // accel
    Buffer.from('11111111222233334444555555555555', 'hex').copy(sys, p); p += 16; // texture
    Buffer.from('aaaaaaaabbbbccccddddeeeeeeeeeeee', 'hex').copy(sys, p); p += 16; // target
    expect(p).toBe(68);

    const part = Buffer.alloc(18);
    p = 0;
    part.writeUInt32LE(dataFlags, p); p += 4;
    p += packFixed(part, p, 3.5, false, 8, 8);                      // part maxage
    Buffer.from([255, 128, 0, 255]).copy(part, p); p += 4;          // start colour RGBA
    Buffer.from([0, 0, 255, 0]).copy(part, p); p += 4;              // end colour
    for (const v of [1, 2, 3, 4]) p += packFixed(part, p, v, false, 3, 5); // scales
    const extras: number[] = [];
    if (opts.glow) extras.push(Math.round(opts.glow[0] * 255), Math.round(opts.glow[1] * 255));
    if (opts.blend) extras.push(opts.blend[0], opts.blend[1]);
    const partSize = Buffer.alloc(4); partSize.writeInt32LE(18 + extras.length);
    const sysSize = Buffer.alloc(4); sysSize.writeInt32LE(68);
    return Buffer.concat([sysSize, sys, partSize, part, Buffer.from(extras)]);
  }

  it('decodes a block packed with the official algorithm, field for field', () => {
    const ps = ParticleSystem.from(block({ glow: [0.2, 1], blend: [7, 0] }));
    expect(ps.crc).toBe(0xdeadbeef);
    expect(ps.flags).toBe(PARTICLE_SYSTEM_FLAGS.USE_NEW_ANGLE);
    expect(ps.pattern).toBe(PARTICLE_PATTERN.ANGLE_CONE);
    expect(ps.maxAge).toBeCloseTo(12.5); expect(ps.startAge).toBeCloseTo(1.25);
    expect(ps.innerAngle).toBeCloseTo(0.5); expect(ps.outerAngle).toBeCloseTo(1.5);
    expect(ps.burstRate).toBeCloseTo(0.25); expect(ps.burstRadius).toBeCloseTo(2.5);
    expect(ps.burstSpeedMin).toBeCloseTo(1); expect(ps.burstSpeedMax).toBeCloseTo(4);
    expect(ps.burstPartCount).toBe(7);
    expect([ps.angularVelocity.x, ps.angularVelocity.y, ps.angularVelocity.z].map((v: number) => +v.toFixed(3))).toEqual([0.5, -1.5, 2]);
    expect(ps.acceleration.z).toBeCloseTo(-9.5);
    expect(String(ps.texture)).toBe('11111111-2222-3333-4444-555555555555');
    expect(String(ps.target)).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(ps.dataFlags & PARTICLE_FLAGS.interpColor).toBeTruthy();
    expect(ps.partMaxAge).toBeCloseTo(3.5);
    expect(ps.startScaleX).toBeCloseTo(1); expect(ps.startScaleY).toBeCloseTo(2);
    expect(ps.endScaleX).toBeCloseTo(3); expect(ps.endScaleY).toBeCloseTo(4);
    expect(ps.startGlow).toBeCloseTo(0.2); expect(ps.endGlow).toBeCloseTo(1);
    expect([ps.blendFuncSource, ps.blendFuncDest]).toEqual([7, 0]);
  });

  it('applies the official defaults when the glow and blend extensions are absent', () => {
    const ps = ParticleSystem.from(block({}));
    expect(ps.startGlow).toBe(0);
    expect([ps.blendFuncSource, ps.blendFuncDest]).toEqual([7, 9]);
  });
});
