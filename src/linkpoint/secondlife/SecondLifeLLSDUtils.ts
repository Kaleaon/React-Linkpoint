/**
 * Second Life LLSD Utilities
 *
 * Specific LLSD patterns and helpers for Second Life
 * Copyright (C) 2024 Linden Lab
 */

import { LLSD, LLSDValue, LLSDMap, LLSDArray, LLSDUtils } from '../types';

/**
 * Validation rules for Second Life LLSD structures
 */
export class SLValidationRules {
  requiresMap: boolean = false;
  requiresArray: boolean = false;
  requiredFields: Set<string> = new Set();
  fieldTypes: Map<string, string> = new Map();

  requireMap(): this {
    this.requiresMap = true;
    return this;
  }

  requireArray(): this {
    this.requiresArray = true;
    return this;
  }

  requireField(name: string, type?: string): this {
    this.requiredFields.add(name);
    if (type) {
      this.fieldTypes.set(name, type);
    }
    return this;
  }
}

/**
 * Validation result
 */
export class SLValidationResult {
  private errors: string[] = [];
  private warnings: string[] = [];

  addError(error: string): void {
    this.errors.push(error);
  }

  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  isValid(): boolean {
    return this.errors.length === 0;
  }

  getErrors(): string[] {
    return [...this.errors];
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }
}

export class SecondLifeLLSDUtils {
  /**
   * Create a standard AgentData block for UDP packets and LLSD requests
   */
  static createAgentDataBlock(agentId: string, sessionId: string, circuitCode: number): LLSDMap {
    return {
      AgentID: agentId,
      SessionID: sessionId,
      CircuitCode: circuitCode,
    };
  }

  /**
   * Create a standard SL capability request
   */
  static createCapRequest(method: string, params: LLSDMap = {}): LLSD {
    return new LLSD({
      method,
      params,
    });
  }

  /**
   * Parse a standard SL capability response
   */
  static parseCapResponse(llsd: LLSD): LLSDValue {
    const content = llsd.getContent();
    if (
      content &&
      typeof content === 'object' &&
      !Array.isArray(content) &&
      'response' in content
    ) {
      return (content as LLSDMap).response;
    }
    return content;
  }

  /**
   * Create a Second Life compatible LLSD response structure
   */
  static createSLResponse(success: boolean, message: string, data?: LLSDValue): LLSDMap {
    const response: LLSDMap = {
      success: success,
      message: message,
    };

    if (data !== undefined) {
      response.data = data;
    }

    return response;
  }

