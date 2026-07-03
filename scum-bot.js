import { startDiscordBot, getBotReady } from './controllers/discord.js';
import { connectAndWatch, getSftpConnected } from './controllers/logs.js';

// Global safety net: log unhandled rejections instead of crashing
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});

const HEALTH_CHECK_INTERVAL = 60000; // Check every 60s
let healthCheckTimer = null;

async function healthCheck() {
  const discordOk = getBotReady();
  const sftpOk = getSftpConnected();

  if (!discordOk) {
    console.warn('[HEALTH] Discord bot is not ready — reconnecting may be needed.');
  }

  if (!sftpOk) {
    console.warn('[HEALTH] SFTP is not connected — reconnect should be in progress.');
  }

  if (discordOk && sftpOk) {
    console.log('[HEALTH] All systems operational.');
  }
}

(async () => {
    await startDiscordBot();
    await connectAndWatch();
    healthCheckTimer = setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
})();

process.on('SIGINT', () => {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  process.exit(0);
});

