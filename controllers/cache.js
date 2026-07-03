import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const cacheFile = join(dataDir, 'players.json');

let cache = {};
if (existsSync(cacheFile)) {
  try {
    cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
}

let persistTimeout = null;
const PERSIST_DEBOUNCE_MS = 500;

function persist() {
  // Debounce: coalesce multiple rapid writes into one
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    // Atomic write: write to temp file, then rename
    const tmp = join(dataDir, `players.json.tmp.${crypto.randomBytes(4).toString('hex')}`);
    writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    renameSync(tmp, cacheFile);
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Record a player logging into the server. Creates a new player entry if
 * one does not already exist.
 * @param {Object} player - The login data containing steamId and username
 */
export function recordPlayerLogin(player) {
  const { steamId, username } = player;
  const existing = cache[steamId] || {};

  cache[steamId] = {
    username,
    steamId,
    loggedIn: true,
    registered: existing.registered || false,
    discordTag: existing.discordTag || null,
    discordId: existing.discordId || null,
    lastLogin: new Date().toISOString(),
    lastLogout: existing.lastLogout || null
  };

  persist();
}

/**
 * Record a player logging out of the server.
 * @param {Object} player - The logout data containing steamId
 */
export function recordPlayerLogout(player) {
  const { steamId } = player;
  const existing = cache[steamId];
  if (!existing) return;

  existing.loggedIn = false;
  existing.lastLogout = new Date().toISOString();
  persist();
}

/**
 * Update a player's registration information with Discord details.
 * @param {GuildMember} member - The Discord member object
 * @param {Object} user - The in-game user data (steamId and username)
 * @param {string} token - The generated registration token
 */
export function saveUserRegistration(member, user, token) {
  const { steamId, username } = user;
  const existing = cache[steamId] || {
    username,
    steamId,
    loggedIn: false,
    registered: false
  };

  cache[steamId] = {
    ...existing,
    username,
    steamId,
    registered: true,
    discordTag: member.user.tag,
    discordId: member.id,
    token,
    updatedAt: new Date().toISOString()
  };

  persist();
  console.log(`✅ Player ${username} (${member.user.tag}) saved/updated in cache.`);
}

export function getPlayerCache() {
  return cache;
}

