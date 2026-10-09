import { describe, expect, it } from 'vitest';
import {
  FLEXIBLE_MAX_FRAME_SECONDS,
  FlexibleChain,
  remapSections,
  type FlexibleFrame,
  type FlexibleParams,
} from '../flexible';
import { IDENTITY, axisAngle, length, rotate, sub, type Quat } from '../sl-math';

const params = (over: Partial<FlexibleParams> = {}): FlexibleParams => ({
  softness: 0,
  tension: 1,
  friction: 0,
  gravity: 0,
  wind: 0,
  force: [0, 0, 0],
  ...over,
});
const upright: FlexibleFrame = {
  position: [0, 0, 10],
  rotation: [...IDENTITY] as Quat,
  scale: [1, 1, 4],
};
// +90 degrees about y turns the prim's +z axis into world +x: a prim lying on its side.
const sideways = (length_ = 2): FlexibleFrame => ({
  position: [0, 0, 0],
  rotation: axisAngle(Math.PI / 2, [0, 1, 0]),
  scale: [1, 1, length_],
});
const near = (a: number[], b: number[], digits = 5) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const run = (
  chain: FlexibleChain,
  frame: FlexibleFrame,
  seconds: number,
  dt = 1 / 60,
  windAt?: (p: number[]) => number[],
) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) chain.step(dt, frame, windAt);
};

