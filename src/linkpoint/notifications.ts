/**
 * Linkpoint PWA - Notifications Manager
 */

import { Utils } from './utils';

export class NotificationsManager extends Utils.EventEmitter {
  public protocol: any;
  public unreadCount: number = 0;

  constructor(protocolManager: any) {
    super();
    this.protocol = protocolManager;
  }

  init() {
    this.protocol.on('notification', (data: any) => this.handleNotification(data));
  }

  handleNotification(data: any) {
    this.unreadCount++;
    this.emit('notification_received', data);
    Utils.showToast(data.title || 'Notification', 'info');
  }

  clear() {
    this.unreadCount = 0;
    this.emit('cleared');
  }
}
