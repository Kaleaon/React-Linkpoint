import { describe, expect, it } from 'vitest';
import { MAX_RETRY_WAIT_SECONDS, RetryBackoff } from '../voice-protocol';
import {
  EarLocation, PEER_GAIN_CONVERSION_FACTOR, earPose, iceServersForGrid, isSpeakingLevel, joinMessage, logoutBody,
  mungeOpusSdp, muteMessage, parseVoiceData, provisionBody, signalingBody, spatialMessage, tetherListener, userGainMessage,
} from '../voice-protocol';

const ID = '11111111-2222-3333-4444-555555555555';

describe('voice capability bodies', () => {
  it('builds a spatial request, with parcel id only when valid', () => {
    expect(provisionBody('SDP', { kind: 'local', parcelLocalId: 7 })).toEqual({
      jsep: { type: 'offer', sdp: 'SDP' }, parcel_local_id: 7, channel_type: 'local', voice_server_type: 'webrtc' });
    expect(provisionBody('SDP', { kind: 'local' })).not.toHaveProperty('parcel_local_id');
    expect(provisionBody('SDP', { kind: 'local', parcelLocalId: -1 })).not.toHaveProperty('parcel_local_id');
  });

  it('builds a multiagent request for P2P and group channels', () => {
    expect(provisionBody('SDP', { kind: 'multiagent', channelId: 'chan', credentials: 'cred' })).toEqual({
      jsep: { type: 'offer', sdp: 'SDP' }, credentials: 'cred', channel: 'chan', channel_type: 'multiagent', voice_server_type: 'webrtc' });
  });

  it('sends candidates or the completed marker, never both, and nothing when idle', () => {
    const c = { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 };
    expect(signalingBody('s', [c], true)).toEqual({ viewer_session: 's', voice_server_type: 'webrtc', candidates: [{ sdpMid: '0', sdpMLineIndex: 0, candidate: 'cand' }] });
    expect(signalingBody('s', [], true)).toEqual({ viewer_session: 's', voice_server_type: 'webrtc', candidate: { completed: true } });
    expect(signalingBody('s', [], false)).toBeNull();
    expect(logoutBody('s')).toEqual({ logout: true, viewer_session: 's', voice_server_type: 'webrtc' });
  });

  it('uses three STUN servers on agni and two elsewhere', () => {
    expect(iceServersForGrid('agni')[0].urls).toEqual(['stun:stun1.agni.secondlife.io:3478', 'stun:stun2.agni.secondlife.io:3478', 'stun:stun3.agni.secondlife.io:3478']);
    expect(iceServersForGrid('Aditi')[0].urls).toEqual(['stun:stun1.aditi.secondlife.io:3478', 'stun:stun2.aditi.secondlife.io:3478']);
  });
});

describe('Opus SDP munging', () => {
  const sdp = ['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=sendrecv'].join('\r\n');
  it('forces 48 kHz stereo and replaces the fmtp line', () => {
    const out = mungeOpusSdp(sdp).split('\r\n');
    expect(out).toContain('a=rtpmap:111 opus/48000/2');
    expect(out.filter((l) => l.startsWith('a=fmtp:111'))).toEqual(['a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxplaybackrate=48000;sprop-maxplaybackrate=48000;sprop-maxcapturerate=48000']);
    expect(out).toContain('a=sendrecv');
  });
  it('adds an fmtp line when absent and leaves SDP without Opus alone', () => {
    expect(mungeOpusSdp('a=rtpmap:111 opus/48000/2\na=sendrecv')).toContain('a=fmtp:111 minptime=10');
    expect(mungeOpusSdp('a=rtpmap:0 PCMU/8000')).toBe('a=rtpmap:0 PCMU/8000');
  });
});

