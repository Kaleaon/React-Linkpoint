/**
 * Linkpoint PWA - Notifications Manager
 */

import { Utils } from './utils';
import { SLConnectionFull } from './sl-connection-full';

export interface NotificationData {
  title?: string;
  message?: string;
  [key: string]: any;
}

export class NotificationsManager extends Utils.EventEmitter {
  public protocol: SLConnectionFull;
  public unreadCount: number = 0;

  constructor(protocolManager: SLConnectionFull) {
    super();
    this.protocol = protocolManager;
  }

  init() {
    this.protocol.on('notification', (data: NotificationData) => this.handleNotification(data));
  }

  handleNotification(data: NotificationData) {
    this.unreadCount++;
    this.emit('notification_received', data);
    Utils.showToast(data.title || 'Notification', 'info');
  }

  clear() {
    this.unreadCount = 0;
    this.emit('cleared');
  }
}
