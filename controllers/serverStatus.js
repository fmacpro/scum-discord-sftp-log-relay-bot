import { config } from './../config.js';
import { readPlayers, getOnlinePlayers } from './players.js';
import net from 'net';

const SERVER_IP = config?.scum?.server_ip;
const QUERY_PORT = config?.scum?.query_port ?? 7809;
const SERVER_NAME = config?.scum?.server_name ?? 'SCUM Server';
const TCP_TIMEOUT = 5000;

async function checkTcpPort(host, port, timeout = TCP_TIMEOUT) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('timeout', () => finish(false));

    socket.connect(port, host);
  });
}

export async function getScumServerStatus() {
  try {
    if (!SERVER_IP) {
      return '⚠️ Server IP is not configured. Set SCUM_SERVER_IP in your .env file.';
    }

    const isOnline = await checkTcpPort(SERVER_IP, QUERY_PORT);

    if (!isOnline) {
      return `🔴 **${SERVER_NAME}** is offline or unreachable.\nIP: \`${SERVER_IP}:${QUERY_PORT}\``;
    }

    // Get player count from local data
    let playerCount = 0;
    try {
      const players = await readPlayers();
      const onlinePlayers = getOnlinePlayers(players);
      playerCount = onlinePlayers.length;
    } catch {
      // If we can't read players.json, just show 0
    }

    return `🟢 **${SERVER_NAME}** is online
Players online: ${playerCount}
IP: \`${SERVER_IP}:${QUERY_PORT}\``;
  } catch (err) {
    console.error('[SERVER STATUS ERROR]', err?.message || err);
    return '🔴 Server is offline or unreachable.';
  }
}
