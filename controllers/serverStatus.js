import { config } from './../config.js';

const BATTLEMETRICS_SERVER_ID = config?.scum?.battlemetrics_server_id;

export async function getScumServerStatus() {
  try {
    const url = `https://api.battlemetrics.com/servers/${BATTLEMETRICS_SERVER_ID}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json'
      }
    });

    if (!res.ok) {
      throw new Error(`BattleMetrics request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const attrs = data?.data?.attributes ?? {};

    const name = attrs.name ?? 'Unknown SCUM Server';
    const statusRaw = attrs.status ?? 'unknown';
    const players = Number(attrs.players ?? 0);
    const maxPlayers = Number(attrs.maxPlayers ?? 0);
    const rank = attrs.rank ?? 'n/a';
    const ip = attrs.ip ?? config?.scum?.server_ip ?? null;
    const port = attrs.port ?? config?.scum?.query_port ?? null;

    const indicator =
      statusRaw === 'online' ? '🟢' : statusRaw === 'offline' ? '🔴' : '🟡';
    const bmLink = `https://www.battlemetrics.com/servers/scum/${BATTLEMETRICS_SERVER_ID}`;

    return `${indicator} **[${name}](${bmLink})**
Players: ${players}/${maxPlayers}
Rank: ${rank}
IP: \`${ip ?? 'n/a'}:${port ?? 'n/a'}\``;
  } catch (err) {
    console.error('[SERVER STATUS ERROR]', err?.message || err);
    return '🔴 Server is offline or unreachable.';
  }
}
