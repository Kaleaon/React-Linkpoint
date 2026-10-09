/**
 * SL Viewer Standards Integration and Unit Tests
 * Testing Second Life, Firestorm, Lumiya, and Linkpoint viewer standards
 */

import { describe, test, expect } from 'vitest';
import { LLSDUtils, LLSDMap, LLSDArray } from '../types';
import { SecondLifeLLSDUtils, SLValidationRules } from '../secondlife/SecondLifeLLSDUtils';
import { FirestormLLSDUtils, FSValidationRules } from '../firestorm/FirestormLLSDUtils';
import { LumiyaLLSDUtils, LumiyaValidationRules } from '../lumiya/LumiyaLLSDUtils';
import { LinkpointLLSDUtils, GridKind } from '../linkpoint/LinkpointLLSDUtils';

describe('LLSDUtils Extensions', () => {
  test('generateUUID should return a valid UUID string', () => {
    const uuid = LLSDUtils.generateUUID();
    expect(LLSDUtils.isUUIDString(uuid)).toBe(true);
  });

  test('deepCopy should duplicate nested objects and arrays safely', () => {
    const original: LLSDMap = {
      nested: { key: 'value' },
      arr: [1, 2, 3],
      date: new Date(1700000000000)
    };
    const copy = LLSDUtils.deepCopy(original) as LLSDMap;

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.nested).not.toBe(original.nested);
    expect(copy.arr).not.toBe(original.arr);
  });

  test('getValue and getters should safely navigate LLSD structures', () => {
    const doc: LLSDMap = {
      agent: {
        name: 'Tester Resident',
        age: 42,
        isPremium: true
      }
    };

    expect(LLSDUtils.getString(doc, 'agent.name')).toBe('Tester Resident');
    expect(LLSDUtils.getNumber(doc, 'agent.age')).toBe(42);
    expect(LLSDUtils.getBoolean(doc, 'agent.isPremium')).toBe(true);
    expect(LLSDUtils.getString(doc, 'agent.missing', 'default')).toBe('default');
  });
});

