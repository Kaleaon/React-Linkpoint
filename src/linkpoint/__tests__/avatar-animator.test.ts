import { describe, expect, it } from 'vitest';
import { AvatarAnimator, bundledAnimationLoader } from '../avatar-animator';
import type { KeyframeAnimation } from '../avatar-animation';

const makeAnim = (over: Partial<KeyframeAnimation> = {}): KeyframeAnimation => ({
  priority: 1,
  length: 2,
  expression: '',
  inPoint: 0,
  outPoint: 2,
  loop: true,
  easeIn: 0,
  easeOut: 0.5,
  handPose: 0,
  joints: [
    {
      name: 'mHead',
      priority: 1,
      rotations: [{ time: 0, value: [0.5, 0, 0, Math.sqrt(0.75)] }],
      positions: [],
    },
  ],
  ...over,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AvatarAnimator retries', () => {
  it('asks again for an animation whose download failed while the simulator still wants it, a bounded number of times', async () => {
    let t = 0;
    const scheduled: Array<() => void> = [];
    let attempts = 0;
    const loader = async () => {
      attempts++;
      return attempts < 3 ? null : makeAnim();
    };
    const animator = new AvatarAnimator(
      loader,
      () => t,
      (run) => {
        scheduled.push(run);
      },
    );
    animator.setAnimations('avatar', [{ id: 'a1', seq: 1 }]);
    await flush();
    expect(attempts).toBe(1);
    expect(animator.pose('avatar').size).toBe(0);
    t = 31;
    scheduled.shift()!();
    await flush(); // second try fails too
    t = 62;
    scheduled.shift()!();
    await flush(); // third succeeds
    expect(attempts).toBe(3);
    t = 63;
    expect(animator.pose('avatar').get('mHead')).toBeTruthy();
  });

  it('does not retry an animation the simulator no longer wants, and gives up after the limit', async () => {
    let t = 0;
    const scheduled: Array<() => void> = [];
    let attempts = 0;
    const animator = new AvatarAnimator(
      async () => {
        attempts++;
        return null;
      },
      () => t,
      (run) => {
        scheduled.push(run);
      },
    );
    animator.setAnimations('avatar', [{ id: 'gone', seq: 1 }]);
    await flush();
    animator.setAnimations('avatar', []);
    t = 31;
    scheduled.shift()!();
    await flush();
    expect(attempts).toBe(1);

    animator.setAnimations('avatar', [{ id: 'bad', seq: 1 }]);
    for (let i = 0; i < 6; i++) {
      await flush();
      t += 31;
      scheduled.shift()?.();
    }
    await flush();
    expect(attempts).toBeLessThanOrEqual(1 + 1 + AvatarAnimator.MAX_RETRIES);
  });
});

describe('bundled animation fallback', () => {
  it('falls back to the second source when the first answers with something that is not an animation', async () => {
    const calls: string[] = [];
    const real = makeAnim();
    const parse = await import('../avatar-animation');
    const spy = (await import('vitest')).vi.spyOn(parse, 'parseAnimation');
    const fetcher = (async (url: string) => {
      calls.push(url);
      return url.startsWith('/anims/')
        ? { ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>').buffer }
        : { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
    }) as unknown as typeof fetch;
    spy.mockImplementation((bytes: any) => {
      if (bytes.length === 1) return real;
      throw new Error('not an animation');
    });
    const loader = bundledAnimationLoader(
      undefined,
      fetcher,
      'https://raw.githubusercontent.com/Kaleaon/React-Linkpoint/main/public/',
    );
    const anim = await loader('11111111-2222-3333-4444-555555555555');
    spy.mockRestore();
    expect(anim).toBe(real);
    expect(calls[0].startsWith('/anims/')).toBe(true);
    expect(calls[1]).toContain('raw.githubusercontent.com');
  });
});

describe('AvatarAnimator', () => {
  it('starts animations, blends them, and eases out when the simulator stops them', async () => {
    let t = 0;
    const animator = new AvatarAnimator(
      async () => makeAnim(),
      () => t,
    );
    animator.setAnimations('avatar', [{ id: 'a1', seq: 1 }]);
    expect(animator.pose('avatar').size).toBe(0); // still loading
    await flush();
    t = 1;
    expect(animator.pose('avatar').get('mHead')!.rotation[0]).toBeCloseTo(0.5, 3);
    animator.setAnimations('avatar', []);
    t = 1.25; // halfway through the 0.5 s ease-out: still present
    expect(animator.pose('avatar').has('mHead')).toBe(true);
    t = 2;
    expect(animator.pose('avatar').size).toBe(0);
    expect(animator.isAnimating('avatar')).toBe(false);
  });

  it('restarts an animation when its sequence id changes but not when it is unchanged', async () => {
    let t = 0,
      loads = 0;
    const animator = new AvatarAnimator(
      async () => {
        loads++;
        return makeAnim({ loop: false, easeIn: 1 });
      },
      () => t,
    );
    animator.setAnimations('a', [{ id: 'x', seq: 1 }]);
    await flush();
    t = 5;
    animator.setAnimations('a', [{ id: 'x', seq: 1 }]);
    await flush();
    expect(animator.isAnimating('a')).toBe(false); // unchanged: not restarted, one-shot finished
    animator.setAnimations('a', [{ id: 'x', seq: 2 }]);
    await flush();
    expect(animator.isAnimating('a')).toBe(true);
    expect(loads).toBe(1); // parsed once, cached
  });

  it('keeps independent subjects separate and ignores missing or null animations', async () => {
    const animator = new AvatarAnimator(
      async (id) => (id === 'good' ? makeAnim() : null),
      () => 1,
    );
    animator.setAnimations('one', [{ id: 'good', seq: 1 }]);
    animator.setAnimations('two', [
      { id: 'unknown', seq: 1 },
      { id: '00000000-0000-0000-0000-000000000000', seq: 1 },
    ]);
    await flush();
    expect(animator.pose('one').size).toBe(1);
    expect(animator.pose('two').size).toBe(0);
    animator.remove('one');
    expect(animator.pose('one').size).toBe(0);
  });

  it('loads bundled animations by UUID and rejects non-UUID ids', async () => {
    const calls: string[] = [];
    const loader = bundledAnimationLoader('/anims/', (async (url: string) => {
      calls.push(url);
      return { ok: false } as Response;
    }) as unknown as typeof fetch);
    expect(await loader('../etc/passwd')).toBeNull();
    expect(await loader('038fcec9-5ebd-8a8e-0e2e-6e71a0a1ac53')).toBeNull();
    expect(calls).toEqual(['/anims/038fcec9-5ebd-8a8e-0e2e-6e71a0a1ac53']);
  });

  it('retries a failed download after the retry window but not before', async () => {
    let t = 0,
      calls = 0;
    const animator = new AvatarAnimator(
      async () => {
        calls++;
        return calls < 2 ? null : makeAnim();
      },
      () => t,
    );
    animator.setAnimations('a', [{ id: 'custom', seq: 1 }]);
    await flush();
    t = 10;
    animator.setAnimations('a', [{ id: 'custom', seq: 2 }]);
    await flush();
    expect(calls).toBe(1); // still inside the window
    t = 31;
    animator.setAnimations('a', [{ id: 'custom', seq: 3 }]);
    await flush();
    expect(calls).toBe(2);
    expect(animator.pose('a').size).toBe(1);
  });
});
