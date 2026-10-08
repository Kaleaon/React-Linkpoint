import { describe, expect, it } from 'vitest';
import { FriendsExtended } from '../phase2/friends-extended';

describe('friend names', () => {
  it('a presence packet without a name keeps the name already known', () => {
    const friends = new (FriendsExtended as any)();
    friends.addFriend('aaaa', { name: 'Ada Lovelace', onlineStatus: 'offline' });
    friends.updateFriendStatus('aaaa', 'online', { id: 'aaaa', online: true });
    friends.updateFriendStatus('aaaa', 'offline', { id: 'aaaa', name: 'Resident' });
    expect(friends.getFriends().find((f: any) => f.id === 'aaaa').name).toBe('Ada Lovelace');
  });

  it('a friend first seen through presence is not given an undefined name', () => {
    const friends = new (FriendsExtended as any)();
    friends.updateFriendStatus('bbbb', 'online', { id: 'bbbb', online: true });
    expect(friends.getFriends().find((f: any) => f.id === 'bbbb').name).toBe('Friend');
    friends.addFriend('bbbb', { name: 'Grace Hopper' });
    expect(friends.getFriends().find((f: any) => f.id === 'bbbb').name).toBe('Grace Hopper');
  });
});
