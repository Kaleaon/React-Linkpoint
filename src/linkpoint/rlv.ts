/**
 * RLV (Restrained Life Viewer) Controller and Command Parser
 * Reference: Lumiya recovered RLVController and RLVCommands
 */

export type RlvCommandType =
  | 'version'
  | 'versionnew'
  | 'versionnum'
  | 'clear'
  | 'detach'
  | 'sendchat'
  | 'recvchat'
  | 'sendim'
  | 'recvim'
  | 'tplm'
  | 'tploc'
  | 'sittp'
  | 'tplure'
  | 'tpto'
  | 'accepttp'
  | 'showinv'
  | 'viewnote'
  | 'edit'
  | 'rez'
  | 'unsit'
  | 'sit'
  | 'remoutfit'
  | 'getoutfit'
  | 'addoutfit'
  | 'getattach'
  | 'getstatus'
  | 'sendchannel'
  | 'redirchat';

export interface RlvRestrictionEntry {
  command: RlvCommandType;
  option: string; // e.g. "head", "22200", UUID, or ""
  param: string; // e.g. "n", "y", "add", "rem", "22200"
  sourceId: string; // Object UUID that issued the restriction
}

export interface RlvReply {
  channel: number;
  message: string;
}

export class RlvController {
  private enabled: boolean = false;
  private restrictions: RlvRestrictionEntry[] = [];
  private onReplyCallback?: (channel: number, message: string) => void;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setReplyCallback(cb: (channel: number, message: string) => void): void {
    this.onReplyCallback = cb;
  }

  /**
   * Process incoming RLV command string (e.g. "@detach=n,sendchat=n").
   * Returns generated reply messages if any (e.g. for @version=22200).
   */
  public processMessage(sourceId: string, messageText: string): RlvReply[] {
    const replies: RlvReply[] = [];
    if (!messageText.startsWith('@')) return replies;

    const commandList = messageText.substring(1).split(',');
    for (const rawCmd of commandList) {
      const trimmed = rawCmd.trim();
      if (!trimmed) continue;

      let cmd = trimmed;
      let param = '';
      let option = '';

      const eqIdx = cmd.indexOf('=');
      if (eqIdx >= 0) {
        param = cmd.substring(eqIdx + 1);
        cmd = cmd.substring(0, eqIdx);
      }

      const colIdx = cmd.indexOf(':');
      if (colIdx >= 0) {
        option = cmd.substring(colIdx + 1);
        cmd = cmd.substring(0, colIdx);
      }

      const reply = this.handleCommand(sourceId, cmd.toLowerCase() as RlvCommandType, option, param);
      if (reply) {
        replies.push(reply);
        if (this.onReplyCallback) {
          this.onReplyCallback(reply.channel, reply.message);
        }
      }
    }
    return replies;
  }

  private handleCommand(sourceId: string, command: RlvCommandType, option: string, param: string): RlvReply | null {
    if (!this.enabled && !['version', 'versionnew', 'versionnum'].includes(command)) {
      return null;
    }

    const pLower = param.toLowerCase();

    switch (command) {
      case 'version':
      case 'versionnew': {
        const channel = parseInt(param, 10);
        if (!isNaN(channel) && channel > 0) {
          return { channel, message: 'Linkpoint RLV v2.0.0' };
        }
        break;
      }
      case 'versionnum': {
        const channel = parseInt(param, 10);
        if (!isNaN(channel) && channel > 0) {
          return { channel, message: '2000000' };
        }
        break;
      }
      case 'clear': {
        if (option) {
          this.restrictions = this.restrictions.filter(
            (r) => !(r.sourceId === sourceId && (r.command === option.toLowerCase() || r.option === option))
          );
        } else {
          this.restrictions = this.restrictions.filter((r) => r.sourceId !== sourceId);
        }
        break;
      }
      case 'getstatus': {
        const channel = parseInt(param, 10);
        if (!isNaN(channel) && channel > 0) {
          const statusStr = this.getFormattedStatus(sourceId, option);
          return { channel, message: statusStr };
        }
        break;
      }
      case 'getattach': {
        const channel = parseInt(param, 10);
        if (!isNaN(channel) && channel > 0) {
          return { channel, message: '0' }; // 0 if not attached or attach point status
        }
        break;
      }
      case 'getoutfit': {
        const channel = parseInt(param, 10);
        if (!isNaN(channel) && channel > 0) {
          return { channel, message: '0' };
        }
        break;
      }
      default: {
        const isAdd = pLower === 'n' || pLower === 'add' || pLower === '0';
        const isRem = pLower === 'y' || pLower === 'rem' || pLower === '1';

        if (isAdd) {
          this.addRestriction(sourceId, command, option, param);
        } else if (isRem) {
          this.removeRestriction(sourceId, command, option);
        }
        break;
      }
    }
    return null;
  }