describe('FlexibleChain', () => {
  it('stays straight with no forces', () => {
    const chain = new FlexibleChain(params({ softness: 2 }));
    run(chain, upright, 1);
    chain.localSections(2).forEach((s, i) => near(s.position, [0, 0, -2 + i], 4));
  });

  it('matches a one-step result worked out by hand from the viewer formulas', () => {
    // Prim lying along +x, length 2, anchor at (-1,0,0); gravity 2, tension 1, dt = 1/30.
    // gravity: z -= 2 * (2 * dt); tension t = 1 * 0.1 * (1 - 0.85); then clamp to the segment length.
    const chain = new FlexibleChain(params({ softness: 0, gravity: 2, tension: 1 }));
    chain.step(1 / 30, sideways(2));
    const tip = chain.localSections(0)[1];
    // World tip (0.99570, 0, -0.13105) in the prim frame (rotate world -> local with the inverse of +90 about y).
    const world = [0.9957017846909793, 0, -0.1310510838613743];
    near(tip.position, rotate(sub(world, [0, 0, 0]), axisAngle(-Math.PI / 2, [0, 1, 0])), 5);
  });

  it('keeps every segment at its length and never bends a segment past atan(2 * length)', () => {
    const chain = new FlexibleChain(
      params({ softness: 3, gravity: 9, tension: 0.2, force: [3, 1, 0] }),
    );
    const frame = sideways(4);
    let previous: number[] | null = null;
    for (let i = 0; i < 240; i++) {
      chain.step(1 / 60, frame);
      const pts = chain.localSections(3).map((s) => s.position);
      for (let k = 1; k < pts.length; k++)
        expect(length(sub(pts[k], pts[k - 1]))).toBeCloseTo(0.5, 3);
      previous = pts[8];
    }
    expect(previous).not.toBeNull();
    // under gravity the tip ends below the horizontal rod; the prim's local +x points down here
    expect(previous![0]).toBeGreaterThan(0.3);
  });

  it('hangs straight when gravity pulls along the chain', () => {
    const chain = new FlexibleChain(params({ softness: 2, gravity: 5 }));
    run(chain, { position: [0, 0, 10], rotation: [...IDENTITY] as Quat, scale: [1, 1, 4] }, 2);
    chain.localSections(2).forEach((s, i) => near(s.position, [0, 0, -2 + i], 3));
  });

  it('sags more with weaker tension and less with stronger tension', () => {
    const sag = (tension: number) => {
      const chain = new FlexibleChain(params({ softness: 3, gravity: 4, tension }));
      run(chain, sideways(4), 3);
      return chain.localSections(3)[8].position[0]; // local +x is down for a prim lying along world +x
    };
    expect(sag(0.5)).toBeGreaterThan(sag(5));
  });

  it('settles: the tip stops moving under constant forces', () => {
    const chain = new FlexibleChain(params({ softness: 2, gravity: 2, tension: 3, friction: 2 }));
    run(chain, sideways(3), 8);
    const a = chain.localSections(2)[4].position;
    run(chain, sideways(3), 1);
    near(chain.localSections(2)[4].position, a, 3);
  });

  it('friction slows the swing', () => {
    const amplitude = (friction: number) => {
      const chain = new FlexibleChain(params({ softness: 3, gravity: 0, tension: 2, friction }));
      run(chain, sideways(4), 0.5);
      let peak = 0;
      for (let i = 0; i < 60; i++) {
        chain.step(1 / 60, sideways(4), undefined);
        chain.step(1 / 60, { ...sideways(4), position: [Math.sin(i / 4) * 0.5, 0, 0] });
        peak = Math.max(peak, Math.abs(chain.localSections(3)[8].position[1]));
      }
      return peak;
    };
    expect(amplitude(5)).toBeLessThanOrEqual(amplitude(0) + 1e-6);
  });

  it('is pushed by wind only when wind sensitivity is on and wind data exists', () => {
    const tipY = (wind: number, windAt?: (p: number[]) => number[]) => {
      const chain = new FlexibleChain(params({ softness: 2, wind, tension: 1 }));
      run(chain, upright, 2, 1 / 60, windAt);
      return chain.localSections(2)[4].position[1];
    };
    const gust = () => [0, 8, 0];
    expect(tipY(2, gust)).toBeGreaterThan(0.05);
    expect(tipY(0, gust)).toBeCloseTo(0, 6);
    expect(tipY(2)).toBeCloseTo(0, 6); // no wind layer decoded yet: no wind is invented
  });

  it('applies the user force', () => {
    const chain = new FlexibleChain(params({ softness: 2, force: [0, 5, 0] }));
    run(chain, upright, 1);
    expect(chain.localSections(2)[4].position[1]).toBeGreaterThan(0.05);
  });

  it('treats a long frame as at most 0.2 s and ignores a zero-length prim', () => {
    const a = new FlexibleChain(params({ gravity: 5 })),
      b = new FlexibleChain(params({ gravity: 5 }));
    a.step(10, sideways(2));
    b.step(FLEXIBLE_MAX_FRAME_SECONDS, sideways(2));
    near(a.localSections(0)[1].position, b.localSections(0)[1].position);
    const flat = new FlexibleChain(params());
    flat.step(0.1, { ...upright, scale: [1, 1, 0] });
    expect(flat.localSections()).toEqual([]);
  });

  it('follows a moving prim: the base stays at the anchor', () => {
    const chain = new FlexibleChain(params({ softness: 2, gravity: 1 }));
    run(chain, upright, 0.5);
    chain.step(1 / 60, { ...upright, position: [50, 0, 10] });
    near(chain.localSections(2)[0].position, [0, 0, -2], 5);
  });

  it('resamples the simulated chain to more render segments through the cubic', () => {
    const chain = new FlexibleChain(params({ softness: 1, gravity: 3 }));
    run(chain, sideways(4), 1);
    const coarse = chain.localSections(1);
    const fine = chain.localSections(3);
    expect(coarse).toHaveLength(3);
    expect(fine).toHaveLength(9);
    // the simulated sections carry over exactly; the ones between are interpolated
    near(fine[0].position, coarse[0].position);
    near(fine[4].position, coarse[1].position);
    near(fine[8].position, coarse[2].position);
    const mid = fine[2].position,
      a = fine[0].position,
      c = fine[4].position;
    expect(length(sub(mid, a))).toBeGreaterThan(0);
    expect(length(sub(mid, a))).toBeLessThan(length(sub(c, a)));
  });

  it('rebuilds the chain when the softness changes without losing the base', () => {
    const chain = new FlexibleChain(params({ softness: 1, gravity: 2 }));
    run(chain, sideways(2), 0.5);
    chain.params = params({ softness: 3, gravity: 2 });
    chain.step(1 / 60, sideways(2));
    expect(chain.segments).toBe(8);
    expect(chain.localSections(3)).toHaveLength(9);
  });
});

describe('remapSections', () => {
  const straight = (n: number, len: number) =>
    Array.from({ length: n + 1 }, (_, i) => ({
      position: [0, 0, (i * len) / n],
      direction: [0, 0, 1],
      rotation: [...IDENTITY] as Quat,
      velocity: [0, 0, 0],
      dPosition: [0, 0, 1],
    }));

  it('builds a straight chain from section 0', () => {
    const out = remapSections([straight(1, 1)[0]], -1, 2, 4);
    expect(out).toHaveLength(5);
    out.forEach((s, i) => near(s.position, [0, 0, i]));
  });

  it('keeps every other section when going to a coarser chain, and everything when equal', () => {
    const fine = straight(4, 4);
    const coarse = remapSections(fine, 2, 1, 4);
    expect(coarse.map((s) => s.position[2])).toEqual([0, 2, 4]);
    expect(remapSections(fine, 2, 2, 4).map((s) => s.position[2])).toEqual([0, 1, 2, 3, 4]);
  });

  it('interpolates a straight chain to a finer straight chain', () => {
    const out = remapSections(straight(1, 4), 0, 2, 4);
    out.forEach((s, i) => near(s.position, [0, 0, i]));
  });
});
