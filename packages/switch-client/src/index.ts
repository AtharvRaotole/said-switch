export { SwitchApiError, health, registerAgent } from './http.js';
export type { RegisterAgentInput } from './http.js';
export { SwitchOps } from './ops.js';
export { FileCursorStore, MemoryCursorStore } from './cursor-store.js';
export type { CursorState, CursorStore } from './cursor-store.js';
export { SwitchConnection } from './connection.js';
export type { ConnectionLogger, ConnectionOptions, ConnectionStatus } from './connection.js';
export type {
  Addressing,
  AgentStatus,
  ContextAttachment,
  ContextEntry,
  ContextResult,
  ContextThread,
  LinkedRoom,
  LoadedDocument,
  OperationInfo,
  ParticipantSummary,
  RoomContext,
  RoomDocumentMetadata,
  RoomParticipant,
  RoomSummary,
  RoomWideMentionStatus,
  SwitchAgentCredentials,
  SwitchCommandEvent,
  SwitchDomainEvent,
  SwitchJoinEvent,
  SwitchMessageEvent,
  TargetedResult,
} from './types.js';
export { actorMatches } from './actors.js';
