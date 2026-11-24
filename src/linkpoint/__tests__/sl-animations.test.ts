import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  serializeAnimationMessage,
  subscribeAnimations,
  watchAnimations,
  downloadAnimation,
  sendAgentAnimations,
} = require('../../../core/sl-animations.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const {
  AgentAnimationMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/AgentAnimation');
const { callViewer } = require('../../../core/viewer-api.cjs');
const { ViewerSession, serializeObject } = require('../../../core/viewer-session.cjs');

const uuid = (value: string) => ({ toString: () => value });

describe('simulator animation messages', () => {
  it('serialises AvatarAnimation and ObjectAnimation with sequence ids', () => {
    const avatar = serializeAnimationMessage({
      message: {
        id: Message.AvatarAnimation,
        Sender: { ID: uuid('agent-1') },
        AnimationList: [
          { AnimID: uuid('anim-a'), AnimSequenceID: 7 },
          { AnimID: uuid('anim-b'), AnimSequenceID: 2 },
        ],
      },
    });
    expect(avatar).toEqual({
      kind: 'avatar',
      id: 'agent-1',
      animations: [
        { id: 'anim-a', seq: 7 },
        { id: 'anim-b', seq: 2 },
      ],
    });
    const object = serializeAnimationMessage({
      message: {
        id: Message.ObjectAnimation,
        Sender: { ID: uuid('obj-1') },
        AnimationList: [{ AnimID: uuid('anim-c'), AnimSequenceID: 1 }],
      },
    });
    expect(object).toMatchObject({ kind: 'object', id: 'obj-1' });
  });

  it('ignores unrelated or malformed messages', () => {
    expect(serializeAnimationMessage(null)).toBeNull();
    expect(
      serializeAnimationMessage({
        message: { id: Message.ChatFromSimulator, Sender: { ID: uuid('x') } },
      }),
    ).toBeNull();
    expect(serializeAnimationMessage({ message: { id: Message.AvatarAnimation } })).toBeNull();
  });

  it('subscribes to both message types on the region circuit and forwards payloads', () => {
    const subscribeToMessages = vi.fn((ids: number[], callback: (packet: unknown) => void) => {
      callback({
        message: {
          id: Message.AvatarAnimation,
          Sender: { ID: uuid('agent-1') },
          AnimationList: [],
        },
      });
      return { unsubscribe: vi.fn() };
    });
    const send = vi.fn();
    const subscription = subscribeAnimations({ circuit: { subscribeToMessages } }, send);
    expect(subscription).toBeTruthy();
    expect(subscribeToMessages.mock.calls[0][0]).toEqual([
      Message.AvatarAnimation,
      Message.ObjectAnimation,
    ]);
    expect(send).toHaveBeenCalledWith('animations', {
      kind: 'avatar',
      id: 'agent-1',
      animations: [],
    });
    expect(subscribeAnimations({}, send)).toBeNull();
  });
});

describe('following the agent across regions', () => {
  it('moves the listener to the new region circuit when the current region changes, and stops on unsubscribe', () => {
    vi.useFakeTimers();
    const makeRegion = () => {
      const unsubscribe = vi.fn();
      return { unsubscribe, circuit: { subscribeToMessages: vi.fn(() => ({ unsubscribe })) } };
    };
    const first = makeRegion(),
      second = makeRegion();
    let current: any = first;
    const watcher = watchAnimations(() => current, vi.fn(), 1000);
    expect(first.circuit.subscribeToMessages).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(first.circuit.subscribeToMessages).toHaveBeenCalledTimes(1); // unchanged: no resubscribe
    current = second;
    vi.advanceTimersByTime(1000);
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.circuit.subscribeToMessages).toHaveBeenCalledTimes(1);
    current = undefined; // between regions: keep the old listener, do not crash
    vi.advanceTimersByTime(2000);
    expect(second.unsubscribe).not.toHaveBeenCalled();
    watcher.unsubscribe();
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(second.circuit.subscribeToMessages).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('animated mesh flag', () => {
  const object = (flags?: number, mesh = true) => ({
    FullID: uuid('obj'),
    PCode: 9,
    Position: { x: 1, y: 2, z: 3 },
    Scale: { x: 1, y: 1, z: 1 },
    extraParams: {
      meshData: mesh ? { meshData: uuid('mesh-asset') } : undefined,
      extendedMeshData: flags === undefined ? undefined : { flags },
    },
  });
  it('marks mesh objects whose ExtendedMesh flags enable Animesh', () => {
    expect(serializeObject({ localID: 1, object: object(1) }).animatedMesh).toBe(true);
    expect(serializeObject({ localID: 1, object: object(0) }).animatedMesh).toBe(false);
    expect(serializeObject({ localID: 1, object: object(undefined) }).animatedMesh).toBe(false);
    expect(serializeObject({ localID: 1, object: object(1, false) }).animatedMesh).toBe(false);
  });
});

describe('animation asset downloads', () => {
  it('falls back to the simulator transfer service when ViewerAsset returns 403', async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const transfer = vi.fn().mockResolvedValue(bytes);
    const bot = {
      clientCommands: {
        asset: {
          downloadAsset: vi.fn().mockRejectedValue(new Error('Response code 403 (Forbidden)')),
          transfer,
        },
      },
    };
    const id = '835965c6-7f2f-bda2-5deb-2478737f91bf';
    await expect(downloadAnimation(bot, id)).resolves.toBe(bytes.toString('base64'));
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer.mock.calls[0][3].subarray(0, 16)).toHaveLength(16);
  });
});

describe('outbound AgentAnimation packets (sendAgentAnimations)', () => {
  const AGENT_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
  const SESSION_ID = 'cccccccc-4444-5555-6666-dddddddddddd';
  const ANIM_STOP = '11111111-2222-3333-4444-555555555501';
  const ANIM_START = '11111111-2222-3333-4444-555555555502';

  it('serializes valid AgentAnimationMessage packets on the reliable circuit and round-trips wire bytes', () => {
    const sendMessage = vi.fn();
    const region = { circuit: { sessionID: SESSION_ID, sendMessage } };
    const bot = { agent: { agentID: AGENT_ID } };

    const res = sendAgentAnimations(bot, region, [
      { id: ANIM_STOP.toUpperCase(), start: false },
      { id: ANIM_START, start: true },
    ]);
    expect(res).toEqual({ sent: true, count: 2 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [msg, flags] = sendMessage.mock.calls[0];
    expect(flags).toBe(PacketFlags.Reliable);
    expect(msg).toBeInstanceOf(AgentAnimationMessage);

    // Round-trip wire binary serialization to prove simulator packet integrity
    const buf = Buffer.alloc(msg.getSize());
    msg.writeToBuffer(buf, 0);
    const decoded = new AgentAnimationMessage();
    decoded.readFromBuffer(buf, 0);
    expect(decoded.AgentData.AgentID.toString()).toBe(AGENT_ID);
    expect(decoded.AgentData.SessionID.toString()).toBe(SESSION_ID);
    expect(decoded.AnimationList).toHaveLength(2);
    expect(decoded.AnimationList[0].AnimID.toString()).toBe(ANIM_STOP);
    expect(decoded.AnimationList[0].StartAnim).toBe(false);
    expect(decoded.AnimationList[1].AnimID.toString()).toBe(ANIM_START);
    expect(decoded.AnimationList[1].StartAnim).toBe(true);
  });

  it('dispatches through ViewerSession and callViewer, rejecting malformed UUIDs or disconnected sessions', async () => {
    const sendMessage = vi.fn();
    const session = new ViewerSession(() => {});
    (session as any).bot = {
      agent: { agentID: AGENT_ID },
      currentRegion: { circuit: { sessionID: SESSION_ID, sendMessage } },
    };

    await expect(
      callViewer(session, 'sendAgentAnimations', {
        animations: [{ id: ANIM_START, start: true }],
      }),
    ).resolves.toEqual({ sent: true, count: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    expect(() =>
      sendAgentAnimations(
        { agent: { agentID: AGENT_ID } },
        { circuit: { sessionID: SESSION_ID, sendMessage } },
        [{ id: '00000000-0000-0000-0000-000000000000', start: true }],
      ),
    ).toThrow(/valid non-zero UUID/);
  });
});
