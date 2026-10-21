import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldViewer, serializeParcelBuyPass, serializeParcelPropertiesUpdate } from '../world';
import { slBridge } from '../sl-bridge';

describe('Parcel Land Transaction Controls & Serialization', () => {
  describe('serializeParcelBuyPass', () => {
    it('serializes ParcelBuyPass UDP binary packet correctly', () => {
      const payload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        localId: 42,
      };

      const bytes = serializeParcelBuyPass(payload);

      // Low frequency header: 0xff, 0xff, 0x00, 0xff (255)
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xff);
      expect(bytes[2]).toBe(0x00);
      expect(bytes[3]).toBe(0xff);

      // Total length = 4 + 16 (AgentID) + 16 (SessionID) + 4 (LocalID) = 40
      expect(bytes.length).toBe(40);

      // LocalID at offset 36 (little endian S32)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getInt32(36, true)).toBe(42);
    });
  });

  describe('serializeParcelPropertiesUpdate', () => {
    it('serializes ParcelPropertiesUpdate UDP binary packet correctly', () => {
      const payload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        localId: 101,
        parcelFlags: 0x00000001 | 0x00000002, // Fly + Scripts
        category: 11, // Park
        name: 'Test Park',
        desc: 'A nice community space',
        musicUrl: 'https://stream.example/audio',
        mediaUrl: 'https://media.example/board',
        passPrice: 100,
        passHours: 12,
        landingType: 1,
      };

      const bytes = serializeParcelPropertiesUpdate(payload);

      // Low frequency header: 0xff, 0xff, 0x01, 0x00 (256)
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xff);
      expect(bytes[2]).toBe(0x01);
      expect(bytes[3]).toBe(0x00);

      expect(bytes.length).toBeGreaterThan(100);

      // Check LocalID at offset 36
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getInt32(36, true)).toBe(101);
      expect(view.getUint32(40, true)).toBe(0x00000003);
    });
  });

  describe('WorldViewer Land Transaction Methods', () => {
    let mockProtocol: any;
    let viewer: WorldViewer;

    beforeEach(() => {
      mockProtocol = {
        connected: true,
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        listeners: {} as Record<string, Function[]>,
        on(event: string, fn: Function) {
          if (!this.listeners[event]) this.listeners[event] = [];
          this.listeners[event].push(fn);
        },
        sendPacket: vi.fn().mockResolvedValue(true),
      };

      viewer = new WorldViewer(mockProtocol);
      viewer.region = {
        name: 'Da Boom',
        parcel: {
          LocalID: 42,
          Name: 'Original Parcel',
          Desc: 'Original Description',
          Area: 4096,
          SalePrice: 1500,
          PassPrice: 50,
          PassHours: 24,
        },
      };
    });

    it('buyPass dispatches ParcelBuyPass packet and emits parcel_pass_purchased', async () => {
      const passSpy = vi.fn();
      viewer.on('parcel_pass_purchased', passSpy);

      const result = await viewer.buyPass(42);

      expect(result).toBe(true);
      expect(mockProtocol.sendPacket).toHaveBeenCalledWith(
        'ParcelBuyPass',
        expect.objectContaining({ localId: 42 }),
        expect.any(Uint8Array),
      );
      expect(passSpy).toHaveBeenCalledWith(
        expect.objectContaining({ localId: 42, agentId: mockProtocol.agentId }),
      );
    });

    it('updateParcelProperties updates local state, sends packet, and emits parcel_changed', async () => {
      const changedSpy = vi.fn();
      viewer.on('parcel_changed', changedSpy);

      const result = await viewer.updateParcelProperties({
        localId: 42,
        name: 'Updated Parcel Name',
        desc: 'Updated Description',
        passPrice: 75,
        category: 6,
      });

      expect(result).toBe(true);
      expect(mockProtocol.sendPacket).toHaveBeenCalledWith(
        'ParcelPropertiesUpdate',
        expect.objectContaining({
          localId: 42,
          name: 'Updated Parcel Name',
          desc: 'Updated Description',
          passPrice: 75,
          category: 6,
        }),
        expect.any(Uint8Array),
      );

      expect(viewer.region.parcel.Name).toBe('Updated Parcel Name');
      expect(viewer.region.parcel.Desc).toBe('Updated Description');
      expect(viewer.region.parcel.PassPrice).toBe(75);
      expect(changedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: 'Updated Parcel Name',
          Desc: 'Updated Description',
          PassPrice: 75,
        }),
      );
    });

    it('buyParcel fails if price or area confirmation is missing or incorrect', async () => {
      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1000, // Mismatched price
          confirmedArea: 4096,
        }),
      ).rejects.toThrow(/confirmed price \(1000\) does not match required price \(1500\)/);

      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1500,
          confirmedArea: 2048, // Mismatched area
        }),
      ).rejects.toThrow(
        /confirmed area \(2048 sq.m.\) does not match required area \(4096 sq.m.\)/,
      );
    });

    it('buyParcel succeeds when price and area confirmations match', async () => {
      const boughtSpy = vi.fn();
      viewer.on('parcel_bought', boughtSpy);

      const result = await viewer.buyParcel({
        price: 1500,
        area: 4096,
        confirmedPrice: 1500,
        confirmedArea: 4096,
        localId: 42,
      });

      expect(result).toBe(true);
      expect(boughtSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 42,
          price: 1500,
          area: 4096,
        }),
      );
    });

    it('subdivideParcel fails if boundary vertices confirmation is missing or mismatched', async () => {
      const vertices: [number, number][] = [
        [0, 0],
        [16, 0],
        [16, 16],
        [0, 16],
      ];

      await expect(
        viewer.subdivideParcel({
          boundaryVertices: vertices,
          confirmedVertices: [
            [0, 0],
            [16, 0],
          ], // Mismatched length
        }),
      ).rejects.toThrow(/confirmed boundary vertices do not match/);
    });

    it('subdivideParcel succeeds when boundary vertices match confirmation', async () => {
      const vertices: [number, number][] = [
        [0, 0],
        [16, 0],
        [16, 16],
        [0, 16],
      ];
      const subSpy = vi.fn();
      viewer.on('parcel_subdivided', subSpy);

      const result = await viewer.subdivideParcel({
        boundaryVertices: vertices,
        confirmedVertices: vertices,
        localId: 42,
      });

      expect(result).toBe(true);
      expect(subSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 42,
          boundaryVertices: vertices,
        }),
      );
    });

    it('reclaimParcel dispatches reclaim and emits parcel_reclaimed', async () => {
      const reclaimSpy = vi.fn();
      viewer.on('parcel_reclaimed', reclaimSpy);

      const result = await viewer.reclaimParcel(42);

      expect(result).toBe(true);
      expect(reclaimSpy).toHaveBeenCalledWith(expect.objectContaining({ localId: 42 }));
    });
  });
});
