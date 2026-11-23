// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import {
  GestureRuntimeEngine,
  MAX_GESTURE_GRAPH_MEMORY_BYTES,
  parseMultiGestureAsset,
  SL_GESTURE_FLAGS,
} from '../gesture-runtime-engine';
import { InventorySpecialTypes } from '../phase2/inventory-types';
import { ChatManager } from '../chat';
import { ChatExtended } from '../phase2/chat-extended';
import { ChatType } from '../sl-message-types';

const require = createRequire(import.meta.url);
const { METHODS, callViewer } = require('../../../core/viewer-api.cjs');
const {
  ViewerSession,
  ActivateGesturesMessage,
  DeactivateGesturesMessage,
} = require('../../../core/viewer-session.cjs');
const { UUID } = require('@caspertech/node-metaverse/dist/lib/classes/UUID');
const { Packet } = require('@caspertech/node-metaverse/dist/lib/classes/Packet');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');

const SAMPLE_MULTI_GESTURE_V2 = [
  '2',
  '130 0', // 0x82 = F2, mask = 0
  '/wave',
  '',
  '4',
  '0',
  'Friendly Wave',
  '11111111-2222-3333-4444-555555555555',
  '0',
  '1',
  'Chime Sound',
  '22222222-3333-4444-5555-666666666666',
  '0',
  '3',
  '0.020000',
  String(SL_GESTURE_FLAGS.WAIT_TIME),
  '2',
  'Hello nearby residents!',
  '0',
].join('\n');

