import { startDiscordBot } from './controllers/discord.js';
import { connectAndWatch } from './controllers/logs.js';

(async () => {
    await startDiscordBot();
    await connectAndWatch();
})();