describe('Second Life Viewer Standards', () => {
  test('isValidSLUUID validates non-null SL UUIDs', () => {
    expect(SecondLifeLLSDUtils.isValidSLUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(SecondLifeLLSDUtils.isValidSLUUID('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(SecondLifeLLSDUtils.isValidSLUUID('invalid')).toBe(false);
  });

  test('createAgentAppearance formats appearance payload', () => {
    const app = SecondLifeLLSDUtils.createAgentAppearance(
      '550e8400-e29b-41d4-a716-446655440000',
      12,
      false,
      [{ item_id: '123' }]
    );
    expect(app.agent_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(app.serial_number).toBe(12);
    expect(app.appearance_version).toBe(1);
  });

  test('createChatMessage formats chat payload', () => {
    const chat = SecondLifeLLSDUtils.createChatMessage('Alice Resident', 1, 0, 'Hello world', [10, 20, 30]);
    expect(chat.from_name).toBe('Alice Resident');
    expect(chat.source_type).toBe(1);
    expect(chat.chat_type).toBe(0);
    expect(chat.message).toBe('Hello world');
    expect(chat.position).toEqual([10, 20, 30]);
  });

  test('validateSLStructure validates required fields and map rules', () => {
    const rules = new SLValidationRules().requireMap().requireField('from_name', 'string');
    const valid = SecondLifeLLSDUtils.validateSLStructure({ from_name: 'Test' }, rules);
    expect(valid.isValid()).toBe(true);

    const invalid = SecondLifeLLSDUtils.validateSLStructure({ other: 'Test' }, rules);
    expect(invalid.isValid()).toBe(false);
    expect(invalid.getErrors()).toContain('Missing required field: from_name');
  });
});

describe('Firestorm Viewer Standards', () => {
  test('RLVCommand generates RLV LLSD and string format', () => {
    const rlv = new FirestormLLSDUtils.RLVCommand('@sit', 'ground', '=force', 'source-123');
    expect(rlv.toString()).toBe('@sit:ground=force');
    const llsd = rlv.toLLSD();
    expect(llsd.behaviour).toBe('@sit');
    expect(llsd.option).toBe('ground');
    expect(llsd.param).toBe('=force');
  });

  test('createRadarData produces radar payload', () => {
    const radar = FirestormLLSDUtils.createRadarData('agent-1', 'Display Name', 'username.resident', [100, 100, 20], 12.5, true);
    expect(radar.agent_id).toBe('agent-1');
    expect(radar.display_name).toBe('Display Name');
    expect(radar.radar_version).toBe('6.0.0');
  });

  test('FSLLSDCache caches and expires entries', () => {
    const cache = new FirestormLLSDUtils.FSLLSDCache(1000);
    cache.put('key1', { value: 123 });
    expect(cache.size()).toBe(1);
    expect(cache.get('key1')).toEqual({ value: 123 });
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test('validateFSStructure validates version and RLV requirements', () => {
    const rules = new FSValidationRules().requireFSVersion('6.0.0').requireRLV();
    const data = {
      firestorm_version: '6.5.0',
      rlv_enabled: true
    };
    const res = FirestormLLSDUtils.validateFSStructure(data, rules);
    expect(res.isValid()).toBe(true);
  });
});

describe('Lumiya Viewer Standards', () => {
  test('createInstantMessage formats ImprovedInstantMessage payload', () => {
    const im = LumiyaLLSDUtils.createInstantMessage(
      'agent-1',
      'session-1',
      false,
      'agent-2',
      0,
      'region-1',
      [128, 128, 20],
      0,
      0,
      'msg-1',
      1700000000,
      'Sender Resident',
      'Instant message text'
    );

    expect(im.agent_id).toBe('agent-1');
    expect(im.session_id).toBe('session-1');
    expect(im.from_group).toBe(false);
    expect(im.to_agent_id).toBe('agent-2');
    expect(im.parent_estate_id).toBe(0);
    expect(im.region_id).toBe('region-1');
    expect(im.position).toEqual([128, 128, 20]);
    expect(im.offline).toBe(0);
    expect(im.dialog).toBe(0);
    expect(im.id).toBe('msg-1');
    expect(im.timestamp).toBe(1700000000);
    expect(im.from_agent_name).toBe('Sender Resident');
    expect(im.message).toBe('Instant message text');
    expect(im.lumiya_version).toBeUndefined();
    expect('lumiya_version' in im).toBe(false);
  });

  test('createCameraState formats camera state map without lumiya_camera', () => {
    const cam = LumiyaLLSDUtils.createCameraState(1.5, 0.2, 1.1, [10, 20, 30], 10.0);
    expect(cam.zoom).toBe(1.5);
    expect(cam.pitch).toBe(0.2);
    expect(cam.yaw).toBe(1.1);
    expect(cam.target).toEqual([10, 20, 30]);
    expect(cam.distance).toBe(10.0);
    expect(cam.lumiya_camera).toBeUndefined();
    expect('lumiya_camera' in cam).toBe(false);
  });

  test('parseSunPhase calculates time of day', () => {
    const { timeOfDay, sunPhase } = LumiyaLLSDUtils.parseSunPhase(Math.PI);
    expect(sunPhase).toBe(Math.PI);
    expect(timeOfDay).toBeCloseTo(0.0);
  });

  test('validateLumiyaStructure checks version requirement', () => {
    const rules = new LumiyaValidationRules().requireLumiyaVersion('3.4.0');
    const valid = LumiyaLLSDUtils.validateLumiyaStructure({ lumiya_version: '3.4.2' }, rules);
    expect(valid.isValid()).toBe(true);

    const validStandard = LumiyaLLSDUtils.validateLumiyaStructure({ version: '3.4.2' }, rules);
    expect(validStandard.isValid()).toBe(true);
  });
});

describe('Linkpoint Viewer Standards & Contracts', () => {
  test('createLoginRequestContract creates login contract', () => {
    const contract = LinkpointLLSDUtils.createLoginRequestContract(
      GridKind.SECOND_LIFE,
      'https://login.secondlife.com/cgi-bin/login.cgi',
      'user resident',
      'pass123'
    );

    expect(contract.grid).toBe('SECOND_LIFE');
    expect(contract.username).toBe('user resident');
    expect(contract.viewer_identity).toBeDefined();

    const validation = LinkpointLLSDUtils.validateLoginContract(contract);
    expect(validation.valid).toBe(true);
  });

  test('createSessionSnapshotContract creates snapshot contract', () => {
    const snap = LinkpointLLSDUtils.createSessionSnapshotContract('agent-id', 'session-id', 'Arah');
    expect(snap.agent_id).toBe('agent-id');
    expect(snap.region_name).toBe('Arah');
  });
});
