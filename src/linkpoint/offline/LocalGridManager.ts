import { LocalGridServer, LocalUser } from './LocalGridServer';
import { Utils } from '../utils';

export const LOCAL_GRID_STORAGE_KEYS = {
  USER_ACCOUNT: 'linkpoint_offline_user_account',
  SETTINGS: 'linkpoint_offline_grid_settings'
};

export class LocalGridManager extends Utils.EventEmitter {
  private server: LocalGridServer;
  private isConfigured: boolean = false;
  private currentUserAccount: { firstName: string; lastName: string; passwordHash: string } | null = null;

  constructor() {
    super();
    this.server = new LocalGridServer();
    this.loadPersistedConfig();
  }

  private loadPersistedConfig() {
    const account = Utils.storage.get(LOCAL_GRID_STORAGE_KEYS.USER_ACCOUNT, null);
    if (account && account.firstName && account.passwordHash) {
      this.currentUserAccount = account;
      this.isConfigured = true;
      this.server.registerUser(account.firstName, account.lastName || 'Resident', account.passwordHash);
    }
  }

  public isFirstTimeSetupNeeded(): boolean {
    return !this.isConfigured || !this.currentUserAccount;
  }

  public setupOfflineAccount(firstName: string, lastName: string, passwordHash: string): LocalUser {
    const cleanedLastName = lastName.trim() || 'Resident';
    const user = this.server.registerUser(firstName.trim(), cleanedLastName, passwordHash);

    this.currentUserAccount = {
      firstName: firstName.trim(),
      lastName: cleanedLastName,
      passwordHash
    };
    this.isConfigured = true;

    Utils.storage.set(LOCAL_GRID_STORAGE_KEYS.USER_ACCOUNT, this.currentUserAccount);
    this.emit('accountConfigured', user);
    return user;
  }

  public toggleGridState(enable: boolean): boolean {
    if (enable) {
      if (this.isFirstTimeSetupNeeded()) {
        throw new Error('First time setup required before starting local grid.');
      }
      const started = this.server.start();
      this.emit('gridStateChanged', { isRunning: true });
      return started;
    } else {
      const stopped = this.server.stop();
      this.emit('gridStateChanged', { isRunning: false });
      return stopped;
    }
  }

  public isGridRunning(): boolean {
    return this.server.getIsRunning();
  }

  public getServer(): LocalGridServer {
    return this.server;
  }

  public getCurrentUserAccount() {
    return this.currentUserAccount;
  }
}
