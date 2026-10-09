import { describe, expect, it, vi } from 'vitest';
import { AXIS, DEFAULT_JOYSTICK_SETTINGS, JoystickAvatar, hardwareAxesFromStandardGamepad } from '../joystick';
import { GamepadInput } from '../gamepad';
import { AgentController } from '../agent-controls';

// hardware axes: [slide, push, up/down, roll, pitch, yaw]
const input = (hw: number[], over = {}) => ({ hardwareAxes: hw, button1: false, dt: 0.033, flying: false, canFly: true, ...over });

describe('JoystickAvatar (LLViewerJoystick::moveAvatar)', () => {
  it('does nothing inside the dead zone', () => {
    const j = new JoystickAvatar();
    const out = j.step(input([0.05, -0.09, 0, 0, 0, 0.08]));
    expect(out).toMatchObject({ push: 0, slide: 0, fly: 0, yaw: 0, run: false, idle: true });
  });

  it('pushing the stick forward (negative) walks forward; back (positive) walks back', () => {
    expect(new JoystickAvatar().step(input([0, -0.5, 0, 0, 0, 0])).push).toBe(-1);
    expect(new JoystickAvatar().step(input([0, 0.5, 0, 0, 0, 0])).push).toBe(1);
  });

  it('removes the dead zone before scaling: 0.35 with a 0.1 dead zone is 0.25 of movement', () => {
    const j = new JoystickAvatar({ ...DEFAULT_JOYSTICK_SETTINGS, runThreshold: 0.26 });
    // run needs |sDelta| above the threshold: (0.35 - 0.1) = 0.25 is not enough, 0.37 is (0.27)
    expect(j.step(input([0, -0.35, 0, 0, 0, 0])).run).toBe(false);
    const k = new JoystickAvatar({ ...DEFAULT_JOYSTICK_SETTINGS, runThreshold: 0.26 });
    k.step(input([0, -0.37, 0, 0, 0, 0]));
    expect(k.step(input([0, -0.37, 0, 0, 0, 0])).run).toBe(true);
  });

  it('runs only after the threshold has been exceeded for two frames, and stops as the stick eases off', () => {
    const j = new JoystickAvatar();
    const pushed = input([0, -1, 0, 0, 0, 0]);
    expect([j.step(pushed).run, j.step(pushed).run, j.step(pushed).run]).toEqual([false, true, true]);
    const released = input([0, 0, 0, 0, 0, 0]);
    expect([j.step(released).run, j.step(released).run]).toEqual([false, false]);
  });

  it('strafes and goes up or down only beyond 0.1 while walking forward', () => {
    const j = new JoystickAvatar();
    // forward dominates: slide (0.15 after dead zone 0.05) is below 0.1? slide = 0.25 - 0.1 = 0.15 > 0.1 -> moves
    expect(j.step(input([0.25, -0.9, 0, 0, 0, 0]))).toMatchObject({ push: -1, slide: 1 });
    expect(new JoystickAvatar().step(input([0.15, -0.9, 0, 0, 0, 0]))).toMatchObject({ push: -1, slide: 0 }); // 0.05 left over: under 0.1
    expect(new JoystickAvatar().step(input([0, -0.9, -0.5, 0, 0, 0]))).toMatchObject({ push: -1, fly: -1 });
    expect(new JoystickAvatar().step(input([0, -0.9, 0.5, 0, 0, 0]))).toMatchObject({ fly: 1 });
  });

  it('with nothing pushed forward the dominant axis wins and the others are applied as they are', () => {
    const out = new JoystickAvatar().step(input([0.9, 0, 0, 0, 0, 0]));
    expect(out).toMatchObject({ slide: 1, push: 0 });
  });

  it('yaw is smoothed (feathering), twice as strong on the ground, and a full stick turns while walking at 30 frames a second', () => {
    const j = new JoystickAvatar();
    const first = j.step(input([0, -0.9, 0, 0, 0, 1], { dt: 0.1 }));
    // cur = 0.9 after the dead zone; * scale 2 * dt 0.1 = 0.18; smoothed d = 0.18 * 0.1 * 16 = 0.288; less the 30% zone 0.03
    expect(first.yaw).toBeCloseTo(2 * (0.288 - 0.03), 9);
    const flying = new JoystickAvatar().step(input([0, -0.9, 0, 0, 0, 1], { dt: 0.1, flying: true })).yaw;
    expect(flying).toBeCloseTo(0.288 - 0.03, 9);
    const steady = new JoystickAvatar();
    let out = steady.step(input([0, -0.9, 0, 0, 0, 1]));
    for (let i = 0; i < 60; i++) out = steady.step(input([0, -0.9, 0, 0, 0, 1]));
    expect(out.yaw).toBeGreaterThan(0);
    // a light push stays inside the zone: nothing
    expect(new JoystickAvatar().step(input([0, -0.9, 0, 0, 0, 0.15])).yaw).toBe(0);
  });

  it('caps a long frame at 0.2 s', () => {
    const a = new JoystickAvatar().step(input([0, -0.9, 0, 0, 0, 1], { dt: 0.2 })).yaw;
    const b = new JoystickAvatar().step(input([0, -0.9, 0, 0, 0, 1], { dt: 5 })).yaw;
    expect(b).toBeCloseTo(a, 9);
  });

  it('button 1 jumps on the ground with automatic flying, and lands once when flying', () => {
    const j = new JoystickAvatar();
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true })).jump).toBe(true);
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true, flying: true })).setFlying).toBe(false);
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true, flying: true })).setFlying).toBeNull(); // held: only once
    j.step(input([0, 0, 0, 0, 0, 0]));
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true, flying: true })).setFlying).toBe(false);
  });

  it('without automatic flying, button 1 toggles flying', () => {
    const j = new JoystickAvatar({ ...DEFAULT_JOYSTICK_SETTINGS, automaticFly: false });
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true })).setFlying).toBe(true);
    expect(j.step(input([0, 0, 0, 0, 0, 0], { button1: true })).setFlying).toBeNull();
  });

  it('pushing up takes off with automatic flying when flying is allowed, and not when it is not', () => {
    expect(new JoystickAvatar().step(input([0, 0, -0.8, 0, 0, 0])).setFlying).toBe(true);
    expect(new JoystickAvatar().step(input([0, 0, -0.8, 0, 0, 0], { canFly: false })).setFlying).toBeNull();
    expect(new JoystickAvatar().step(input([0, 0, -0.8, 0, 0, 0], { flying: true })).setFlying).toBeNull();
  });

  it('uses the axis mapping: internal axis 0 reads hardware axis 1 (push), as in the settings', () => {
    expect(DEFAULT_JOYSTICK_SETTINGS.axis).toEqual([1, 0, 2, 4, 3, 5]);
    expect(AXIS).toEqual({ Z: 0, X: 1, Y: 2, RZ: 3, RX: 4, RY: 5 });
  });
});

