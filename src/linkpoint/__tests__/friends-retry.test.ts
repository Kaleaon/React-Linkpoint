import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';

describe('friends loading retries', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries after a failure and reports the error until the list arrives', async () => {
    vi.useFakeTimers();
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    const fetchFriends = vi
      .fn()
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'aaaa', name: 'Ada Lovelace', onlineStatus: 'online' }]);
    (app.protocol as any).fetchFriends = fetchFriends;
    const loaded = vi.fn();
    app.protocol.on('friends_loaded', loaded);

    await app.loadFriends();
    expect(app.friendsError).toBe('timed out');
    await vi.advanceTimersByTimeAsync(2001);
    expect(fetchFriends).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4001);
    expect(fetchFriends).toHaveBeenCalledTimes(3);
    expect(app.friendsError).toBeNull();
    expect(loaded).toHaveBeenCalledWith([
      { id: 'aaaa', name: 'Ada Lovelace', onlineStatus: 'online' },
    ]);
    app.protocol.off('friends_loaded', loaded);
  });
});
