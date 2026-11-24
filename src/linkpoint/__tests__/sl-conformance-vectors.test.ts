import { describe, it, expect } from 'vitest';
import {
  MessageIDs,
  validateOutboundViewerPacket,
  encodeWireMessageIdBytes,
  decodeWireMessageIdBytes,
  isValidMessageId,
  isViewerOutboundEligible,
} from '../sl-message-types';
import { LLSD, LLSDUUID, LLSDUndef, LLSDURI, LLSDBinary } from '../llsd';
import {
  LLSDBinaryParser,
  LLSDBinarySerializer,
  SecondLifeLLSDUtils,
  SLValidationRules,
  LSL_CONTROL_FLAGS,
  LSL_AGENT_INFO_FLAGS,
  LSL_PERMISSION_FLAGS,
  LSL_CHANGED_FLAGS,
  SL_ASSET_TYPES,
  SL_INVENTORY_TYPES,
  getLSLEventSignature,
  getLSLFunctionSignature,
  getLSLConstantValue,
  decodeLSLBitmask,
} from '../index';

describe('Second Life Conformance & TPV Guardrails', () => {
  describe('Master Message Template Outbound Viewer Packet Validation (TPV_COMPLIANCE.md §5)', () => {
    it('allows registered NotTrusted viewer packets when not UDPBlackListed', () => {
      const chatRes = validateOutboundViewerPacket({
        messageId: MessageIDs.CHAT_FROM_VIEWER,
        messageName: 'ChatFromViewer',
      });
      expect(chatRes.valid).toBe(true);
      expect(chatRes.metadata?.trust).toBe('NotTrusted');
      expect(chatRes.metadata?.encoding).toBe('Zerocoded');

      const termFriendRes = validateOutboundViewerPacket(MessageIDs.TERMINATE_FRIENDSHIP);
      expect(termFriendRes.valid).toBe(true);
      expect(termFriendRes.messageId).toBe(0xffff012c);

      const grantRightsRes = validateOutboundViewerPacket(MessageIDs.GRANT_USER_RIGHTS);
      expect(grantRightsRes.valid).toBe(true);
      expect(grantRightsRes.messageId).toBe(0xffff0140);
    });

    it('rejects Trusted simulator-only messages from viewer outbound dispatch', () => {
      for (const simOnlyId of [
        MessageIDs.CHAT_FROM_SIMULATOR,
        MessageIDs.OBJECT_UPDATE,
        MessageIDs.REGION_HANDSHAKE,
        MessageIDs.KICK_USER,
        MessageIDs.ONLINE_NOTIFICATION,
      ]) {
        expect(isValidMessageId(simOnlyId)).toBe(true);
        expect(isViewerOutboundEligible(simOnlyId)).toBe(false);
        const res = validateOutboundViewerPacket(simOnlyId);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe('trusted_simulator_only');
      }
    });

    it('rejects UDPBlackListed messages such as OpenCircuit', () => {
      const res = validateOutboundViewerPacket(MessageIDs.OPEN_CIRCUIT);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('udp_blacklisted');
    });

    it('rejects malformed, unregistered, or mismatched-name message IDs', () => {
      expect(validateOutboundViewerPacket(0).reason).toBe('invalid_message_id');
      expect(validateOutboundViewerPacket(-5).reason).toBe('invalid_message_id');
      expect(validateOutboundViewerPacket(0xffffdead).reason).toBe('unknown_message_id');
      expect(
        validateOutboundViewerPacket({
          messageId: MessageIDs.CHAT_FROM_VIEWER,
          messageName: 'AgentUpdate',
        }).reason,
      ).toBe('message_name_mismatch');
    });

    it('round-trips High, Medium, Low, and Fixed frequency wire ID bytes', () => {
      const samples = [
        { id: MessageIDs.AGENT_UPDATE, len: 1 },
        { id: MessageIDs.OBJECT_ADD, len: 2 },
        { id: MessageIDs.USE_CIRCUIT_CODE, len: 4 },
        { id: MessageIDs.PACKET_ACK, len: 4 },
      ];
      for (const s of samples) {
        const bytes = encodeWireMessageIdBytes(s.id);
        expect(bytes.byteLength).toBe(s.len);
        const decoded = decodeWireMessageIdBytes(bytes);
        expect(decoded.messageId).toBe(s.id);
        expect(decoded.bytesRead).toBe(s.len);
      }
    });
  });

  describe('LLSD XML, Notation, and Binary Codec Round-Trips', () => {
    it('round-trips sentinel types and binary buffers across XML, Notation, and Binary', () => {
      const payload = {
        agent_id: new LLSDUUID('d7f4aeca-88f1-4f73-b712-1d44876b26f5'),
        seed_cap: new LLSDURI('https://simhost.agni.lindenlab.com:12043/cap/seed'),
        empty_val: new LLSDUndef(),
        raw_bytes: new LLSDBinary(new Uint8Array([0x00, 0x7f, 0x80, 0xff])),
        direct_bytes: new Uint8Array([1, 2, 3, 4]),
        neg_zero: -0.0,
        pos_inf: Infinity,
        neg_inf: -Infinity,
        text: '  preserve   spaces & <entities>  ',
        created_at: new Date('2025-03-15T10:20:30.500Z'),
      };

      const xml = LLSD.buildXML(payload);
      const fromXml = LLSD.parseXML(xml);
      expect(fromXml.agent_id).toBe('d7f4aeca-88f1-4f73-b712-1d44876b26f5');
      expect(fromXml.seed_cap).toBe('https://simhost.agni.lindenlab.com:12043/cap/seed');
      expect(fromXml.empty_val).toBeNull();
      expect(Array.from(fromXml.raw_bytes)).toEqual([0x00, 0x7f, 0x80, 0xff]);
      expect(Array.from(fromXml.direct_bytes)).toEqual([1, 2, 3, 4]);
      expect(Object.is(fromXml.neg_zero, -0)).toBe(true);
      expect(fromXml.pos_inf).toBe(Infinity);
      expect(fromXml.neg_inf).toBe(-Infinity);
      expect(fromXml.text).toBe('  preserve   spaces & <entities>  ');
      expect(fromXml.created_at.toISOString()).toBe('2025-03-15T10:20:30.500Z');

      const notation = LLSD.buildNotation(payload, true);
      expect(notation.startsWith('<?llsd/notation?>\n')).toBe(true);
      const fromNotation = LLSD.parseNotation(notation);
      expect(fromNotation.agent_id).toBe('d7f4aeca-88f1-4f73-b712-1d44876b26f5');
      expect(fromNotation.text).toBe('  preserve   spaces & <entities>  ');
      expect(Array.from(fromNotation.direct_bytes)).toEqual([1, 2, 3, 4]);
      expect(Object.is(fromNotation.neg_zero, -0)).toBe(true);

      const binaryWithHeader = LLSD.buildBinary(payload, true);
      const fromBinary = LLSD.parseBinary(binaryWithHeader);
      expect(fromBinary.agent_id).toBe('d7f4aeca-88f1-4f73-b712-1d44876b26f5');
      expect(fromBinary.text).toBe('  preserve   spaces & <entities>  ');
      expect(Array.from(fromBinary.raw_bytes)).toEqual([0x00, 0x7f, 0x80, 0xff]);
      expect(fromBinary.created_at.getTime()).toBe(payload.created_at.getTime());

      // Also verify LLSDBinaryParser accepts <?llsd/binary?> header directly
      const parsedDoc = new LLSDBinaryParser().parse(binaryWithHeader);
      const docMap = parsedDoc.getContent() as Record<string, unknown>;
      expect(docMap.agent_id).toBe('d7f4aeca-88f1-4f73-b712-1d44876b26f5');

      // And LLSDBinarySerializer output parses cleanly via LLSD.parseBinary
      const serializedRaw = new LLSDBinarySerializer().serialize(parsedDoc);
      const reparsed = LLSD.parseBinary(serializedRaw);
      expect(reparsed.agent_id).toBe('d7f4aeca-88f1-4f73-b712-1d44876b26f5');
    });

    it('validates canonical Second Life asset-to-inventory mappings and LLSD field types', () => {
      expect(SecondLifeLLSDUtils.assetTypeToInventoryType('settings')).toBe(
        SL_INVENTORY_TYPES.SETTINGS,
      );
      expect(SecondLifeLLSDUtils.assetTypeToInventoryType('material')).toBe(
        SL_INVENTORY_TYPES.MATERIAL,
      );
      expect(SecondLifeLLSDUtils.assetTypeToInventoryType('gltf')).toBe(SL_INVENTORY_TYPES.GLTF);
      expect(SecondLifeLLSDUtils.assetTypeToInventoryType('gltfbin')).toBe(
        SL_INVENTORY_TYPES.GLTF_BIN,
      );
      expect(SecondLifeLLSDUtils.assetTypeToInventoryType('callcard')).toBe(
        SL_INVENTORY_TYPES.CALLING_CARD,
      );
      expect(SL_ASSET_TYPES.SETTINGS).toBe(56);
      expect(SL_ASSET_TYPES.MATERIAL).toBe(57);
      expect(SL_ASSET_TYPES.MESH).toBe(49);

      const rules = new SLValidationRules()
        .requireMap()
        .requireField('agent_id', 'uuid')
        .requireField('serial_number', 'integer')
        .requireField('visual_params', 'binary');

      const okRes = SecondLifeLLSDUtils.validateSLStructure(
        {
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          serial_number: 4,
          visual_params: new Uint8Array([10, 20]),
        },
        rules,
      );
      expect(okRes.isValid()).toBe(true);
      expect(okRes.getWarnings()).toHaveLength(0);

      const warnRes = SecondLifeLLSDUtils.validateSLStructure(
        {
          agent_id: 'not-a-uuid',
          serial_number: 4.5,
          visual_params: new Uint8Array([10]),
        },
        rules,
      );
      expect(warnRes.getWarnings()).toHaveLength(2);
    });
  });

  describe('Canonical LSL & SLua Reference Helpers', () => {
    it('decodes bitmasks and resolves canonical event and function signatures', () => {
      const moveMask =
        LSL_CONTROL_FLAGS.CONTROL_FWD |
        LSL_CONTROL_FLAGS.CONTROL_UP |
        LSL_CONTROL_FLAGS.CONTROL_ML_LBUTTON;
      expect(decodeLSLBitmask(moveMask, LSL_CONTROL_FLAGS)).toEqual([
        'CONTROL_FWD',
        'CONTROL_UP',
        'CONTROL_ML_LBUTTON',
      ]);

      const agentMask = LSL_AGENT_INFO_FLAGS.AGENT_FLYING | LSL_AGENT_INFO_FLAGS.AGENT_AUTOMATED;
      expect(decodeLSLBitmask(agentMask, LSL_AGENT_INFO_FLAGS)).toEqual([
        'AGENT_FLYING',
        'AGENT_AUTOMATED',
      ]);

      const permMask =
        LSL_PERMISSION_FLAGS.PERMISSION_DEBIT |
        LSL_PERMISSION_FLAGS.PERMISSION_TAKE_CONTROLS |
        LSL_PERMISSION_FLAGS.PERMISSION_TELEPORT;
      expect(decodeLSLBitmask(permMask, LSL_PERMISSION_FLAGS)).toEqual([
        'PERMISSION_DEBIT',
        'PERMISSION_TAKE_CONTROLS',
        'PERMISSION_TELEPORT',
      ]);

      const changedMask =
        LSL_CHANGED_FLAGS.CHANGED_INVENTORY | LSL_CHANGED_FLAGS.CHANGED_RENDER_MATERIAL;
      expect(decodeLSLBitmask(changedMask, LSL_CHANGED_FLAGS)).toEqual([
        'CHANGED_INVENTORY',
        'CHANGED_RENDER_MATERIAL',
      ]);

      const listenEv = getLSLEventSignature('listen');
      expect(listenEv).toBeDefined();
      expect(listenEv?.parameters).toEqual([
        { name: 'channel', type: 'integer' },
        { name: 'name', type: 'string' },
        { name: 'id', type: 'key' },
        { name: 'msg', type: 'string' },
      ]);

      // Supports both LSL ll* and SLua ll.* lookup
      const sayFn = getLSLFunctionSignature('llSay');
      const sluaSayFn = getLSLFunctionSignature('ll.Say');
      expect(sayFn).toBeDefined();
      expect(sluaSayFn).toEqual(sayFn);
      expect(sayFn?.returnType).toBe('void');
      expect(sayFn?.parameters).toEqual([
        { name: 'channel', type: 'integer' },
        { name: 'msg', type: 'string' },
      ]);

      expect(getLSLConstantValue('PRIM_GLTF_BASE_COLOR')).toBe(48);
      expect(getLSLConstantValue('EOF')).toBe('\n\n\n');
    });
  });
});