describe('standard gamepad mapping (Linkpoint\'s)', () => {
  it('left stick slides and pushes, triggers go up and down, right stick pitches and yaws', () => {
    const buttons = Array.from({ length: 17 }, () => ({ value: 0 }));
    buttons[7] = { value: 1 }; buttons[6] = { value: 0.25 };
    expect(hardwareAxesFromStandardGamepad([0.5, -0.5, 0.25, -0.75], buttons)).toEqual([0.5, -0.5, -0.75, 0, -0.75, 0.25]);
  });
});

function fakePad(axes: number[], pressed: number[] = []) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { connected: true, mapping: 'standard', axes, buttons } as unknown as Gamepad;
}

describe('GamepadInput', () => {
  const setup = (pad: Gamepad | null, enabled = true) => {
    const calls: any[] = [];
    let flying = false;
    let time = 0;
    const input = new GamepadInput(
      { setAnalog: (a) => calls.push(a), setFlying: (f) => { flying = f; calls.push({ flying: f }); }, isFlying: () => flying },
      { enabled: () => enabled, getGamepads: () => [pad], now: () => time },
    );
    return { input, calls, tick: (ms = 33) => { time += ms; input.poll(); } };
  };

  it('moves the avatar from the left stick, and lets go when the stick returns to rest', () => {
    const { input, calls, tick } = setup(fakePad([0, -1, 0, 0]));
    tick(); tick();
    expect(calls.at(-1)).toMatchObject({ forward: 1, right: 0, up: 0, turn: 0 });
    const idle = setup(fakePad([0, 0, 0, 0]));
    idle.tick();
    expect(idle.calls.at(-1)).toMatchObject({ forward: -0, up: 0 });
    void input;
  });

  it('does nothing while disabled, and releases the analog input when turned off', () => {
    let enabled = true;
    const calls: any[] = [];
    let time = 0;
    const input = new GamepadInput(
      { setAnalog: (a) => calls.push(a), setFlying: () => {}, isFlying: () => false },
      { enabled: () => enabled, getGamepads: () => [fakePad([0, -1, 0, 0])], now: () => time },
    );
    time += 33; input.poll();
    expect(calls.at(-1)).not.toBeNull();
    enabled = false;
    time += 33; input.poll();
    expect(calls.at(-1)).toBeNull();
    const before = calls.length;
    time += 33; input.poll();
    expect(calls.length).toBe(before); // already released
  });

  it('ignores pads without the standard layout and disconnected pads', () => {
    const odd = { connected: true, mapping: '', axes: [0, -1], buttons: [] } as unknown as Gamepad;
    const { calls, tick } = setup(odd);
    tick();
    expect(calls).toEqual([]);
  });

  it('triggers take off and land through the flying hook', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    buttons[7] = { pressed: true, value: 1 };
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
    const { calls, tick } = setup(pad);
    tick();
    expect(calls).toContainEqual({ flying: true });
  });
});

describe('AgentController analog layer', () => {
  it('fills idle axes, and keys win on an axis they use', () => {
    const c = new AgentController();
    c.setAnalog({ forward: 1, turn: -1, run: true });
    const flags = c.nextFlags(0);
    expect(flags).not.toBe(0);
    c.command('push_backward', true, 10);
    c.command('push_backward', false, 400);
    c.command('push_backward', true, 1000);
    const withKey = c.nextFlags(2000);
    expect(withKey & 0x2).toBe(0x2); // AT_NEG: the key beats the stick on that axis
    c.setAnalog(null);
  });
});
