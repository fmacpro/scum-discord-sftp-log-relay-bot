import { config } from './../config.js';
import { handleRegistrationTokenMessage, sendToDiscord } from './discord.js';
import SftpClient from 'ssh2-sftp-client';
import readline from 'readline';
import iconv from 'iconv-lite';
import { parseChatLogLine, parseLoginLogoutLogLine, parseKillLogLine } from './text.js';
import { recordPlayerLogin, recordPlayerLogout } from './cache.js';

let sftp = new SftpClient();
const filePrefixes = ['login_', 'admin_', 'chat_', 'kill_'];
const remoteDir = config.scum.game_logs_path;
const pollInterval = 2000;
const checkNewFileInterval = 10000;
const minReconnectDelay = 3000;
const watchdogInterval = 30000; // 30s watchdog
const MAX_RECENT_LINES_PER_FILE = 500;

let tailState = {}; // { prefix: { file, timestamp, bytesRead } }
let connected = false;
let retryDelay = 1000;
let tailTimer = null;
let switchTimer = null;
let connectionCount = 0;
let reconnecting = false;
let lastReconnectTime = 0;
let watchdogTimer = null;
let connecting = false;

const processedLineCache = new Map(); // file => { queue: [], set: Set }
const prefixLocks = new Set();

function stopAllTimers() {
  if (tailTimer) clearInterval(tailTimer);
  if (switchTimer) clearInterval(switchTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
  tailTimer = null;
  switchTimer = null;
  watchdogTimer = null;
}

function shouldSkipLine(file, line) {
  let cache = processedLineCache.get(file);
  if (!cache) {
    cache = { queue: [], set: new Set() };
    processedLineCache.set(file, cache);
  }

  const key = line;
  if (cache.set.has(key)) {
    return true;
  }

  cache.set.add(key);
  cache.queue.push(key);
  if (cache.queue.length > MAX_RECENT_LINES_PER_FILE) {
    const removed = cache.queue.shift();
    cache.set.delete(removed);
  }

  return false;
}

function clearProcessedLinesForFile(file) {
  if (file && processedLineCache.has(file)) {
    processedLineCache.delete(file);
  }
}

function handleLogLine(prefix, file, line) {
  if (prefix !== 'login_' && shouldSkipLine(file, line)) {
    console.warn(`[DEDUP ${prefix}] Skipped duplicate line in ${file}: ${line.slice(0, 80)}`);
    return;
  }

  switch (prefix) {
    case 'admin_': {
      const data = parseChatLogLine(line);
      if (!data) {
        console.warn(`[ADMIN ${file}] Unable to parse line: ${line}`);
        break;
      }
      const formatted = `${data.username} (${data.steamId}) Command: #${data.messageText}`;
      console.log(`[ADMIN ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_commands_feed_id);
      break;
    }
    case 'chat_': {
      const data = parseChatLogLine(line);
      if (!data) {
        console.warn(`[CHAT ${file}] Unable to parse line: ${line}`);
        break;
      }
      const formatted = `${data.username} (${data.steamId}) ${data.messageText}`;
      console.log(`[CHAT ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_chat_feed_id);
      handleRegistrationTokenMessage(data);
      break;
    }
    case 'kill_': {
      const data = parseKillLogLine(line);
      if (!data) {
        console.warn(`[KILL ${file}] Unable to parse line: ${line}`);
        break;
      }
      const formatted = [
        '🪦 **Player Death Report**',
        `**Victim:** ${data.victimName}`,
        `**Killer:** ${data.killerName}`,
        `**Weapon:** ${data.weapon}`
      ].join('\n');
      console.log(`[KILL ${file}] ${data.victimName} killed by ${data.killerName} with ${data.weapon}`);
      sendToDiscord(formatted, config.discord.kill_feed_id);
      break;
    }
    case 'login_': {
      const data = parseLoginLogoutLogLine(line);
      if (!data) {
        console.warn(`[LOGIN ${file}] Unable to parse line: ${line}`);
        break;
      }
      const formatted = `${data.username} (${data.steamId}:${data.ip}) ${data.action} at coordinates X:${data.loggedX} Y:${data.loggedY} Z:${data.loggedZ}`;
      console.log(`[LOGIN ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_logins_feed_id, { suppressDuplicates: false });

      if (data.action === 'logged in') {
        recordPlayerLogin(data);
      } else if (data.action === 'logged out') {
        recordPlayerLogout(data);
      }
      break;
    }
    default:
      console.warn(`[UNKNOWN PREFIX] ${prefix}: ${line}`);
  }
}

function extractTimestampFromFilename(name) {
  const match = name.match(/_(\d{14})\.log$/);
  if (!match) return 0;
  const ts = match[1];
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const hour = ts.slice(8, 10);
  const minute = ts.slice(10, 12);
  const second = ts.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).getTime();
}

async function findLatestFile(prefix) {
  if (!connected) return null;
  const fileList = await sftp.list(remoteDir);
  const matchingFiles = fileList
    .filter(f => f.type === '-' && f.name.startsWith(prefix))
    .map(f => ({
      name: f.name,
      path: `${remoteDir}/${f.name}`,
      timestamp: extractTimestampFromFilename(f.name),
      size: f.size,
    }))
    .filter(f => f.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
  return matchingFiles[0] || null;
}

async function tailFile(prefix) {
  if (!connected || !tailState[prefix]) return;
  if (prefixLocks.has(prefix)) return;
  prefixLocks.add(prefix);

  const { file, bytesRead } = tailState[prefix];
  try {
    const stats = await sftp.stat(file);
    const totalSize = stats.size;
    if (totalSize > bytesRead) {
      const stream = await sftp.createReadStream(file, { start: bytesRead, end: totalSize - 1 });
      const decodedStream = stream.pipe(iconv.decodeStream('utf16-le'));
      const rl = readline.createInterface({ input: decodedStream, crlfDelay: Infinity });
      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed !== '') {
          handleLogLine(prefix, file, trimmed);
        }
      }
      tailState[prefix].bytesRead = totalSize;
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Unexpected end event')) {
      console.log(`[DEBUG ${prefix}] Suppressed tail error: ${msg}`);
    } else if (msg.includes('No such file') || msg.includes('not found') || msg.includes('ENOENT') || msg.includes('does not exist')) {
      // File was deleted (likely rotated). Reset tail state so checkForNewFiles
      // can pick up the new file on its next cycle, or try to find it now.
      console.warn(`[TAIL ${prefix}] File gone (rotated/deleted): ${file}. Resetting tail state.`);
      clearProcessedLinesForFile(file);
      delete tailState[prefix];
      // Try to find the new file immediately instead of waiting for checkForNewFiles
      try {
        const latest = await findLatestFile(prefix);
        if (latest) {
          tailState[prefix] = { file: latest.path, timestamp: latest.timestamp, bytesRead: latest.size };
          console.log(`[TAIL ${prefix}] Recovered — now tailing ${latest.name}`);
        } else {
          console.warn(`[TAIL ${prefix}] No new ${prefix} file found yet — will retry on next poll.`);
        }
      } catch (findErr) {
        console.error(`[TAIL ${prefix}] Error finding new file: ${findErr.message}`);
      }
    } else {
      console.error(`[TAIL ERROR for ${prefix}]: ${msg}`);
      // Don't reconnect here — the watchdog or next failed operation will handle it.
      // This prevents rapid reconnect storms from a single bad file.
    }
  } finally {
    prefixLocks.delete(prefix);
  }
}

async function checkForNewFiles() {
  if (!connected) return;
  for (const prefix of filePrefixes) {
    try {
      const latest = await findLatestFile(prefix);
      if (!latest) {
        // No files found for this prefix at all. If we had a stale tailState
        // (e.g., from a deleted file), clear it so we don't keep erroring.
        if (tailState[prefix]) {
          console.warn(`[CHECK ${prefix}] No ${prefix} files found — clearing stale tail state.`);
          clearProcessedLinesForFile(tailState[prefix].file);
          delete tailState[prefix];
        }
        continue;
      }
      const state = tailState[prefix];
      // Switch if no state yet, or if the latest file is different (by path)
      if (!state || latest.path !== state.file) {
        if (state && state.file) {
          clearProcessedLinesForFile(state.file);
        }
        tailState[prefix] = { file: latest.path, timestamp: latest.timestamp, bytesRead: latest.size };
        console.log(`[SWITCHED] Now tailing ${prefix}${latest.name}`);
      }
    } catch (err) {
      if (connected) console.error(`[CHECK FILE ERROR for ${prefix}]: ${err.message}`);
    }
  }
}

async function resetTailState() {
  if (!connected) return;
  console.log('[RESET] Reinitializing tail state to latest log files');
  for (const prefix of filePrefixes) {
    if (tailState[prefix] && tailState[prefix].file) {
      clearProcessedLinesForFile(tailState[prefix].file);
    }
    const latest = await findLatestFile(prefix);
    if (latest) {
      tailState[prefix] = { file: latest.path, timestamp: latest.timestamp, bytesRead: latest.size };
      console.log(`[TAIL RESET ${prefix}] ${latest.name}`);
    }
  }
}

async function startTailLoop() {
  if (tailTimer) clearInterval(tailTimer);
  tailTimer = setInterval(() => {
    for (const prefix of filePrefixes) {
      tailFile(prefix).catch(err => {
        console.error(`[TAIL UNCAUGHT ${prefix}]: ${err.message}`);
      });
    }
  }, pollInterval);
}

export function getSftpConnected() {
  return connected;
}

export async function connectAndWatch() {
  if (connected || connecting) return;
  connecting = true;
  try {
    // Add a connection timeout so we don't hang forever
    const connectPromise = sftp.connect(config.sftp);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SFTP connection timed out after 15s')), 15000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    connected = true;
    reconnecting = false;
    retryDelay = 1000;
    connectionCount++;
    console.log(`[CONNECTED] Active SFTP connections: ${connectionCount}`);
    console.log(`[CONNECTED] Watching prefixes: ${filePrefixes.join(', ')}`);

    await resetTailState();
    startTailLoop();
    if (switchTimer) clearInterval(switchTimer);
    switchTimer = setInterval(checkForNewFiles, checkNewFileInterval);

    // Start watchdog to ensure no hangs — also checks if SFTP is silent for too long
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (!connected && Date.now() - lastReconnectTime > watchdogInterval) {
        console.warn('[WATCHDOG] Forcing reconnect due to inactivity');
        reconnectWithBackoff();
      }
    }, watchdogInterval);
  } catch (err) {
    console.error(`[CONNECT WARN]: ${err.message}`);
    await reconnectWithBackoff();
  } finally {
    connecting = false;
  }
}

let reconnectTimer = null;

async function reconnectWithBackoff() {
  if (reconnecting) return;
  reconnecting = true;
  connected = false;
  connecting = false;
  stopAllTimers();

  // Cancel any pending reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Always create a fresh SFTP client to avoid half-closed state issues
  try {
    if (typeof sftp.removeAllListeners === 'function') {
      sftp.removeAllListeners();
    }
    await sftp.end().catch(() => {});
  } catch { /* ignore error */ }
  connectionCount = Math.max(connectionCount - 1, 0);
  console.log(`[DISCONNECTED] Active SFTP connections: ${connectionCount}`);

  sftp = new SftpClient();
  attachSftpListeners();

  const baseDelay = Math.max(retryDelay, minReconnectDelay);
  const delay = baseDelay + Math.floor(Math.random() * 500);
  console.log(`[RECONNECTING] Retrying in ${(delay / 1000).toFixed(3)}s...`);

  lastReconnectTime = Date.now();
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnecting = false; // always clear
    await connectAndWatch();
  }, delay);

  retryDelay = Math.min(retryDelay * 2, 60000);
}

function attachSftpListeners() {
  // Increase max listeners on the underlying SSH2 client to suppress warnings on reconnect
  if (sftp.client && typeof sftp.client.setMaxListeners === 'function') {
    sftp.client.setMaxListeners(20);
  }
  sftp.on('end', () => { console.warn('[SFTP] end event raised'); reconnectWithBackoff(); });
  sftp.on('close', () => { console.warn('[SFTP] close event raised'); reconnectWithBackoff(); });
  sftp.on('error', err => {
    const msg = err.message || '';
    if (msg.includes('ECONNRESET') || msg.includes('handshake') || msg.includes('Keepalive')) {
      console.warn(`[SFTP WARN] ${msg}`);
    } else {
      console.error(`[SFTP ERROR] ${msg}`);
    }
    reconnectWithBackoff();
  });
}

// Attach listeners initially
attachSftpListeners();

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  stopAllTimers();
  try { await sftp.end(); }
  catch { /* ignore error */ }
  process.exit(0);
});
