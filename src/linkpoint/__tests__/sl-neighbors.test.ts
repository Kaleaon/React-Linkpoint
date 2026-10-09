import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  NeighborRegions,
  createRemoteCaps,
  decodeHandle,
  decodeIp,
  originOf,
} = require('../../../core/sl-neighbors.cjs');
const LLSD = require('@caspertech/llsd');

// Region handle of the region whose south-west corner is 256000, 256256: x in the high 32 bits, y in the low.
const NORTH = (256000n << 32n) | 256512n;
const handleBytes = (h: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(h);
  return b;
};
const enable = (h: bigint, ip: number[], port: number) => ({
  message: 'EnableSimulator',
  body: {
    SimulatorInfo: [{ Handle: { octets: [...handleBytes(h)] }, IP: { octets: ip }, Port: port }],
  },
});
const establish = (host: string, seed: string) => ({
  message: 'EstablishAgentCommunication',
  body: { 'agent-id': 'x', 'sim-ip-and-port': host, 'seed-capability': seed },
});

function fakeCaps(voiceServerType: string | null) {
  return {
    getCapability: vi.fn(async (name: string) => `https://sim/${name}`),
    capsPerformXMLGet: vi.fn(async () =>
      voiceServerType ? { VoiceServerType: voiceServerType } : {},
    ),
    capsPerformXMLPost: vi.fn(async () => ({})),
  };
}

describe('decoding the event-queue values', () => {
  it('reads a handle from the 8 big-endian bytes, as LLSD binary or a Buffer, and finds the origin', () => {
    expect(decodeHandle({ octets: [...handleBytes(NORTH)] })).toBe(NORTH.toString());
    expect(decodeHandle(handleBytes(NORTH))).toBe(NORTH.toString());
    expect(decodeHandle(NORTH)).toBe(NORTH.toString());
    expect(decodeHandle({ octets: [1, 2, 3] })).toBeNull();
    expect(originOf(NORTH.toString())).toEqual([256000, 256512]);
  });

  it('reads an IPv4 address from 4 bytes', () => {
    expect(decodeIp({ octets: [127, 0, 0, 1] })).toBe('127.0.0.1');
    expect(decodeIp('10.1.2.3')).toBe('10.1.2.3');
    expect(decodeIp({ octets: [1, 2] })).toBeNull();
  });
});

describe('NeighborRegions', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('lists a neighbour once it has a seed capability and its SimulatorFeatures say webrtc', async () => {
    const caps = fakeCaps('webrtc');
    const changes: unknown[] = [];
    const n = new NeighborRegions({
      makeCaps: () => caps,
      onChange: (l: unknown) => changes.push(l),
    });
    n.handleEvents([enable(NORTH, [10, 0, 0, 5], 13001)]);
    expect(n.list()).toEqual([]);
    n.handleEvents([establish('10.0.0.5:13001', 'https://sim/seed')]);
    await flush();
    expect(n.list()).toEqual([{ handle: NORTH.toString(), originX: 256000, originY: 256512 }]);
    expect(changes.at(-1)).toEqual(n.list());
    expect(n.capsFor(NORTH)).toBe(caps);
  });

  it('works when the seed arrives before the simulator is enabled', async () => {
    const n = new NeighborRegions({ makeCaps: () => fakeCaps('webrtc') });
    n.handleEvents([establish('10.0.0.5:13001', 'https://sim/seed')]);
    n.handleEvents([enable(NORTH, [10, 0, 0, 5], 13001)]);
    await flush();
    expect(n.list()).toHaveLength(1);
  });

  it('leaves out regions that do not offer webrtc voice, or whose features cannot be read', async () => {
    const type: string | null = 'vivox';
    const n = new NeighborRegions({ makeCaps: () => fakeCaps(type) });
    n.handleEvents([enable(NORTH, [10, 0, 0, 5], 13001), establish('10.0.0.5:13001', 's')]);
    await flush();
    expect(n.list()).toEqual([]);
    const failing = new NeighborRegions({
      makeCaps: () => ({
        getCapability: async () => {
          throw new Error('nope');
        },
        capsPerformXMLGet: async () => ({}),
        capsPerformXMLPost: async () => ({}),
      }),
    });
    failing.handleEvents([enable(NORTH, [10, 0, 0, 6], 1), establish('10.0.0.6:1', 's')]);
    await flush();
    expect(failing.list()).toEqual([]);
  });

  it('ignores malformed events', () => {
    const n = new NeighborRegions({ makeCaps: () => fakeCaps('webrtc') });
    expect(() =>
      n.handleEvents([
        { message: 'EnableSimulator', body: {} },
        { message: 'EstablishAgentCommunication', body: { 'sim-ip-and-port': 3 } },
        null,
        { message: 'Other' },
      ]),
    ).not.toThrow();
    expect(n.list()).toEqual([]);
  });

  it('crossing a border: the new region stops being a neighbour and the old one becomes one', async () => {
    const north = fakeCaps('webrtc');
    const home = fakeCaps('webrtc');
    const HOME = (256000n << 32n) | 256256n;
    const n = new NeighborRegions({ makeCaps: () => north });
    n.setCurrent(HOME.toString(), home);
    n.handleEvents([enable(NORTH, [10, 0, 0, 5], 13001), establish('10.0.0.5:13001', 's')]);
    await flush();
    expect(n.list().map((e: any) => e.handle)).toEqual([NORTH.toString()]);
    expect(n.capsFor(HOME)).toBe(home);
    n.setCurrent(NORTH.toString(), north);
    await flush();
    expect(n.list().map((e: any) => e.handle)).toEqual([HOME.toString()]);
    expect(n.capsFor(NORTH)).toBe(north); // now the current region's
  });
});

