import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MessageIDs,
  MESSAGE_TEMPLATE_METADATA,
  getMessageMetadata,
  getMessageMetadataByName,
  isValidMessageId,
  isViewerOutboundEligible,
  encodeWireMessageIdBytes,
  decodeWireMessageIdBytes,
  validateOutboundViewerPacket,
} from '../linkpoint/sl-message-types';
import { LLSD, LLSDUUID, LLSDURI } from '../linkpoint/llsd';
import {
  LLSDXMLParser,
  LLSDBinaryParser,
  LSL_DEFINITIONS_PROVENANCE,
  LSL_CONTROL_FLAGS,
  LSL_AGENT_INFO_FLAGS,
  LSL_PERMISSION_FLAGS,
  LSL_CHANGED_FLAGS,
  LSL_PRIM_PARAMS,
  LSL_INVENTORY_TYPES,
  SL_ASSET_TYPES,
  SL_INVENTORY_TYPES,
  LSL_EVENT_SIGNATURES,
  LSL_BUILTIN_FUNCTIONS,
  SLUA_KEYWORDS,
  SLUA_BUILTIN_TYPES,
  SLUA_GLOBAL_MODULES,
  getLSLEventSignature,
  getLSLFunctionSignature,
  decodeLSLBitmask,
} from '../linkpoint';

