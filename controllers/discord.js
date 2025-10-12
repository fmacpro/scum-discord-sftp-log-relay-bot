import { config } from './../config.js';
import { saveUserRegistration } from './cache.js';
import { parseCleanedChatLogLine } from './text.js';
import { getScumServerStatus } from './serverStatus.js';
import { getFormattedPlayers, getFormattedOnlinePlayers } from './players.js';
import crypto from 'crypto';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'], // Needed for DMs
});

const activeTokens = new Map(); // token => { userId, timeout }

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
    .setDescription('Lists players active in the last hour')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discord.bot_token);
let botReady = false;

export async function startDiscordBot() {
  client.once('ready', () => {
    console.log(`[BOT READY] Logged in as ${client.user.tag}`);
    botReady = true;
    registerSlashCommand();
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'register') {
      const token = crypto.randomUUID();
      const userId = interaction.user.id;

      try {
        await interaction.reply({ content: '✅ Check your DMs for your registration token.', ephemeral: true });
        await interaction.user.send(`🔐 Your registration token is:\n\`${token}\`\nPaste this into scum in game local chat (T)`);

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
        await interaction.reply({ content, ephemeral: true });
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
        await interaction.reply({ content, ephemeral: true });
      } catch (err) {
        console.error('❌ Error loading active players:', err.message);
        await interaction.reply({ content: '❌ Unable to load active players.', ephemeral: true });
      }
    }
  });

  // HANDLE CONFIRMATION MESSAGES FROM THE BOT ITSELF
  client.on('messageCreate', async message => {
    // Only handle messages from the bot in the watched channel
    if (message.author.id !== client.user.id) return;
    if (message.channel.id !== config.discord.admin_chat_feed_id) return;

    // Scan message content for known tokens
    for (const [token, data] of activeTokens.entries()) {
      if (message.content.includes(token)) {
        const { userId, timeout } = data;
        try {
          const guild = message.guild;
          const member = await guild.members.fetch(userId);
          const role = guild.roles.cache.find(r => r.name === config.discord.scum_member_role);

          // 1. Parse line and set nickname
          const user = parseCleanedChatLogLine(message.content);
          if (!user) {
            console.warn(`[TOKEN VERIFY] Unable to parse user details for token ${token}`);
            await message.reply(`❌ Unable to parse user information for <@${userId}>.`);
            continue;
          }
          await setUserNickname(member, user.username);

          // 2. Assign role
          if (role) {
            await member.roles.add(role);
          } else {
            console.warn(`⚠️ Role "${config.discord.scum_member_role}" not found.`);
          }

          // 3. Save user to persistent cache
          saveUserRegistration(member, user, token);

          // 4. Confirm in the channel
          await message.reply(`✅ <@${userId}> (${user.username}:${user.steamId}) has been verified and given the ${config.discord.scum_member_role} role.`);

          // Cleanup token
          clearTimeout(timeout);
          activeTokens.delete(token);
          console.log(`[TOKEN VERIFIED] ${member.user.tag} registered as ${user.username}.`);
        } catch (err) {
          console.error('❌ Error verifying user:', err.message);
          await message.reply(`❌ Something went wrong verifying <@${userId}>. Please contact an admin.`);
        }

        break;
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

export async function sendToDiscord(content, channelId) {
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

    await channel.send(content);
  } catch (err) {
    console.error('[DISCORD ERROR]', err.message);
  }
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

