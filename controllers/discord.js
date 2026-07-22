import { config } from './../config.js';
import { saveUserRegistration } from './cache.js';
import { getScumServerStatus } from './serverStatus.js';
import { getFormattedPlayers, getFormattedOnlinePlayers } from './players.js';
import crypto from 'crypto';
import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';

const DISCORD_MAX_CONTENT_LENGTH = 2000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // Needed for DMs
});

const activeTokens = new Map(); // token => { userId, timeout }
const recentDiscordMessages = new Map(); // channelId => { queue: [], set: Set }
const MAX_RECENT_DISCORD_MESSAGES = 100;

// SLASH COMMAND: /register
const commands = [
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Generates a unique registration token and sends it via DM')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Shows the SCUM server status')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('players')
    .setDescription('Lists known players sorted by last login')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('activeplayers')
    .setDescription('Lists players currently logged in')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discord.bot_token);
let botReady = false;
let discordReconnectTimer = null;

function scheduleDiscordReconnect() {
  if (discordReconnectTimer) return; // Already scheduled
  console.log('[DISCORD] Scheduling reconnect in 10s...');
  discordReconnectTimer = setTimeout(async () => {
    discordReconnectTimer = null;
    try {
      botReady = false;
      console.log('[DISCORD] Attempting reconnect...');
      await client.login(config.discord.bot_token);
    } catch (err) {
      console.error('[DISCORD] Reconnect failed:', err.message);
      // Try again in 30s
      discordReconnectTimer = setTimeout(() => {
        discordReconnectTimer = null;
        scheduleDiscordReconnect();
      }, 30000);
    }
  }, 10000);
}

export async function startDiscordBot() {
  client.once('clientReady', () => {
    console.log(`[BOT READY] Logged in as ${client.user.tag}`);
    botReady = true;
    registerSlashCommand();
  });

  // Reset botReady on disconnect so we don't keep trying to send to a dead client
  client.on('disconnect', () => {
    console.warn('[DISCORD] Client disconnected — resetting ready state');
    botReady = false;
  });

  client.on('shardDisconnect', () => {
    console.warn('[DISCORD] Shard disconnected — resetting ready state');
    botReady = false;
  });

  // Discord.js v14 can transparently resume a session without re-emitting clientReady.
  // We must restore botReady on resume or messages get silently dropped.
  client.on('shardResume', () => {
    console.log('[DISCORD] Shard resumed — restoring ready state');
    botReady = true;
  });

  client.on('resume', () => {
    console.log('[DISCORD] Client resumed — restoring ready state');
    botReady = true;
  });

  client.on('invalidated', () => {
    console.warn('[DISCORD] Client session invalidated — resetting ready state and reconnecting');
    botReady = false;
    scheduleDiscordReconnect();
  });

  client.on('error', err => {
    console.error('[DISCORD ERROR]', err.message);
    // Discord.js v14 handles reconnection internally for most errors,
    // but if botReady was set to false, schedule a manual reconnect
    if (!botReady) {
      scheduleDiscordReconnect();
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'register') {
      const token = crypto.randomUUID();
      const userId = interaction.user.id;

      try {
        await interaction.reply({ content: '✅ Check your DMs for your registration token.', ephemeral: true });
        await interaction.user.send(`🔐 Your registration token is:\n\`${token}\`\nPaste this into SCUM in-game chat.`);

        const timeout = setTimeout(() => {
          activeTokens.delete(token);
        }, 5 * 60 * 1000); // 5 minutes TTL

        activeTokens.set(token, { userId, timeout });
        console.log(`[TOKEN GENERATED] ${interaction.user.tag} => ${token}`);
      } catch (err) {
        console.error('❌ Could not DM user:', err.message);
        await interaction.editReply('❌ Unable to send you a DM. Please enable DMs from server members.');
      }
    }

    if (interaction.commandName === 'serverstatus') {
      try {
        await interaction.deferReply();
        const status = await getScumServerStatus();
        await interaction.editReply(status);
      } catch (err) {
        console.error('❌ Error fetching server status:', err.message);
        await interaction.editReply('❌ Unable to fetch server status.');
      }
    }

    if (interaction.commandName === 'players') {
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id);
      const role = guild.roles.cache.find(r => r.name === config.discord.scum_admins_role);
      if (!role || !member.roles.cache.has(role.id)) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        return;
      }
      try {
        const lines = await getFormattedPlayers();
        const header = 'Players:\n';
        const content = lines.length === 0
          ? `${header}No player data available.`
          : `${header}${lines.join('\n')}`;
        const messages = splitIntoDiscordMessages(content);

        if (messages.length === 0) {
          await interaction.reply({ content: header.trimEnd(), ephemeral: true });
          return;
        }

        await interaction.reply({ content: messages[0], ephemeral: true });

        for (const messageContent of messages.slice(1)) {
          if (messageContent.length === 0) continue;
          await interaction.followUp({ content: messageContent, ephemeral: true });
        }
      } catch (err) {
        console.error('❌ Error loading players:', err.message);
        await interaction.reply({ content: '❌ Unable to load players.', ephemeral: true });
      }
    }

    if (interaction.commandName === 'activeplayers') {
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id);
      const role = guild.roles.cache.find(r => r.name === config.discord.scum_admins_role);
      if (!role || !member.roles.cache.has(role.id)) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        return;
      }
      try {
        const lines = await getFormattedOnlinePlayers();
        const header = 'Active Players:\n';
        const content = lines.length === 0
          ? `${header}No active players found.`
          : `${header}${lines.join('\n')}`;
        const messages = splitIntoDiscordMessages(content);

        if (messages.length === 0) {
          await interaction.reply({ content: header.trimEnd(), ephemeral: true });
          return;
        }

        await interaction.reply({ content: messages[0], ephemeral: true });

        for (const messageContent of messages.slice(1)) {
          if (messageContent.length === 0) continue;
          await interaction.followUp({ content: messageContent, ephemeral: true });
        }
      } catch (err) {
        console.error('❌ Error loading active players:', err.message);
        await interaction.reply({ content: '❌ Unable to load active players.', ephemeral: true });
      }
    }
  });

  client.login(config.discord.bot_token);
}

