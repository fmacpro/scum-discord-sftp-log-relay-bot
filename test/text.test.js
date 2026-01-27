import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatLogLine, parseKillLogLine } from '../controllers/text.js';

test('parseChatLogLine returns null on invalid line', () => {
  assert.strictEqual(parseChatLogLine('bad'), null);
});

test('parseChatLogLine parses valid chat entries', () => {
  const line = "2025.10.25-15.39.01: '76561198326745502:Barry(123)' 'Hello world'";
  const result = parseChatLogLine(line);
  assert.deepStrictEqual(result, {
    timestamp: '2025.10.25-15.39.01',
    steamId: '76561198326745502',
    username: 'Barry',
    messageText: 'Hello world'
  });
});

test('parseKillLogLine parses kill log entries', () => {
  const line = '2025.10.25-15.39.01: Died: Barry (76561198326745502), Killer: BP_Drifter_Lvl_4_C_2146455350 (NPC) Weapon: Weapon_DEagle_50_C [Projectile] S:[KillerLoc : -26007.18, -271845.03, 19384.88 VictimLoc: -26143.72, -272107.22, 19387.05, Distance: 2.96 m]';
  const result = parseKillLogLine(line);
  assert.deepStrictEqual(result, {
    timestamp: '2025.10.25-15.39.01',
    victimName: 'Barry',
    victimId: '76561198326745502',
    killerName: 'BP_Drifter_Lvl_4_C_2146455350',
    killerId: 'NPC',
    weapon: 'Weapon_DEagle_50_C [Projectile]'
  });
});

test('parseKillLogLine returns null on invalid line', () => {
  assert.strictEqual(parseKillLogLine('not a kill log'), null);
});
