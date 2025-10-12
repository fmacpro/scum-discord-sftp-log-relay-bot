import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { readPlayers, timeAgo, getOnlinePlayers } from '../controllers/players.js';

const samplePath = path.resolve('test/fixtures/players.json');

test('readPlayers sorts by lastLogin descending', async () => {
  const players = await readPlayers(samplePath);
  assert.equal(players[0].username, 'alpha');
  assert.equal(players[1].username, 'beta');
  assert.equal(players[2].username, 'gamma');
});

test('timeAgo formats relative times', () => {
  const now = new Date('2025-09-02T01:00:00.000Z').getTime();
  assert.equal(timeAgo('2025-09-02T00:00:00.000Z', now), '1 hour ago');
  assert.equal(timeAgo('2025-09-01T01:00:00.000Z', now), '1 day ago');
  assert.equal(timeAgo('2025-08-02T01:00:00.000Z', now), '1 month ago');
});

test('getOnlinePlayers filters players correctly', () => {
  const now = new Date('2025-09-02T01:00:00.000Z').getTime();
  const players = [
    { username: 'online1', lastLogin: '2025-09-02T00:30:00.000Z', lastLogout: '2025-09-01T23:00:00.000Z' },
    { username: 'offline1', lastLogin: '2025-09-02T00:30:00.000Z', lastLogout: '2025-09-02T00:45:00.000Z' },
    { username: 'online2', lastLogin: '2025-09-02T00:30:00.000Z' },
    { username: 'offline2', lastLogin: '2025-09-01T22:00:00.000Z', lastLogout: '2025-09-01T23:00:00.000Z' }
  ];
  const online = getOnlinePlayers(players, now);
  assert.deepEqual(online.map(p => p.username), ['online1', 'online2']);
});
