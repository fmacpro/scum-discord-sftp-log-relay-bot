import { config } from './../config.js';
import { sendToDiscord } from './discord.js';
import SftpClient from 'ssh2-sftp-client';
import readline from 'readline';
import iconv from 'iconv-lite';
import { parseChatLogLine, parseLoginLogoutLogLine } from './text.js';
import { recordPlayerLogin, recordPlayerLogout } from './cache.js';

let sftp = new SftpClient();
const filePrefixes = ['login_', 'admin_', 'chat_'];
const remoteDir = config.scum.game_logs_path;
const pollInterval = 2000;
const checkNewFileInterval = 10000;
const minReconnectDelay = 3000;
const watchdogInterval = 30000; // 30s watchdog

let tailState = {}; // { prefix: { file, timestamp, bytesRead } }
let connected = false;
let retryDelay = 1000;
let tailTimer = null;
let switchTimer = null;
let connectionCount = 0;
let reconnecting = false;
let lastReconnectTime = 0;
let watchdogTimer = null;

function stopAllTimers() {
  if (tailTimer) clearInterval(tailTimer);
  if (switchTimer) clearInterval(switchTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
  tailTimer = null;
  switchTimer = null;
  watchdogTimer = null;
}

function handleLogLine(prefix, file, line) {
  switch (prefix) {
    case 'admin_': {
      const data = parseChatLogLine(line);
      const formatted = `${data.username} (${data.steamId}) Command: #${data.messageText}`;
      console.log(`[ADMIN ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_commands_feed_id);
      break;
    }
    case 'chat_': {
      const data = parseChatLogLine(line);
      const formatted = `${data.username} (${data.steamId}) ${data.messageText}`;
      console.log(`[CHAT ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_chat_feed_id);
      break;
    }
    case 'login_': {
      const data = parseLoginLogoutLogLine(line);
      const formatted = `${data.username} (${data.steamId}:${data.ip}) ${data.action} at coordinates X:${data.loggedX} Y:${data.loggedY} Z:${data.loggedZ}`;
      console.log(`[LOGIN ${file}] ${formatted}`);
      sendToDiscord(formatted, config.discord.admin_logins_feed_id);

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
    if (err.message.includes('Unexpected end event')) {
      console.log(`[DEBUG ${prefix}] Suppressed tail error: ${err.message}`);
    } else {
      console.error(`[TAIL ERROR for ${prefix}]: ${err.message}`);
      await reconnectWithBackoff();
    }
  }
}

async function checkForNewFiles() {
  if (!connected) return;
  for (const prefix of filePrefixes) {
    try {
      const latest = await findLatestFile(prefix);
      if (!latest) continue;
      const state = tailState[prefix];
      if (!state || latest.timestamp > state.timestamp) {
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
      tailFile(prefix);
    }
  }, pollInterval);
}

export async function connectAndWatch() {
  if (connected) return;
  try {
    await sftp.connect(config.sftp);
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

    // Start watchdog to ensure no hangs
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (!connected && Date.now() - lastReconnectTime > watchdogInterval) {
        console.warn('[WATCHDOG] Forcing reconnect due to inactivity');
        reconnectWithBackoff(true);
      }
    }, watchdogInterval);
  } catch (err) {
    console.error(`[CONNECT WARN]: ${err.message}`);
    await reconnectWithBackoff();
  }
}

async function reconnectWithBackoff(forceNewClient = false) {
  if (reconnecting) return;
  reconnecting = true;
  connected = false;
  stopAllTimers();

  try { await sftp.end(); }
  catch { /* ignore error */ }
  connectionCount = Math.max(connectionCount - 1, 0);
  console.log(`[DISCONNECTED] Active SFTP connections: ${connectionCount}`);

  // Always create fresh client after disconnect when requested
  if (forceNewClient) {
    if (typeof sftp.removeAllListeners === 'function') {
      sftp.removeAllListeners();
    }
    sftp = new SftpClient();
    attachSftpListeners();
  }

  const baseDelay = Math.max(retryDelay, minReconnectDelay);
  const delay = baseDelay + Math.floor(Math.random() * 500);
  console.log(`[RECONNECTING] Retrying in ${(delay / 1000).toFixed(3)}s...`);

  lastReconnectTime = Date.now();
  setTimeout(async () => {
    reconnecting = false; // always clear
    await connectAndWatch();
  }, delay);

  retryDelay = Math.min(retryDelay * 2, 60000);
}

function attachSftpListeners() {
  sftp.on('end', () => { console.warn('Global end listener: end event raised'); reconnectWithBackoff(); });
  sftp.on('close', () => { console.warn('Global close listener: close event raised'); reconnectWithBackoff(); });
  sftp.on('error', err => {
    const msg = err.message || '';
    if (msg.includes('ECONNRESET') || msg.includes('handshake')) {
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


