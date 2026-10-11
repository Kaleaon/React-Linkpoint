// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';

describe('LinkpointApp automatic friend contacts sync', () => {
  beforeEach(() => {
    localStorage.clear();
    app.contacts.clear();
    app.friends.clear();
  });

  it('automatically populates contacts on friends_loaded event', () => {
    const loadedFriends = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Alice Resident',
        onlineStatus: 'online',
      },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Bob Linden', onlineStatus: 'offline' },
    ];

    expect(app.contacts.size).toBe(0);
    app.protocol.emit('friends_loaded', loadedFriends);

    expect(app.contacts.size).toBe(2);
    expect(app.contacts.get('11111111-1111-1111-1111-111111111111')?.name).toBe('Alice Resident');
    expect(app.contacts.get('22222222-2222-2222-2222-222222222222')?.name).toBe('Bob Linden');
  });

  it('automatically populates contact when a new friend is added', () => {
    expect(app.contacts.size).toBe(0);

    app.friends.addFriend('33333333-3333-3333-3333-333333333333', {
      name: 'Charlie Resident',
      onlineStatus: 'online',
    });

    expect(app.contacts.size).toBe(1);
    expect(app.contacts.get('33333333-3333-3333-3333-333333333333')?.name).toBe('Charlie Resident');
  });
});
