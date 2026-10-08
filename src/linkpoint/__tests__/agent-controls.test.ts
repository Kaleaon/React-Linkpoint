import { describe, expect, it } from 'vitest';
import { ControlFlags } from '@caspertech/node-metaverse';
import {
  AGENT_CONTROL, AgentController, FLY_TIME_MS, NUDGE_TIME_MS, ONE_SHOT_FLAGS,
  intentToFlags,
} from '../agent-controls';
import { DEFAULT_KEY_BINDINGS, commandFor, commandsFor, keyNameFromCode, maskFromModifiers } from '../key-bindings';

describe('agent control flags', () => {
  it('match node-metaverse for every flag it defines', () => {
    const lib = ControlFlags as unknown as Record<string, number>;
    let checked = 0;
    for (const [name, value] of Object.entries(AGENT_CONTROL)) {
      const key = `AGENT_CONTROL_${name}`;
      if (key in lib) { expect(value >>> 0, key).toBe(lib[key] >>> 0); checked++; }
    }
    expect(checked).toBeGreaterThan(25);
  });

  it('keeps flags distinct single bits', () => {
    const seen = new Set<number>();
    for (const value of Object.values(AGENT_CONTROL)) {
      expect(Math.log2(value)).toBe(Math.floor(Math.log2(value)));
      expect(seen.has(value)).toBe(false);
      seen.add(value);
    }
  });

  it('maps an intent to flags, with strafe named from the left axis', () => {
    expect(intentToFlags({ forward: 1 })).toBe(AGENT_CONTROL.AT_POS);
    expect(intentToFlags({ forward: -1 })).toBe(AGENT_CONTROL.AT_NEG);
    expect(intentToFlags({ right: 1 })).toBe(AGENT_CONTROL.LEFT_NEG);
    expect(intentToFlags({ right: -1 })).toBe(AGENT_CONTROL.LEFT_POS);
    expect(intentToFlags({ turn: 1 })).toBe(AGENT_CONTROL.TURN_RIGHT);
    expect(intentToFlags({ up: -1, fly: true })).toBe(AGENT_CONTROL.UP_NEG | AGENT_CONTROL.FLY);
  });

  it('adds FAST_* only to axes that are moving', () => {
    expect(intentToFlags({ forward: 1, run: true })).toBe(AGENT_CONTROL.AT_POS | AGENT_CONTROL.FAST_AT);
    expect(intentToFlags({ run: true })).toBe(0);
  });

  it('keeps the top bit as an unsigned value', () => {
    expect(intentToFlags({ mouselookLeftButton: true })).toBe(AGENT_CONTROL.ML_LBUTTON_DOWN);
    expect(AGENT_CONTROL.ML_LBUTTON_UP).toBe(0x80000000);
  });
});

