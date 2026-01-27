import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPlayersFile = path.join(__dirname, '..', 'data', 'players.json');

export async function readPlayers(filePath = defaultPlayersFile) {
  const data = await fs.readFile(filePath, 'utf8');
  const players = JSON.parse(data);
  return Object.values(players)
    .filter(p => p.lastLogin)
    .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
}

export function timeAgo(dateStr, now = Date.now()) {
  const diffSeconds = Math.floor((now - new Date(dateStr).getTime()) / 1000);
  const units = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];
  for (const unit of units) {
    const count = Math.floor(diffSeconds / unit.seconds);
    if (count >= 1) {
      return `${count} ${unit.label}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}

export function isPlayerOnline(player, now = Date.now()) {
  if (!player.lastLogin) return false;
  const lastLogin = new Date(player.lastLogin).getTime();
  if (player.lastLogout) {
    const lastLogout = new Date(player.lastLogout).getTime();
    if (lastLogout >= lastLogin) return false;
  }
  return true;
}

export function getOnlinePlayers(players, now = Date.now()) {
  const cutoff = now - 24 * 60 * 60 * 1000;
  return players.filter(p => {
    if (!isPlayerOnline(p, now)) return false;
    const lastLogin = new Date(p.lastLogin).getTime();
    return lastLogin >= cutoff;
  });
}

export async function getFormattedPlayers(filePath = defaultPlayersFile, now = Date.now()) {
  const players = await readPlayers(filePath);
  return players.map(p => `${p.username} - last login ${timeAgo(p.lastLogin, now)}`);
}

export async function getFormattedOnlinePlayers(filePath = defaultPlayersFile, now = Date.now()) {
  const players = await readPlayers(filePath);
  return getOnlinePlayers(players, now).map(p => `${p.username} - last login ${timeAgo(p.lastLogin, now)}`);
}
