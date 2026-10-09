import { describe, it, expect } from 'vitest';
import { FriendsExtended } from '../phase2/friends-extended';

describe('FriendsExtended secondary set indexing', () => {
  it('maintains online friends set index accurately on add, update, and remove', () => {
    const friends = new FriendsExtended();

    friends.addFriend('{USER-1}', { name: 'User One', onlineStatus: 'online' });
    friends.addFriend('user-2', { name: 'User Two', onlineStatus: 'offline' });

    expect(friends.getStats().totalFriends).toBe(2);
    expect(friends.getStats().onlineFriends).toBe(1);

    const onlineList = friends.getOnlineFriends();
    expect(onlineList).toHaveLength(1);
    expect(onlineList[0].id).toBe('user-1');

    // Update user-2 status to online
    friends.updateFriendStatus('user-2', 'online');
    expect(friends.getStats().onlineFriends).toBe(2);
    expect(friends.getOnlineFriends()).toHaveLength(2);

    // Idempotent online update
    friends.updateFriendStatus('user-2', 'online');
    expect(friends.getStats().onlineFriends).toBe(2);

    // Update user-1 status to offline
    friends.updateFriendStatus('{user-1}', 'offline');
    expect(friends.getStats().onlineFriends).toBe(1);
    expect(friends.getOnlineFriends()[0].id).toBe('user-2');

    // Remove user-2
    friends.removeFriend('USER-2');
    expect(friends.getStats().totalFriends).toBe(1);
    expect(friends.getStats().onlineFriends).toBe(0);
    expect(friends.getOnlineFriends()).toHaveLength(0);
  });

  it('maintains pending request set index accurately on send, accept, and decline', async () => {
    const mockProtocol = {
      sendFriendRequest: async () => Promise.resolve(),
    };
    const friends = new FriendsExtended(mockProtocol);

    expect(friends.getStats().pendingRequests).toBe(0);

    const req1 = await friends.sendFriendRequest('user-a', 'Hello');
    expect(friends.getStats().pendingRequests).toBe(1);

    const req2 = await friends.sendFriendRequest('user-b', 'Hi');
    expect(friends.getStats().pendingRequests).toBe(2);

    // Accept req1
    await friends.acceptFriendRequest(req1.id);
    expect(friends.getStats().pendingRequests).toBe(1);

    // Decline req2
    friends.declineFriendRequest(req2.id);
    expect(friends.getStats().pendingRequests).toBe(0);
  });

  it('maintains pending requests when mutating friendRequests map directly', () => {
    const friends = new FriendsExtended();
    const map = (friends as any).friendRequests;

    map.set('req-100', { id: 'req-100', status: 'pending' });
    map.set('req-101', { id: 'req-101', status: 'accepted' });

    expect(friends.getStats().pendingRequests).toBe(1);

    map.set('req-100', { id: 'req-100', status: 'declined' });
    expect(friends.getStats().pendingRequests).toBe(0);

    map.set('req-102', { id: 'req-102', status: 'pending' });
    expect(friends.getStats().pendingRequests).toBe(1);

    map.delete('req-102');
    expect(friends.getStats().pendingRequests).toBe(0);
  });

  it('clears all secondary set indexes on clear()', () => {
    const friends = new FriendsExtended();
    friends.addFriend('u-1', { onlineStatus: 'online' });
    friends.addFriend('u-2', { onlineStatus: 'online' });
    (friends as any).friendRequests.set('r-1', { status: 'pending' });

    expect(friends.getStats().onlineFriends).toBe(2);
    expect(friends.getStats().pendingRequests).toBe(1);

    friends.clear();

    expect(friends.getStats().totalFriends).toBe(0);
    expect(friends.getStats().onlineFriends).toBe(0);
    expect(friends.getStats().pendingRequests).toBe(0);
    expect(friends.getOnlineFriends()).toHaveLength(0);
  });

  it('handles replaceFriends with secondary set indexing', () => {
    const friends = new FriendsExtended();
    friends.addFriend('f-1', { onlineStatus: 'online' });
    friends.addFriend('f-2', { onlineStatus: 'online' });

    expect(friends.getStats().onlineFriends).toBe(2);

    // replace with f-2 (online) and f-3 (offline)
    friends.replaceFriends([
      { id: 'f-2', onlineStatus: 'online' },
      { id: 'f-3', onlineStatus: 'offline' },
    ]);

    expect(friends.getStats().totalFriends).toBe(2);
    expect(friends.getStats().onlineFriends).toBe(1);
    expect(friends.getOnlineFriends()[0].id).toBe('f-2');
  });

  it('executes getStats in O(1) constant time for large lists', () => {
    const friends = new FriendsExtended();
    for (let i = 0; i < 50000; i++) {
      friends.addFriend(`friend-${i}`, {
        onlineStatus: i % 2 === 0 ? 'online' : 'offline',
      });
    }

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      friends.getStats();
    }
    const elapsed = performance.now() - start;

    expect(friends.getStats().totalFriends).toBe(50000);
    expect(friends.getStats().onlineFriends).toBe(25000);
    expect(elapsed).toBeLessThan(10); // < 10 ms for 1000 calls
  });
});
