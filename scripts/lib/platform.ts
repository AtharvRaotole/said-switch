/**
 * Which chat app the room uses. setup, doctor, and register follow this
 * instead of assuming Mattermost.
 *
 * SAID_PLATFORM wins when set. Otherwise doctor reads the room's bridge from
 * Switch (`get_room_detail` + `get_my_context`). A blank value does not probe
 * Mattermost.
 */

export const KNOWN_PLATFORMS = ['telegram', 'mattermost', 'slack', 'discord', 'teams'] as const;
export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];

/** A Switch bridge key, `none` for an unbridged room, or null when unset. */
export type ChatPlatform = KnownPlatform | 'none' | (string & {});

export interface BridgeApp {
  id: string;
  platform: string;
  name?: string;
  yourAccountLinked: boolean;
  status?: string;
}

export interface PlatformResolution {
  platform: ChatPlatform | null;
  source: 'env' | 'room' | 'unset';
  /** Set when the workspace context listed this bridge. */
  appConnected: boolean | null;
  accountLinked: boolean | null;
  /** Env and the room disagree. */
  conflict: string | null;
  invalidEnv: string | null;
}

const NONE = new Set(['none', 'native', 'switch', 'unbridged']);

export function parsePlatform(raw: string | undefined | null): { platform: ChatPlatform | null; invalid: string | null } {
  const value = raw?.trim().toLowerCase() ?? '';
  if (!value) return { platform: null, invalid: null };
  if (NONE.has(value)) return { platform: 'none', invalid: null };
  if (/^[a-z][a-z0-9_]{1,31}$/.test(value)) return { platform: value, invalid: null };
  return { platform: null, invalid: value };
}

export function readBridgeApps(context: unknown): BridgeApp[] {
  if (!context || typeof context !== 'object') return [];
  const connected = (context as { messaging_apps?: { connected?: unknown } }).messaging_apps?.connected;
  if (!Array.isArray(connected)) return [];
  const apps: BridgeApp[] = [];
  for (const item of connected) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || typeof rec.platform !== 'string') continue;
    apps.push({
      id: rec.id,
      platform: rec.platform.trim().toLowerCase(),
      name: typeof rec.name === 'string' ? rec.name : undefined,
      yourAccountLinked: rec.your_account_linked === true,
      status: typeof rec.status === 'string' ? rec.status : undefined,
    });
  }
  return apps;
}

export function readRoomBridge(room: unknown): { bridgeId: string | null; displayName: string | null } {
  if (!room || typeof room !== 'object') return { bridgeId: null, displayName: null };
  const rec = room as Record<string, unknown>;
  return {
    bridgeId: typeof rec.bridge_id === 'string' && rec.bridge_id ? rec.bridge_id : null,
    displayName: typeof rec.bridge_display_name === 'string' ? rec.bridge_display_name : null,
  };
}

function platformFromDisplayName(name: string | null): ChatPlatform | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const platform of KNOWN_PLATFORMS) {
    if (lower.includes(platform)) return platform;
  }
  return null;
}

/**
 * Env wins. The room is used when env is blank. A room with no bridge is `none`,
 * which is not Mattermost.
 */
export function resolvePlatform(input: {
  envValue?: string | null;
  room?: unknown;
  context?: unknown;
  roomWasRead?: boolean;
}): PlatformResolution {
  const parsed = parsePlatform(input.envValue);
  const apps = readBridgeApps(input.context);
  const bridge = readRoomBridge(input.room);
  let fromRoom: ChatPlatform | null = null;
  let app: BridgeApp | undefined;
  if (input.roomWasRead) {
    if (!bridge.bridgeId) {
      fromRoom = 'none';
    } else {
      app = apps.find((item) => item.id === bridge.bridgeId);
      fromRoom = app?.platform ?? platformFromDisplayName(bridge.displayName);
    }
  }

  if (parsed.invalid) {
    return {
      platform: fromRoom,
      source: fromRoom ? 'room' : 'unset',
      appConnected: app ? app.status !== 'error' : null,
      accountLinked: app ? app.yourAccountLinked : null,
      conflict: null,
      invalidEnv: parsed.invalid,
    };
  }
  if (parsed.platform) {
    const conflict = fromRoom && fromRoom !== parsed.platform ? `SAID_PLATFORM=${parsed.platform} but the room bridge is ${fromRoom}` : null;
    const envApp = apps.find((item) => item.platform === parsed.platform);
    return {
      platform: parsed.platform,
      source: 'env',
      appConnected: envApp ? envApp.status !== 'error' : app && app.platform === parsed.platform ? true : apps.length ? false : null,
      accountLinked: (envApp ?? (app?.platform === parsed.platform ? app : undefined))?.yourAccountLinked ?? null,
      conflict,
      invalidEnv: null,
    };
  }
  if (fromRoom) {
    return {
      platform: fromRoom,
      source: 'room',
      appConnected: fromRoom === 'none' ? null : app ? app.status !== 'error' : null,
      accountLinked: app ? app.yourAccountLinked : null,
      conflict: null,
      invalidEnv: null,
    };
  }
  return { platform: null, source: 'unset', appConnected: null, accountLinked: null, conflict: null, invalidEnv: null };
}

/** Mattermost is probed only when this room is Mattermost, or SAID_PLATFORM is unset and MATTERMOST_URL was set on purpose. */
export function shouldProbeMattermost(platform: ChatPlatform | null, mattermostUrlSet: boolean): boolean {
  if (platform === 'mattermost') return true;
  if (platform === null && mattermostUrlSet) return true;
  return false;
}

