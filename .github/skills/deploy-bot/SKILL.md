---
name: deploy-bot
description: 'Deploy the SCUM Discord bot to a production server. Use when: asked to deploy, update the running bot, restart the bot, or check deployment status.'
argument-hint: 'Deploy target (optional)'
---

# Deploy Bot

## When to Use
- Asked to deploy the bot to production
- Need to update the running instance with latest code
- Restarting the bot after configuration changes
- Checking if the bot is running

## Procedure

1. **Ensure environment is configured:**
   - Verify `.env` exists with all required variables (see `.env.example` for reference).
   - Check that `SFTP_HOST`, `DISCORD_BOT_TOKEN`, and channel IDs are populated.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run linting and tests before deploying:**
   ```bash
   npm run lint
   npm test
   ```

4. **Start the bot:**
   ```bash
   node scum-bot.js
   ```

5. **Run as a persistent process (recommended):**
   Use a process manager like `pm2` or `screen`:
   ```bash
   # With pm2
   pm2 start scum-bot.js --name scum-bot
   pm2 save

   # With screen
   screen -dmS scum-bot node scum-bot.js
   ```

6. **Verify the bot is running:**
   - Check logs for `[BOT READY]` message indicating successful Discord connection.
   - Confirm log tailing begins with `[SFTP]` messages showing file polling.

## Updating an Existing Deployment

1. Pull the latest code.
2. Run `npm install` for any dependency changes.
3. Restart the process:
   ```bash
   pm2 restart scum-bot
   ```
