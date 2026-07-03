import 'dotenv/config';

export const config = {
  scum: {
    game_logs_path: process.env.SCUM_GAME_LOGS,
    battlemetrics_server_id: process.env.BATTLEMETRICS_SERVER_ID
  },
  sftp: {
    host: process.env.SFTP_HOST,
    port: process.env.SFTP_PORT,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD,
    readyTimeout: 20000,
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha1',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group16-sha512',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521'
      ]
    },
    keepaliveInterval: 15000,
    keepaliveCountMax: 10
  },
  discord: {
    bot_token: process.env.DISCORD_BOT_TOKEN,
    client_id: process.env.DISCORD_CLIENT_ID,
    guild_id: process.env.DISCORD_GUILD_ID,
    send_to_discord: process.env.SEND_TO_DISCORD,
    admin_logins_feed_id: process.env.DISCORD_ADMIN_LOGINS_FEED_ID,
    admin_chat_feed_id: process.env.DISCORD_ADMIN_CHAT_FEED_ID,
    admin_commands_feed_id: process.env.DISCORD_ADMIN_COMMANDS_FEED_ID,
    kill_feed_id: process.env.DISCORD_KILL_FEED_ID,
    scum_member_role: process.env.DISCORD_SCUM_ROLE,
    scum_admins_role: process.env.DISCORD_SCUM_ADMINS_ROLE,
  }
};