export function platformLabel(platform: ChatPlatform | null): string {
  switch (platform) {
    case 'telegram':
      return 'Telegram';
    case 'mattermost':
      return 'Mattermost';
    case 'slack':
      return 'Slack';
    case 'discord':
      return 'Discord';
    case 'teams':
      return 'Microsoft Teams';
    case 'none':
      return 'Switch only (no chat bridge)';
    case null:
      return 'not set';
    default:
      return platform;
  }
}

export function chatPlace(platform: ChatPlatform | null): string {
  switch (platform) {
    case 'telegram':
      return 'the Telegram group';
    case 'mattermost':
      return 'the Mattermost channel';
    case 'slack':
      return 'the Slack channel';
    case 'discord':
      return 'the Discord channel';
    case 'teams':
      return 'the Teams channel';
    case 'none':
      return 'the Switch room';
    default:
      return 'the chat channel';
  }
}

export function inviteHint(platform: ChatPlatform | null, agentName: string): string {
  return `In ${chatPlace(platform)}, type: !invite-agent @${agentName}`;
}

export function setupSteps(platform: ChatPlatform | null): string[] {
  const commonTail = [
    'Put SWITCH_URL, SWITCH_REGISTRATION_KEY and SAID_ROOM_ID in .env',
    'npm run register     registers @said and @builder and sets who can address them',
    `In ${chatPlace(platform)}: !invite-agent @said and !invite-agent @builder (type the names; Telegram will not autocomplete them)`,
    'npm run enroll -- --developer "Riya" --client "Dana" --wait',
    'npm run dev          starts notary, builder, console and the client site',
    'npm run doctor       every line should be a pass before you record',
    '',
    'No Switch handy? npm run demo:offline runs the whole story against a clearly labeled simulator.',
  ];
  if (platform === 'telegram') {
    return [
      'Chat platform: Telegram (SAID_PLATFORM=telegram). Mattermost is not part of this setup.',
      '1. Install Docker and Switch Console. Add a server and run it on this computer. docs/SETUP_LIVE.md §1',
      '2. Telegram: @BotFather /newbot. In BotFather turn Group Privacy off BEFORE the bot joins any group.',
      '   Switch Console → Messaging apps → Connect → Telegram. Paste the token there, not into this repo.',
      '   Create a group, add both people, add the bot. Each person posts once, then Link my account → This is me.',
      ...commonTail.map((line, i) => (i < 6 ? `${i + 3}. ${line}` : line)),
    ];
  }
  if (platform === 'mattermost') {
    return [
      'Chat platform: Mattermost (SAID_PLATFORM=mattermost).',
      '1. Install Docker and Switch Console. Add a server and run it on this computer. docs/SETUP_LIVE.md §1',
      '2. Mattermost: developer and client accounts, create a channel, turn it into a Switch room. docs/SETUP_LIVE.md §2',
      ...commonTail.map((line, i) => (i < 6 ? `${i + 3}. ${line}` : line)),
    ];
  }
  if (platform === 'slack' || platform === 'discord' || platform === 'teams') {
    const label = platformLabel(platform);
    return [
      `Chat platform: ${label} (SAID_PLATFORM=${platform}). Mattermost is not part of this setup.`,
      '1. Install Docker and Switch Console. Add a server and run it on this computer.',
      `2. ${label}: connect it in Switch Console → Messaging apps. The app token stays in Switch, not in this repo. docs/PLATFORM_BRIDGES.md`,
      '   Create or pick the channel, add both people, and link your account (This is me) after you have posted once.',
      ...commonTail.map((line, i) => (i < 6 ? `${i + 3}. ${line}` : line)),
    ];
  }
  if (platform === 'none') {
    return [
      'Chat platform: none. Said runs in a Switch room with no Slack, Telegram, or Mattermost bridge.',
      '1. Install Docker and Switch Console. Add a server and run it on this computer.',
      '2. Create the room in Switch Console. There is no messaging-app bot to connect.',
      ...commonTail.map((line, i) => (i < 6 ? `${i + 3}. ${line}` : line)),
    ];
  }
  if (platform) {
    return [
      `Chat platform: ${platform} (SAID_PLATFORM). Mattermost is not probed unless you set SAID_PLATFORM=mattermost.`,
      '1. Install Docker and Switch Console. Add a server and run it on this computer.',
      `2. Connect ${platform} in Switch Console → Messaging apps. See docs/PLATFORM_BRIDGES.md.`,
      ...commonTail.map((line, i) => (i < 6 ? `${i + 3}. ${line}` : line)),
    ];
  }
  return [
    'Chat platform is not set. Doctor will not warn that Mattermost is down.',
    'Set SAID_PLATFORM in .env to telegram, mattermost, slack, discord, teams, or none.',
    'The hackathon demo is Telegram. With SAID_PLATFORM=telegram the steps are:',
    '  BotFather /newbot, Group Privacy off before the bot joins, connect the bot in Switch Console,',
    '  add it to the group, both people post, then Link my account. README "Live Telegram room".',
    'Mattermost instead: SAID_PLATFORM=mattermost and docs/SETUP_LIVE.md. It is not the default.',
    ...commonTail.map((line, i) => `${i + 1}. ${line}`),
  ];
}
