import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLConnectionFull } from '../sl-connection-full';
import { slBridge } from '../sl-bridge';

const connected = () => {
  const c = new SLConnectionFull();
  (c as any).connected = true;
  (slBridge as any).connected = true;
  return c;
};
afterEach(() => {
  delete (window as any).linkpointDesktop;
  vi.restoreAllMocks();
  (slBridge as any).connected = false;
  (slBridge as any).sessionId = null;
});

describe('viewer actions on the client', () => {
  it('refuse to run while not connected', async () => {
    const c = new SLConnectionFull();
    await expect(c.teleportTo('Ahern')).rejects.toThrow(/Not connected/);
    await expect(c.touchObject({ id: 'x' })).rejects.toThrow(/Not connected/);
    await expect(c.stand()).rejects.toThrow(/Not connected/);
    await expect(c.setMovement({ forward: 1 })).rejects.toThrow(/Not connected/);
  });

  it('use the desktop bridge when it is present', async () => {
    const call = vi.fn(async (method: string) =>
      method === 'teleport'
        ? { requested: { region: 'Ahern', x: 1, y: 2, z: 3 }, message: 'ok' }
        : method === 'touchObject'
          ? { touched: 'abc' }
          : method === 'setMovement'
            ? { moving: true }
            : { sitting: 'ground' },
    );
    (window as any).linkpointDesktop = { call };
    const c = connected();
    const seen = vi.fn();
    c.on('teleport_requested', seen);
    await expect(c.teleportTo('secondlife://Ahern/1/2/3')).resolves.toMatchObject({
      message: 'ok',
    });
    expect(call).toHaveBeenCalledWith('teleport', { destination: 'secondlife://Ahern/1/2/3' });
    expect(seen).toHaveBeenCalledOnce();
    await c.touchObject({ id: 'abc', face: 1 });
    expect(call).toHaveBeenCalledWith('touchObject', { id: 'abc', face: 1 });
    await c.sit();
    expect(call).toHaveBeenCalledWith('sit', { id: undefined });
    await expect(c.setMovement({ forward: 1, right: -1, run: true })).resolves.toEqual({
      moving: true,
    });
    expect(call).toHaveBeenCalledWith('setMovement', { forward: 1, right: -1, run: true });
  });

  it('fall back to the web server with the session id and surface its error message', async () => {
    (slBridge as any).connected = true;
    (slBridge as any).sessionId = 'sess-1';
    const fetchMock = vi.fn(async (_url: string, _init?: any) => ({
      ok: true,
      json: async () => ({ requested: { region: 'Ahern', x: 1, y: 2, z: 3 }, message: '' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const c = connected();
    await c.teleportTo('Ahern/1/2/3');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sl/call');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sessionId: 'sess-1',
      method: 'teleport',
      params: { destination: 'Ahern/1/2/3' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Coordinates must be within the region (0-256)' }),
      })),
    );
    await expect(c.teleportTo('Ahern/999/2/3')).rejects.toThrow(
      'Coordinates must be within the region (0-256)',
    );
    vi.unstubAllGlobals();
  });

  it('enforces requireConnected and actionGuard before emitting teleport_started across all four teleport methods', async () => {
    const disconnected = new SLConnectionFull();
    const startedDisconnected = vi.fn();
    disconnected.on('teleport_started', startedDisconnected);
    await expect(disconnected.teleportTo('Ahern')).rejects.toThrow(/Not connected/);
    await expect(
      disconnected.teleportCoordinate({ region: 'Ahern', x: 10, y: 20, z: 30 }),
    ).rejects.toThrow(/Not connected/);
    await expect(disconnected.teleportHome()).rejects.toThrow(/Not connected/);
    await expect(disconnected.acceptLure('lure-1', 'sender-1', 'Sam')).rejects.toThrow(
      /Not connected/,
    );
    expect(startedDisconnected).not.toHaveBeenCalled();

    const guarded = connected();
    guarded.actionGuard = (action, detail) =>
      action === 'teleport'
        ? 'Blocked by @tploc'
        : action === 'acceptLure' && detail?.senderId === 'blocked-sender'
          ? 'Blocked by @tplure'
          : null;
    const startedGuarded = vi.fn();
    guarded.on('teleport_started', startedGuarded);

    await expect(guarded.teleportTo('Ahern')).rejects.toThrow('Blocked by @tploc');
    await expect(
      guarded.teleportCoordinate({ region: 'Ahern', x: 10, y: 20, z: 30 }),
    ).rejects.toThrow('Blocked by @tploc');
    await expect(guarded.teleportHome()).rejects.toThrow('Blocked by @tploc');
    await expect(guarded.acceptLure('lure-1', 'blocked-sender', 'Sam')).rejects.toThrow(
      'Blocked by @tplure',
    );
    expect(startedGuarded).not.toHaveBeenCalled();
  });

  it('runs shared session lifecycle and yields one animation frame at 90% arriving for teleportCoordinate, teleportHome, and acceptLure', async () => {
    const call = vi.fn(async (method: string, params?: any) => {
      if (method === 'teleport') {
        return { requested: { region: params.region || 'Ahern', x: 1, y: 2, z: 3 }, message: 'ok' };
      }
      if (method === 'teleportHome') {
        return { requested: 'home' };
      }
      return { accepted: true, message: 'Arrived' };
    });
    (window as any).linkpointDesktop = { call };

    const c = connected();
    const events: string[] = [];
    c.on('teleport_started', (d: any) => events.push(`start:${d.destination}`));
    c.on('teleport_progress', (d: any) => events.push(`${d.phase}:${d.percent}`));
    c.on('teleport_completed', (d: any) => events.push(`done:${d.regionName}`));

    await c.teleportCoordinate({ region: 'Morris', x: 10, y: 20, z: 31 });
    expect(call).toHaveBeenCalledWith('teleport', { region: 'Morris', x: 10, y: 20, z: 31 });
    expect(events).toEqual([
      'start:Morris/10/20/31',
      'initiating:15',
      'contacting:40',
      'preparing:65',
      'arriving:90',
      'done:Morris',
    ]);

    events.length = 0;
    await c.teleportHome();
    expect(call).toHaveBeenCalledWith('teleportHome', undefined);
    expect(events).toEqual([
      'start:Home',
      'initiating:15',
      'contacting:40',
      'preparing:65',
      'arriving:90',
      'done:Home',
    ]);

    events.length = 0;
    await c.acceptLure('lure-7', 'sender-7', 'Pat Resident');
    expect(call).toHaveBeenCalledWith('acceptLure', { id: 'lure-7' });
    expect(events).toEqual([
      'start:Pat Resident',
      'initiating:15',
      'contacting:40',
      'preparing:65',
      'arriving:90',
      'done:Pat Resident',
    ]);
  });
});

describe('L$ balance', () => {
  it('is unknown until the grid answers, then the reported value', async () => {
    const c = connected();
    expect(c.balance).toBeNull();
    (window as any).linkpointDesktop = { call: vi.fn(async () => ({ balance: 4321 })) };
    const updates: Array<number | null> = [];
    c.on('balance_updated', (v: number | null) => updates.push(v));
    expect(await c.refreshBalance()).toBe(4321);
    expect(c.balance).toBe(4321);
    expect(updates).toEqual([4321]);
  });

  it('goes back to unknown when the request fails or returns nonsense, never keeping a stale value', async () => {
    const c = connected();
    (c as any).balance = 100;
    (window as any).linkpointDesktop = {
      call: vi.fn(async () => {
        throw new Error('timeout');
      }),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await c.refreshBalance()).toBeNull();
    expect(c.balance).toBeNull();
    (window as any).linkpointDesktop = { call: vi.fn(async () => ({ balance: Number.NaN })) };
    expect(await c.refreshBalance()).toBeNull();
  });

  it('is null when not connected', async () => {
    const c = new SLConnectionFull();
    (c as any).balance = 55;
    expect(await c.refreshBalance()).toBeNull();
    expect(c.balance).toBeNull();
  });
});
