import { describe, expect, it } from 'vitest';
import {
  CHAT_RANGE,
  chatBand,
  bearingToCompass,
  permissionLabel,
  legacyName,
  slurl,
  positionLabel,
  Resident,
  Permissions,
} from '../../data/slTypes';

describe('chatBand', () => {
  it('returns WHISPER for distances less than or equal to whisper threshold (10m)', () => {
    expect(chatBand(0)).toBe('WHISPER');
    expect(chatBand(5)).toBe('WHISPER');
    expect(chatBand(CHAT_RANGE.whisper)).toBe('WHISPER');
  });

  it('returns WHISPER for negative distance inputs', () => {
    expect(chatBand(-1)).toBe('WHISPER');
    expect(chatBand(-10)).toBe('WHISPER');
  });

  it('returns CHAT for distances greater than whisper (10m) and less than or equal to say threshold (20m)', () => {
    expect(chatBand(10.01)).toBe('CHAT');
    expect(chatBand(15)).toBe('CHAT');
    expect(chatBand(CHAT_RANGE.say)).toBe('CHAT');
  });

  it('returns SHOUT for distances greater than say (20m) and less than or equal to shout threshold (100m)', () => {
    expect(chatBand(20.01)).toBe('SHOUT');
    expect(chatBand(50)).toBe('SHOUT');
    expect(chatBand(CHAT_RANGE.shout)).toBe('SHOUT');
  });

  it('returns OUT OF RANGE for distances strictly greater than shout threshold (100m)', () => {
    expect(chatBand(100.01)).toBe('OUT OF RANGE');
    expect(chatBand(150)).toBe('OUT OF RANGE');
    expect(chatBand(1000)).toBe('OUT OF RANGE');
    expect(chatBand(Infinity)).toBe('OUT OF RANGE');
  });
});

describe('bearingToCompass', () => {
  it('maps cardinal directions correctly (0 -> N, 90 -> E, 180 -> S, 270 -> W)', () => {
    expect(bearingToCompass(0)).toBe('N');
    expect(bearingToCompass(90)).toBe('E');
    expect(bearingToCompass(180)).toBe('S');
    expect(bearingToCompass(270)).toBe('W');
  });

  it('maps 360 degrees to N', () => {
    expect(bearingToCompass(360)).toBe('N');
  });

  it('rounds intermediate bearing values to the nearest 16-point compass direction', () => {
    expect(bearingToCompass(22.5)).toBe('NNE');
    expect(bearingToCompass(45)).toBe('NE');
    expect(bearingToCompass(67.5)).toBe('ENE');
    expect(bearingToCompass(11.2)).toBe('N');
    expect(bearingToCompass(11.3)).toBe('NNE');
  });
});

describe('permissionLabel', () => {
  it('formats permissions correctly when all rights are granted', () => {
    const permissions: Permissions = { copy: true, modify: true, transfer: true };
    expect(permissionLabel(permissions)).toBe('copy · modify · transfer');
  });

  it('formats permissions correctly when all rights are denied', () => {
    const permissions: Permissions = { copy: false, modify: false, transfer: false };
    expect(permissionLabel(permissions)).toBe('no copy · no modify · no transfer');
  });

  it('formats permissions correctly for mixed permission flags', () => {
    const permissions: Permissions = { copy: true, modify: false, transfer: true };
    expect(permissionLabel(permissions)).toBe('copy · no modify · transfer');
  });
});

describe('legacyName', () => {
  it('combines first and last name into a single legacy name string', () => {
    const resident: Resident = {
      id: 'uuid-123',
      firstName: 'Philip',
      lastName: 'Linden',
      displayName: 'Philip',
      userName: 'philip.linden',
      online: true,
    };
    expect(legacyName(resident)).toBe('Philip Linden');
  });

  it('handles single-name accounts with Resident as last name', () => {
    const resident: Resident = {
      id: 'uuid-456',
      firstName: 'Ada',
      lastName: 'Resident',
      displayName: 'Ada',
      userName: 'ada',
      online: false,
    };
    expect(legacyName(resident)).toBe('Ada Resident');
  });
});

describe('slurl', () => {
  it('constructs a valid secondlife:// URL with rounded integer coordinates', () => {
    expect(slurl('Aharon', 128.4, 64.6, 21.1)).toBe('secondlife://Aharon/128/65/21');
  });

  it('properly encodes spaces and special characters in region names', () => {
    expect(slurl('Welcome Island', 10, 20, 30)).toBe('secondlife://Welcome%20Island/10/20/30');
  });
});

describe('positionLabel', () => {
  it('renders vector position coordinates rounded inside angled brackets', () => {
    expect(positionLabel(128.4, 64.6, 21.1)).toBe('<128, 65, 21>');
  });

  it('handles origin position (0, 0, 0)', () => {
    expect(positionLabel(0, 0, 0)).toBe('<0, 0, 0>');
  });
});
