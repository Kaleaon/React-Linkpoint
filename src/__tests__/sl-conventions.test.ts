import { describe, expect, it } from 'vitest';
import { parseChatInput } from '../screens/ChatScreen';
import { parseSlurl } from '../screens/TeleportScreen';
import { CHAT_RANGE, bearingToCompass, chatBand, legacyName, permissionLabel, positionLabel, slurl } from '../data/slTypes';

/**
 * Conventions a Second Life viewer is expected to get exactly right. Residents
 * carry these between viewers as muscle memory, so "close enough" is wrong.
 */

describe('chat commands', () => {
  it('treats plain text as ordinary chat at the current volume', () => {
    expect(parseChatInput('hello there', 'say')).toEqual({ channel: 0, text: 'hello there', emote: false, volume: 'say' });
  });

  it('parses /me as an emote', () => {
    const r = parseChatInput('/me waves', 'say');
    expect(r.emote).toBe(true);
    expect(r.text).toBe('waves');
  });

  it('routes /<n> to that channel', () => {
    const r = parseChatInput('/142 dim 50', 'say');
    expect(r.channel).toBe(142);
    expect(r.text).toBe('dim 50');
  });

  it('handles high channel numbers scripts actually use', () => {
    expect(parseChatInput('/999 on', 'say').channel).toBe(999);
  });

  it('lets /shout and /whisper override the volume for one message', () => {
    expect(parseChatInput('/shout over here', 'say')).toMatchObject({ volume: 'shout', text: 'over here' });
    expect(parseChatInput('/whisper psst', 'say')).toMatchObject({ volume: 'whisper', text: 'psst' });
  });

  it('combines a channel with an emote, in that order', () => {
    const r = parseChatInput('/5 /me bows', 'say');
    expect(r.channel).toBe(5);
    expect(r.emote).toBe(true);
    expect(r.text).toBe('bows');
  });

  it('leaves a bare slash alone rather than eating it', () => {
    expect(parseChatInput('/ hmm', 'say')).toMatchObject({ channel: 0, text: '/ hmm', emote: false });
  });
});

describe('chat ranges', () => {
  it('uses the distances the simulator enforces', () => {
    expect(CHAT_RANGE.whisper).toBe(10);
    expect(CHAT_RANGE.say).toBe(20);
    expect(CHAT_RANGE.shout).toBe(100);
  });

  it('bands a distance by which range would carry it', () => {
    expect(chatBand(5)).toBe('WHISPER');
    expect(chatBand(10)).toBe('WHISPER');
    expect(chatBand(11)).toBe('CHAT');
    expect(chatBand(20)).toBe('CHAT');
    expect(chatBand(21)).toBe('SHOUT');
    expect(chatBand(100)).toBe('SHOUT');
    expect(chatBand(101)).toBe('OUT OF RANGE');
  });
});

describe('SLURLs', () => {
  it('builds the standard protocol URL', () => {
    expect(slurl('Da Boom', 128, 128, 26)).toBe('secondlife://Da%20Boom/128/128/26');
  });

  it('rounds fractional positions, as the location bar does', () => {
    expect(slurl('Ahern', 127.6, 128.2, 24.9)).toBe('secondlife://Ahern/128/128/25');
  });

  it('parses the protocol form back', () => {
    expect(parseSlurl('secondlife://Ahern/128/129/24')).toMatchObject({ region: 'Ahern', x: 128, y: 129, z: 24 });
  });

  it('parses the maps.secondlife.com form a browser hands over', () => {
    expect(parseSlurl('https://maps.secondlife.com/secondlife/Da%20Boom/128/128/26')).toMatchObject({
      region: 'Da Boom',
      x: 128,
      y: 128,
      z: 26,
    });
  });

  it('parses the legacy slurl.com form', () => {
    expect(parseSlurl('http://slurl.com/secondlife/Ahern/1/2/3')).toMatchObject({ region: 'Ahern', x: 1, y: 2, z: 3 });
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(parseSlurl('  secondlife://Ahern/128/129/24  ')).not.toBeNull();
  });

  it('rejects anything that is not a SLURL', () => {
    expect(parseSlurl('https://example.com')).toBeNull();
    expect(parseSlurl('Da Boom 128 128 26')).toBeNull();
    expect(parseSlurl('secondlife://Ahern/128/129')).toBeNull();
    expect(parseSlurl('')).toBeNull();
  });

  it('round-trips a built SLURL through the parser', () => {
    const parsed = parseSlurl(slurl('Da Boom', 128, 128, 26));
    expect(parsed).toMatchObject({ region: 'Da Boom', x: 128, y: 128, z: 26 });
  });
});

describe('formatting conventions', () => {
  it('renders a position the way the location bar does', () => {
    expect(positionLabel(128, 128, 26)).toBe('<128, 128, 26>');
  });

  it('states the whole permission mask, including what is absent', () => {
    expect(permissionLabel({ copy: true, modify: true, transfer: false })).toBe('copy · modify · no transfer');
    expect(permissionLabel({ copy: false, modify: false, transfer: false })).toBe('no copy · no modify · no transfer');
  });

  it('builds the legacy name the simulator uses on the wire', () => {
    expect(
      legacyName({ id: 'x', firstName: 'Ruth', lastName: 'Resident', displayName: 'Ruth', userName: 'ruth.resident', online: true }),
    ).toBe('Ruth Resident');
  });

  it('maps a bearing onto the sixteen-point compass', () => {
    expect(bearingToCompass(0)).toBe('N');
    expect(bearingToCompass(90)).toBe('E');
    expect(bearingToCompass(180)).toBe('S');
    expect(bearingToCompass(270)).toBe('W');
    expect(bearingToCompass(45)).toBe('NE');
    // 360 wraps back to north rather than running off the end of the table.
    expect(bearingToCompass(360)).toBe('N');
  });
});
