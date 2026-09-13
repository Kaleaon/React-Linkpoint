/**
 * Linkpoint PWA - Real Second Life Protocol Implementation
 */

import { Utils } from './utils';
import { XMLRPCClient } from './xmlrpc-client';
import { LLSD } from './llsd';
import { corsHandler } from './cors-handler';

export class SLProtocol extends Utils.EventEmitter {
  public sessionId: string | null = null;
  public secureSessionId: string | null = null;
  public agentId: string | null = null;
  public circuitCode: number | null = null;
  public simAddress: string | null = null;
  public simPort: number | null = null;
  public seedCapability: string | null = null;
  public connected: boolean = false;
  public capabilities: Record<string, string> = {};
  public region: any = null;
  public inventoryRoot: string | null = null;
  public friends: any[] = [];

  static GRIDS: Record<string, any> = {
    agni: {
      name: 'Second Life (Main Grid)',
      loginUrl: 'https://login.agni.lindenlab.com/cgi-bin/login.cgi'
    },
    aditi: {
      name: 'Second Life Beta (Aditi)',
      loginUrl: 'https://login.aditi.lindenlab.com/cgi-bin/login.cgi'
    },
    osgrid: {
      name: 'OSGrid',
      loginUrl: 'http://login.osgrid.org/'
    }
  };

  async login(gridId: string, username: string, password: string, startLocation: string = 'last') {
    const grid = SLProtocol.GRIDS[gridId];
    if (!grid) throw new Error('Invalid grid selected');

    const nameParts = username.replace(/[._]/g, ' ').trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts[1] : 'Resident';

    try {
      const passwordHash = await XMLRPCClient.hashPassword(password);
      const loginParams = {
        firstName,
        lastName,
        passwordHash,
        startLocation,
        channel: 'Linkpoint PWA',
        version: '1.0.0',
        loginUri: grid.loginUrl
      };

      const xmlRequest = XMLRPCClient.buildLoginRequest(loginParams);
      const response = await XMLRPCClient.sendRequest(grid.loginUrl, xmlRequest);

      if (!response.login || response.login === 'false') {
        throw new Error(response.message || 'Login failed');
      }

      this.sessionId = response.session_id;
      this.secureSessionId = response.secure_session_id;
      this.agentId = response.agent_id;
      this.circuitCode = parseInt(response.circuit_code);
      this.simAddress = response.sim_ip;
      this.simPort = parseInt(response.sim_port);
      this.seedCapability = response.seed_capability;
      this.inventoryRoot = response['inventory-root']?.[0]?.folder_id;
      
      this.region = {
        name: response['sim_name'] || 'Unknown',
        x: parseInt(response.region_x) || 0,
        y: parseInt(response.region_y) || 0
      };

      this.connected = true;

      if (this.seedCapability) {
        await this.fetchCapabilities();
      }

      this.emit('login_success', response);
      return response;

    } catch (error) {
      console.error('Login error:', error);
      this.emit('login_failed', error);
      throw error;
    }
  }

  async fetchCapabilities() {
    if (!this.seedCapability) return;

    try {
      const capsRequest = ['EventQueueGet', 'ChatSessionRequest', 'FetchInventoryDescendents2'];
      const response = await corsHandler.makeRequest(this.seedCapability, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML(capsRequest)
      });

      if (response && response.ok) {
        const text = await response.text();
        this.capabilities = LLSD.parseXML(text);
        this.emit('capabilities_fetched', this.capabilities);
      }
    } catch (error) {
      console.error('Failed to fetch capabilities:', error);
    }
  }

  private buildLLSDArray(items: string[]) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<llsd><array>\n';
    for (const item of items) {
      xml += `<string>${item}</string>\n`;
    }
    xml += '</array></llsd>\n';
    return xml;
  }

  getCapability(name: string) {
    return this.capabilities[name];
  }

  isConnected() {
    return this.connected;
  }

  async logout() {
    this.sessionId = null;
    this.agentId = null;
    this.connected = false;
    this.emit('logout');
  }
}
