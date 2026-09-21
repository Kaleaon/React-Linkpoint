/**
 * Linkpoint Local Grid Server
 * Simulates local grid services (Login XML-RPC, User, Inventory, Asset, and Region services)
 * for offline viewing and local hosting.
 */

import { Utils } from '../utils';

export interface LocalUser {
  id: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  homeRegionId: string;
  homePosition: { x: number; y: number; z: number };
  inventoryRootId: string;
}

export interface LocalRegion {
  id: string;
  name: string;
  locX: number;
  locY: number;
  serverURI: string;
  simIp: string;
  simPort: number;
  terrainHeightmap: Float32Array | number[];
  prims: LocalPrim[];
}

export interface LocalPrim {
  id: string;
  name: string;
  description: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  shape: string;
  textureAssets: string[];
}

export interface HypergridIdentity {
  gridURI: string;
  userId: string;
  displayName: string;
  homeGrid: string;
}

export class LocalGridServer {
  private isRunning: boolean = false;
  private users: Map<string, LocalUser> = new Map();
  private regions: Map<string, LocalRegion> = new Map();
  private hypergridUsers: Map<string, HypergridIdentity> = new Map();

  constructor() {
    this.initDefaultRegion();
  }

  private initDefaultRegion() {
    const defaultRegionId = Utils.generateUUID();
    const defaultRegion: LocalRegion = {
      id: defaultRegionId,
      name: 'Offline Region',
      locX: 1000,
      locY: 1000,
      serverURI: 'http://127.0.0.1:9000/',
      simIp: '127.0.0.1',
      simPort: 9000,
      terrainHeightmap: new Float32Array(256 * 256).fill(21),
      prims: []
    };
    this.regions.set(defaultRegionId, defaultRegion);
  }

  public start(): boolean {
    this.isRunning = true;
    return true;
  }

  public stop(): boolean {
    this.isRunning = false;
    return true;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public registerUser(firstName: string, lastName: string, passwordHash: string): LocalUser {
    const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
    const userId = Utils.generateUUID();
    const inventoryRootId = Utils.generateUUID();
    const defaultRegion = Array.from(this.regions.values())[0];

    const user: LocalUser = {
      id: userId,
      firstName,
      lastName,
      passwordHash,
      homeRegionId: defaultRegion ? defaultRegion.id : Utils.generateUUID(),
      homePosition: { x: 128, y: 128, z: 22 },
      inventoryRootId
    };

    this.users.set(fullName, user);
    return user;
  }

  public getUser(firstName: string, lastName: string): LocalUser | undefined {
    const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
    return this.users.get(fullName);
  }

  public authenticate(firstName: string, lastName: string, passwordHash: string): boolean {
    if (!this.isRunning) return false;
    const user = this.getUser(firstName, lastName);
    if (!user) return false;
    return user.passwordHash === passwordHash;
  }

  public processLogin(firstName: string, lastName: string, passwordHash: string): Record<string, any> {
    if (!this.isRunning) {
      return {
        login: 'false',
        reason: 'Local Grid Server is offline/shutdown.'
      };
    }

    const user = this.getUser(firstName, lastName);
    if (!user || user.passwordHash !== passwordHash) {
      return {
        login: 'false',
        reason: 'Invalid username or password for local grid.'
      };
    }

    const region = this.regions.get(user.homeRegionId) || Array.from(this.regions.values())[0];
    const sessionToken = Utils.generateUUID();
    const secureSessionId = Utils.generateUUID();

    return {
      login: 'true',
      session_id: sessionToken,
      secure_session_id: secureSessionId,
      agent_id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      start_location: 'home',
      sim_ip: region.simIp,
      sim_port: region.simPort,
      region_x: region.locX * 256,
      region_y: region.locY * 256,
      seed_capability: `${region.serverURI}CAPS/${sessionToken}/`,
      look_at: '[r0,g0,b0]',
      inventory_root: [{ folder_id: user.inventoryRootId }],
      message: 'Welcome to your Offline Local OpenSim Grid!'
    };
  }

  public resolveHypergridId(identifier: string): HypergridIdentity {
    let gridURI = 'http://127.0.0.1:9000';
    let userId = Utils.generateUUID();
    let displayName = identifier;

    if (identifier.includes('@')) {
      const parts = identifier.split('@');
      displayName = parts[0];
      gridURI = parts[1].startsWith('http') ? parts[1] : `http://${parts[1]}`;
    } else if (identifier.startsWith('http')) {
      try {
        const url = new URL(identifier);
        gridURI = `${url.protocol}//${url.host}`;
        const pathParts = url.pathname.split('/');
        userId = pathParts[pathParts.length - 1] || userId;
      } catch (e) {
        // fallback
      }
    }

    const hgId: HypergridIdentity = {
      gridURI,
      userId,
      displayName,
      homeGrid: gridURI
    };

    this.hypergridUsers.set(identifier, hgId);
    return hgId;
  }

  public getRegions(): LocalRegion[] {
    return Array.from(this.regions.values());
  }

  public addRegion(region: LocalRegion) {
    this.regions.set(region.id, region);
  }
}