  private addRestriction(sourceId: string, command: RlvCommandType, option: string, param: string): void {
    // Prevent duplicate entries
    const existing = this.restrictions.find(
      (r) => r.sourceId === sourceId && r.command === command && r.option === option
    );
    if (!existing) {
      this.restrictions.push({ sourceId, command, option, param });
    }
  }

  private removeRestriction(sourceId: string, command: RlvCommandType, option: string): void {
    this.restrictions = this.restrictions.filter(
      (r) => !(r.sourceId === sourceId && r.command === command && r.option === option)
    );
  }

  private getFormattedStatus(sourceId: string, optionFilter: string): string {
    const active = this.restrictions.filter(
      (r) => (!sourceId || r.sourceId === sourceId) && (!optionFilter || r.command === optionFilter || r.option === optionFilter)
    );
    return active.map((r) => `${r.command}:${r.option}`).join('/');
  }

  // --- Restriction Queries ---

  public isRestricted(command: RlvCommandType, option?: string, targetId?: string): boolean {
    if (!this.enabled) return false;
    return this.restrictions.some((r) => {
      if (r.command !== command) return false;
      if (option && r.option && r.option.toLowerCase() !== option.toLowerCase()) return false;
      if (targetId && r.option && r.option.toLowerCase() !== targetId.toLowerCase()) return false;
      return true;
    });
  }

  public canDetach(attachmentName?: string, objectId?: string): boolean {
    return !this.isRestricted('detach', attachmentName, objectId);
  }

  public canSendChat(channel: number = 0): boolean {
    if (!this.enabled) return true;
    if (channel === 0) {
      return !this.isRestricted('sendchat');
    }
    return !this.isRestricted('sendchannel', channel.toString());
  }

  public canRecvChat(senderId?: string): boolean {
    return !this.isRestricted('recvchat', undefined, senderId);
  }

  public canSendIM(targetId?: string): boolean {
    return !this.isRestricted('sendim', undefined, targetId);
  }

  public canRecvIM(senderId?: string): boolean {
    return !this.isRestricted('recvim', undefined, senderId);
  }

  public canTeleportLandmark(): boolean {
    return !this.isRestricted('tplm');
  }

  public canTeleportLocation(): boolean {
    return !this.isRestricted('tploc');
  }

  public canTeleportSit(): boolean {
    return !this.isRestricted('sittp');
  }

  public canTeleportLure(senderId?: string): boolean {
    return !this.isRestricted('tplure', undefined, senderId);
  }

  public autoAcceptTeleport(senderId?: string): boolean {
    return this.isRestricted('accepttp', undefined, senderId);
  }

  public canShowInventory(): boolean {
    return !this.isRestricted('showinv');
  }

  public canViewNotecard(): boolean {
    return !this.isRestricted('viewnote');
  }

  public canSit(): boolean {
    return !this.isRestricted('sit');
  }

  public canUnsit(): boolean {
    return !this.isRestricted('unsit');
  }

  public canRemoveOutfit(itemOrType?: string): boolean {
    return !this.isRestricted('remoutfit', itemOrType);
  }

  public canAddOutfit(itemOrType?: string): boolean {
    return !this.isRestricted('addoutfit', itemOrType);
  }

  /**
   * Get channel redirects for local chat (@redirchat)
   */
  public getRedirChatChannels(): number[] {
    if (!this.enabled) return [];
    const channels: number[] = [];
    for (const r of this.restrictions) {
      if (r.command === 'redirchat' && r.option) {
        const ch = parseInt(r.option, 10);
        if (!isNaN(ch) && !channels.includes(ch)) {
          channels.push(ch);
        }
      }
    }
    return channels;
  }
}
