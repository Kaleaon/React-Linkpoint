/**
 * Lumiya LLSD Utilities
 *
 * Specific LLSD patterns and helpers for Lumiya viewer standards
 * Copyright (C) 2024 Linden Lab / Linkpoint Contributors
 */

import { LLSD, LLSDValue, LLSDMap, LLSDArray, LLSDUtils } from '../types';
import {
  SecondLifeLLSDUtils,
  SLValidationRules,
  SLValidationResult,
} from '../secondlife/SecondLifeLLSDUtils';

/**
 * Lumiya-specific validation rules
 */
export class LumiyaValidationRules extends SLValidationRules {
  requiresLumiyaVersion: boolean = false;
  minLumiyaVersion: string = '';
  requiresSunPhase: boolean = false;
  requiresTouchControls: boolean = false;

  requireLumiyaVersion(minVersion: string): this {
    this.requiresLumiyaVersion = true;
    this.minLumiyaVersion = minVersion;
    return this;
  }

  requireSunPhase(): this {
    this.requiresSunPhase = true;
    return this;
  }

  requireTouchControls(): this {
    this.requiresTouchControls = true;
    return this;
  }
}

/**
 * Lumiya-specific validation result
 */
export class LumiyaValidationResult extends SLValidationResult {
  private lumiyaVersion: string = '';
  private sunPhaseValid: boolean = false;

  setLumiyaVersion(version: string): void {
    this.lumiyaVersion = version;
  }

  setSunPhaseValid(valid: boolean): void {
    this.sunPhaseValid = valid;
  }

  getLumiyaVersion(): string {
    return this.lumiyaVersion;
  }

  isSunPhaseValid(): boolean {
    return this.sunPhaseValid;
  }
}

export class LumiyaLLSDUtils {
  /**
   * Create an ImprovedInstantMessage data structure following Lumiya standards
   */
  static createInstantMessage(
    agentId: string,
    sessionId: string,
    fromGroup: boolean,
    toAgentId: string,
    parentEstateId: number,
    regionId: string,
    position: LLSDArray = [0, 0, 0],
    offline: number,
    dialog: number,
    id: string,
    timestamp: number,
    fromAgentName: string,
    message: string,
    binaryBucket: Uint8Array = new Uint8Array(),
  ): LLSDMap {
    return {
      agent_id: agentId,
      session_id: sessionId,
      from_group: fromGroup,
      to_agent_id: toAgentId,
      parent_estate_id: parentEstateId,
      region_id: regionId,
      position: position,
      offline: offline,
      dialog: dialog,
      id: id,
      timestamp: timestamp,
      from_agent_name: fromAgentName,
      message: message,
      binary_bucket: binaryBucket,
    };
  }

  /**
   * Create ChatFromViewer data structure following Lumiya standards
   */
  static createChatFromViewer(
    agentId: string,
    sessionId: string,
    message: string,
    type: number,
    channel: number = 0,
  ): LLSDMap {
    return {
      agent_id: agentId,
      session_id: sessionId,
      message: message,
      type: type,
      channel: channel,
      timestamp: Date.now() / 1000,
    };
  }

  /**
   * Parse sun phase and calculate time of day according to Lumiya's formula
   */
  static parseSunPhase(
    sunAngle: number,
    eastAngle: number = 0,
  ): { timeOfDay: number; sunPhase: number } {
    // Lumiya formula: timeOfDay is normalized (sunAngle + 0.5) % 1.0
    const normalized = ((sunAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const timeOfDay = (normalized / (2 * Math.PI) + 0.5) % 1.0;
    return {
      timeOfDay,
      sunPhase: sunAngle,
    };
  }

  /**
   * Create Lumiya camera state parameters
   */
  static createCameraState(
    zoom: number,
    pitch: number,
    yaw: number,
    target: LLSDArray = [0, 0, 0],
    distance: number = 5.0,
  ): LLSDMap {
    return {
      zoom,
      pitch,
      yaw,
      target,
      distance,
    };
  }

  /**
   * Validate UUID according to Lumiya standards
   */
  static isValidLumiyaUUID(uuid: string): boolean {
    return SecondLifeLLSDUtils.isValidSLUUID(uuid);
  }

  /**
   * Validate Lumiya-specific LLSD structure
   */
  static validateLumiyaStructure(
    llsdData: LLSDValue,
    rules: LumiyaValidationRules,
  ): LumiyaValidationResult {
    const result = new LumiyaValidationResult();

    const baseResult = SecondLifeLLSDUtils.validateSLStructure(llsdData, rules);
    for (const error of baseResult.getErrors()) {
      result.addError(error);
    }
    for (const warning of baseResult.getWarnings()) {
      result.addWarning(warning);
    }

    if (!baseResult.isValid()) {
      return result;
    }

    if (typeof llsdData === 'object' && !Array.isArray(llsdData) && llsdData !== null) {
      const map = llsdData as LLSDMap;

      if (rules.requiresLumiyaVersion) {
        const version = map['lumiya_version'] || map['version'];
        if (!version || typeof version !== 'string') {
          result.addError('Missing Lumiya version information');
        } else {
          result.setLumiyaVersion(version);
        }
      }

      if (
        rules.requiresSunPhase &&
        !('position' in map || 'timeOfDay' in map || 'timestamp' in map)
      ) {
        result.addWarning('Sun phase parameters missing from structure');
      }
    }

    return result;
  }
}
