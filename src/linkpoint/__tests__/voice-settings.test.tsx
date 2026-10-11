// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import Settings from '../../screens/Settings.jsx';
import { app } from '../app';
import { VIEWER_SETTINGS_KEY } from '../../hooks/viewerSettings.js';
import { mountScreen, unmount, typeInto, flush, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;
let selected: { inputDeviceId: string; outputDeviceId: string };
let deviceChanges: EventTarget;
const sinkDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'setSinkId');

beforeEach(() => {
  localStorage.clear();
  selected = { inputDeviceId: '', outputDeviceId: '' };
  deviceChanges = new EventTarget();
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, {
      mediaDevices: {
        value: {
          enumerateDevices: vi.fn(async () => [
            { deviceId: 'mic-2', kind: 'audioinput', label: 'USB microphone' },
            { deviceId: 'speaker-2', kind: 'audiooutput', label: 'Headphones' },
          ]),
          getUserMedia: vi.fn(),
          addEventListener: deviceChanges.addEventListener.bind(deviceChanges),
          removeEventListener: deviceChanges.removeEventListener.bind(deviceChanges),
        },
      },
    }),
  );
  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(app.voice, 'getDevices').mockImplementation(() => ({ ...selected }));
  vi.spyOn(app.voice, 'setInputDevice').mockImplementation(async (id) => {
    selected.inputDeviceId = id;
  });
  vi.spyOn(app.voice, 'setOutputDevice').mockImplementation(async (id) => {
    selected.outputDeviceId = id;
  });
});
afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (sinkDescriptor)
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', sinkDescriptor);
  else delete (HTMLMediaElement.prototype as any).setSinkId;
});

describe('voice and sound preferences', () => {
  it('lists real audio devices and changes selections without requesting microphone access on mount', async () => {
    mounted = await mountScreen(Settings);
    await flush();
    const input = mounted.host.querySelector('#settings-voice-audioinput') as HTMLSelectElement;
    const output = mounted.host.querySelector('#settings-voice-audiooutput') as HTMLSelectElement;
    expect(input.textContent).toContain('USB microphone');
    expect(output.textContent).toContain('Headphones');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    await typeInto(input, 'mic-2');
    await typeInto(output, 'speaker-2');
    expect(app.voice.setInputDevice).toHaveBeenCalledWith('mic-2');
    expect(app.voice.setOutputDevice).toHaveBeenCalledWith('speaker-2');
    expect(input.value).toBe('mic-2');
    expect(output.value).toBe('speaker-2');
  });

  it('shows selection failures and keeps the current selection', async () => {
    vi.mocked(app.voice.setInputDevice).mockRejectedValueOnce(
      new Error('Microphone access denied'),
    );
    mounted = await mountScreen(Settings);
    await flush();
    const input = mounted.host.querySelector('#settings-voice-audioinput') as HTMLSelectElement;
    await typeInto(input, 'mic-2');
    expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain(
      'Microphone access denied',
    );
    expect(input.value).toBe('');
  });

  it('disables speaker selection when the browser has no output-routing API', async () => {
    delete (HTMLMediaElement.prototype as any).setSinkId;
    mounted = await mountScreen(Settings);
    await flush();
    expect(
      (mounted.host.querySelector('#settings-voice-audiooutput') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(mounted.host.textContent).toContain('system sound settings');
  });

  it('refreshes devices when hardware changes and identifies disconnected selections', async () => {
    selected.inputDeviceId = 'mic-2';
    mounted = await mountScreen(Settings);
    await flush();
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([]);
    await act(async () => {
      deviceChanges.dispatchEvent(new Event('devicechange'));
    });
    expect(
      (mounted.host.querySelector('#settings-voice-audioinput') as HTMLSelectElement).textContent,
    ).toContain('unavailable');
  });

  it('persists category volume and applies master volume to voice as well as object audio', async () => {
    const levels = vi.spyOn(app.audio, 'setLevels');
    const voice = vi.spyOn(app.voice, 'setSpeakerVolume');
    mounted = await mountScreen(Settings);
    await typeInto(
      mounted.host.querySelector('#settings-master-volume-select') as HTMLSelectElement,
      '50%',
    );
    await typeInto(mounted.host.querySelector('#settings-voiceVolume') as HTMLSelectElement, '70%');
    await typeInto(mounted.host.querySelector('#settings-sfxVolume') as HTMLSelectElement, '25%');
    expect(voice).toHaveBeenLastCalledWith(0.35);
    expect(levels).toHaveBeenLastCalledWith({ sfx: 0.25, ui: 0.5, ambient: 0.5 });
    const saved = JSON.parse(localStorage.getItem(VIEWER_SETTINGS_KEY)!);
    expect(saved.prefs).toMatchObject({ voiceVolume: '70%', sfxVolume: '25%' });
    await unmount(mounted);
    mounted = await mountScreen(Settings);
    expect((mounted.host.querySelector('#settings-voiceVolume') as HTMLSelectElement).value).toBe(
      '70%',
    );
    await typeInto(
      mounted.host.querySelector('#settings-master-volume-select') as HTMLSelectElement,
      'Muted',
    );
    expect(voice).toHaveBeenLastCalledWith(0);
  });
});
