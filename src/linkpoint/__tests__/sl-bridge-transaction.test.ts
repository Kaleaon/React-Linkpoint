import { describe, it, expect, vi, afterEach } from 'vitest';
import { SLConnectionFull } from '../sl-connection-full';
import { slBridge } from '../sl-bridge';
import slActions from '../../../core/sl-actions.cjs';

afterEach(() => {
  delete (window as any).linkpointDesktop;
  vi.restoreAllMocks();
  (slBridge as any).connected = false;
  (slBridge as any).sessionId = null;
});

describe('commitObjectTransaction Bridge and RPC dispatch', () => {
  describe('SLConnectionFull', () => {
    it('rejects commitObjectTransaction when not connected', async () => {
      const conn = new SLConnectionFull();
      (conn as any).connected = false;

      await expect(
        conn.commitObjectTransaction({
          objects: [{ localId: 100, position: [10, 20, 30] }],
        }),
      ).rejects.toThrow(/Not connected/);
    });

    it('delegates to slBridge.commitObjectTransaction when connected', async () => {
      const conn = new SLConnectionFull();
      (conn as any).connected = true;
      (slBridge as any).connected = true;

      const bridgeSpy = vi.spyOn(slBridge, 'commitObjectTransaction').mockResolvedValueOnce({
        committed: true,
        chunks: 1,
        objectsUpdated: 1,
        linksUpdated: 0,
      });

      const params = {
        objects: [{ localId: 100, position: [1, 2, 3] }],
      };

      const result = await conn.commitObjectTransaction(params);
      expect(bridgeSpy).toHaveBeenCalledWith(params);
      expect(result.committed).toBe(true);
    });
  });

  describe('slBridge', () => {
    it('dispatches commitObjectTransaction over desktop bridge IPC when linkpointDesktop is present', async () => {
      const callMock = vi.fn().mockResolvedValue({
        committed: true,
        chunks: 2,
        objectsUpdated: 5,
        linksUpdated: 2,
      });
      (window as any).linkpointDesktop = { call: callMock };
      (slBridge as any).connected = true;

      const payload = {
        objects: [{ localId: 101, position: [5, 10, 15] }],
        links: [{ parentLocalId: 100, childLocalId: 101 }],
      };

      const res = await slBridge.commitObjectTransaction(payload);

      expect(callMock).toHaveBeenCalledWith('commitObjectTransaction', payload);
      expect(res.committed).toBe(true);
      expect(res.chunks).toBe(2);
    });
  });

  describe('core/sl-actions commitObjectTransaction', () => {
    it('rejects when bot is not connected', async () => {
      await expect(slActions.commitObjectTransaction(null, {})).rejects.toThrow(
        /Not connected to Second Life/,
      );
    });

    it('encodes updates, calls bot hooks, and sends packets through circuit', async () => {
      const circuitSendMock = vi.fn();
      const botObjMock = vi.fn().mockResolvedValue(true);

      const mockBot = {
        agent: { agentID: '11111111-2222-3333-4444-555555555555' },
        currentRegion: {
          circuit: {
            sessionID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            sendMessage: circuitSendMock,
          },
        },
        clientCommands: {
          objects: {
            commitObjectTransaction: botObjMock,
          },
        },
      };

      const params = {
        objects: [
          {
            localId: 505,
            position: [128, 128, 25],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        ],
        links: [
          {
            parentLocalId: 500,
            childLocalId: 505,
          },
        ],
        delinks: [
          {
            localId: 506,
          },
        ],
      };

      const result = await slActions.commitObjectTransaction(mockBot, params);

      expect(result.committed).toBe(true);
      expect(result.objectsUpdated).toBe(1);
      expect(result.linksUpdated).toBe(2);
      expect(botObjMock).toHaveBeenCalledWith(params);
      expect(circuitSendMock).toHaveBeenCalled();
    });

    it('enforces <= 1200 byte chunks on batch packet generation in slActions', async () => {
      const circuitSendMock = vi.fn();
      const mockBot = {
        agent: { agentID: '11111111-2222-3333-4444-555555555555' },
        circuit: {
          sessionID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sendMessage: circuitSendMock,
        },
      };

      // 70 objects with position, rotation, scale = 210 entries. Exceeds 1200 bytes.
      const objects = [];
      for (let i = 1; i <= 70; i++) {
        objects.push({
          localId: 2000 + i,
          position: [i, i, i],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        });
      }

      const result = await slActions.commitObjectTransaction(mockBot, { objects });

      expect(result.committed).toBe(true);
      expect(result.chunks).toBeGreaterThan(1);
      expect(circuitSendMock.mock.calls.length).toBe(result.chunks);
    });
  });
});
