/**
 * Wire shapes of the Switch agent protocol, as returned by the real server
 * (switch-core `bridges/agent/operations/definitions.py`). Field names are the
 * server's snake_case names: these are `result` payloads, passed through as-is.
 */

export interface SwitchAgentCredentials {
  baseUrl: string;
  agentId: string;
  apiKey: string;
}

/** What an agent's reachability can be (`AgentStatus` in switch-core `protocol/types.py`). */
export type AgentStatus =
  | 'live'
  | 'disconnected'
  | 'awaiting_manual_poll'
  | 'no_session'
  | 'dormant'
  | 'not_permitted';

/** What a room-wide `@everyone` mention did (`RoomWideMentionStatus`). */
export type RoomWideMentionStatus = 'sent' | 'unsupported' | 'no_bridge' | 'bridge_unavailable';

/** A participant as `connect_to_room` reports it. */
export interface RoomParticipant {
  id: string;
  name: string;
  type: 'agent' | 'user';
  agent_type: string | null;
  status: AgentStatus | null;
  room_role: string | null;
  alias: string | null;
}

/** A participant as `list_participants` reports it (no `agent_type` / `room_role`). */
export interface ParticipantSummary {
  id: string;
  name: string;
  type: 'agent' | 'user';
  status: AgentStatus | null;
  alias: string | null;
}

export interface RoomDocumentMetadata {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scope: 'room' | 'global';
  created_by_agent_id: string | null;
}

export interface LinkedRoom {
  target_room_id: string;
  target_room_name: string;
  target_room_description: string;
  label: string;
  access: 'member' | 'not_member';
  access_note?: string;
}

/** Result of the `connect_to_room` operation. */
export interface RoomContext {
  agent_id: string;
  room_id: string;
  name: string;
  description: string;
  participants: RoomParticipant[];
  instructions: string;
  reference_types: unknown[];
  references: unknown[];
  documents: RoomDocumentMetadata[];
  packages: unknown[];
  linked_rooms: LinkedRoom[];
  roles: unknown[];
  /** Set when connecting took the room off another live session of this agent. */
  warning: string | null;
}

/** Result of the `send_targeted_message` operation. Keys are the targeted names (or `everyone`). */
export interface TargetedResult {
  event_id: string;
  target_statuses: Record<string, AgentStatus | RoomWideMentionStatus>;
}

export interface ContextAttachment {
  filename: string;
  mimetype: string;
  size: number;
  mxc: string;
  msgtype: string;
}

/** One timeline entry of `read_context`. */
export interface ContextEntry {
  id: string;
  kind: 'message' | 'room_join';
  sender: string;
  sender_name: string;
  body: string;
  /** Epoch milliseconds. */
  timestamp: number | null;
  attachments: ContextAttachment[];
  sender_kind?: string;
  on_behalf_of?: string;
  [extra: string]: unknown;
}

export interface ContextThread {
  root: ContextEntry;
  /** Oldest first. */
  replies: ContextEntry[];
}

/** Result of the `read_context` operation. Threads are ordered with the freshest LAST. */
export interface ContextResult {
  threads: ContextThread[];
  truncated: boolean;
  oldest_timestamp: number | null;
}

export interface RoomSummary {
  room_id: string;
  name: string;
  description: string;
  connected: boolean;
  archived: boolean;
}

export interface LoadedDocument {
  id: string;
  name: string;
  description: string;
  content: string;
}

export type Addressing = 'owner_only' | 'owner_and_owner_agents' | 'anyone';

export interface OperationInfo {
  description: string;
  input_schema: unknown;
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface SwitchMessageEvent {
  kind: 'message';
  sequence: number;
  roomId: string;
  threadId: string | null;
  messageId: string;
  sender: string;
  senderName: string;
  body: string;
  timestamp: number;
  addressed: boolean;
  attachments: unknown[];
  /** The frame's `data` object: the event envelope, including `payload`, `bridge_id`, `channel_type`. */
  raw: unknown;
}

export interface SwitchCommandEvent {
  kind: 'command';
  sequence: number;
  roomId: string;
  command: string;
  args: unknown;
  userId: string;
  userName: string;
  threadId: string | null;
  raw: unknown;
}

export interface SwitchJoinEvent {
  kind: 'room_join';
  sequence: number;
  roomId: string;
  member: string;
  memberName: string;
  timestamp: number;
  listening: boolean;
  raw: unknown;
}

export type SwitchDomainEvent = SwitchMessageEvent | SwitchCommandEvent | SwitchJoinEvent;
