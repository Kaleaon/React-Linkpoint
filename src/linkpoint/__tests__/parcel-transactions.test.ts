import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorldViewer,
  serializeParcelBuy,
  serializeParcelBuyPass,
  serializeParcelPropertiesUpdate,
} from '../world';
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

  describe('serializeParcelBuy', () => {
    it('serializes ParcelBuy UDP binary packet correctly with 0xffff0101 header and 67-byte length', () => {
      const payload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        groupId: '99999999-8888-7777-6666-555555555555',
        isGroupOwned: false,
        removeContribution: false,
        localId: 42,
        final: true,
        price: 1500,
        area: 4096,
      };

      const bytes = serializeParcelBuy(payload);

      // Low frequency message 257 (0x0101): 0xff, 0xff, 0x01, 0x01
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xff);
      expect(bytes[2]).toBe(0x01);
      expect(bytes[3]).toBe(0x01);

      // Total length: 4 (header) + 16 (AgentID) + 16 (SessionID) + 16 (GroupID) + 1 (IsGroupOwned) + 1 (RemoveContribution) + 4 (LocalID) + 1 (Final) + 4 (Price) + 4 (Area) = 67
      expect(bytes.length).toBe(67);

      // Flags and fields verification
      expect(bytes[52]).toBe(0); // IsGroupOwned = false
      expect(bytes[53]).toBe(0); // RemoveContribution = false

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getInt32(54, true)).toBe(42); // LocalID
      expect(bytes[58]).toBe(1); // Final = true
      expect(view.getInt32(59, true)).toBe(1500); // Price
      expect(view.getInt32(63, true)).toBe(4096); // Area
    });

    it('serializes group purchase with isGroupOwned=1 and forGroup flag', () => {
      const payload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        groupId: '99999999-8888-7777-6666-555555555555',
        forGroup: true,
        removeContribution: true,
        localId: 105,
        price: 3200,
        area: 8192,
      };

      const bytes = serializeParcelBuy(payload);
      expect(bytes.length).toBe(67);
      expect(bytes[52]).toBe(1); // isGroupOwned
      expect(bytes[53]).toBe(1); // removeContribution

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getInt32(54, true)).toBe(105);
      expect(bytes[58]).toBe(1); // final default true
      expect(view.getInt32(59, true)).toBe(3200);
      expect(view.getInt32(63, true)).toBe(8192);
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

    it('clamps strings and allocates exact buffer size without trailing nulls', () => {
      const payload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        localId: 1,
        name: 'a'.repeat(300), // Exceeds 255
        desc: 'b'.repeat(70000), // Exceeds 65535
        musicUrl: 'c'.repeat(300), // Exceeds 255
        mediaUrl: 'd'.repeat(300), // Exceeds 255
      };

      const bytes = serializeParcelPropertiesUpdate(payload);

      // Header(4) + Uuids(32) + LocalID(4) + Flags(4) + Buyer(16) + Snap(16) + Loc(12) + Look(12) +
      // Cat(1) + NameLen(1) + Name(255) + DescLen(2) + Desc(65535) + MusicLen(1) + Music(255) +
      // MediaLen(1) + Media(255) + MediaId(16) + AutoScale(1) + GroupId(16) + Price(4) + Hours(4) + Fee(4) + Landing(1)
      const expectedTotal =
        4 +
        32 +
        4 +
        4 +
        16 +
        16 +
        12 +
        12 +
        1 +
        1 +
        255 +
        2 +
        65535 +
        1 +
        255 +
        1 +
        255 +
        16 +
        1 +
        16 +
        4 +
        4 +
        4 +
        1;
      expect(bytes.length).toBe(expectedTotal);
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
        off(event: string, fn: Function) {
          if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter((cb: any) => cb !== fn);
          }
        },
        emit(event: string, ...args: any[]) {
          this.listeners[event]?.forEach((fn: any) => fn(...args));
        },
        sendPacket: vi.fn().mockImplementation(async (packetName: string, data: any) => {
          if (packetName === 'ParcelBuy') {
            const targetId = data?.localId ?? 42;
            mockProtocol.emit('ParcelProperties', {
              ParcelData: [{ LocalID: targetId, OwnerID: mockProtocol.agentId }],
            });
          }
          return true;
        }),
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
      expect(mockProtocol.sendPacket).toHaveBeenCalledWith(
        'ParcelBuy',
        expect.objectContaining({ localId: 42, price: 1500, area: 4096 }),
        expect.any(Uint8Array),
      );
      expect(viewer.region.parcel.OwnerID).toBe(mockProtocol.agentId);
      expect(boughtSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 42,
          price: 1500,
          area: 4096,
        }),
      );
    });

    it('buyParcel aborts before network transmission when balance is lower than required price', async () => {
      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1500,
          confirmedArea: 4096,
          localId: 42,
          currentBalance: 500, // Insufficient balance
        }),
      ).rejects.toThrow(/Insufficient L\$ balance: required L\$ 1,500, available L\$ 500/);

      expect(mockProtocol.sendPacket).not.toHaveBeenCalled();
      expect(viewer.region.parcel.OwnerID).toBeUndefined();
    });

    it('buyParcel rejects and preserves original ownership when simulator emits parcel_buy_failed', async () => {
      mockProtocol.sendPacket = vi.fn().mockImplementation(async () => {
        mockProtocol.emit('parcel_buy_failed', { reason: 'Land is no longer for sale' });
        return true;
      });

      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1500,
          confirmedArea: 4096,
          localId: 42,
          currentBalance: 5000,
        }),
      ).rejects.toThrow(/Land is no longer for sale/);

      expect(viewer.region.parcel.OwnerID).toBeUndefined();
    });

    it('buyParcel rejects when simulator confirms a different resident owner', async () => {
      mockProtocol.sendPacket = vi.fn().mockImplementation(async () => {
        mockProtocol.emit('ParcelProperties', {
          ParcelData: [{ LocalID: 42, OwnerID: 'different-agent-id-9999' }],
        });
        return true;
      });

      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1500,
          confirmedArea: 4096,
          localId: 42,
          currentBalance: 5000,
        }),
      ).rejects.toThrow(/Parcel purchase rejected by simulator/);

      expect(viewer.region.parcel.OwnerID).not.toBe(mockProtocol.agentId);
    });

    it('buyParcel rejects and preserves local cache when simulator confirmation times out', async () => {
      // Simulator does not respond
      mockProtocol.sendPacket = vi.fn().mockResolvedValue(true);

      await expect(
        viewer.buyParcel({
          price: 1500,
          area: 4096,
          confirmedPrice: 1500,
          confirmedArea: 4096,
          localId: 42,
          currentBalance: 2000,
          timeoutMs: 50,
        }),
      ).rejects.toThrow(/Parcel purchase confirmation timed out after 50ms/);

      expect(viewer.region.parcel.OwnerID).toBeUndefined();
    });

    it('buyParcel succeeds for group purchase and updates GroupID on positive confirmation', async () => {
      const targetGroupId = '44444444-5555-6666-7777-888888888888';
      mockProtocol.sendPacket = vi.fn().mockImplementation(async () => {
        mockProtocol.emit('ParcelProperties', {
          ParcelData: [{ LocalID: 42, GroupID: targetGroupId, isGroupOwned: true }],
        });
        return true;
      });

      const boughtSpy = vi.fn();
      viewer.on('parcel_bought', boughtSpy);

      const result = await viewer.buyParcel({
        price: 1500,
        area: 4096,
        confirmedPrice: 1500,
        confirmedArea: 4096,
        localId: 42,
        forGroup: true,
        groupId: targetGroupId,
        currentBalance: 3000,
      });

      expect(result).toBe(true);
      expect(viewer.region.parcel.GroupID).toBe(targetGroupId);
      expect(boughtSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 42,
          forGroup: true,
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
