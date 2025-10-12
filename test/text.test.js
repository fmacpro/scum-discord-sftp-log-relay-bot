import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatLogLine, parseCleanedChatLogLine } from '../controllers/text.js';

test('parseCleanedChatLogLine parses valid line', () => {
  const line = 'PlayerOne (12345678901234567) Hello world';
  const result = parseCleanedChatLogLine(line);
  assert.deepStrictEqual(result, {
    steamId: '12345678901234567',
    username: 'PlayerOne',
    messageText: 'Hello world'
  });
});

test('parseCleanedChatLogLine returns null on invalid line', () => {
  assert.strictEqual(parseCleanedChatLogLine('invalid'), null);
});

test('parseChatLogLine returns null on invalid line', () => {
  assert.strictEqual(parseChatLogLine('bad'), null);
});