describe('data channel messages', () => {
  it('encodes positions as truncated hundredths and tethers the listener to 50 m', () => {
    const msg = JSON.parse(spatialMessage({
      avatarPosition: [10.019, -2.5, 30], avatarRotation: [0, 0, 0.7071, 0.7071],
      listenerPosition: [10.019, 97.5, 30], listenerRotation: [0, 0, 0, 1] }));
    expect(msg.sp).toEqual({ x: 1001, y: -250, z: 3000 });
    expect(msg.sh).toEqual({ x: 0, y: 0, z: 70, w: 70 });
    expect(msg.lp.y).toBe(4750); // 100 m away, pulled back to -2.5 + 50 = 47.5 m
    expect(msg.lh).toEqual({ x: 0, y: 0, z: 0, w: 100 });
    expect(tetherListener([0, 0, 0], [3, 4, 0])).toEqual([3, 4, 0]);
  });

  it('chooses the ear pose by setting', () => {
    const avatar = { position: [1, 1, 1] as const, rotation: [0, 0, 0, 1] as const };
    const camera = { position: [9, 9, 9] as const, rotation: [0, 1, 0, 0] as const };
    expect(earPose(EarLocation.Camera, avatar, camera)).toBe(camera);
    expect(earPose(EarLocation.Avatar, avatar, camera)).toBe(avatar);
    expect(earPose(EarLocation.Mixed, avatar, camera)).toEqual({ position: avatar.position, rotation: camera.rotation });
  });

  it('encodes join, mute and gain', () => {
    expect(JSON.parse(joinMessage(true))).toEqual({ j: { p: true } });
    expect(JSON.parse(joinMessage(false))).toEqual({ j: {} });
    expect(JSON.parse(muteMessage({ [ID]: true }))).toEqual({ m: { [ID]: true } });
    expect(JSON.parse(userGainMessage({ [ID]: 0.5, other: -1 }))).toEqual({ ug: { [ID]: Math.trunc(0.5 * PEER_GAIN_CONVERSION_FACTOR), other: 0 } });
  });

  it('parses participant updates and skips junk', () => {
    const updates = parseVoiceData(JSON.stringify({
      [ID]: { j: { p: true }, p: 64, v: true, m: false, V: 'srv-1' },
      '22222222-2222-3333-4444-555555555555': { l: true },
      '00000000-0000-0000-0000-000000000000': { p: 1 },
      'not-a-uuid': { p: 1 }, '33333333-2222-3333-4444-555555555555': 'x',
    }));
    expect(updates).toEqual([
      { id: ID, joined: true, primary: true, level: 0.5, speaking: true, moderatorMuted: false, version: 'srv-1' },
      { id: '22222222-2222-3333-4444-555555555555', left: true },
    ]);
    expect(parseVoiceData('not json')).toEqual([]);
    expect(parseVoiceData('[1]')).toEqual([]);
    expect(parseVoiceData(JSON.stringify({ [ID]: { j: {} } }))[0].primary).toBe(false);
  });

  it('applies the viewer speaking threshold', () => {
    expect(isSpeakingLevel(0.31)).toBe(true);
    expect(isSpeakingLevel(0.3)).toBe(false);
  });
});

describe('RetryBackoff (the viewer\'s SESSION_RETRY schedule)', () => {
  it('starts at random + 0.5 s and adds random + 0.5 s per retry', () => {
    const backoff = new RetryBackoff(() => 0.25); // every draw is 0.75 s
    expect([backoff.next(), backoff.next(), backoff.next()]).toEqual([0.75, 1.5, 2.25]);
  });

  it('stops growing once the wait has reached 10 s', () => {
    const backoff = new RetryBackoff(() => 0.5); // 1 s steps: 1, 2, ... 10, then it stays at 10
    const waits = Array.from({ length: 14 }, () => backoff.next());
    expect(waits.slice(0, 3)).toEqual([1, 2, 3]);
    expect(waits[9]).toBe(MAX_RETRY_WAIT_SECONDS);
    expect(waits.slice(9)).toEqual([10, 10, 10, 10, 10]);
    // A step that overshoots the cap is allowed once (the check happens before adding), as in the viewer.
    const coarse = new RetryBackoff(() => 1); // 1.5 s steps: ..., 9, 10.5, 10.5
    const seen = Array.from({ length: 9 }, () => coarse.next());
    expect(seen.slice(-2)).toEqual([10.5, 10.5]);
  });

  it('starts over after a session comes up', () => {
    const backoff = new RetryBackoff(() => 0);
    backoff.next(); backoff.next();
    backoff.reset();
    expect(backoff.next()).toBe(0.5);
  });
});
