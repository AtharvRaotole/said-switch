import { SwitchApiError, bearer, credsBase, requestJson } from './http.js';
import type {
  Addressing,
  ContextResult,
  LoadedDocument,
  OperationInfo,
  ParticipantSummary,
  RoomContext,
  RoomSummary,
  SwitchAgentCredentials,
  TargetedResult,
} from './types.js';

function withDefined(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null));
}

/** HTTP side of the agent protocol: `POST /agents/{id}/ops/{operation}` and friends. */
export class SwitchOps {
  private readonly creds: SwitchAgentCredentials;
  private readonly fetchImpl: typeof fetch;
  private connectionId: string | null;

  constructor(creds: SwitchAgentCredentials, opts: { connectionId?: string; fetchImpl?: typeof fetch } = {}) {
    this.creds = creds;
    this.connectionId = opts.connectionId ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** The connection id binds calls to the room the connection has claimed. */
  setConnectionId(id: string | null): void {
    this.connectionId = id;
  }

  async listOps(): Promise<Record<string, OperationInfo>> {
    const body = (await requestJson(this.fetchImpl, `${credsBase(this.creds)}/ops`, {
      method: 'GET',
      headers: bearer(this.creds.apiKey),
    })) as { operations?: Record<string, OperationInfo> } | null;
    if (!body || typeof body.operations !== 'object' || body.operations === null) {
      throw new SwitchApiError(200, body, 'Switch ops listing is missing "operations"');
    }
    return body.operations;
  }

  /** Calls an operation with its arguments unwrapped in the body; returns `body.result`. */
  async call<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...bearer(this.creds.apiKey),
      'content-type': 'application/json',
    };
    if (this.connectionId) headers['x-switch-connection-id'] = this.connectionId;
    const body = (await requestJson(this.fetchImpl, `${credsBase(this.creds)}/ops/${encodeURIComponent(op)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    })) as { result?: T } | null;
    if (body === null || typeof body !== 'object' || !('result' in body)) {
      throw new SwitchApiError(200, body, `Switch operation ${op} returned no "result"`);
    }
    return body.result as T;
  }

  connectToRoom(roomId: string): Promise<RoomContext> {
    return this.call<RoomContext>('connect_to_room', { room_id: roomId });
  }

  postMessage(body: string, threadId?: string | null): Promise<{ event_id: string }> {
    return this.call('post_message', withDefined({ body, thread_id: threadId }));
  }

  sendTargetedMessage(body: string, targetNames: string[], threadId?: string | null): Promise<TargetedResult> {
    return this.call('send_targeted_message', withDefined({ body, target_names: targetNames, thread_id: threadId }));
  }

  readContext(opts: { limit?: number; since?: string; before?: string; roomId?: string } = {}): Promise<ContextResult> {
    return this.call(
      'read_context',
      withDefined({ limit: opts.limit, since: opts.since, before: opts.before, room_id: opts.roomId }),
    );
  }

  listParticipants(): Promise<ParticipantSummary[]> {
    return this.call('list_participants');
  }

  createRoomDocument(input: {
    name: string;
    description: string;
    instructions: string;
    content: string;
  }): Promise<{ document_id: string }> {
    return this.call('create_room_document', { ...input });
  }

  updateRoomDocument(input: {
    documentId: string;
    content?: string;
    name?: string;
    description?: string;
    instructions?: string;
  }): Promise<{ document_id: string; status: string }> {
    return this.call(
      'update_room_document',
      withDefined({
        document_id: input.documentId,
        content: input.content,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
      }),
    );
  }

  loadInternalDocuments(ids: string[]): Promise<LoadedDocument[]> {
    return this.call('load_internal_documents', { ids });
  }

  updateAgentDetail(
    input: { agentId: string; addressing?: Addressing } & Record<string, unknown>,
  ): Promise<unknown> {
    const { agentId, ...rest } = input;
    return this.call('update_agent_detail', withDefined({ ...rest, agent_id: agentId }));
  }

  getAgentDetail(agentId?: string): Promise<unknown> {
    return this.call('get_agent_detail', { agent_id: agentId ?? this.creds.agentId });
  }

  listRooms(includeArchived?: boolean): Promise<RoomSummary[]> {
    return this.call('list_rooms', withDefined({ include_archived: includeArchived }));
  }

  /** Room membership detail, including `bridge_id` and `bridge_display_name`. No room connection required. */
  getRoomDetail(roomId: string): Promise<unknown> {
    return this.call('get_room_detail', { room_id: roomId });
  }

  /** Workspace messaging apps (`messaging_apps.connected[].platform`). Absent on older Switch servers. */
  getMyContext(): Promise<unknown> {
    return this.call('get_my_context');
  }

  /** `POST /agents/{id}/message`: posts to a room without any connection. */
  async postMessageDirect(roomId: string, content: string): Promise<{ ok: boolean; event_id: string }> {
    const body = (await requestJson(this.fetchImpl, `${credsBase(this.creds)}/message`, {
      method: 'POST',
      headers: { ...bearer(this.creds.apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, content }),
    })) as { ok: boolean; event_id: string };
    return body;
  }
}