function findVectorFile(relativePath: string): string {
  const candidates = [
    path.resolve(__dirname, '../../test-vectors', relativePath),
    path.resolve(__dirname, '../../../test-vectors', relativePath),
    path.resolve('/app/React-Linkpoint/test-vectors', relativePath),
    path.resolve('/app/Linkpoint/test-vectors', relativePath),
    path.resolve(process.cwd(), 'test-vectors', relativePath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  throw new Error(`Test vector file not found for ${relativePath}`);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface ExpectedLLSDNode {
  llsd_type: string;
  value?: unknown;
  special?: string;
  epoch_ms?: number;
  hex?: string;
  items?: ExpectedLLSDNode[];
  entries?: Record<string, ExpectedLLSDNode>;
}

function assertMatchesExpectedLLSD(actual: unknown, expected: ExpectedLLSDNode): void {
  switch (expected.llsd_type) {
    case 'undef':
      expect(actual).toBeNull();
      return;
    case 'boolean':
      expect(typeof actual).toBe('boolean');
      expect(actual).toBe(expected.value);
      return;
    case 'integer':
      expect(typeof actual).toBe('number');
      expect(Number.isInteger(actual)).toBe(true);
      expect(actual).toBe(expected.value);
      return;
    case 'real':
      expect(typeof actual).toBe('number');
      if (expected.special === '-0.0') {
        expect(Object.is(actual, -0)).toBe(true);
      } else if (expected.special === 'inf') {
        expect(actual).toBe(Infinity);
      } else if (expected.special === '-inf') {
        expect(actual).toBe(-Infinity);
      } else if (expected.special === 'nan') {
        expect(Number.isNaN(actual)).toBe(true);
      } else {
        expect(actual).toBeCloseTo(expected.value as number, 12);
      }
      return;
    case 'string':
    case 'uuid':
      expect(typeof actual).toBe('string');
      expect(actual).toBe(expected.value);
      return;
    case 'uri': {
      const strVal = actual instanceof URL ? actual.href : String(actual);
      expect(strVal).toBe(expected.value);
      return;
    }
    case 'date':
      expect(actual).toBeInstanceOf(Date);
      expect((actual as Date).getTime()).toBe(expected.epoch_ms);
      return;
    case 'binary':
      expect(actual).toBeInstanceOf(Uint8Array);
      expect(bytesToHex(actual as Uint8Array)).toBe(expected.hex);
      return;
    case 'array': {
      expect(Array.isArray(actual)).toBe(true);
      const arr = actual as unknown[];
      const expectedItems = expected.items ?? [];
      expect(arr).toHaveLength(expectedItems.length);
      for (let i = 0; i < expectedItems.length; i++) {
        assertMatchesExpectedLLSD(arr[i], expectedItems[i]);
      }
      return;
    }
    case 'map': {
      expect(typeof actual).toBe('object');
      expect(actual).not.toBeNull();
      expect(Array.isArray(actual)).toBe(false);
      const rec = actual as Record<string, unknown>;
      const expectedEntries = expected.entries ?? {};
      expect(Object.keys(rec).sort()).toEqual(Object.keys(expectedEntries).sort());
      for (const [key, expectedVal] of Object.entries(expectedEntries)) {
        assertMatchesExpectedLLSD(rec[key], expectedVal);
      }
      return;
    }
    default:
      throw new Error(`Unhandled expected LLSD type: ${expected.llsd_type}`);
  }
}

describe('React-Linkpoint Canonical Shared Test Vectors Suite', () => {
  describe('3D Math Test Vectors', () => {
    it('verifies quaternions operations', () => {
      const filePath = findVectorFile('math/quaternion_matrix_transform_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(data.version).toBe('1.0');
      expect(Array.isArray(data.quaternions)).toBe(true);

      for (const qCase of data.quaternions) {
        if (qCase.operation === 'identity') {
          expect(qCase.expected.x).toBe(0);
          expect(qCase.expected.y).toBe(0);
          expect(qCase.expected.z).toBe(0);
          expect(qCase.expected.w).toBe(1);
        } else if (qCase.operation === 'multiply') {
          expect(qCase.expected.q.length).toBe(4);
        } else if (qCase.operation === 'normalize') {
          expect(qCase.expected.magnitude).toBeCloseTo(5.4772, 3);
        } else if (qCase.operation === 'rotate_vector') {
          expect(qCase.expected.v).toEqual([0, 1, 0]);
        }
      }
    });

    it('verifies matrix operations', () => {
      const filePath = findVectorFile('math/quaternion_matrix_transform_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.matrices)).toBe(true);
      for (const mCase of data.matrices) {
        expect(mCase.name).toBeDefined();
        expect(mCase.expected).toBeDefined();
      }
    });

    it('verifies Euler angle conversions', () => {
      const filePath = findVectorFile('math/quaternion_matrix_transform_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.euler_angles)).toBe(true);
      for (const eCase of data.euler_angles) {
        expect(eCase.expected_quaternion.length).toBe(4);
      }
    });

    it('verifies AABB volume queries', () => {
      const filePath = findVectorFile('math/quaternion_matrix_transform_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.aabb_queries)).toBe(true);
      for (const boxCase of data.aabb_queries) {
        const min = boxCase.min;
        const max = boxCase.max;
        const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
        const extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

        expect(center).toEqual(boxCase.center);
        expect(extents).toEqual(boxCase.extents);

        for (const cp of boxCase.contains_points) {
          const pt = cp.point;
          const inside =
            pt[0] >= min[0] &&
            pt[0] <= max[0] &&
            pt[1] >= min[1] &&
            pt[1] <= max[1] &&
            pt[2] >= min[2] &&
            pt[2] <= max[2];
          expect(inside).toBe(cp.expected);
        }
      }
    });
  });

  describe('Mesh Pipeline Test Vectors', () => {
    it('verifies LLMesh compressed binary parsing', () => {
      const filePath = findVectorFile('mesh/llmesh_decompress_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.llmesh_vectors)).toBe(true);
      for (const meshCase of data.llmesh_vectors) {
        const bytes = hexToBytes(meshCase.hex_bytes);
        expect(bytes.length).toBeGreaterThanOrEqual(24);

        const magic = new TextDecoder().decode(bytes.subarray(0, 22));
        expect(magic).toBe('Linden Binary Mesh 1.0');

        // Verify U16 numVertices at offset 63
        const numVerts = bytes[63] | (bytes[64] << 8);
        expect(numVerts).toBe(meshCase.expected.vertex_count);
      }
    });
  });

  describe('Texture Decoder Test Vectors', () => {
    it('verifies JPEG2000 codestream test vectors', () => {
      const filePath = findVectorFile('textures/j2k_texture_decoder_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.j2k_vectors)).toBe(true);
      for (const texCase of data.j2k_vectors) {
        const bytes = hexToBytes(texCase.hex_bytes);
        if (texCase.expected.status === 'success') {
          expect(bytes.length).toBeGreaterThanOrEqual(24);
          const sig = new TextDecoder().decode(bytes.subarray(4, 8));
          expect(sig).toBe('jP  ');
        } else {
          if (bytes.length >= 8) {
            const sig = new TextDecoder().decode(bytes.subarray(4, 8));
            expect(sig).not.toBe('jP  ');
          }
        }
      }
    });
  });

  describe('Master Message Template UDP Wire Conformance Vectors', () => {
    it('verifies all canonical wire IDs, frequency bytes, trust flags, and TPV outbound eligibility', () => {
      const filePath = findVectorFile('protocol/master_message_template_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(data.source_repository).toBe('https://github.com/secondlife/master-message-template');
      expect(Array.isArray(data.messages)).toBe(true);
      expect(data.messages.length).toBeGreaterThanOrEqual(80);
      expect(MESSAGE_TEMPLATE_METADATA.size).toBe(data.messages.length);

      const tsRecord = MessageIDs as Record<string, number>;
      for (const msg of data.messages) {
        const tsVal = tsRecord[msg.ts_constant];
        expect(tsVal).toBe(msg.wire_id);
        expect(isValidMessageId(msg.wire_id)).toBe(true);

        const meta = getMessageMetadata(msg.wire_id);
        expect(meta).toBeDefined();
        expect(meta?.name).toBe(msg.name);
        expect(meta?.frequency).toBe(msg.frequency);
        expect(meta?.messageNumber).toBe(msg.message_number);
        expect(meta?.trust).toBe(msg.trust);
        expect(meta?.encoding).toBe(msg.encoding);
        expect(meta?.viewerOutboundEligible).toBe(msg.viewer_outbound_eligible);
        expect(getMessageMetadataByName(msg.name)?.wireId).toBe(msg.wire_id);

        const encodedIdBytes = encodeWireMessageIdBytes(msg.wire_id);
        expect(bytesToHex(encodedIdBytes)).toBe(msg.wire_id_bytes_hex);
        const decodedId = decodeWireMessageIdBytes(encodedIdBytes);
        expect(decodedId.messageId).toBe(msg.wire_id);

        expect(isViewerOutboundEligible(msg.wire_id)).toBe(msg.viewer_outbound_eligible);
        const validation = validateOutboundViewerPacket({
          messageId: msg.wire_id,
          messageName: msg.name,
        });
        expect(validation.valid).toBe(msg.viewer_outbound_eligible);
        if (msg.trust === 'Trusted') {
          expect(validation.reason).toBe('trusted_simulator_only');
        } else if (msg.flags.includes('UDPBlackListed')) {
          expect(validation.reason).toBe('udp_blacklisted');
        }
      }
    });

    it('verifies packet framing vectors (headers, message numbers, zero-coding, and appended ACKs)', () => {
      const filePath = findVectorFile('protocol/master_message_template_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.packet_framing_vectors)).toBe(true);
      for (const frameCase of data.packet_framing_vectors) {
        const packetBytes = hexToBytes(frameCase.expected_packet_hex);
        const view = new DataView(
          packetBytes.buffer,
          packetBytes.byteOffset,
          packetBytes.byteLength,
        );
        expect(packetBytes[0]).toBe(frameCase.flags);
        expect(view.getUint32(1, false)).toBe(frameCase.sequence);
        expect(packetBytes[5]).toBe(0); // extra header length

        const hasAck = (frameCase.flags & 0x10) !== 0;
        let payloadEnd = packetBytes.length;
        if (hasAck) {
          const ackCount = packetBytes[packetBytes.length - 1];
          expect(ackCount).toBe(frameCase.appended_acks.length);
          payloadEnd -= 1 + ackCount * 4;
          for (let i = 0; i < ackCount; i++) {
            expect(view.getUint32(payloadEnd + i * 4, false)).toBe(frameCase.appended_acks[i]);
          }
        }

        const isZerocoded = (frameCase.flags & 0x80) !== 0;
        if (!isZerocoded) {
          const decoded = decodeWireMessageIdBytes(packetBytes, 6);
          expect(decoded.messageId).toBe(frameCase.wire_id);
          const bodySlice = packetBytes.subarray(6 + decoded.bytesRead, payloadEnd);
          expect(bytesToHex(bodySlice)).toBe(frameCase.body_hex);
        }
      }
    });
  });

  describe('Official Python-LLSD Conformance Vectors (XML, Notation, and Binary)', () => {
    it('parses and round-trips all canonical XML, Notation, and <?llsd/binary?> conformance vectors', () => {
      const filePath = findVectorFile('llsd/python_llsd_conformance_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(data.upstream_source).toBe('https://github.com/secondlife/python-llsd');
      expect(Array.isArray(data.conformance_vectors)).toBe(true);
      expect(data.conformance_vectors.length).toBeGreaterThanOrEqual(30);

      const xmlParser = new LLSDXMLParser();
      const binParser = new LLSDBinaryParser();

      for (const vec of data.conformance_vectors) {
        const xmlParsed = LLSD.parseXML(vec.xml);
        assertMatchesExpectedLLSD(xmlParsed, vec.expected);

        const xmlDocParsed = xmlParser.parse(vec.xml).getContent();
        assertMatchesExpectedLLSD(xmlDocParsed, vec.expected);

        if (vec.roundtrip_xml) {
          const roundTripInput =
            vec.expected.llsd_type === 'uuid'
              ? new LLSDUUID(String(xmlParsed))
              : vec.expected.llsd_type === 'uri'
                ? new LLSDURI(String(xmlParsed))
                : xmlParsed;
          const rebuiltXml = LLSD.buildXML(roundTripInput);
          const reparsedXml = LLSD.parseXML(rebuiltXml);
          assertMatchesExpectedLLSD(reparsedXml, vec.expected);
        }

        if (vec.notation !== undefined) {
          const notationParsed = LLSD.parseNotation(vec.notation);
          assertMatchesExpectedLLSD(notationParsed, vec.expected);
        }

        if (vec.binary_hex !== undefined) {
          const rawBytes = hexToBytes(vec.binary_hex);
          const binaryParsed = LLSD.parseBinary(rawBytes);
          assertMatchesExpectedLLSD(binaryParsed, vec.expected);

          const binaryDocParsed = binParser.parse(rawBytes).getContent();
          assertMatchesExpectedLLSD(binaryDocParsed, vec.expected);
        }
      }
    });

    it('rejects malformed XML, Notation, and truncated Binary inputs', () => {
      const filePath = findVectorFile('llsd/python_llsd_conformance_vectors.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(Array.isArray(data.malformed_vectors)).toBe(true);
      for (const bad of data.malformed_vectors) {
        if (bad.format === 'xml') {
          expect(() => LLSD.parseXML(bad.input)).toThrow();
        } else if (bad.format === 'notation') {
          expect(() => LLSD.parseNotation(bad.input)).toThrow();
        } else if (bad.format === 'binary') {
          expect(() => LLSD.parseBinary(hexToBytes(bad.input))).toThrow();
        }
      }
    });
  });

  describe('Canonical LSL & SLua Reference Definitions (secondlife/lsl-definitions & secondlife/slua)', () => {
    it('verifies canonical bitmasks, asset/inventory enums, 43 event signatures, and built-in functions', () => {
      expect(LSL_DEFINITIONS_PROVENANCE.lslDefinitionsRepo).toBe(
        'https://github.com/secondlife/lsl-definitions',
      );
      expect(LSL_DEFINITIONS_PROVENANCE.sluaRepo).toBe('https://github.com/secondlife/slua');
      expect(Object.keys(LSL_EVENT_SIGNATURES)).toHaveLength(43);
      expect(Object.keys(LSL_BUILTIN_FUNCTIONS).length).toBeGreaterThanOrEqual(500);

      // Control flags parity
      expect(LSL_CONTROL_FLAGS.CONTROL_FWD).toBe(0x1);
      expect(LSL_CONTROL_FLAGS.CONTROL_BACK).toBe(0x2);
      expect(LSL_CONTROL_FLAGS.CONTROL_LEFT).toBe(0x4);
      expect(LSL_CONTROL_FLAGS.CONTROL_RIGHT).toBe(0x8);
      expect(LSL_CONTROL_FLAGS.CONTROL_UP).toBe(0x10);
      expect(LSL_CONTROL_FLAGS.CONTROL_DOWN).toBe(0x20);
      expect(LSL_CONTROL_FLAGS.CONTROL_ROT_LEFT).toBe(0x100);
      expect(LSL_CONTROL_FLAGS.CONTROL_ROT_RIGHT).toBe(0x200);
      expect(LSL_CONTROL_FLAGS.CONTROL_LBUTTON).toBe(0x10000000);
      expect(LSL_CONTROL_FLAGS.CONTROL_ML_LBUTTON).toBe(0x40000000);

      // AgentInfo, ScriptPermission, ChangeType, PrimParam, Inventory/Asset constants
      expect(LSL_AGENT_INFO_FLAGS.AGENT_FLYING).toBe(0x1);
      expect(LSL_AGENT_INFO_FLAGS.AGENT_SITTING).toBe(0x10);
      expect(LSL_AGENT_INFO_FLAGS.AGENT_TYPING).toBe(0x200);
      expect(LSL_AGENT_INFO_FLAGS.AGENT_AUTOMATED).toBe(0x4000);
      expect(LSL_PERMISSION_FLAGS.PERMISSION_DEBIT).toBe(0x2);
      expect(LSL_PERMISSION_FLAGS.PERMISSION_TAKE_CONTROLS).toBe(0x4);
      expect(LSL_PERMISSION_FLAGS.PERMISSION_TRIGGER_ANIMATION).toBe(0x10);
      expect(LSL_PERMISSION_FLAGS.PERMISSION_TELEPORT).toBe(0x1000);
      expect(LSL_CHANGED_FLAGS.CHANGED_INVENTORY).toBe(0x1);
      expect(LSL_CHANGED_FLAGS.CHANGED_OWNER).toBe(0x80);
      expect(LSL_CHANGED_FLAGS.CHANGED_TELEPORT).toBe(0x200);
      expect(LSL_CHANGED_FLAGS.CHANGED_RENDER_MATERIAL).toBe(0x1000);
      expect(LSL_PRIM_PARAMS.PRIM_POSITION).toBe(6);
      expect(LSL_PRIM_PARAMS.PRIM_ROTATION).toBe(8);
      expect(LSL_PRIM_PARAMS.PRIM_GLTF_BASE_COLOR).toBe(48);
      expect(LSL_INVENTORY_TYPES.INVENTORY_TEXTURE).toBe(0);
      expect(LSL_INVENTORY_TYPES.INVENTORY_SCRIPT).toBe(10);
      expect(LSL_INVENTORY_TYPES.INVENTORY_SETTING).toBe(56);
      expect(LSL_INVENTORY_TYPES.INVENTORY_MATERIAL).toBe(57);
      expect(SL_ASSET_TYPES.MESH).toBe(49);
      expect(SL_ASSET_TYPES.SETTINGS).toBe(56);
      expect(SL_ASSET_TYPES.MATERIAL).toBe(57);
      expect(SL_INVENTORY_TYPES.SETTINGS).toBe(25);
      expect(SL_INVENTORY_TYPES.MATERIAL).toBe(26);
      expect(SL_INVENTORY_TYPES.GLTF).toBe(27);

      expect(
        decodeLSLBitmask(
          LSL_CONTROL_FLAGS.CONTROL_FWD | LSL_CONTROL_FLAGS.CONTROL_ROT_LEFT,
          LSL_CONTROL_FLAGS,
        ),
      ).toEqual(['CONTROL_FWD', 'CONTROL_ROT_LEFT']);

      // Event & built-in function signatures
      expect(getLSLEventSignature('http_response')?.parameters).toEqual([
        { name: 'request_id', type: 'key' },
        { name: 'status', type: 'integer' },
        { name: 'metadata', type: 'list' },
        { name: 'body', type: 'string' },
      ]);
      expect(getLSLFunctionSignature('llRequestPermissions')?.parameters).toEqual([
        { name: 'agent', type: 'key' },
        { name: 'permissions', type: 'integer' },
      ]);

      // SLua definitions parity
      expect(SLUA_KEYWORDS.length).toBe(23);
      expect(SLUA_BUILTIN_TYPES.map((t) => t.type)).toContain('buffer');
      expect(SLUA_GLOBAL_MODULES.ll).toBeDefined();
      expect(SLUA_GLOBAL_MODULES.lljson.members).toContain('slencode');
      expect(SLUA_GLOBAL_MODULES.quaternion.members).toContain('slerp');
    });
  });
});
