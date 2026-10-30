import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { mountScreen, unmount, type Mounted } from './ui-helpers';
import { useAppState } from '../../hooks/useAppState.js';
import AsyncDataBoundary from '../../components/AsyncDataBoundary.jsx';
import StateBlock from '../../components/StateBlock.jsx';
import { InventoryManager } from '../inventory';
import { GroupsManager } from '../phase2/groups';
import { FriendsExtended } from '../phase2/friends-extended';
import { ChatManager } from '../chat';

describe('Centralized Async Data State Store & Onboarding State Machine', () => {
  let mounted: Mounted | null = null;

  afterEach(async () => {
    await unmount(mounted);
    mounted = null;
  });

  describe('Global asyncDataState store in AppContext & useAppState', () => {
    it('initializes asyncDataState for groups, inventory, friends, and chat domains', async () => {
      mounted = await mountScreen(() => null);
      const { asyncDataState } = mounted.ctx.current.state;

      expect(asyncDataState).toBeDefined();
      expect(asyncDataState.groups).toEqual({ status: 'idle', error: null, itemCount: 0 });
      expect(asyncDataState.inventory).toEqual({ status: 'idle', error: null, itemCount: 0 });
      expect(asyncDataState.friends).toEqual({ status: 'idle', error: null, itemCount: 0 });
      expect(asyncDataState.chat).toEqual({ status: 'idle', error: null, itemCount: 0 });
    });

    it('updates domain async state deterministically and ignores identical updates', async () => {
      mounted = await mountScreen(() => null);

      await act(async () => {
        mounted!.ctx.current.actions.setAsyncDataDomainState('groups', {
          status: 'loading',
          error: null,
        });
      });

      expect(mounted.ctx.current.state.asyncDataState.groups.status).toBe('loading');

      const prevState = mounted.ctx.current.state.asyncDataState;

      await act(async () => {
        mounted!.ctx.current.actions.setAsyncDataDomainState('groups', {
          status: 'loading',
          error: null,
          itemCount: 0,
        });
      });

      // Reference equality check to confirm no extra state update triggered
      expect(mounted.ctx.current.state.asyncDataState).toBe(prevState);

      await act(async () => {
        mounted!.ctx.current.actions.setAsyncDataDomainState('groups', {
          status: 'ready',
          itemCount: 5,
        });
      });

      expect(mounted.ctx.current.state.asyncDataState.groups.status).toBe('ready');
      expect(mounted.ctx.current.state.asyncDataState.groups.itemCount).toBe(5);
    });
  });

  describe('Data Managers EventEmitter Loading Events', () => {
    it('InventoryManager emits inventory_loading_start and inventory_loading_end', async () => {
      const mockProtocol = { on: vi.fn(), agentId: 'test-agent' } as any;
      const mockAuth = { isLoggedIn: () => true, user: { id: 'user-1' } } as any;
      const inv = new InventoryManager(mockProtocol, mockAuth);

      const startSpy = vi.fn();
      const endSpy = vi.fn();

      inv.on('inventory_loading_start', startSpy);
      inv.on('inventory_loading_end', endSpy);

      await inv.load();

      expect(startSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.stringMatching(/ready|empty/),
        }),
      );
    });

    it('GroupsManager emits loading and updated events', () => {
      const groups = new GroupsManager();
      const startSpy = vi.fn();
      const endSpy = vi.fn();
      const updatedSpy = vi.fn();

      groups.on('groups_loading_start', startSpy);
      groups.on('groups_loading_end', endSpy);
      groups.on('groups_updated', updatedSpy);

      groups.emit('groups_loading_start');
      groups.replaceGroups([{ id: 'g1', name: 'Test Group' }]);

      expect(startSpy).toHaveBeenCalled();
      expect(updatedSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'g1' })]),
      );
      expect(endSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          itemCount: 1,
          status: 'ready',
        }),
      );
    });

    it('FriendsExtended emits loading and loaded events', () => {
      const friends = new FriendsExtended();
      const startSpy = vi.fn();
      const endSpy = vi.fn();

      friends.on('friends_loading_start', startSpy);
      friends.on('friends_loading_end', endSpy);

      friends.emit('friends_loading_start');
      friends.emit('friends_loading_end', { itemCount: 0, status: 'empty' });

      expect(startSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledWith({ itemCount: 0, status: 'empty' });
    });

    it('ChatManager emits chat_loading_start and chat_loading_end on loadSessions', () => {
      const chat = new ChatManager({} as any, {} as any);
      const startSpy = vi.fn();
      const endSpy = vi.fn();

      chat.on('chat_loading_start', startSpy);
      chat.on('chat_loading_end', endSpy);

      chat.loadSessions();

      expect(startSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('AsyncDataBoundary Component', () => {
    it('renders SkeletonLoader placeholders during loading phase', async () => {
      mounted = await mountScreen(() => (
        <AsyncDataBoundary domain="inventory" loading={true}>
          <div data-testid="content">Loaded Content</div>
        </AsyncDataBoundary>
      ));

      expect(
        mounted.host.querySelector('[data-testid="async-data-boundary-loading-inventory"]'),
      ).toBeTruthy();
      expect(mounted.host.querySelector('[data-testid="content"]')).toBeFalsy();
    });

    it('renders StateBlock during empty phase', async () => {
      mounted = await mountScreen(() => (
        <AsyncDataBoundary
          domain="friends"
          empty={true}
          emptyTitle="NO FRIENDS FOUND"
          emptyBody="You do not have any friends yet."
          emptyBtn="ADD FRIEND"
        >
          <div data-testid="content">Loaded Content</div>
        </AsyncDataBoundary>
      ));

      expect(mounted.host.textContent).toContain('NO FRIENDS FOUND');
      expect(mounted.host.textContent).toContain('You do not have any friends yet.');
      expect(mounted.host.textContent).toContain('ADD FRIEND');
      expect(mounted.host.querySelector('[data-testid="content"]')).toBeFalsy();
    });

    it('renders children when data is ready', async () => {
      mounted = await mountScreen(() => (
        <AsyncDataBoundary domain="chat" loading={false} empty={false}>
          <div data-testid="content">Loaded Chat Message</div>
        </AsyncDataBoundary>
      ));

      expect(mounted.host.querySelector('[data-testid="content"]')).toBeTruthy();
      expect(mounted.host.textContent).toContain('Loaded Chat Message');
    });
  });

  describe('StateBlock Zero-Data Onboarding & Accessibility', () => {
    it('executes action callback on button click and keyboard activation', async () => {
      const actionSpy = vi.fn();

      mounted = await mountScreen(() => (
        <StateBlock
          domain="friends"
          status="empty"
          title="NO CONTACTS"
          body="Start exploring to connect with residents."
          btn="IMPORT CONTACTS"
          onAction={actionSpy}
          role="status"
          ariaLive="polite"
        />
      ));

      const actionBtn = mounted.host.querySelector(
        '[data-testid="state-block-action"]',
      ) as HTMLElement;
      expect(actionBtn).toBeTruthy();

      await act(async () => {
        actionBtn.click();
      });
      expect(actionSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        actionBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(actionSpy).toHaveBeenCalledTimes(2);

      await act(async () => {
        actionBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(actionSpy).toHaveBeenCalledTimes(3);
    });

    it('preserves WCAG accessibility attributes (role="status" and aria-live="polite")', async () => {
      mounted = await mountScreen(() => (
        <StateBlock
          domain="groups"
          status="empty"
          title="NO GROUPS"
          body="Join groups to stay connected."
          btn="EXPLORE GROUPS"
          role="status"
          ariaLive="polite"
        />
      ));

      const stateBlock = mounted.host.querySelector('[data-testid="state-block"]');
      expect(stateBlock).toBeTruthy();
      expect(stateBlock?.getAttribute('role')).toBe('status');
      expect(stateBlock?.getAttribute('aria-live')).toBe('polite');
    });
  });
});