  /**
   * Validate a UUID string according to Second Life standards
   */
  static isValidSLUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }

    // Second Life uses standard UUID format and non-null UUIDs
    return LLSDUtils.isUUIDString(uuid) && uuid !== '00000000-0000-0000-0000-000000000000';
  }

  /**
   * Create agent appearance data structure
   */
  static createAgentAppearance(
    agentId: string,
    serialNumber: number,
    isTrial: boolean,
    attachments: LLSDArray = [],
    visualParams: Uint8Array = new Uint8Array(),
    textureHashes: LLSDArray = [],
  ): LLSDMap {
    return {
      agent_id: agentId,
      serial_number: serialNumber,
      is_trial_account: isTrial,
      attachments: attachments,
      visual_params: visualParams,
      texture_hashes: textureHashes,
      appearance_version: 1,
      cof_version: 1,
    };
  }

  /**
   * Create object properties data structure
   */
  static createObjectProperties(
    objectId: string,
    ownerId: string,
    groupId: string,
    name: string,
    description: string,
    permissions: LLSDMap,
  ): LLSDMap {
    return {
      object_id: objectId,
      owner_id: ownerId,
      group_id: groupId,
      name: name,
      description: description,
      permissions: permissions,
      sale_info: {
        sale_price: 0,
        sale_type: 0,
      },
      creation_date: new Date().toISOString(),
    };
  }

  /**
   * Create asset upload request
   */
  static createAssetUploadRequest(
    assetType: string,
    name: string,
    description: string,
    data: Uint8Array,
    expectedUploadCost: number = 0,
  ): LLSDMap {
    return {
      asset_type: assetType,
      name: name,
      description: description,
      asset_resources: {
        asset_data: data,
      },
      folder_id: LLSDUtils.generateUUID(),
      inventory_type: SecondLifeLLSDUtils.assetTypeToInventoryType(assetType),
      expected_upload_cost: expectedUploadCost,
      everyone_mask: 0x00000000,
      group_mask: 0x00000000,
      next_owner_mask: 0x00082000,
    };
  }

  /**
   * Convert Second Life asset type mnemonic to canonical `LLInventoryType::EType` code
   */
  static assetTypeToInventoryType(assetType: string): number {
    const mapping: Record<string, number> = {
      texture: 0,
      img_tga: 0,
      jpeg: 0,
      txtr_tga: 0,
      sound: 1,
      snd_wav: 1,
      callcard: 2,
      callingcard: 2,
      landmark: 3,
      script: 10,
      clothing: 18,
      object: 6,
      notecard: 7,
      category: 8,
      folder: 8,
      rootcategory: 9,
      lsltext: 10,
      lslbyte: 10,
      bodypart: 18,
      trash: 14,
      snapshot: 15,
      lostandfound: 16,
      attachment: 17,
      wearable: 18,
      animatn: 19,
      animation: 19,
      gesture: 20,
      mesh: 22,
      widget: 23,
      person: 24,
      settings: 25,
      material: 26,
      gltf: 27,
      gltfbin: 28,
    };

    const result = mapping[assetType.trim().toLowerCase()];
    return result !== undefined ? result : -1;
  }

  /**
   * Create chat message structure
   */
  static createChatMessage(
    fromName: string,
    sourceType: number,
    chatType: number,
    message: string,
    position: LLSDArray = [0, 0, 0],
    ownerId: string = '00000000-0000-0000-0000-000000000000',
  ): LLSDMap {
    return {
      from_name: fromName,
      source_type: sourceType,
      chat_type: chatType,
      message: message,
      position: position,
      owner_id: ownerId,
      audible: 1.0,
      timestamp: Date.now() / 1000,
    };
  }

  /**
   * Create sim stats structure
   */
  static createSimStats(
    regionId: string,
    timeDilation: number,
    simFPS: number,
    physicsFPS: number,
    agentUpdates: number,
    rootAgents: number,
    childAgents: number,
    totalPrims: number,
    activePrims: number,
    activeScripts: number,
  ): LLSDMap {
    return {
      region_id: regionId,
      time_dilation: timeDilation,
      sim_fps: simFPS,
      physics_fps: physicsFPS,
      agent_updates_per_second: agentUpdates,
      root_agents: rootAgents,
      child_agents: childAgents,
      total_prims: totalPrims,
      active_prims: activePrims,
      active_scripts: activeScripts,
      timestamp: Date.now() / 1000,
    };
  }

  /**
   * Validate Second Life LLSD structure
   */
  static validateSLStructure(llsdData: LLSDValue, rules: SLValidationRules): SLValidationResult {
    const result = new SLValidationResult();

    if (
      rules.requiresMap &&
      (typeof llsdData !== 'object' || Array.isArray(llsdData) || llsdData === null)
    ) {
      result.addError(`Expected Map but got ${llsdData === null ? 'null' : typeof llsdData}`);
      return result;
    }

    if (rules.requiresArray && !Array.isArray(llsdData)) {
      result.addError(`Expected Array but got ${typeof llsdData}`);
      return result;
    }

    if (typeof llsdData === 'object' && !Array.isArray(llsdData) && llsdData !== null) {
      const map = llsdData as LLSDMap;

      // Check required fields
      for (const field of rules.requiredFields) {
        if (!(field in map)) {
          result.addError(`Missing required field: ${field}`);
        }
      }

      // Check field types (supporting both JS typeof names and canonical LLSD type names)
      for (const [field, expectedType] of rules.fieldTypes.entries()) {
        if (field in map) {
          const value = map[field];
          if (!SecondLifeLLSDUtils.matchesExpectedFieldType(value, expectedType)) {
            const actualType = SecondLifeLLSDUtils.describeFieldType(value);
            result.addWarning(`Field ${field} expected ${expectedType} but got ${actualType}`);
          }
        }
      }
    }

    return result;
  }

  private static describeFieldType(value: LLSDValue): string {
    if (value === null || value === undefined) return 'undef';
    if (value instanceof Date) return 'date';
    if (value instanceof URL) return 'uri';
    if (value instanceof Uint8Array) return 'binary';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'real';
    if (typeof value === 'string') return LLSDUtils.isUUIDString(value) ? 'uuid' : 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object') return 'map';
    return typeof value;
  }

  private static matchesExpectedFieldType(value: LLSDValue, expectedType: string): boolean {
    const norm = expectedType.toLowerCase();
    switch (norm) {
      case 'undef':
      case 'null':
        return value === null || value === undefined;
      case 'boolean':
        return typeof value === 'boolean';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'real':
        return typeof value === 'number';
      case 'number':
        return typeof value === 'number';
      case 'uuid':
        return typeof value === 'string' && LLSDUtils.isUUIDString(value);
      case 'string':
        return typeof value === 'string';
      case 'date':
        return value instanceof Date && !Number.isNaN(value.getTime());
      case 'uri':
        return value instanceof URL || typeof value === 'string';
      case 'binary':
        return value instanceof Uint8Array;
      case 'array':
        return Array.isArray(value);
      case 'map':
        return (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          !(value instanceof Date) &&
          !(value instanceof URL) &&
          !(value instanceof Uint8Array)
        );
      default:
        return typeof value === expectedType;
    }
  }
}
