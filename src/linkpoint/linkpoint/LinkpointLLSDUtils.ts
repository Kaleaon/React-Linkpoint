/**
 * Linkpoint LLSD & Viewer Contract Utilities
 *
 * Standards for Linkpoint multi-platform grid contracts and identity
 * Copyright (C) 2024 Linkpoint Contributors
 */

import { LLSD, LLSDValue, LLSDMap, LLSDUtils } from '../types';
import { VIEWER_CHANNEL, VIEWER_VERSION, VIEWER_IDENTITY } from '../viewer-identity';
import {
  SecondLifeLLSDUtils,
  SLValidationRules,
  SLValidationResult,
} from '../secondlife/SecondLifeLLSDUtils';

export enum GridKind {
  SECOND_LIFE = 'SECOND_LIFE',
  OPENSIM = 'OPENSIM',
}

export interface LoginRequestContract {
  grid: GridKind;
  loginUri: string;
  username: string;
  password: string;
  start?: string;
}

export interface SessionSnapshotContract {
  agentId: string;
  sessionId: string;
  regionName: string;
}

export class LinkpointLLSDUtils {
  /**
   * Create a standard Linkpoint login request contract map
   */
  static createLoginRequestContract(
    grid: GridKind,
    loginUri: string,
    username: string,
    password: string,
    start: string = 'last',
  ): LLSDMap {
    return {
      grid: grid,
      login_uri: loginUri,
      username: username,
      password: password,
      start: start,
      viewer_channel: VIEWER_CHANNEL,
      viewer_version: VIEWER_VERSION,
      viewer_identity: VIEWER_IDENTITY,
    };
  }

  /**
   * Create a standard Linkpoint session snapshot contract map
   */
  static createSessionSnapshotContract(
    agentId: string,
    sessionId: string,
    regionName: string,
  ): LLSDMap {
    return {
      agent_id: agentId,
      session_id: sessionId,
      region_name: regionName,
      timestamp: Date.now() / 1000,
      viewer_identity: VIEWER_IDENTITY,
    };
  }

  /**
   * Create a general viewer contract wrapper
   */
  static createViewerContract(contractName: string, payload: LLSDMap): LLSDMap {
    return {
      contract_name: contractName,
      channel: VIEWER_CHANNEL,
      version: VIEWER_VERSION,
      identity: VIEWER_IDENTITY,
      payload: payload,
    };
  }

  /**
   * Validate a login request contract
   */
  static validateLoginContract(data: LLSDValue): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, errors: ['Expected contract object'] };
    }

    const map = data as LLSDMap;
    if (!map.username || typeof map.username !== 'string') {
      errors.push('Missing or invalid username');
    }
    if (!map.password || typeof map.password !== 'string') {
      errors.push('Missing or invalid password');
    }
    if (!map.grid || (map.grid !== GridKind.SECOND_LIFE && map.grid !== GridKind.OPENSIM)) {
      errors.push('Missing or invalid grid type');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
