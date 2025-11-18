import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoDiscordMessages } from '../controllers/discord.js';

const MAX = 2000;

test('splitIntoDiscordMessages returns single message when under limit', () => {
  const content = 'short message';
  const result = splitIntoDiscordMessages(content);
  assert.deepStrictEqual(result, [content]);
});

test('splitIntoDiscordMessages prefers newline boundaries', () => {
  const partA = 'A'.repeat(1000);
  const partB = 'B'.repeat(900);
  const partC = 'C'.repeat(500);
  const content = `${partA}\n${partB}\n${partC}`;
  const result = splitIntoDiscordMessages(content, MAX);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0], `${partA}\n${partB}`);
  assert.strictEqual(result[1], partC);
  assert.ok(result[0].length <= MAX);
  assert.ok(result[1].length <= MAX);
});

test('splitIntoDiscordMessages splits long lines without newlines', () => {
  const content = 'X'.repeat(MAX + 10);
  const result = splitIntoDiscordMessages(content, MAX);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].length, MAX);
  assert.strictEqual(result[1].length, 10);
});
