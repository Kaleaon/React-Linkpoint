import { FriendsExtended } from './src/linkpoint/phase2/friends-extended.js';

function runBenchmark() {
  const friendsExt = new FriendsExtended();

  // Populate with large number of friends
  const numFriends = 100000;
  console.log(`Populating ${numFriends} friends...`);
  for (let i = 0; i < numFriends; i++) {
    friendsExt.addFriend(`user-${i}`, {
      name: `User ${i}`,
      onlineStatus: i % 4 === 0 ? 'online' : 'offline'
    });
  }

  // Populate with large number of requests
  const numRequests = 50000;
  console.log(`Populating ${numRequests} requests...`);
  for (let i = 0; i < numRequests; i++) {
    friendsExt['friendRequests'].set(`req-${i}`, {
      id: `req-${i}`,
      targetUserId: `target-${i}`,
      status: i % 5 === 0 ? 'pending' : 'accepted',
      timestamp: Date.now()
    });
  }

  // Silence console.log to avoid spamming output
  console.log = () => {};

  console.info("Running benchmark...");
  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    friendsExt.getStats();
  }
  const end = performance.now();

  console.info(`Time taken for ${iterations} iterations: ${(end - start).toFixed(2)} ms`);
}

runBenchmark();
