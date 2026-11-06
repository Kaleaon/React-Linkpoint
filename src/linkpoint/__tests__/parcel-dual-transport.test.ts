import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldViewer } from '../world';
import { slBridge } from '../sl-bridge';

// Require core session and message classes
const {
  ViewerSession,
  ParcelPropertiesUpdateMessage,
  sanitizeParcelProperties,
} = require('../../../core/viewer-session.cjs');
const { UUID } = require('@caspertech/node-metaverse');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');

describe('Dual-Transport Capability-First Parcel Update with UDP Fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ViewerSession.updateParcelProperties Transport Selection', () => {
    let session: any;
    let mockCircuit: any;
    let mockBot: any;
    let mockCaps: any;

    beforeEach(() => {
      mockCircuit = {
        sessionID: new UUID('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
        sendMessage: vi.fn(),
      };

      mockCaps = {
        getCapability: vi.fn(),
        capsPerformXMLPost: vi.fn(),
      };

      mockBot = {
        agent: {
          agentID: new UUID('11111111-2222-3333-4444-555555555555'),
        },
        currentRegion: {
          circuit: mockCircuit,
          caps: mockCaps,
        },
      };

      session = new ViewerSession(() => {});
      session.bot = mockBot;
    });

    it('Criterion 1: dispatches HTTP POST when region advertises parcel update capability', async () => {
      mockCaps.getCapability.mockImplementation(async (name: string) => {
        if (name === 'ParcelPropertiesUpdate') {
          return 'https://sim.example.com/caps/ParcelPropertiesUpdate_123';
        }
        return null;
      });
      mockCaps.capsPerformXMLPost.mockResolvedValue({ status: 'ok' });

      const result = await session.updateParcelProperties({
        localId: 42,
        name: 'Sunset Beach Parcel',
        desc: 'Relaxing oceanfront parcel',
        parcelFlags: 13,
        landingType: 1,
        passPrice: 100,
        passHours: 12,
      });

      expect(mockCaps.getCapability).toHaveBeenCalledWith('ParcelPropertiesUpdate');
      expect(mockCaps.capsPerformXMLPost).toHaveBeenCalledWith(
        'https://sim.example.com/caps/ParcelPropertiesUpdate_123',
        expect.objectContaining({
          LocalID: 42,
          local_id: 42,
          Name: 'Sunset Beach Parcel',
          name: 'Sunset Beach Parcel',
          ParcelFlags: 13,
          flags: 13,
          landing_type: 1,
          pass_price: 100,
          pass_hours: 12,
        }),
      );
      // UDP circuit must NOT have been called
      expect(mockCircuit.sendMessage).not.toHaveBeenCalled();

      // Return value contains transport metadata indicating capability execution
      expect(result).toMatchObject({
        success: true,
        transport: 'capability',
        endpoint: 'https://sim.example.com/caps/ParcelPropertiesUpdate_123',
        parcel: expect.objectContaining({
          localId: 42,
          name: 'Sunset Beach Parcel',
        }),
      });
    });

    it('Criterion 2: dispatches reliable UDP packet when no capability is advertised', async () => {
      mockCaps.getCapability.mockResolvedValue(null);

      const result = await session.updateParcelProperties({
        localId: 101,
        name: 'Legacy UDP Parcel',
        desc: 'Running on OpenSim circuit',
        parcelFlags: 7,
        musicUrl: 'https://stream.example/live',
        mediaUrl: 'https://media.example/board',
        category: 3,
      });

      expect(mockCaps.getCapability).toHaveBeenCalled();
      expect(mockCaps.capsPerformXMLPost).not.toHaveBeenCalled();

      // UDP packet must be dispatched with PacketFlags.Reliable on message ID 0xFFFF0100
      expect(mockCircuit.sendMessage).toHaveBeenCalledTimes(1);
      const [dispatchedMsg, dispatchedFlags] = mockCircuit.sendMessage.mock.calls[0];

      expect(dispatchedFlags).toBe(PacketFlags.Reliable);
      expect(dispatchedMsg).toBeInstanceOf(ParcelPropertiesUpdateMessage);
      expect(dispatchedMsg.name).toBe('ParcelPropertiesUpdate');
      expect(dispatchedMsg.id).toBe(0xffff0100 >>> 0); // 4294902016 (low-frequency 0x0100)
      expect(dispatchedMsg.ParcelData.LocalID).toBe(101);
      expect(dispatchedMsg.ParcelData.ParcelFlags).toBe(7);
      expect(dispatchedMsg.ParcelData.Name.toString('utf8')).toBe('Legacy UDP Parcel');

      expect(result).toMatchObject({
        success: true,
        transport: 'udp',
        messageId: '0xFFFF0100',
        parcel: expect.objectContaining({
          localId: 101,
          name: 'Legacy UDP Parcel',
        }),
      });
    });

    it('Criterion 3: network timeouts during capability requests trigger automatic fallback to UDP dispatch', async () => {
      mockCaps.getCapability.mockImplementation(
        () =>
          new Promise((resolve) => {
            // Delay longer than timeout
            setTimeout(() => resolve('https://sim.example.com/caps/slow_endpoint'), 200);
          }),
      );

      // Pass timeout of 50ms to verify fast fallback within < 500ms constraint
      const result = await session.updateParcelProperties({
        localId: 88,
        name: 'Timeout Fallback Land',
        timeout: 50,
      });

      // Circuit fallback dispatched
      expect(mockCircuit.sendMessage).toHaveBeenCalledTimes(1);
      const [dispatchedMsg, dispatchedFlags] = mockCircuit.sendMessage.mock.calls[0];
      expect(dispatchedFlags).toBe(PacketFlags.Reliable);
      expect(dispatchedMsg.ParcelData.LocalID).toBe(88);
      expect(dispatchedMsg.id).toBe(0xffff0100 >>> 0);

      expect(result).toMatchObject({
        success: true,
        transport: 'udp',
        messageId: '0xFFFF0100',
      });
    });

    it('Criterion 3: HTTP 404 or network errors during capability POST fall back to UDP dispatch', async () => {
      mockCaps.getCapability.mockResolvedValue('https://sim.example.com/caps/failing');
      mockCaps.capsPerformXMLPost.mockRejectedValue(new Error('HTTP 404 Not Found'));

      const result = await session.updateParcelProperties({
        localId: 77,
        name: '404 Fallback Parcel',
      });

      expect(mockCaps.capsPerformXMLPost).toHaveBeenCalled();
      expect(mockCircuit.sendMessage).toHaveBeenCalledTimes(1);
      const [dispatchedMsg, dispatchedFlags] = mockCircuit.sendMessage.mock.calls[0];
      expect(dispatchedFlags).toBe(PacketFlags.Reliable);
      expect(dispatchedMsg.ParcelData.LocalID).toBe(77);

      expect(result).toMatchObject({
        success: true,
        transport: 'udp',
      });
    });

    it('sanitizes input properties and clamps strings to protocol limits', () => {
      const sanitized = sanitizeParcelProperties({
        localId: '55',
        name: 'A'.repeat(300),
        desc: 'B'.repeat(70000),
        musicUrl: 'C'.repeat(300),
        mediaUrl: 'D'.repeat(300),
        parcelFlags: '15',
        category: '6',
        passPrice: '250',
        passHours: '48',
        authBuyerId: 'invalid-uuid-string',
      });

      expect(sanitized.localId).toBe(55);
      expect(sanitized.name.length).toBe(255);
      expect(sanitized.desc.length).toBe(65535);
      expect(sanitized.musicUrl.length).toBe(255);
      expect(sanitized.mediaUrl.length).toBe(255);
      expect(sanitized.parcelFlags).toBe(15);
      expect(sanitized.category).toBe(6);
      expect(sanitized.passPrice).toBe(250);
      expect(sanitized.passHours).toBe(48);
      expect(sanitized.authBuyerId).toBe('00000000-0000-0000-0000-000000000000');
    });
  });

  describe('ParcelPropertiesUpdateMessage Binary Layout', () => {
    it('serializes buffer matching low-frequency 0xFFFF0100 message format', () => {
      const msg = new ParcelPropertiesUpdateMessage();
      msg.AgentData.AgentID = new UUID('11111111-2222-3333-4444-555555555555');
      msg.AgentData.SessionID = new UUID('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      msg.ParcelData.LocalID = 42;
      msg.ParcelData.ParcelFlags = 0x00000005;
      msg.ParcelData.Name = Buffer.from('Binary Test Parcel', 'utf8');
      msg.ParcelData.Desc = Buffer.from('Description of Binary Test Parcel', 'utf8');
      msg.ParcelData.MusicURL = Buffer.from('https://stream.example/audio', 'utf8');
      msg.ParcelData.MediaURL = Buffer.from('https://media.example/video', 'utf8');
      msg.ParcelData.PassPrice = 120;
      msg.ParcelData.PassHours = 24.5;
      msg.ParcelData.Category = 8;
      msg.ParcelData.LandingType = 2;

      const size = msg.getSize();
      expect(size).toBeGreaterThan(100);

      const buffer = Buffer.alloc(size);
      const written = msg.writeToBuffer(buffer, 0);
      expect(written).toBe(size);

      // Verify little-endian offsets
      expect(buffer.readInt32LE(32)).toBe(42); // LocalID
      expect(buffer.readUInt32LE(36)).toBe(5); // ParcelFlags
    });
  });

  describe('slBridge and WorldViewer Integration', () => {
    it('Requirement 4: slBridge.updateParcelProperties returns transport metadata', async () => {
      const mockResult = {
        success: true,
        transport: 'capability' as const,
        endpoint: 'https://sim.example.com/caps/ParcelPropertiesUpdate_123',
        parcel: { localId: 42, name: 'Bridge Parcel' },
      };

      vi.spyOn(slBridge, 'call').mockResolvedValue(mockResult);

      const result = await slBridge.updateParcelProperties({
        localId: 42,
        name: 'Bridge Parcel',
      });

      expect(slBridge.call).toHaveBeenCalledWith('updateParcelProperties', {
        localId: 42,
        name: 'Bridge Parcel',
      });
      expect(result.transport).toBe('capability');
      expect(result.endpoint).toBe('https://sim.example.com/caps/ParcelPropertiesUpdate_123');
    });

    it('Requirement 5: WorldViewer tracks transport receipt and applies mutations to regional parcel', async () => {
      const viewer = new WorldViewer({ connected: false, on: vi.fn() });
      viewer.region = {
        name: 'Aich',
        parcel: {
          LocalID: 10,
          Name: 'Initial Name',
          Desc: 'Initial Desc',
        },
      };

      vi.spyOn(slBridge, 'call').mockResolvedValue({
        success: true,
        transport: 'capability',
      });
      (slBridge as any).connected = true;

      const changedSpy = vi.fn();
      viewer.on('parcel_changed', changedSpy);

      const success = await viewer.updateParcelProperties({
        localId: 10,
        name: 'Mutated Via Caps',
        desc: 'New verified description',
        passPrice: 50,
      });

      expect(success).toBe(true);
      expect(viewer.lastParcelTransport).toBe('capability');
      expect(viewer.lastTransportReceipt).toMatchObject({
        transport: 'capability',
        localId: 10,
      });
      expect(viewer.region.parcel.Name).toBe('Mutated Via Caps');
      expect(viewer.region.parcel.transport).toBe('capability');
      expect(changedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: 'Mutated Via Caps',
          transport: 'capability',
        }),
      );
    });

    it('Requirement 5: WorldViewer tracks UDP transport when falling back through protocol.sendPacket', async () => {
      const mockProtocol = {
        connected: true,
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        sendPacket: vi.fn().mockResolvedValue(true),
        on: vi.fn(),
      };

      const viewer = new WorldViewer(mockProtocol);
      viewer.region = {
        name: 'Da Boom',
        parcel: {
          LocalID: 25,
          Name: 'UDP Sim Land',
        },
      };

      const success = await viewer.updateParcelProperties({
        localId: 25,
        name: 'Updated via UDP circuit',
      });

      expect(success).toBe(true);
      expect(viewer.lastParcelTransport).toBe('udp');
      expect(mockProtocol.sendPacket).toHaveBeenCalledWith(
        'ParcelPropertiesUpdate',
        expect.objectContaining({
          localId: 25,
          name: 'Updated via UDP circuit',
        }),
        expect.any(Uint8Array),
      );
      expect(viewer.region.parcel.Name).toBe('Updated via UDP circuit');
      expect(viewer.region.parcel.transport).toBe('udp');
    });
  });
});
