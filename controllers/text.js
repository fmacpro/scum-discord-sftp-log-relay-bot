export function extractUsername(logLine) {
  const trimmed = logLine.trim();

  const match = trimmed.match(/'(\d+):([^)']+)\(\d+\)'/);

  if (match && match[2]) {
    return match[2];
  }

  return null; // or throw error if preferred
}

export function parseChatLogLine(line) {
  line = line.trim();

  const regex = /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}):\s+'(\d+):([^']+?)\(\d+\)'\s+(?:Command:\s+)?'(.+)'$/;

  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [, timestamp, steamId, username, messageText] = match;

  return {
    timestamp,
    steamId,
    username,
    messageText
  };
}

export function parseLoginLogoutLogLine(line) {
  line = line.trim();

  const regex = /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}):\s+'([\d.]+)\s+(\d+):([^']+?)\(\d+\)'\s+logged (in|out) at: X=([-.\d]+)\s+Y=([-.\d]+)\s+Z=([-.\d]+)/;

  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [
    ,
    timestamp,
    ip,
    steamId,
    username,
    action,
    x,
    y,
    z
  ] = match;

  return {
    timestamp,
    ip,
    steamId,
    username,
    action: `logged ${action}`,
    loggedX: parseFloat(x),
    loggedY: parseFloat(y),
    loggedZ: parseFloat(z)
  };
}

export function parseKillLogLine(line) {
  line = line.trim();

  const regex = /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}):\s+Died:\s+([^()]+?)\s+\(([^)]+)\),\s+Killer:\s+([^()]+?)\s+\(([^)]+)\)\s+Weapon:\s+(.+?)(?:\s+[A-Z](?::)?\[.*)?$/;

  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [
    ,
    timestamp,
    victimName,
    victimId,
    killerName,
    killerId,
    weapon
  ] = match;

  return {
    timestamp,
    victimName: victimName.trim(),
    victimId: victimId.trim(),
    killerName: killerName.trim(),
    killerId: killerId.trim(),
    weapon: weapon.trim().replace(/\s+[A-Z](?::)?\[.*$/, '')
  };
}
