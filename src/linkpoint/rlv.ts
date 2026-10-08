/**
 * RLV controller: the small API the UI context (`src/viewer/RlvContext.tsx`) uses, kept as it was and now backed by
 * `RlvHandler` (rlv-handler.ts), which follows Firestorm's RLVa. Replies to `@version*`, `@getstatus*` and the like
 * come from RLVa's own strings and rules rather than invented ones.
 */
import { CHAT_TYPE, RlvHandler, type RlvEnvironment } from './rlv-handler';

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

export interface RlvReply {
  channel: number;
  message: string;
}

export class RlvController {
  readonly handler: RlvHandler;
  private onReplyCallback?: (channel: number, message: string) => void;
  private collected: RlvReply[] | null = null;

  constructor(enabled: boolean = false, env: RlvEnvironment = {}) {
    this.handler = new RlvHandler({
      ...env,
      sendChat: (text, channel, type) => {
        const reply = { channel, message: text };
        this.collected?.push(reply);
        this.onReplyCallback?.(channel, text);
        env.sendChat?.(text, channel, type);
      },
    });
    this.handler.setEnabled(enabled);
  }

  public setEnabled(enabled: boolean): void { this.handler.setEnabled(enabled); }
  public isEnabled(): boolean { return this.handler.isEnabled(); }
  public setReplyCallback(cb: (channel: number, message: string) => void): void { this.onReplyCallback = cb; }

  /**
   * Process a line of object chat such as "@detach=n,sendchat=n" as the viewer does for llOwnerSay: commands are
   * applied in order and the replies they send are returned. Does nothing while RLV is off.
   */
  public processMessage(sourceId: string, messageText: string): RlvReply[] {
    const replies: RlvReply[] = [];
    this.collected = replies;
    try {
      this.handler.handleObjectChat(sourceId, messageText, CHAT_TYPE.OWNER);
    } finally {
      this.collected = null;
    }
    return replies;
  }

  // --- Restriction queries -------------------------------------------------------------------------

  /** Whether any object holds `command`, optionally only with the given option (an attachment point, uuid or channel). */
  public isRestricted(command: RlvCommandType, option?: string, targetId?: string): boolean {
    if (!this.handler.isEnabled()) return false;
    const wanted = (option ?? targetId ?? '').toLowerCase();
    if (!wanted) return this.handler.hasBehaviour(command);
    for (const object of this.handler.objects.values()) {
      if (object.commands.some((c) => c.name === command && (c.option.toLowerCase() === wanted || c.option === ''))) return true;
    }
    return false;
  }

  public canDetach(attachmentName?: string, objectId?: string): boolean { return !this.isRestricted('detach', attachmentName, objectId); }
  public canSendChat(channel: number = 0): boolean {
    if (!this.handler.isEnabled()) return true;
    return channel === 0 ? !this.handler.hasBehaviour('sendchat') : this.handler.canSendChannel(channel);
  }
  public canRecvChat(senderId?: string): boolean {
    if (!this.handler.isEnabled()) return true;
    return !this.handler.hasBehaviour('recvchat') || (senderId ? this.handler.isException('recvchat', senderId) : false);
  }
  public canSendIM(targetId?: string): boolean { return targetId ? this.handler.canSendIM(targetId) : !this.handler.hasBehaviour('sendim') || !this.handler.isEnabled(); }
  public canRecvIM(senderId?: string): boolean { return senderId ? this.handler.canReceiveIM(senderId) : !this.handler.hasBehaviour('recvim') || !this.handler.isEnabled(); }
  public canTeleportLandmark(): boolean { return !this.handler.isEnabled() || this.handler.canTeleportToLandmark(); }
  public canTeleportLocation(): boolean { return !this.handler.isEnabled() || this.handler.canTeleportToLocation(''); }
  public canTeleportSit(): boolean { return !this.isRestricted('sittp'); }
  public canTeleportLure(senderId?: string): boolean { return !this.handler.isEnabled() || (senderId ? this.handler.canAcceptTpOffer(senderId) : !this.handler.hasBehaviour('tplure')); }
  public autoAcceptTeleport(senderId?: string): boolean { return this.handler.isEnabled() && this.handler.autoAcceptTeleportOffer(senderId ?? ''); }
  public canShowInventory(): boolean { return !this.handler.isEnabled() || this.handler.canShowInventory(); }
  public canViewNotecard(): boolean { return !this.isRestricted('viewnote'); }
  public canSit(): boolean { return !this.isRestricted('sit'); }
  public canUnsit(): boolean { return !this.isRestricted('unsit'); }
  public canRemoveOutfit(itemOrType?: string): boolean { return !this.isRestricted('remoutfit', itemOrType); }
  public canAddOutfit(itemOrType?: string): boolean { return !this.isRestricted('addoutfit', itemOrType); }

  /** Channels local chat is redirected to (`@redirchat:<channel>`). */
  public getRedirChatChannels(): number[] {
    if (!this.handler.isEnabled()) return [];
    const channels: number[] = [];
    for (const object of this.handler.objects.values()) {
      for (const c of object.commands) {
        if (c.name !== 'redirchat') continue;
        const channel = parseInt(c.option, 10);
        if (!Number.isNaN(channel) && !channels.includes(channel)) channels.push(channel);
      }
    }
    return channels;
  }
}