describe('Dedicated Gesture Runtime Engine and Action Pipeline', () => {
  afterEach(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.innerHTML = '';
  });

  describe('LLMultiGesture parsing, step compilation, and InventorySpecialTypes', () => {
    it('parses Second Life LLMultiGesture v2 assets into hotkey, trigger, and typed steps', () => {
      const parsed = parseMultiGestureAsset(SAMPLE_MULTI_GESTURE_V2, {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        name: 'Wave Gesture',
      });

      expect(parsed.hotkey).toBe('F2');
      expect(parsed.trigger).toBe('/wave');
      expect(parsed.replaceWith).toBe('');
      expect(parsed.steps).toHaveLength(4);
      expect(parsed.steps?.[0]).toMatchObject({
        type: 'animation',
        animId: '11111111-2222-3333-4444-555555555555',
        stop: false,
      });
      expect(parsed.steps?.[1]).toMatchObject({
        type: 'sound',
        soundId: '22222222-3333-4444-5555-666666666666',
      });
      expect(parsed.steps?.[2]).toMatchObject({
        type: 'wait',
        durationMs: 20,
      });
      expect(parsed.steps?.[3]).toMatchObject({
        type: 'chat',
        text: 'Hello nearby residents!',
      });
    });

    it('registers, compiles, activates, and executes gestures via InventorySpecialTypes', async () => {
      const executedSteps: string[] = [];
      const activateGestures = vi.fn(async () => ({ activated: true }));
      const deactivateGestures = vi.fn(async () => ({ deactivated: true }));

      const runtime = new GestureRuntimeEngine({
        bridge: {
          connected: true,
          activateGestures,
          deactivateGestures,
        },
        handlers: {
          onAnimation: (step) => {
            executedSteps.push(`anim:${step.assetId}`);
          },
          onSound: (step) => {
            executedSteps.push(`sound:${step.assetId}`);
          },
          onChat: (step) => {
            executedSteps.push(`chat:${step.text}`);
          },
        },
      });

      const inventoryTypes = new InventorySpecialTypes();
      inventoryTypes.setGestureRuntime(runtime);

      const gestureId = '33333333-4444-4555-8666-777777777777';
      const compiled = inventoryTypes.registerGesture(gestureId, {
        itemId: gestureId,
        assetId: '44444444-5555-4666-8777-888888888888',
        name: 'Greeting Sequence',
        assetData: SAMPLE_MULTI_GESTURE_V2,
        active: false,
      });

      expect(compiled.steps).toHaveLength(4);
      expect(inventoryTypes.getStats().gestures).toEqual({ total: 1, active: 0 });
      expect(inventoryTypes.getGestureMemoryBytes()).toBeGreaterThan(0);

      inventoryTypes.setGestureActive(gestureId, true);
      expect(inventoryTypes.getStats().gestures).toEqual({ total: 1, active: 1 });
      await Promise.resolve();
      expect(activateGestures).toHaveBeenCalledWith({
        gestures: [
          {
            itemId: gestureId,
            assetId: '44444444-5555-4666-8777-888888888888',
            gestureFlags: 0,
          },
        ],
        flags: 0,
      });

      const result = await inventoryTypes.executeGesture(gestureId);
      expect(result).toEqual({
        gestureId,
        completed: true,
        aborted: false,
        stepsExecuted: 4,
      });
      expect(executedSteps).toEqual([
        'anim:11111111-2222-3333-4444-555555555555',
        'sound:22222222-3333-4444-5555-666666666666',
        'chat:Hello nearby residents!',
      ]);

      inventoryTypes.setGestureActive(gestureId, false);
      await Promise.resolve();
      expect(deactivateGestures).toHaveBeenCalledWith({
        gestures: [{ itemId: gestureId, gestureFlags: 0 }],
        flags: 0,
      });
    });
  });

  describe('Constraints: yielding execution and 5 MiB compiled graph memory cap', () => {
    it('enforces the 5 MiB compiled gesture step graph memory cap and reclaims bytes on unregister', () => {
      expect(MAX_GESTURE_GRAPH_MEMORY_BYTES).toBe(5 * 1024 * 1024);

      const boundedEngine = new GestureRuntimeEngine({ maxMemoryBytes: 1200 });
      boundedEngine.registerGesture('g-1', {
        name: 'First Gesture',
        steps: [
          { type: 'chat', text: 'Step one' },
          { type: 'chat', text: 'Step two' },
        ],
      });
      const firstUsage = boundedEngine.memoryUsageBytes;
      expect(firstUsage).toBeGreaterThan(0);
      expect(firstUsage).toBeLessThanOrEqual(1200);

      expect(() =>
        boundedEngine.registerGesture('g-overflow', {
          name: 'Oversized Gesture',
          steps: Array.from({ length: 20 }, (_, i) => ({
            type: 'chat' as const,
            text: `Large step payload ${i} ${'x'.repeat(40)}`,
          })),
        }),
      ).toThrow(/memory limit exceeded/i);

      expect(boundedEngine.memoryUsageBytes).toBe(firstUsage);
      expect(boundedEngine.unregisterGesture('g-1')).toBe(true);
      expect(boundedEngine.memoryUsageBytes).toBe(0);
    });

    it('yields control between consecutive gesture steps so UI tasks interleave without freezing', async () => {
      const timeline: string[] = [];
      const engine = new GestureRuntimeEngine({
        handlers: {
          onChat: (step) => {
            timeline.push(`step:${step.text}`);
          },
        },
      });

      engine.registerGesture('yield-test', {
        name: 'Yield Check',
        steps: [
          { type: 'chat', text: 'A' },
          { type: 'chat', text: 'B' },
          { type: 'chat', text: 'C' },
        ],
      });

      const executionPromise = engine.executeGesture('yield-test');
      // Synchronous callers regain control after step A before step B runs on the next macrotask turn
      expect(timeline).toEqual(['step:A']);
      timeline.push('ui-frame-between-steps');

      const result = await executionPromise;
      expect(result.completed).toBe(true);
      expect(timeline[0]).toBe('step:A');
      expect(timeline[1]).toBe('ui-frame-between-steps');
      expect(timeline.slice(2)).toEqual(['step:B', 'step:C']);
    });

    it('aborts in-flight gesture step execution immediately when deactivated', async () => {
      const executed: string[] = [];
      const engine = new GestureRuntimeEngine({
        handlers: {
          onChat: (step) => {
            executed.push(step.text);
          },
        },
      });

      engine.registerGesture('abort-test', {
        name: 'Long Gesture',
        active: true,
        steps: [
          { type: 'chat', text: 'before-wait' },
          { type: 'wait', durationMs: 5000 },
          { type: 'chat', text: 'after-wait' },
        ],
      });

      const execPromise = engine.executeGesture('abort-test');
      expect(executed).toEqual(['before-wait']);

      await engine.deactivateGesture('abort-test');
      const outcome = await execPromise;
      expect(outcome).toEqual({
        gestureId: 'abort-test',
        completed: false,
        aborted: true,
        stepsExecuted: 1,
      });
      expect(executed).toEqual(['before-wait']);
    });
  });

  describe('Hotkey listener and text-input focus guardrails', () => {
    it('executes active gesture assigned to F2 and ignores keystrokes when text inputs have focus', async () => {
      const triggered: string[] = [];
      const engine = new GestureRuntimeEngine({
        keyTarget: window,
        handlers: {
          onAnimation: (step) => {
            triggered.push(step.assetId);
          },
        },
      });

      engine.registerGesture('f2-wave', {
        name: 'Hotkey Wave',
        hotkey: 'F2',
        active: true,
        steps: [{ type: 'animation', animId: '55555555-6666-4777-8888-999999999999' }],
      });

      // 1. Focused <input>: must ignore F2 even when keydown bubbles/dispatches on window
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }));
      expect(triggered).toHaveLength(0);

      // 2. Focused <textarea>: must ignore F2
      input.blur();
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }));
      expect(triggered).toHaveLength(0);

      // 3. Focused contenteditable: must ignore F2
      textarea.blur();
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      editable.tabIndex = 0;
      document.body.appendChild(editable);
      editable.focus();
      editable.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }),
      );
      expect(triggered).toHaveLength(0);

      // 4. Blur text input -> pressing F2 executes the gesture sequence!
      editable.blur();
      const executions = engine.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'F2', code: 'F2', cancelable: true }),
      );
      expect(executions).toHaveLength(1);
      await Promise.all(executions);
      expect(triggered).toEqual(['55555555-6666-4777-8888-999999999999']);

      engine.destroy();
    });
  });

  describe('Outbound chat trigger matching in ChatManager and ChatExtended', () => {
    let sendSpatialChat: ReturnType<typeof vi.fn>;
    let chatManager: ChatManager;
    let engine: GestureRuntimeEngine;

    beforeEach(() => {
      sendSpatialChat = vi.fn(async () => undefined);
      const mockProtocol: any = {
        on: vi.fn(),
        sendChat: sendSpatialChat,
      };
      const mockAuth = {
        isLoggedIn: () => true,
        getUserDisplayName: () => 'Tester Resident',
        user: { id: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb', fullName: 'Tester Resident' },
      };

      chatManager = new ChatManager(mockProtocol, mockAuth);
      engine = new GestureRuntimeEngine({
        handlers: {
          onChat: (step) =>
            chatManager.sendMessage(step.text, step.channel, step.chatType as ChatType, {
              skipGestureTriggers: true,
            }),
        },
      });
      chatManager.setGestureEngine(engine);
    });

    it('consumes standalone slash triggers in ChatManager while executing the gesture sequence', async () => {
      const animPlayed = vi.fn();
      engine.setHandlers({
        onAnimation: animPlayed,
        onChat: (step) =>
          chatManager.sendMessage(step.text, step.channel, step.chatType as ChatType, {
            skipGestureTriggers: true,
          }),
      });

      engine.registerGesture('slash-wave', {
        name: 'Slash Wave',
        trigger: '/wave',
        replaceWith: '',
        active: true,
        steps: [
          { type: 'animation', animId: '66666666-7777-4888-8999-aaaaaaaaaaaa' },
          { type: 'chat', text: 'Wavesenthusiastically!' },
        ],
      });

      const triggeredEvents: any[] = [];
      chatManager.on('gesture_triggered', (ev: any) => triggeredEvents.push(ev));

      await chatManager.sendMessage('/wave', 0, ChatType.NORMAL);

      expect(triggeredEvents).toHaveLength(1);
      expect(triggeredEvents[0]).toMatchObject({
        matchedGestureIds: ['slash-wave'],
        consumed: true,
      });
      expect(animPlayed).toHaveBeenCalledTimes(1);

      // Raw "/wave" was NOT transmitted; instead the gesture's chat step executes asynchronously
      await new Promise((r) => setTimeout(r, 15));
      expect(sendSpatialChat).toHaveBeenCalledTimes(1);
      expect(sendSpatialChat).toHaveBeenCalledWith('Wavesenthusiastically!', 0, ChatType.NORMAL);
    });

    it('revises outbound chat text when a matched trigger defines replaceWith in ChatManager and ChatExtended', async () => {
      const soundPlayed = vi.fn();
      engine.setHandlers({ onSound: soundPlayed });
      engine.registerGesture('cheer-trigger', {
        name: 'Cheer',
        trigger: '/cheer',
        replaceWith: 'cheers loudly!',
        active: true,
        steps: [{ type: 'sound', soundId: '77777777-8888-4999-8aaa-bbbbbbbbbbbb' }],
      });

      await chatManager.sendMessage('/cheer', 0, ChatType.SHOUT);
      expect(soundPlayed).toHaveBeenCalledTimes(1);
      expect(sendSpatialChat).toHaveBeenCalledWith('cheers loudly!', 0, ChatType.SHOUT);

      const extSend = vi.fn(async () => undefined);
      const chatExt = new ChatExtended({ sendChat: extSend } as any);
      chatExt.adapter.sendSpatialChat = extSend;
      chatExt.setGestureEngine(engine);

      const extResult = await chatExt.sendWithRange('Hey everyone /cheer', 'normal');
      expect(extResult.text).toBe('Hey everyone cheers loudly!');
      expect(extSend).toHaveBeenCalledWith('Hey everyone cheers loudly!', 'normal');
      expect(soundPlayed).toHaveBeenCalledTimes(2);
    });
  });

  describe('Protocol packets (ActivateGestures 0xFFFF013C & DeactivateGestures 0xFFFF013D) and RPC whitelist', () => {
    it('whitelists gesture RPC methods in core/viewer-api.cjs', () => {
      for (const method of [
        'fetchGesture',
        'activateGestures',
        'activateGesture',
        'deactivateGestures',
        'deactivateGesture',
        'setAgentAnimation',
        'triggerGestureSound',
      ]) {
        expect(METHODS.has(method)).toBe(true);
      }
    });

    it('serializes ActivateGestures (0xFFFF013C) and DeactivateGestures (0xFFFF013D) accurately and round-trips through Packet', () => {
      const agentId = '10101010-2020-4030-8040-505050505050';
      const sessionId = '60606060-7070-4080-9090-a0a0a0a0a0a0';
      const itemId = 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5';
      const assetId = 'd4d4d4d4-e5e5-4f6f-8a7a-b8b8b8b8b8b8';

      const activateMsg = new ActivateGesturesMessage();
      expect(activateMsg.id).toBe(0xffff013c >>> 0);
      activateMsg.AgentData = {
        AgentID: new UUID(agentId),
        SessionID: new UUID(sessionId),
        Flags: 0,
      };
      activateMsg.Data = [
        {
          ItemID: new UUID(itemId),
          AssetID: new UUID(assetId),
          GestureFlags: 2,
        },
      ];

      expect(activateMsg.getSize()).toBe(37 + 36);
      const actPacket = new Packet();
      actPacket.message = activateMsg;
      actPacket.packetFlags = PacketFlags.Reliable;
      actPacket.sequenceNumber = 42;
      const actBuf = Buffer.alloc(actPacket.getSize());
      actPacket.writeToBuffer(actBuf, 0);

      const parsedActPacket = new Packet();
      const actAcks: number[] = [];
      parsedActPacket.readFromBuffer(
        actBuf,
        0,
        () => {},
        (seq: number) => actAcks.push(seq),
      );
      expect(actAcks).toEqual([42]);
      expect(parsedActPacket.sequenceNumber).toBe(42);
      expect(parsedActPacket.message.name).toBe('ActivateGestures');
      expect(parsedActPacket.message.AgentData.AgentID.toString()).toBe(agentId);
      expect(parsedActPacket.message.AgentData.SessionID.toString()).toBe(sessionId);
      expect(parsedActPacket.message.Data).toHaveLength(1);
      expect(parsedActPacket.message.Data[0].ItemID.toString()).toBe(itemId);
      expect(parsedActPacket.message.Data[0].AssetID.toString()).toBe(assetId);
      expect(parsedActPacket.message.Data[0].GestureFlags).toBe(2);

      // Also verify direct ActivateGesturesMessage.readFromBuffer round-trip
      const directActBuf = Buffer.alloc(activateMsg.getSize());
      expect(activateMsg.writeToBuffer(directActBuf, 0)).toBe(activateMsg.getSize());
      const decodedAct = new ActivateGesturesMessage();
      expect(decodedAct.readFromBuffer(directActBuf, 0)).toBe(activateMsg.getSize());
      expect(decodedAct.Data[0].ItemID.toString()).toBe(itemId);
      expect(decodedAct.Data[0].AssetID.toString()).toBe(assetId);

      const deactivateMsg = new DeactivateGesturesMessage();
      expect(deactivateMsg.id).toBe(0xffff013d >>> 0);
      deactivateMsg.AgentData = {
        AgentID: new UUID(agentId),
        SessionID: new UUID(sessionId),
        Flags: 0,
      };
      deactivateMsg.Data = [
        {
          ItemID: new UUID(itemId),
          GestureFlags: 0,
        },
      ];

      expect(deactivateMsg.getSize()).toBe(37 + 20);
      const deactPacket = new Packet();
      deactPacket.message = deactivateMsg;
      deactPacket.packetFlags = PacketFlags.Reliable;
      deactPacket.sequenceNumber = 43;
      const deactBuf = Buffer.alloc(deactPacket.getSize());
      deactPacket.writeToBuffer(deactBuf, 0);

      const parsedDeactPacket = new Packet();
      const deactAcks: number[] = [];
      parsedDeactPacket.readFromBuffer(
        deactBuf,
        0,
        () => {},
        (seq: number) => deactAcks.push(seq),
      );
      expect(deactAcks).toEqual([43]);
      expect(parsedDeactPacket.sequenceNumber).toBe(43);
      expect(parsedDeactPacket.message.name).toBe('DeactivateGestures');
      expect(parsedDeactPacket.message.AgentData.AgentID.toString()).toBe(agentId);
      expect(parsedDeactPacket.message.Data).toHaveLength(1);
      expect(parsedDeactPacket.message.Data[0].ItemID.toString()).toBe(itemId);
      expect(parsedDeactPacket.message.Data[0].GestureFlags).toBe(0);

      const directDeactBuf = Buffer.alloc(deactivateMsg.getSize());
      expect(deactivateMsg.writeToBuffer(directDeactBuf, 0)).toBe(deactivateMsg.getSize());
      const decodedDeact = new DeactivateGesturesMessage();
      expect(decodedDeact.readFromBuffer(directDeactBuf, 0)).toBe(deactivateMsg.getSize());
      expect(decodedDeact.Data[0].ItemID.toString()).toBe(itemId);
    });

    it('synchronizes activated and deactivated gestures via ViewerSession over Reliable circuit packets (including >255 batching)', async () => {
      const events: Array<{ type: string; payload: any }> = [];
      const session = new ViewerSession((type: string, payload: any) =>
        events.push({ type, payload }),
      );

      const sentPackets: Array<{ msg: any; flags: number }> = [];
      const circuit = {
        sessionID: new UUID('12121212-3434-4565-8787-989898989898'),
        sendMessage: vi.fn((msg: any, flags: number) => {
          sentPackets.push({ msg, flags });
          return sentPackets.length;
        }),
      };

      session.identity = { agentId: 'abababab-cdcd-4efe-8121-343434343434' };
      session.bot = {
        agent: {
          agentID: new UUID('abababab-cdcd-4efe-8121-343434343434'),
          inventory: { main: { skeleton: new Map() } },
        },
        currentRegion: { circuit },
      };

      // Generate 260 gestures to verify automatic 255-entry packet batching
      const manyGestures = Array.from({ length: 260 }, (_, idx) => {
        const hex = idx.toString(16).padStart(12, '0');
        return {
          itemId: `00000001-0000-4000-8000-${hex}`,
          assetId: `00000002-0000-4000-8000-${hex}`,
          gestureFlags: 0,
        };
      });

      const actRes = await callViewer(session, 'activateGestures', { gestures: manyGestures });
      expect(actRes.activated).toBe(true);
      expect(actRes.count).toBe(260);
      expect(sentPackets).toHaveLength(2);
      expect(sentPackets[0].flags).toBe(PacketFlags.Reliable);
      expect(sentPackets[0].msg).toBeInstanceOf(ActivateGesturesMessage);
      expect(sentPackets[0].msg.Data).toHaveLength(255);
      expect(sentPackets[1].msg.Data).toHaveLength(5);
      expect(events.some((e) => e.type === 'gestures-activated')).toBe(true);

      sentPackets.length = 0;
      const deactRes = await callViewer(session, 'deactivateGesture', {
        itemId: manyGestures[0].itemId,
      });
      expect(deactRes.deactivated).toBe(true);
      expect(sentPackets).toHaveLength(1);
      expect(sentPackets[0].flags).toBe(PacketFlags.Reliable);
      expect(sentPackets[0].msg).toBeInstanceOf(DeactivateGesturesMessage);
      expect(sentPackets[0].msg.Data[0].ItemID.toString()).toBe(manyGestures[0].itemId);
      expect(events.some((e) => e.type === 'gestures-deactivated')).toBe(true);
    });
  });

  describe('Guardrail: no visual gesture authoring UI in Inventory', () => {
    it('renders read-only gesture runtime metadata and activation/play controls without authoring inputs', async () => {
      const { app } = await import('../app');
      const { ThemeProvider } = await import('../../context/ThemeContext.jsx');
      const { AppProvider } = await import('../../context/AppContext.jsx');
      const { default: Inventory } = await import('../../screens/Inventory.jsx');

      const gestureItemId = '99999999-8888-4777-8666-555555555555';
      app.inventory.items.set(gestureItemId, {
        id: gestureItemId,
        assetId: '88888888-7777-4666-8555-444444444444',
        name: 'Bow Gesture',
        assetType: 21,
        parent: 'root',
      } as any);
      localStorage.setItem('linkpoint_inventory_view_mode', 'flat');

      const host = document.createElement('div');
      document.body.appendChild(host);
      const root: Root = createRoot(host);

      await act(async () => {
        root.render(
          createElement(
            AppProvider as any,
            null,
            createElement(ThemeProvider as any, null, createElement(Inventory)),
          ),
        );
      });

      const buttons = Array.from(host.querySelectorAll('button'));
      const bowButton = buttons.find((btn) => btn.textContent?.includes('Bow Gesture'));
      expect(bowButton).toBeTruthy();

      await act(async () => {
        bowButton?.click();
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 130));
      });

      const textContent = host.textContent || '';
      expect(textContent).toContain('Activate Gesture');
      expect(textContent).toContain('Play Gesture');
      // Unknown trigger/shortcut render as em-dash per FAKE_DATA_POLICY
      expect(textContent.split('—').length - 1).toBeGreaterThanOrEqual(2);
      // No visual gesture step editor / authoring controls
      expect(/add step|edit gesture|new gesture|save gesture/i.test(textContent)).toBe(false);

      await act(async () => {
        root.unmount();
      });
      app.inventory.items.delete(gestureItemId);
      app.inventoryTypes.unregisterGesture(gestureItemId);
    });
  });
});
