import { describe, expect, it, vi } from 'vitest';
import { VoiceManager } from '../voice';
import { VoiceInput } from '../voice-input';

vi.mock('../sl-bridge', () => ({
  slBridge: { voiceProvision: vi.fn(), voiceSignal: vi.fn(), voiceLogout: vi.fn() },
}));

describe('push-to-talk state (LLVoiceClient)', () => {
  it('starts with the mic closed; holding the key follows it down and up', () => {
    const voice = new VoiceManager();
    expect(voice.muted).toBe(true);
    voice.inputUserControlState(true);
    expect(voice.muted).toBe(false);
    voice.inputUserControlState(false);
    expect(voice.muted).toBe(true);
  });

  it('toggle mode flips on press and ignores release', () => {
    const voice = new VoiceManager();
    voice.setPttToggle(true);
    voice.inputUserControlState(true);
    voice.inputUserControlState(false);
    expect(voice.muted).toBe(false);
    voice.inputUserControlState(true);
    voice.inputUserControlState(false);
    expect(voice.muted).toBe(true);
  });

  it('turning toggle mode off, or push-to-talk on, closes the mic', () => {
    const voice = new VoiceManager();
    voice.setPttToggle(true);
    voice.setUserPttState(true);
    voice.setPttToggle(false);
    expect(voice.muted).toBe(true);
    voice.setUsePtt(false);
    expect(voice.muted).toBe(false); // without push-to-talk the mic is simply open
    voice.setUsePtt(true);
    expect(voice.muted).toBe(true);
  });

  it('an explicit mute always wins; the mic button is the plain mute switch without push-to-talk', () => {
    const voice = new VoiceManager();
    voice.setUsePtt(false);
    voice.setMuted(true);
    expect(voice.muted).toBe(true);
    voice.setUsePtt(true);
    voice.setUserPttState(true);
    expect(voice.muted).toBe(true); // muteMic still set
    voice.setUsePtt(false);
    voice.setMuted(false);
    expect(voice.muted).toBe(false);
  });

  it('the mic button toggles the push-to-talk state when push-to-talk is on, and says so', () => {
    const voice = new VoiceManager();
    const events: unknown[] = [];
    voice.on('mute_changed', (e: unknown) => events.push(e));
    voice.setMuted(false);
    expect(voice.muted).toBe(false);
    voice.setMuted(true);
    expect(events).toEqual([{ muted: false }, { muted: true }]);
  });
});

describe('VoiceInput', () => {
  const target = () => {
    const handlers: Record<string, Array<(e: any) => void>> = {};
    return {
      addEventListener: (type: string, fn: any) => {
        (handlers[type] ||= []).push(fn);
      },
      removeEventListener: (type: string, fn: any) => {
        handlers[type] = (handlers[type] || []).filter((h) => h !== fn);
      },
      fire: (type: string, event: any) =>
        (handlers[type] || []).forEach((h) => h({ preventDefault() {}, target: {}, ...event })),
    };
  };

  it('middle mouse toggles the mic (the default toggle_voice binding)', () => {
    const voice = new VoiceManager();
    const t = target();
    const input = new VoiceInput(voice, { target: t as any, enabled: () => true });
    t.fire('mousedown', { button: 1 });
    expect(voice.muted).toBe(false);
    t.fire('mousedown', { button: 1 });
    expect(voice.muted).toBe(true);
    t.fire('mousedown', { button: 0 });
    expect(voice.muted).toBe(true);
    input.destroy();
  });

  it('does nothing while not in voice', () => {
    const voice = new VoiceManager();
    const t = target();
    new VoiceInput(voice, { target: t as any, enabled: () => false });
    t.fire('mousedown', { button: 1 });
    expect(voice.muted).toBe(true);
  });

  it('a voice_follow_key binding holds the mic open while the key is down', () => {
    const voice = new VoiceManager();
    const t = target();
    const changes: boolean[] = [];
    new VoiceInput(voice, {
      target: t as any,
      overrides: () => ({ third_person: [['T', 'NONE', 'voice_follow_key']] }),
      onChanged: (talking) => changes.push(talking),
    });
    t.fire('keydown', { code: 'KeyT' });
    expect(voice.muted).toBe(false);
    t.fire('keydown', { code: 'KeyT', repeat: true });
    t.fire('keyup', { code: 'KeyT' });
    expect(voice.muted).toBe(true);
    expect(changes).toEqual([true, false]);
  });
});
