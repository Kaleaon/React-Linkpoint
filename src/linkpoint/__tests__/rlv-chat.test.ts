import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatManager } from '../chat';
import { AgentController } from '../agent-controls';
import { RlvHandler } from '../rlv-handler';
import { Utils } from '../utils';

const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OBJ = '11111111-1111-1111-1111-111111111111';
const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function setup() {
  Utils.storage.remove('linkpoint_chat_history');
  Utils.storage.remove('linkpoint_auto_reply_config');
  const sendChat = vi.fn().mockResolvedValue(undefined);
  const sendDirectIM = vi.fn();
  const manager = new ChatManager({ sendChat }, { isLoggedIn: () => true, getUserDisplayName: () => 'Me', user: { id: ME } });
  (manager as any).adapter.sendDirectIM = sendDirectIM.mockResolvedValue({ queued: false });
  const replies: Array<[string, number, number]> = [];
  const rlv = new RlvHandler({ selfId: () => ME, sendChat: (t, c, ty) => { replies.push([t, c, ty]); } });
  manager.setRlv(rlv);
  return { manager, rlv, sendChat, sendDirectIM, replies };
}
const owner = (message: string) => ({ fromId: OBJ, fromName: 'Collar', message, chatType: 8, sourceType: 2 });

describe('ChatManager with RLV', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); t.rlv.setEnabled(true); });

  it('consumes llOwnerSay command lines: applied, never shown', async () => {
    await t.manager.handleIncomingMessage(owner('@sendchat=n,version=2222'));
    expect(t.manager.messages).toHaveLength(0);
    expect(t.rlv.hasBehaviour('sendchat')).toBe(true);
    expect(t.replies).toEqual([['RestrainedLife viewer v3.4.3 (RLVa 2.4.2)', 2222, 2]]);
  });

  it('shows the same line normally while RLV is off', async () => {
    t.rlv.setEnabled(false);
    await t.manager.handleIncomingMessage(owner('@sendchat=n'));
    expect(t.manager.messages).toHaveLength(1);
    expect(t.rlv.hasBehaviour('sendchat')).toBe(false);
  });

  it('filters what @sendchat lets out, sending the ellipsis form', async () => {
    t.rlv.processCommand(OBJ, 'sendchat=n');
    await t.manager.sendMessage('hello there', 0, 1);
    expect(t.sendChat).toHaveBeenCalledWith('...', 0, 1);
  });

  it('@redirchat sends public chat to the channel and says nothing in public', async () => {
    t.rlv.processCommand(OBJ, 'redirchat:9=n');
    await t.manager.sendMessage('good evening', 0, 1);
    expect(t.sendChat).not.toHaveBeenCalled();
    expect(t.replies).toEqual([['good evening', 9, 2]]);
    expect(t.manager.messages).toHaveLength(0);
  });

  it('@chatnormal turns a shout or say into a whisper', async () => {
    t.rlv.processCommand(OBJ, 'chatnormal=n');
    await t.manager.sendMessage('((hi all))', 0, 2);
    expect(t.sendChat).toHaveBeenCalledWith('((hi all))', 0, 0);
  });

  it('@recvchat replaces other residents\' chat; a resident on the exception list is heard', async () => {
    t.rlv.processCommand(OBJ, 'recvchat=n');
    t.rlv.processCommand(OBJ, `recvchat:${BOB}=n`);
    await t.manager.handleIncomingMessage({ fromId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', fromName: 'Carol', message: 'hello', chatType: 1, sourceType: 1 });
    await t.manager.handleIncomingMessage({ fromId: BOB, fromName: 'Bob', message: 'hello', chatType: 1, sourceType: 1 });
    expect(t.manager.messages.map((m) => m.text)).toEqual(['...', 'hello']);
  });

  it('@shownames replaces a speaker\'s name', async () => {
    t.rlv.processCommand(OBJ, 'shownames=n');
    await t.manager.handleIncomingMessage({ fromId: BOB, fromName: 'Bob Builder', message: 'hi', chatType: 1, sourceType: 1 });
    expect(t.manager.messages[0].sender).not.toBe('Bob Builder');
    expect(t.manager.messages[0].sender).toBe(t.rlv.anonym('Bob Builder'));
  });

  it('@sendim refuses an IM; an exception allows it', async () => {
    t.rlv.processCommand(OBJ, 'sendim=n');
    await expect(t.manager.sendInstantMessage(BOB, 'psst')).rejects.toThrow('RLV');
    t.rlv.processCommand(OBJ, `sendim:${BOB}=n`);
    await expect(t.manager.sendInstantMessage(BOB, 'psst')).resolves.toBeDefined();
  });

  it('@recvim replaces an incoming IM with the viewer\'s notice', async () => {
    t.rlv.processCommand(OBJ, 'recvim=n');
    await t.manager.handleIncomingMessage({ fromId: BOB, fromName: 'Bob', message: 'secret', type: 'im' });
    expect(t.manager.messages[0].text).toBe('*** IM blocked by your viewer');
  });
});

describe('movement restrictions (AgentController)', () => {
  const FLY = 0x2000;
  it('@fly=n stops flying, ignores toggle_fly and the hold-jump auto fly, and lands an airborne avatar', () => {
    const controller = new AgentController();
    let canFly = true;
    controller.restrictions = { canFly: () => canFly };
    controller.command('toggle_fly', true, 0);
    expect(controller.nextFlags(1) & FLY).toBe(FLY);
    canFly = false;
    expect(controller.nextFlags(2) & FLY).toBe(0);
    controller.command('toggle_fly', true, 3);
    expect(controller.flying).toBe(false);
    controller.command('jump', true, 10);
    expect(controller.nextFlags(700) & FLY).toBe(0); // jump held past the 500 ms auto-fly time
  });

  it('@jump=n ignores jumping on the ground but still flies up', () => {
    const controller = new AgentController();
    controller.restrictions = { canJump: () => false };
    controller.command('jump', true, 0);
    expect(controller.isMoving()).toBe(false);
    controller.setFlying(true);
    controller.command('jump', true, 10);
    expect(controller.isMoving()).toBe(true);
  });

  it('@alwaysrun=n and @temprun=n keep the avatar walking', () => {
    const controller = new AgentController();
    let canAlways = false, canTemp = false;
    controller.restrictions = { canAlwaysRun: () => canAlways, canTempRun: () => canTemp };
    controller.command('toggle_run', true, 0);
    expect(controller.alwaysRun).toBe(false);
    controller.command('push_forward', true, 100); controller.command('push_forward', false, 150);
    controller.command('push_forward', true, 200); // tap-tap-hold would run
    const walking = controller.nextFlags(1000);
    canAlways = true; canTemp = true;
    controller.releaseAll();
    controller.command('push_forward', true, 2000); controller.command('push_forward', false, 2050);
    controller.command('push_forward', true, 2100);
    const running = controller.nextFlags(3000);
    expect(running).not.toBe(walking);
  });
});