describe('AgentController', () => {
  it('sends a nudge for a short tap and a walk once held past the nudge time', () => {
    const c = new AgentController();
    c.command('push_forward', true, 1000);
    expect(c.nextFlags(1100)).toBe(AGENT_CONTROL.NUDGE_AT_POS);
    expect(c.nextFlags(1000 + NUDGE_TIME_MS)).toBe(AGENT_CONTROL.AT_POS);
    c.command('push_forward', false, 1400);
    expect(c.nextFlags(1500)).toBe(0);
  });

  it('runs on tap-tap-hold and stops running on release', () => {
    const c = new AgentController();
    c.command('push_forward', true, 0); c.command('push_forward', false, 80);
    c.command('push_forward', true, 200);
    expect(c.nextFlags(200 + NUDGE_TIME_MS + 1)).toBe(AGENT_CONTROL.AT_POS | AGENT_CONTROL.FAST_AT);
    c.command('push_forward', false, 900);
    c.command('push_forward', true, 2000);
    expect(c.nextFlags(2000 + NUDGE_TIME_MS + 1)).toBe(AGENT_CONTROL.AT_POS);
  });

  it('does not treat a second tap after the window as a run', () => {
    const c = new AgentController();
    c.command('push_forward', true, 0); c.command('push_forward', false, 50);
    c.command('push_forward', true, 400);
    expect(c.nextFlags(400 + NUDGE_TIME_MS + 1) & AGENT_CONTROL.FAST_AT).toBe(0);
  });

  it('honours AllowTapTapHoldRun = off and always-run', () => {
    const c = new AgentController();
    c.allowTapTapHoldRun = false;
    c.command('push_forward', true, 0); c.command('push_forward', false, 50); c.command('push_forward', true, 100);
    expect(c.nextFlags(500) & AGENT_CONTROL.FAST_AT).toBe(0);
    c.command('toggle_run', true, 600);
    expect(c.nextFlags(900) & AGENT_CONTROL.FAST_AT).toBe(AGENT_CONTROL.FAST_AT);
  });

  it('toggles flying on the key-down edge only', () => {
    const c = new AgentController();
    c.command('toggle_fly', true, 0); c.command('toggle_fly', false, 10);
    expect(c.flying).toBe(true);
    expect(c.nextFlags(20) & AGENT_CONTROL.FLY).toBe(AGENT_CONTROL.FLY);
    c.command('toggle_fly', true, 30);
    expect(c.flying).toBe(false);
  });

  it('starts flying when jump is held for the fly time, only with automatic fly on', () => {
    const c = new AgentController();
    c.command('jump', true, 0);
    expect(c.nextFlags(FLY_TIME_MS - 1) & AGENT_CONTROL.FLY).toBe(0);
    expect(c.nextFlags(FLY_TIME_MS) & AGENT_CONTROL.FLY).toBe(AGENT_CONTROL.FLY);
    const off = new AgentController(); off.automaticFly = false;
    off.command('jump', true, 0);
    expect(off.nextFlags(5000) & AGENT_CONTROL.FLY).toBe(0);
    expect(off.nextFlags(5000) & AGENT_CONTROL.UP_POS).toBe(AGENT_CONTROL.UP_POS);
  });

  it('holds STOP while stop_moving is held and clears one-shots after one update', () => {
    const c = new AgentController();
    c.command('stop_moving', true, 0);
    expect(c.nextFlags(1)).toBe(AGENT_CONTROL.STOP);
    c.command('stop_moving', false, 2);
    c.standUp();
    expect(c.nextFlags(3)).toBe(AGENT_CONTROL.STAND_UP);
    expect(c.nextFlags(4)).toBe(0);
    expect(ONE_SHOT_FLAGS & AGENT_CONTROL.STAND_UP).toBeTruthy();
  });

  it('ignores key repeat and releaseAll clears held state', () => {
    const c = new AgentController();
    c.command('turn_left', true, 0); c.command('turn_left', true, 30);
    expect(c.nextFlags(40)).toBe(AGENT_CONTROL.TURN_LEFT);
    c.releaseAll();
    expect(c.nextFlags(50)).toBe(0);
    expect(c.command('spin_over', true, 0)).toBe(false);
  });
});

describe('default key bindings', () => {
  it('follow the official third-person table', () => {
    expect(commandFor('third_person', 'A', 'NONE')).toBe('turn_left');
    expect(commandFor('third_person', 'A', 'SHIFT')).toBe('slide_left');
    expect(commandFor('third_person', 'E', 'NONE')).toBe('jump');
    expect(commandFor('third_person', 'C', 'NONE')).toBe('push_down');
    expect(commandFor('third_person', 'HOME', 'NONE')).toBe('toggle_fly');
    expect(commandFor('third_person', 'SPACE', 'NONE')).toBe('stop_moving');
    expect(commandFor('first_person', 'A', 'NONE')).toBe('slide_left');
    expect(commandFor('third_person', 'Z', 'NONE')).toBeNull();
  });

  it('has a binding for every mode and no duplicate key+mask within a mode', () => {
    for (const [mode, rows] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      expect(rows.length).toBeGreaterThan(10);
      const keys = rows.map(([k, m]) => `${k}/${m}`);
      expect(new Set(keys).size, mode).toBe(keys.length);
    }
    expect(commandsFor('third_person')).toContain('toggle_voice');
  });

  it('applies overrides per mode and maps DOM codes and modifiers', () => {
    expect(commandFor('third_person', 'W', 'NONE', { third_person: [['W', 'NONE', 'jump']] })).toBe('jump');
    expect(keyNameFromCode('KeyW')).toBe('W');
    expect(keyNameFromCode('PageUp')).toBe('PGUP');
    expect(keyNameFromCode('F5')).toBeNull();
    expect(maskFromModifiers({ shift: true })).toBe('SHIFT');
    expect(maskFromModifiers({ ctrl: true, alt: true })).toBe('CTL_ALT');
    expect(maskFromModifiers({ ctrl: true })).toBeNull();
  });
});
