import { describe, expect, it, vi } from 'vitest';
import { Utils } from '../utils';
import { FriendsExtended } from '../phase2/friends-extended';
import { GroupsManager } from '../phase2/groups';
import { ObjectManagerExtended } from '../phase2/objects-extended';
import { NotificationsManager } from '../notifications';
import { WorldViewer } from '../world';
import { LAYOUTS } from '../../theme/layouts.js';
import { PALETTES } from '../../theme/palettes.js';
import { NAV_ALL } from '../../data/content.js';

class ProtocolStub extends Utils.EventEmitter {
  sendChat = vi.fn();
}

describe('runtime UI manager snapshots', () => {
  it('keeps every design layout and palette while adding Lumiya surfaces', () => {
    expect(Object.keys(LAYOUTS)).toEqual(expect.arrayContaining(['terminal', 'sweep', 'tiles', 'glass', 'rules', 'press']));
    expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(20);
    expect(NAV_ALL.map((item: any) => item.id)).toEqual(expect.arrayContaining(['Notecards', 'Media', 'Accounts', 'Grids']));
  });
  it('exposes friend, group and object records without exposing backing maps', () => {
    const friends = new FriendsExtended();
    friends.addFriend('friend-id', { name: 'Live Resident', onlineStatus: 'online' });
    const friendSnapshot = friends.getFriends();
    friendSnapshot[0].name = 'changed';
    expect(friends.getFriends()[0].name).toBe('Live Resident');

    const groups = new GroupsManager();
    groups.setGroupInfo('group-id', { name: 'Live Group' });
    expect(groups.getGroups()).toMatchObject([{ id: 'group-id', name: 'Live Group' }]);

    const objects = new ObjectManagerExtended();
    objects.setPrimParams('object-id', { shape: 'sphere' });
    expect(objects.getObjects()[0]).toMatchObject({ id: 'object-id', primParams: { shape: 'sphere' } });
  });

  it('retains and clears live notifications', () => {
    const notifications = new NotificationsManager(new ProtocolStub() as any);
    notifications.handleNotification({ title: 'Grid notice', message: 'Live payload' });
    expect(notifications.items).toHaveLength(1);
    notifications.clear();
    expect(notifications.items).toEqual([]);
    expect(notifications.unreadCount).toBe(0);
  });

  it('turns region and object protocol messages into world events', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const regionListener = vi.fn();
    const objectListener = vi.fn();
    world.on('region_changed', regionListener);
    world.on('objects_changed', objectListener);

    protocol.emit('RegionHandshake', { regionID: 'region-id', regionName: 'Live Region', regionX: 10, regionY: 20 });
    protocol.emit('ObjectUpdate', { id: 'object-id', name: 'Live Object' });

    expect(world.region).toMatchObject({ id: 'region-id', name: 'Live Region', x: 10, y: 20 });
    expect(world.objects).toMatchObject([{ id: 'object-id', name: 'Live Object' }]);
    expect(regionListener).toHaveBeenCalledOnce();
    expect(objectListener).toHaveBeenCalledOnce();
  });
});