async function setUserNickname(member, username) {
  try {
    await member.setNickname(username);
    console.log(`✅ Nickname set to "${username}" for ${member.user.tag}`);
  } catch (err) {
    console.error(`❌ Failed to set nickname for ${member.user.tag}: ${err.message}`);
    if (err.code === 50013) {
      console.error("Bot lacks permission to manage this member's nickname.");
    }
  }
}

export function splitIntoDiscordMessages(content, maxLength = DISCORD_MAX_CONTENT_LENGTH) {
  if (typeof content !== 'string') {
    content = String(content);
  }

  if (content.length <= maxLength) {
    return [content];
  }

  const messages = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n', maxLength);

    if (splitIndex <= 0) {
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex);
    messages.push(chunk);

    remaining = remaining.slice(splitIndex);
    if (remaining.startsWith('\n')) {
      remaining = remaining.slice(1);
    }
  }

  if (remaining.length > 0) {
    messages.push(remaining);
  }

  return messages;
}

function shouldEmitDiscordMessage(channelId, content) {
  if (!channelId || !content) return true;
  let cache = recentDiscordMessages.get(channelId);
  if (!cache) {
    cache = { queue: [], set: new Set() };
    recentDiscordMessages.set(channelId, cache);
  }

  const key = content.trim();
  if (cache.set.has(key)) {
    return false;
  }

  cache.set.add(key);
  cache.queue.push(key);
  if (cache.queue.length > MAX_RECENT_DISCORD_MESSAGES) {
    const removed = cache.queue.shift();
    cache.set.delete(removed);
  }

  return true;
}

export async function sendToDiscord(content, channelId, { suppressDuplicates = true } = {}) {
  if (config.discord.send_to_discord !== "true") return;

  if (!botReady) {
    console.warn('[DISCORD] Bot not ready yet.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error('[DISCORD] Invalid or non-text channel.');
      return;
    }

    const messages = splitIntoDiscordMessages(content);
    if (messages.length > 1) {
      console.warn(`[DISCORD] Message exceeded ${DISCORD_MAX_CONTENT_LENGTH} characters. Sending in ${messages.length} parts.`);
    }

    let sentCount = 0;
    for (const messageContent of messages) {
      if (messageContent.length === 0) continue;
      if (suppressDuplicates && !shouldEmitDiscordMessage(channelId, messageContent)) {
        console.warn(`[DISCORD] Suppressed duplicate message for channel ${channelId}: ${messageContent.slice(0, 80)}`);
        continue;
      }
      await channel.send(messageContent);
      sentCount++;
    }
    if (sentCount === 0) {
      console.warn(`[DISCORD] All message parts were suppressed as duplicates for channel ${channelId}.`);
    }
  } catch (err) {
    console.error('[DISCORD ERROR]', err.message);
  }
}

export function getBotReady() {
  return botReady;
}

export async function handleRegistrationTokenMessage(chatData) {
  if (!botReady) {
    console.warn('[DISCORD] Bot not ready yet for registration tokens.');
    return false;
  }

  if (!chatData?.messageText) {
    return false;
  }

  for (const [token, data] of activeTokens.entries()) {
    if (!chatData.messageText.includes(token)) {
      continue;
    }

    const { userId, timeout } = data;

    try {
      const guild = await client.guilds.fetch(config.discord.guild_id);
      const member = await guild.members.fetch(userId);
      const role = guild.roles.cache.find(r => r.name === config.discord.scum_member_role);

      await setUserNickname(member, chatData.username);

      if (role) {
        await member.roles.add(role);
      } else {
        console.warn(`⚠️ Role "${config.discord.scum_member_role}" not found.`);
      }

      saveUserRegistration(member, chatData, token);

      try {
        await member.send(
          `✅ You are registered as ${chatData.username} (${chatData.steamId}). You now have the ${config.discord.scum_member_role} role.`
        );
      } catch (dmError) {
        console.warn(`⚠️ Unable to DM ${member.user.tag} registration confirmation: ${dmError.message}`);
      }

      await sendToDiscord(
        `✅ <@${userId}> (${chatData.username}:${chatData.steamId}) has been verified and given the ${config.discord.scum_member_role} role.`,
        config.discord.admin_chat_feed_id
      );

      clearTimeout(timeout);
      activeTokens.delete(token);
      console.log(`[TOKEN VERIFIED] ${member.user.tag} registered as ${chatData.username}.`);
      return true;
    } catch (err) {
      console.error('❌ Error verifying user:', err.message);
      await sendToDiscord(
        `❌ Something went wrong verifying <@${userId}>. Please contact an admin.`,
        config.discord.admin_chat_feed_id
      );
      return false;
    }
  }

  return false;
}

async function registerSlashCommand() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.client_id, config.discord.guild_id),
      { body: commands }
    );
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('❌ Error registering command:', err);
  }
}
