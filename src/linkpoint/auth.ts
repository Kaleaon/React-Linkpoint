/**
 * Linkpoint PWA - Authentication Module
 */

import { Utils } from './utils';

export class AuthManager extends Utils.EventEmitter {
  public protocol: any;
  public user: any = null;
  public credentials: any = null;

  constructor(protocolManager: any) {
    super();
    this.protocol = protocolManager;
  }

  init() {
    const savedCreds = Utils.storage.get('linkpoint_credentials');
    if (savedCreds && savedCreds.rememberMe) {
      this.credentials = savedCreds;
      this.emit('credentials_loaded', savedCreds);
    }
  }

  async login(grid: string, username: string, password: string, rememberMe: boolean) {
    try {
      const response = await this.protocol.connect(grid, username, password, 'last');

      if (rememberMe) {
        Utils.storage.set('linkpoint_credentials', { username, grid, rememberMe: true });
      } else {
        Utils.storage.remove('linkpoint_credentials');
      }

      this.user = {
        id: this.protocol.agentId,
        firstName: response.first_name || username.split(' ')[0],
        lastName: response.last_name || username.split(' ')[1] || 'Resident',
        fullName: `${response.first_name || username.split(' ')[0]} ${response.last_name || username.split(' ')[1] || 'Resident'}`,
        grid
      };

      this.emit('login_success', this.user);
      return this.user;
    } catch (error) {
      this.emit('login_failed', error);
      throw error;
    }
  }

  async logout() {
    await this.protocol.logout();
    this.user = null;
    this.emit('logout');
  }

  isLoggedIn() {
    return this.user !== null && this.protocol.connected;
  }

  getUserDisplayName() {
    return this.user ? this.user.fullName : 'Guest';
  }
}