describe('createRemoteCaps (plain HTTP LLSD)', () => {
  it('asks the seed for the voice capabilities once and posts LLSD/XML', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body });
      const text =
        url === 'https://seed'
          ? LLSD.LLSD.formatXML({
              ProvisionVoiceAccountRequest: 'https://sim/provision',
              VoiceSignalingRequest: 'https://sim/signal',
              SimulatorFeatures: 'https://sim/features',
            })
          : LLSD.LLSD.formatXML({ ok: true });
      return { ok: true, status: 200, text: async () => text };
    });
    const caps = createRemoteCaps('https://seed', fetchImpl);
    expect(await caps.getCapability('ProvisionVoiceAccountRequest')).toBe('https://sim/provision');
    expect(await caps.getCapability('VoiceSignalingRequest')).toBe('https://sim/signal');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // one seed request
    expect(calls[0].body).toContain('ProvisionVoiceAccountRequest');
    expect(
      await caps.capsPerformXMLPost('https://sim/provision', { jsep: { type: 'offer' } }),
    ).toEqual({ ok: true });
    expect(calls[1].body).toContain('<key>jsep</key>');
    await expect(caps.getCapability('Nope')).rejects.toThrow('not available');
  });

  it('reports an HTTP failure', async () => {
    const caps = createRemoteCaps('https://seed', async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    }));
    await expect(caps.getCapability('x')).rejects.toThrow('HTTP 500');
  });
});

describe('ViewerSession voice with a neighbour', () => {
  const { ViewerSession } = require('../../../core/viewer-session.cjs');
  const HOME = (256000n << 32n) | 256256n;

  it('provisions on the named neighbour, and sends signaling and logout to the region that provisioned the session', async () => {
    const s = new ViewerSession(() => undefined);
    const homeCaps = {
      getCapability: async (n: string) => `https://home/${n}`,
      capsPerformXMLPost: vi.fn(async (..._args: any[]) => ({
        viewer_session: 'home-session',
        jsep: { type: 'answer', sdp: 's' },
      })),
    };
    const northCaps = {
      getCapability: async (n: string) => `https://north/${n}`,
      capsPerformXMLPost: vi.fn(async (..._args: any[]) => ({
        viewer_session: 'north-session',
        jsep: { type: 'answer', sdp: 's' },
      })),
    };
    s.currentRegion = () => ({ caps: homeCaps, regionHandle: { toString: () => HOME.toString() } });
    s.neighbors = new NeighborRegions({ makeCaps: () => northCaps });
    s.neighbors.handleEvents([
      enable(NORTH, [10, 0, 0, 5], 13001),
      establish('10.0.0.5:13001', 's'),
    ]);
    s.neighbors.byHandle.get(NORTH.toString()).webrtc = true;

    const offer = {
      jsep: { type: 'offer', sdp: 'S' },
      channel_type: 'local',
      voice_server_type: 'webrtc',
      parcel_local_id: -1,
    };
    await s.voiceProvision({ body: offer });
    await s.voiceProvision({ body: offer, regionHandle: NORTH.toString() });
    expect(homeCaps.capsPerformXMLPost.mock.calls[0][0]).toBe(
      'https://home/ProvisionVoiceAccountRequest',
    );
    expect(northCaps.capsPerformXMLPost.mock.calls[0][0]).toBe(
      'https://north/ProvisionVoiceAccountRequest',
    );

    await s.voiceSignal({
      body: {
        viewer_session: 'north-session',
        voice_server_type: 'webrtc',
        candidates: [{ candidate: 'c' }],
      },
    });
    expect(northCaps.capsPerformXMLPost.mock.calls[1][0]).toBe(
      'https://north/VoiceSignalingRequest',
    );
    await s.voiceLogout({ viewerSession: 'north-session' });
    expect(northCaps.capsPerformXMLPost.mock.calls[2][1]).toMatchObject({
      logout: true,
      viewer_session: 'north-session',
    });
    expect(homeCaps.capsPerformXMLPost).toHaveBeenCalledTimes(1);

    await expect(s.voiceProvision({ body: offer, regionHandle: '123' })).rejects.toThrow(
      'not available in that region',
    );
    await expect(s.voiceProvision({ body: offer, regionHandle: 'abc' })).rejects.toThrow(
      'must be a number',
    );
  });
});
