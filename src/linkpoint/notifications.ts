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
  public items: NotificationData[] = [];
  private noticeCounter = 0;
  private filters = { local: true, im: true, group: true };

  setFilters(filters: { local: boolean; im: boolean; group: boolean }) { this.filters = { ...filters }; }

  constructor(protocolManager: SLConnectionFull) {
    super();
    this.protocol = protocolManager;
  }

  init(chat?: { on(event: string, listener: Function): void }) {
    chat?.on('message_received', (data: any) => {
      if (!data || !['im', 'group'].includes(data.type) || (this.protocol.agentId && data.senderId === this.protocol.agentId)) return;
      this.handleNotification({ ...data, kind: data.type, title: data.type === 'group' ? (data.groupName || 'Group message') : (data.sender || 'Private message'), message: data.text || '' });
    });
    this.protocol.on('notification', (data: NotificationData) => this.handleNotification(data));
    this.protocol.on('group_notice', (data: any) => {
      this.handleNotification({
        id: data.id || `notice-${Date.now()}-${++this.noticeCounter}`,
        kind: 'notice',
        title: data.subject || 'Group Notice',
        subject: data.subject || 'Group Notice',
        message: data.message || '',
        from: data.fromName || data.from || 'Resident',
        groupId: data.groupId,
        timestamp: data.timestamp || Date.now(),
      });
    });
  }

  handleNotification(data: NotificationData) {
    this.items.push({ ...data });
    this.unreadCount++;
    this.emit('notification_received', data);
    const category = data.groupId || data.kind === 'notice' || data.kind === 'group' || data.type === 'group' ? 'group' : data.kind === 'im' || data.type === 'im' ? 'im' : 'local';
    if (this.filters[category]) Utils.showToast(data.title || 'Notification', 'info');
  }

  clear() {
    this.unreadCount = 0;
    this.items = [];
    this.emit('cleared');
  }
}
