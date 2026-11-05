/**
 * Roster matching for bridged humans. Live Switch (0.31 Mattermost) posts a
 * Matrix actor id on the message while `connect_to_room` lists a UUID, and
 * both share a username. This is not an authentication check: a display name
 * is not proof of an agent. Use `senderIsAgent` for that.
 */
export function actorMatches(opts: {
  senderId: string;
  senderName?: string | null;
  id?: string | null;
  name?: string | null;
}): boolean {
  if (opts.id && opts.senderId === opts.id) return true;
  const senderName = opts.senderName?.trim().toLowerCase();
  const name = opts.name?.trim().toLowerCase();
  return Boolean(senderName && name && senderName === name);
}

/**
 * Agent client id on current Switch: `@switch-agent-<first 8 hex of the client uuid>:<server>`.
 * `create_client(client_type="agent")` is the only writer of this localpart.
 * Registration still returns a different id (the agent UUID). Message events
 * put the transport id in `sender` and the agent identifier, not the human
 * display name, in `sender_name`.
 */
const SWITCH_AGENT_TRANSPORT_ID = /^@switch-agent-[0-9a-f]{8}:[^:\s]+$/;

/**
 * People on current bridges and native member clients.
 * The localpart is `switch-<kind>` or `switch-<kind>-<rest>`, then `:<server>`.
 * Mattermost 0.31 used `@switch-mattermost-` for agents and people, so it is not here.
 */
const HUMAN_PLATFORM_SENDER = /^@switch-(?:telegram|slack|discord|teams|user|member)(?::|-)/;

export function isSwitchAgentTransportId(senderId: string): boolean {
  return SWITCH_AGENT_TRANSPORT_ID.test(senderId);
}

export function isHumanPlatformSender(senderId: string): boolean {
  return HUMAN_PLATFORM_SENDER.test(senderId);
}

export interface AgentSenderCheck {
  senderId: string;
  senderName?: string | null;
  agentId: string;
  agentName?: string | null;
  /**
   * Mattermost 0.31 posts `@switch-mattermost-…` for the agent bot and stamps
   * the agent identifier as `sender_name`. Case-insensitive. Off unless
   * `SAID_ALLOW_SAID_NAME_FALLBACK` is set. Never matches a current human
   * platform id, so a Telegram user cannot pass by renaming themselves.
   */
  allowNameFallback?: boolean;
  /**
   * Exact agent identifier on a legacy actor id (Mattermost receipts).
   * Still refused for human platform ids. Not case-insensitive.
   */
  allowLegacyExactName?: boolean;
}

/**
 * True only for the registered agent.
 *
 * 1. `sender` is the agent UUID stored at registration (mock Switch and any
 *    server that still puts that UUID on the event).
 * 2. `sender` is that agent's Switch transport id and `sender_name` is the
 *    agent identifier, character for character. Current Switch, including
 *    Telegram rooms, does this. A human bridge id never has the
 *    `@switch-agent-` localpart, and another agent has a different name.
 * 3. Optional Mattermost 0.31 name fallback, refused for human platform ids.
 */
export function senderIsAgent(input: AgentSenderCheck): boolean {
  if (input.agentId && input.senderId === input.agentId) return true;
  if (isHumanPlatformSender(input.senderId)) return false;
  const name = input.senderName?.trim() ?? '';
  const agentName = input.agentName?.trim() ?? '';
  if (!name || !agentName) return false;
  if (isSwitchAgentTransportId(input.senderId) && name === agentName) return true;
  if (input.allowLegacyExactName && name === agentName) return true;
  if (input.allowNameFallback && name.toLowerCase() === agentName.toLowerCase()) return true;
  return false;
}

/**
 * Agent chatter (Said ignoring its own posts, and the builder's on Mattermost).
 * Exact agent identifier only. A Telegram/Slack/Discord/Teams/member sender is
 * a person even when their name differs from an agent by case alone
 * (`Said` vs `said`), which Switch's puppet check does not reject.
 */
export function senderIsKnownAgent(input: {
  senderId: string;
  senderName?: string | null;
  agentIds: ReadonlySet<string>;
  agentNames: ReadonlySet<string>;
}): boolean {
  if (input.agentIds.has(input.senderId)) return true;
  if (isHumanPlatformSender(input.senderId)) return false;
  const name = input.senderName?.trim() ?? '';
  if (!name || !input.agentNames.has(name)) return false;
  return true;
}
