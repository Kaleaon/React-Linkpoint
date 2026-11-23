// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaScreen } from '../LumiyaTools.jsx';
import {
  buttonByText,
  click,
  mountScreen,
  typeInto,
  unmount,
  type Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

function triggerAudioError(audio: HTMLAudioElement, code: number | null) {
  Object.defineProperty(audio, 'error', {
    value: code === null ? null : ({ code } as MediaError),
    configurable: true,
  });
  audio.dispatchEvent(new Event('error'));
}

describe('MediaScreen playback error alert and retry flow', () => {
  let mounted: Mounted | null = null;

  afterEach(async () => {
    if (mounted) {
      await unmount(mounted);
      mounted = null;
    }
  });

  it('validates HTTPS URLs before enabling Play and shows default empty state initially', async () => {
    mounted = await mountScreen(MediaScreen);

    const input = mounted.host.querySelector(
      'input[aria-label="HTTPS audio stream URL"]',
    ) as HTMLInputElement;
    const playButton = buttonByText(mounted.host, 'Play');

    expect(input).not.toBeNull();
    expect(playButton).toBeDefined();
    expect(playButton?.disabled).toBe(true);
    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    expect(mounted.host.textContent).toContain(
      'Enter an HTTPS stream supplied by the current parcel or broadcaster.',
    );

    await typeInto(input, 'http://insecure.example.com/stream.mp3');
    expect(playButton?.disabled).toBe(true);

    await typeInto(input, 'https://stream.example.com/live.mp3');
    expect(playButton?.disabled).toBe(false);
  });

  it.each([
    [1, 'Stream playback was aborted.'],
    [2, 'A network error interrupted stream playback.'],
    [3, 'The audio stream could not be decoded.'],
    [4, 'The stream format is unsupported or the source could not be reached.'],
    [null, 'Unable to play audio stream. Check the stream URL and try again.'],
  ])(
    'renders accessible error alert for MediaError code %s and unmounts failed audio element',
    async (code, expectedMessage) => {
      mounted = await mountScreen(MediaScreen);

      const input = mounted.host.querySelector(
        'input[aria-label="HTTPS audio stream URL"]',
      ) as HTMLInputElement;
      const playButton = buttonByText(mounted.host, 'Play');

      await typeInto(input, 'https://stream.example.com/live.mp3');
      await click(playButton);

      const audio = mounted.host.querySelector('audio.media-player') as HTMLAudioElement;
      expect(audio).not.toBeNull();
      expect(audio.getAttribute('src')).toBe('https://stream.example.com/live.mp3');

      await act(async () => {
        triggerAudioError(audio, code);
      });

      expect(mounted.host.querySelector('audio.media-player')).toBeNull();

      const alert = mounted.host.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.getAttribute('aria-live')).toBe('assertive');
      expect(alert?.textContent).toContain(expectedMessage);

      const retryButton = buttonByText(mounted.host, 'Retry');
      expect(retryButton).toBeDefined();
    },
  );

  it('clears the error alert and retries stream playback when Retry is clicked', async () => {
    mounted = await mountScreen(MediaScreen);

    const input = mounted.host.querySelector(
      'input[aria-label="HTTPS audio stream URL"]',
    ) as HTMLInputElement;
    const playButton = buttonByText(mounted.host, 'Play');

    await typeInto(input, '  https://stream.example.com/parcel-radio.ogg  ');
    await click(playButton);

    const firstAudio = mounted.host.querySelector('audio.media-player') as HTMLAudioElement;
    expect(firstAudio).not.toBeNull();

    await act(async () => {
      triggerAudioError(firstAudio, 2);
    });

    expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain(
      'A network error interrupted stream playback.',
    );

    const retryButton = buttonByText(mounted.host, 'Retry');
    expect(retryButton).toBeDefined();
    await click(retryButton);

    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    const retriedAudio = mounted.host.querySelector('audio.media-player') as HTMLAudioElement;
    expect(retriedAudio).not.toBeNull();
    expect(retriedAudio.getAttribute('src')).toBe('https://stream.example.com/parcel-radio.ogg');

    // Subsequent failure re-surfaces the alert with the new failure reason
    await act(async () => {
      triggerAudioError(retriedAudio, 4);
    });

    expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain(
      'The stream format is unsupported or the source could not be reached.',
    );
  });

  it('clears the error alert on URL edit and disables Play when the URL input is cleared', async () => {
    mounted = await mountScreen(MediaScreen);

    const input = mounted.host.querySelector(
      'input[aria-label="HTTPS audio stream URL"]',
    ) as HTMLInputElement;
    const playButton = buttonByText(mounted.host, 'Play');

    await typeInto(input, 'https://stream.example.com/broken.mp3');
    await click(playButton);

    const audio = mounted.host.querySelector('audio.media-player') as HTMLAudioElement;
    await act(async () => {
      triggerAudioError(audio, 3);
    });

    expect(mounted.host.querySelector('[role="alert"]')).not.toBeNull();

    // Editing the URL clears the error alert
    await typeInto(input, 'https://stream.example.com/fixed.mp3');
    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    expect(playButton?.disabled).toBe(false);

    // Trigger another error, then clear the input completely
    await click(playButton);
    const secondAudio = mounted.host.querySelector('audio.media-player') as HTMLAudioElement;
    await act(async () => {
      triggerAudioError(secondAudio, 2);
    });
    expect(mounted.host.querySelector('[role="alert"]')).not.toBeNull();

    await typeInto(input, '');
    expect(mounted.host.querySelector('[role="alert"]')).toBeNull();
    expect(playButton?.disabled).toBe(true);
    expect(mounted.host.textContent).toContain(
      'Enter an HTTPS stream supplied by the current parcel or broadcaster.',
    );
  });
});
