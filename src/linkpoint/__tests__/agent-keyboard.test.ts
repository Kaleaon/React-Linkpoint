import { describe, expect, it, vi } from 'vitest';
import { AGENT_CONTROL } from '../agent-controls';
import { AgentKeyboard } from '../agent-keyboard';

const { ViewerSession } = require('../../../core/viewer-session.cjs');

function harness(extra: Partial<ConstructorParameters<typeof AgentKeyboard>[0]> = {}) {
  const target = new EventTarget();
  let t = 0;
  const send = vi.fn();
  const keyboard = new AgentKeyboard({ send, target: target as unknown as Window, now: () => t, ...extra });
  const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent(type, { code, cancelable: true, bubbles: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  return { keyboard, send, key, advance: (ms: number) => { t += ms; } };
}

describe('AgentKeyboard', () => {
  it('turns W into a nudge, then a walk after the nudge time, then nothing on release', () => {
    vi.useFakeTimers();
    const h = harness();
    const down = h.key('keydown', 'KeyW');
    expect(down.defaultPrevented).toBe(true);
    expect(h.send).toHaveBeenLastCalledWith(AGENT_CONTROL.NUDGE_AT_POS);
    h.advance(300); vi.advanceTimersByTime(300);
    expect(h.send).toHaveBeenLastCalledWith(AGENT_CONTROL.AT_POS);
    h.key('keyup', 'KeyW');
    expect(h.send).toHaveBeenLastCalledWith(0);
    h.keyboard.destroy();
    vi.useRealTimers();
  });

  it('uses A for turning and Shift+A for sliding in third person', () => {
    const h = harness();
    h.key('keydown', 'KeyA');
    h.advance(10);
    expect(h.send).toHaveBeenLastCalledWith(AGENT_CONTROL.TURN_LEFT);
    h.key('keyup', 'KeyA');
    h.key('keydown', 'KeyA', { shiftKey: true });
    expect(h.send).toHaveBeenLastCalledWith(AGENT_CONTROL.NUDGE_LEFT_POS);
    h.keyboard.destroy();
  });

  it('releases a slide even if Shift came up before the key', () => {
    const h = harness();
    h.key('keydown', 'KeyD', { shiftKey: true });
    h.key('keyup', 'KeyD', { shiftKey: false });
    expect(h.send).toHaveBeenLastCalledWith(0);
    h.keyboard.destroy();
  });

  it('leaves typing targets, browser shortcuts and camera-only commands alone', () => {
    const h = harness();
    const input = document.createElement('input');
    const typed = new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true });
    Object.defineProperty(typed, 'target', { value: input });
    (h.keyboard as any).onKeyDown(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect(h.key('keydown', 'KeyW', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(h.key('keydown', 'KeyW', { altKey: true }).defaultPrevented).toBe(false); // move_forward is camera
    expect(h.send).not.toHaveBeenCalled();
    h.keyboard.destroy();
  });

  it('does nothing while disabled and lets a policy veto a command', () => {
    let on = false;
    const h = harness({ enabled: () => on, allow: (command) => command !== 'toggle_fly' });
    expect(h.key('keydown', 'KeyF').defaultPrevented).toBe(false);
    on = true;
    h.key('keydown', 'KeyF');
    expect(h.send).not.toHaveBeenCalled();
    h.key('keydown', 'Home'); // also toggle_fly
    expect(h.send).not.toHaveBeenCalled();
    h.keyboard.destroy();
  });

  it('toggles flying and zeroes the flags when destroyed mid-move', () => {
    const h = harness();
    h.key('keydown', 'KeyF');
    expect(h.send).toHaveBeenLastCalledWith(AGENT_CONTROL.FLY);
    h.key('keydown', 'KeyW');
    h.keyboard.destroy();
    expect(h.send).toHaveBeenLastCalledWith(0);
  });
});

describe('ViewerSession.setMovement with a flag word', () => {
  it('sets exactly the requested bits, sends once, and clears one-shot flags afterwards', () => {
    const session = new ViewerSession(() => undefined);
    let word = 0;
    const agent = {
      setControlFlag: vi.fn((f: number) => { word |= f; }),
      clearControlFlag: vi.fn((f: number) => { word &= ~f; }),
      sendAgentUpdate: vi.fn(() => { agent.sent.push(word >>> 0); }),
      sent: [] as number[],
    };
    session.bot = { agent };
    const flags = (AGENT_CONTROL.AT_POS | AGENT_CONTROL.FLY | AGENT_CONTROL.STAND_UP | AGENT_CONTROL.NUDGE_AT_POS) >>> 0;
    expect(session.setMovement({ controlFlags: flags })).toEqual({ moving: true, flags });
    expect(agent.sent).toEqual([flags]);
    expect(word >>> 0).toBe((AGENT_CONTROL.AT_POS | AGENT_CONTROL.FLY) >>> 0);
    session.setMovement({ controlFlags: 0 });
    expect(word).toBe(0);
  });

  it('keeps the highest bit intact and rejects invalid words', () => {
    const session = new ViewerSession(() => undefined);
    let word = 0;
    const agent = { setControlFlag: (f: number) => { word |= f; }, clearControlFlag: (f: number) => { word &= ~f; }, sendAgentUpdate: vi.fn() };
    session.bot = { agent };
    session.setMovement({ controlFlags: AGENT_CONTROL.ML_LBUTTON_UP });
    expect(word >>> 0).toBe(0x80000000);
    for (const bad of [-1, 1.5, 2 ** 32, 'x']) expect(() => session.setMovement({ controlFlags: bad })).toThrow(/unsigned 32-bit/);
  });
});
