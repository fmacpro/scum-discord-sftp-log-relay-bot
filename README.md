# SCUM Discord SFTP Log Relay Bot

A Node.js application that tails SCUM server log files over SFTP and relays activity to Discord channels. The bot listens for login, chat, and admin command events, posts them to configured channels, and provides slash commands for player registration and server status checks via the BattleMetrics API. Player records are created automatically the first time a user logs into the server and track whether the player is currently online or has registered their Discord account.

## Features

- Streams SCUM login, logout, chat, admin command, and kill feed events from remote log files to dedicated Discord channels in real time.
- Automatically tracks player state, verifies members through chat tokens, and assigns roles/nicknames once a Discord user links their account.
- Provides admin-friendly snapshots of server population and recent activity through slash commands.

### Slash Commands

| Command          | Access Level              | Purpose                                                                 |
| ---------------- | ------------------------- | ----------------------------------------------------------------------- |
| `/register`      | Anyone in the guild       | Sends the user a DM with a one-time token used to link their SCUM name. |
| `/serverstatus`  | Anyone in the guild       | Shows the SCUM server status via the BattleMetrics API.                 |
| `/players`       | Requires scum admins role | Lists all known players sorted by last login time.                      |
| `/activeplayers` | Requires scum admins role | Lists players active within the last hour.                              |

### Discord Channels

| Channel Purpose          | Feed Contents                                                                  | Suggested Visibility                  |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------ |
| Admin logins feed        | Login/logout lines from `login_*.log`, including coordinates and IP addresses. | Admin-only (contains sensitive data) |
| Admin chat feed          | In-game chat captured from `chat_*.log`, plus registration confirmations.      | Admin-only (may expose player info)  |
| Admin command feed       | `admin_*.log` entries showing commands issued via the server console.          | Admin-only                            |
| Kill feed                | `kill_*.log` summaries detailing victim, killer, and weapon.                   | Public (optional showcase channel)   |

Create dedicated text channels for each feed so the bot can keep the data separated and permissioned appropriately. Only the kill feed is intended for a public-facing audience; the other channels often reveal IP addresses, coordinates, or admin actions and should remain restricted to trusted staff.

## Prerequisites

- [Node.js](https://nodejs.org/en/download) v18 or later
- Access to your SCUM server's log files via SFTP
- A Discord application with a bot token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy [`.env.example`](.env.example) to `.env` and fill in the values described below.
3. Start the bot:
   ```bash
   node scum-bot.js
   ```
4. (Optional) Run linting and tests:
   ```bash
   npm run lint
   npm test
   ```

## Environment Variables

The `.env` file configures both the SFTP connection and Discord integration. The repository includes [`.env.example`](.env.example) with example values for all available options.

| Variable                         | Description                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `SFTP_HOST`                      | Hostname of the SFTP server hosting SCUM log files.                                         |
| `SFTP_PORT`                      | SFTP port (usually `22`).                                                                   |
| `SFTP_USERNAME`                  | Username for SFTP authentication.                                                           |
| `SFTP_PASSWORD`                  | Password for SFTP authentication.                                                           |
| `SCUM_GAME_LOGS`                 | Remote path to the SCUM log directory.                                                      |
| `BATTLEMETRICS_SERVER_ID`        | Server ID from [BattleMetrics](https://www.battlemetrics.com/) used by `/serverstatus`.     |
| `DISCORD_BOT_TOKEN`              | Bot token from the [Discord Developer Portal](https://discord.com/developers/applications). |
| `DISCORD_CLIENT_ID`              | Application (client) ID from the Developer Portal.                                          |
| `DISCORD_GUILD_ID`               | Server ID (guild) where slash commands are registered.                                      |
| `DISCORD_ADMIN_LOGINS_FEED_ID`   | Channel ID for login/logout notifications.                                                  |
| `DISCORD_ADMIN_CHAT_FEED_ID`     | Channel ID for chat messages.                                                               |
| `DISCORD_ADMIN_COMMANDS_FEED_ID` | Channel ID for admin command logs.                                                          |
| `DISCORD_KILL_FEED_ID`           | Channel ID for kill feed notifications.                                                     |
| `DISCORD_SCUM_ROLE`              | Name of the role granted to verified players.                                               |
| `DISCORD_SCUM_ADMINS_ROLE`       | Name of the role allowed to use admin-only commands.                                        |
| `SEND_TO_DISCORD`                | Set to `true` to send messages to Discord; otherwise output remains local.                  |

### Configuring Discord variables

1. **Create a Discord application and bot:** Visit the [Discord Developer Portal](https://discord.com/developers/applications), create a new application, then use the **Bot** tab to add a bot user. The bot's token becomes `DISCORD_BOT_TOKEN` ([docs](https://discord.com/developers/docs/getting-started#configuring-a-bot)).
2. **Grab the client ID:** On the application's **General Information** page, copy the **Application ID** and set it as `DISCORD_CLIENT_ID` ([docs](https://discord.com/developers/docs/getting-started#creating-an-app)).
3. **Enable Developer Mode:** In Discord, open **User Settings → Advanced** and enable **Developer Mode** to allow copying IDs ([guide](https://support.discord.com/hc/en-us/articles/206346498-What-is-Developer-Mode-)).
4. **Create the target channels:** In your server, create channels for logins, chat, admin command logs, and the kill feed if they don't already exist.
5. **Collect IDs from your server:** With Developer Mode enabled, right-click your server icon to copy the **Server ID** for `DISCORD_GUILD_ID`. Right-click the channels you created to copy `DISCORD_ADMIN_LOGINS_FEED_ID`, `DISCORD_ADMIN_CHAT_FEED_ID`, `DISCORD_ADMIN_COMMANDS_FEED_ID`, and `DISCORD_KILL_FEED_ID`.
6. **Create the SCUM role:** In **Server Settings → Roles**, create or choose a role that the bot will assign to verified players ([role management docs](https://support.discord.com/hc/en-us/articles/214836687-Role-Management-101)).
7. **Create the scum admins role:** Create or choose a role for administrators allowed to run admin-only commands.

For more details on Discord bot configuration, see the [discord.js guide](https://discordjs.guide/).

### Sample `.env`

```dotenv
SFTP_HOST=example.com
SFTP_PORT=22
SFTP_USERNAME=myuser
SFTP_PASSWORD=secret

SCUM_GAME_LOGS=/home/scumserver/SCUM/Saved/Logs
BATTLEMETRICS_SERVER_ID=12345678

DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=123456789012345678
DISCORD_GUILD_ID=123456789012345678
DISCORD_ADMIN_LOGINS_FEED_ID=987654321098765432
DISCORD_ADMIN_CHAT_FEED_ID=987654321098765433
DISCORD_ADMIN_COMMANDS_FEED_ID=987654321098765434
DISCORD_KILL_FEED_ID=987654321098765435
DISCORD_SCUM_ROLE="scummembers"
DISCORD_SCUM_ADMINS_ROLE="scumadmins"
SEND_TO_DISCORD=true
```

These example values are mirrored in [`.env.example`](.env.example) for convenience.
