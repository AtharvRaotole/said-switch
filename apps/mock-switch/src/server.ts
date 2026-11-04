import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer, type Server } from 'node:http';
import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';

const SERVER_NAME = 'switch.local';
const OWNER_ID = 'user-dev';
/** Offline simulator only. Live Switch uses SWITCH_REGISTRATION_KEY from the environment. */
const REGISTRATION_KEY = 'mock-registration-key';
const BUSINESS_ROOM = '11111111-1111-4111-8111-111111111111';
const PERSONAL_ROOM = '22222222-2222-4222-8222-222222222222';
const MAX_DOCUMENT_BYTES = 1_048_576;
const ADDRESSING_DENIED_MESSAGE =
  "You're not permitted to direct messages to me in this room — my operator has restricted who can address me here.";
const ADDRESSING_UNCLAIMED_MESSAGE =
  "I only take instructions from my owner, and this chat account isn't linked to a Switch user yet — so I can't tell whether that's you. If it is, link this account to your Switch user in Switch Console, post the code it shows you from this account, and try again.";

type Addressing = 'owner_only' | 'owner_and_owner_agents' | 'anyone';
type Persona = {
  id: string;
  name: string;
  claimedBy: string | null;
};
type Room = {
  id: string;
  name: string;
  description: string;
  humans: Persona[];
};
type Agent = {
  id: string;
  apiKey: string;
  name: string;
  description: string;
  displayName: string | null;
  iconUrl: string | null;
  connectorType: string;
  integrationProfile: Record<string, unknown>;
  ownerId: string;
  addressing: Addressing;
  createdAt: string;
};
export type MockMessage = {
  message_id: string;
  room_id: string;
  sender: string;
  sender_name: string;
  body: string;
  timestamp: number;
  thread_id: string | null;
  attachments: never[];
  sender_type: 'user' | 'agent';
  switch_generated?: boolean;
};
export type MockDocument = {
  id: string;
  room_id: string;
  name: string;
  description: string;
  instructions: string;
  content: string;
  created_by_agent_id: string;
};
type DomainFrame = {
  event: 'message';
  data: {
    type: 'message';
    room_id: string;
    bridge_id: null;
    channel_type: 'channel_public';
    payload: {
      addressed: boolean;
      sender: string;
      sender_name: string;
      message_id: string;
      body: string;
      timestamp: number;
      thread_id: string | null;
      attachments: never[];
    };
    sequence: number;
  };
  id: number;
};
type PersistedState = {
  agents: Agent[];
  messages: MockMessage[];
  documents: MockDocument[];
  eventCounter: number;
  documentCounter: number;
  buffers: Record<string, DomainFrame[]>;
  sequences: Record<string, number>;
};
type Connection = {
  id: string;
  agentId: string;
  generation: number;
  scope: 'single' | 'all';
  filter: 'all' | 'addressed';
  rooms: Set<string>;
  cursor: number;
  ws: WebSocket | null;
  lastPong: number;
  pingTimer: NodeJS.Timeout | null;
  connectedRoom: string | null;
};
type SseClient = { send: (event: string, data: unknown) => void; close: () => void };

export interface MockSwitch {
  url: string;
  close(): Promise<void>;
  reset(): Promise<void>;
  say(
    as: 'developer' | 'client' | string,
    body: string,
    threadId?: string | null,
  ): Promise<{ messageId: string }>;
  messages(roomId?: string): MockMessage[];
  documents(roomId?: string): MockDocument[];
  deleteDocumentAsHuman(documentId: string): Promise<void>;
}

const rooms: Room[] = [
  {
    id: BUSINESS_ROOM,
    name: 'larkspur-site',
    description: 'Offline simulation of the Larkspur client project.',
    humans: [
      {
        id: '@switch-user-riya01:switch.local',
        name: 'Riya (developer)',
        claimedBy: OWNER_ID,
      },
      {
        id: '@switch-user-dana02:switch.local',
        name: 'Dana (client)',
        claimedBy: null,
      },
    ],
  },
  {
    id: PERSONAL_ROOM,
    name: 'weekend-plans',
    description: 'Offline simulation of a shared personal planning room.',
    humans: [
      {
        id: '@switch-user-sam03:switch.local',
        name: 'Sam',
        claimedBy: OWNER_ID,
      },
      {
        id: '@switch-user-alex04:switch.local',
        name: 'Alex',
        claimedBy: null,
      },
    ],
  },
];

const operationSpecs = {
  connect_to_room: spec(
    'Connect this session to a room. The agent must be assigned to the room.',
    {
      room_id: stringSchema(),
      include_general_instructions: booleanSchema(true),
    },
    ['room_id'],
  ),
  post_message: spec('Send a message to the connected room.', {
    body: stringSchema(),
    thread_id: nullableStringSchema(null),
  }, ['body']),
  send_targeted_message: spec('Send a message addressed to specific agents/users.', {
    body: stringSchema(),
    target_names: nullableArraySchema(),
    target_roles: nullableArraySchema(),
    thread_id: nullableStringSchema(null),
  }, ['body']),
  read_context: spec('Get a room conversation timeline, grouped into threads.', {
    limit: { type: 'integer', default: 50 },
    since: nullableStringSchema(null),
    before: nullableStringSchema(null),
    room_id: nullableStringSchema(null),
  }),
  list_participants: spec('List agents and users in the connected room.', {}),
  list_rooms: spec('List rooms this agent is assigned to.', {
    include_archived: booleanSchema(false),
  }),
  get_agent_detail: spec('Get full detail for an agent.', { agent_id: stringSchema() }, [
    'agent_id',
  ]),
  update_agent_detail: spec('Change an agent and return its fresh detail.', {
    agent_id: stringSchema(),
    name: nullableStringSchema(null),
    description: nullableStringSchema(null),
    display_name: nullableStringSchema(null),
    icon_url: nullableStringSchema(null),
    addressing: nullableStringSchema(null),
    provider: nullableStringSchema(null),
    model: nullableStringSchema(null),
    advanced_config: { anyOf: [{ type: 'object' }, { type: 'null' }], default: null },
    instructions: nullableStringSchema(null),
    auto_mode: nullableBooleanSchema(),
    auto_approve: nullableBooleanSchema(),
    directory: nullableStringSchema(null),
    isolation: nullableStringSchema(null),
    machine: nullableStringSchema(null),
    desired_state: nullableStringSchema(null),
  }, ['agent_id']),
  create_room_document: spec('Create a room-scoped internal document.', {
    name: stringSchema(),
    description: stringSchema(),
    instructions: stringSchema(),
    content: stringSchema(),
  }, ['name', 'description', 'instructions', 'content']),
  update_room_document: spec('Update a room-scoped document you created.', {
    document_id: stringSchema(),
    name: nullableStringSchema(null),
    description: nullableStringSchema(null),
    instructions: nullableStringSchema(null),
    content: nullableStringSchema(null),
  }, ['document_id']),
  delete_room_document: spec('Delete a room-scoped document you created.', {
    document_id: stringSchema(),
  }, ['document_id']),
  load_internal_documents: spec('Load internal documents attached to the room.', {
    ids: { type: 'array', items: { type: 'string' } },
  }, ['ids']),
} as const;

function stringSchema() {
  return { type: 'string' };
}
function booleanSchema(value: boolean) {
  return { type: 'boolean', default: value };
}
function nullableStringSchema(value: null) {
  return { anyOf: [{ type: 'string' }, { type: 'null' }], default: value };
}
function nullableBooleanSchema() {
  return { anyOf: [{ type: 'boolean' }, { type: 'null' }], default: null };
}
function nullableArraySchema() {
  return {
    anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
    default: null,
  };
}
function spec(
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    description,
    input_schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
  };
}

export async function createMockSwitch(opts: {
  port: number;
  statePath?: string;
  log?: boolean;
}): Promise<MockSwitch> {
  let state = seedState();
  const connections = new Map<string, Connection>();
  const sseClients = new Set<SseClient>();
  let closed = false;

  if (opts.statePath) {
    try {
      const loaded = JSON.parse(await readFile(opts.statePath, 'utf8')) as PersistedState;
      state = normalizeState(loaded);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const log = (message: string) => {
    if (opts.log !== false) {
      console.log(`[mock-switch simulation] ${message}`);
    }
  };

  let persistQueue = Promise.resolve();
  const persist = async () => {
    if (!opts.statePath) return;
    const path = opts.statePath;
    persistQueue = persistQueue.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(state, null, 2));
      await rename(temp, path);
    });
    await persistQueue;
  };

  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', mock: true }));

  app.post('/agents', async (c) => {
    if (bearer(c.req.header('authorization')) !== REGISTRATION_KEY) {
      return c.json({ detail: 'Invalid registration token' }, 401);
    }
    const body = await jsonObject(c);
    if (!body.ok) return body.response;
    const allowed = new Set([
      'name',
      'description',
      'connector_type',
      'integration_profile',
      'display_name',
      'icon_url',
      'tools',
      'models',
      'metadata',
      'overwrite',
    ]);
    const unexpected = Object.keys(body.value).filter((key) => !allowed.has(key));
    if (unexpected.length) {
      return c.json({ detail: `registration does not accept: ${unexpected.sort().join(', ')}` }, 400);
    }
    const {
      name,
      description,
      connector_type: connectorType,
      integration_profile: integrationProfile,
      overwrite,
    } = body.value;
    if (
      typeof name !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
      typeof description !== 'string' ||
      typeof connectorType !== 'string' ||
      !isObject(integrationProfile)
    ) {
      return c.json({ detail: 'Invalid registration request' }, 400);
    }
    const existing = state.agents.find((agent) => agent.name === name);
    if (existing && overwrite !== true) {
      return c.json({ detail: `Agent '${name}' already exists` }, 409);
    }
    const profile = integrationProfile as Record<string, unknown>;
    if (
      !['always_on', 'session_addressable', 'auto_session', 'session_passive'].includes(
        String(profile.connection_model),
      ) ||
      typeof profile.message_exchange !== 'boolean' ||
      !Array.isArray(profile.pre_invocation_mediation) ||
      !Array.isArray(profile.post_invocation_mediation) ||
      !Array.isArray(profile.event_reporting)
    ) {
      return c.json({ detail: 'Invalid integration_profile' }, 400);
    }
    const apiKey = `mock-agent-${randomBytes(24).toString('hex')}`;
    if (existing) {
      existing.apiKey = apiKey;
      existing.description = description;
      existing.connectorType = connectorType;
      existing.integrationProfile = profile;
      existing.displayName =
        typeof body.value.display_name === 'string' ? body.value.display_name : null;
      existing.iconUrl = typeof body.value.icon_url === 'string' ? body.value.icon_url : null;
      await persist();
      log(`re-registered agent ${name} (offline simulation)`);
      return c.json({ id: existing.id, api_key: apiKey });
    }
    const agent: Agent = {
      id: `@switch-agent-${uniqueHex(state.agents)}:${SERVER_NAME}`,
      apiKey,
      name,
      description,
      displayName:
        typeof body.value.display_name === 'string' ? body.value.display_name : null,
      iconUrl: typeof body.value.icon_url === 'string' ? body.value.icon_url : null,
      connectorType,
      integrationProfile: profile,
      ownerId: OWNER_ID,
      addressing: 'owner_and_owner_agents',
      createdAt: new Date().toISOString(),
    };
    state.agents.push(agent);
    state.buffers[agent.id] = [];
    state.sequences[agent.id] = 0;
    await persist();
    log(`registered agent ${name} (offline simulation)`);
    return c.json({ id: agent.id, api_key: agent.apiKey });
  });

  app.get('/agents/:id/ops', (c) => {
    const agent = authenticatedAgent(c.req.param('id'), c.req.header('authorization'));
    if (!agent) return c.json({ detail: 'Not authenticated' }, 401);
    return c.json({ operations: operationSpecs });
  });

  app.post('/agents/:id/ops/:op', async (c) => {
    const agent = authenticatedAgent(c.req.param('id'), c.req.header('authorization'));
    if (!agent) return c.json({ detail: 'Not authenticated' }, 401);
    const operation = c.req.param('op') as keyof typeof operationSpecs;
    const operationSpec = operationSpecs[operation];
    if (!operationSpec) {
      return c.json(
        {
          detail: `unknown operation '${operation}'; expected one of: ${Object.keys(
            operationSpecs,
          )
            .sort()
            .join(', ')}`,
        },
        404,
      );
    }
    const body = await jsonObject(c);
    if (!body.ok) return body.response;
    const validation = validateArguments(operation, body.value);
    if (validation) return c.json({ detail: validation }, 400);
    const connectionId = c.req.header('x-switch-connection-id');
    let connection: Connection | null = null;
    if (connectionId) {
      const candidate = connections.get(connectionId);
      if (!candidate || candidate.agentId !== agent.id || !candidate.ws) {
        return c.json({ detail: `Unknown or dead connection ${connectionId}` }, 409);
      }
      connection = candidate;
    }
    try {
      const result = await runOperation(agent, operation, body.value, connection);
      return c.json({ result });
    } catch (error) {
      if (error instanceof HttpError) return c.json({ detail: error.message }, error.status);
      throw error;
    }
  });

  app.post('/agents/:id/message', async (c) => {
    const agent = authenticatedAgent(c.req.param('id'), c.req.header('authorization'));
    if (!agent) return c.json({ detail: 'Not authenticated' }, 401);
    const body = await jsonObject(c);
    if (!body.ok) return body.response;
    const unexpected = Object.keys(body.value).filter(
      (key) => !['room_id', 'content'].includes(key),
    );
    if (
      unexpected.length ||
      typeof body.value.room_id !== 'string' ||
      typeof body.value.content !== 'string'
    ) {
      return c.json({ detail: 'Expected {room_id, content}' }, 400);
    }
    requireRoom(String(body.value.room_id));
    const message = await postMessage(
      agentActor(agent),
      String(body.value.room_id),
      String(body.value.content),
      null,
    );
    return c.json({ ok: true, event_id: message.message_id });
  });

  app.get('/mock/messages', (c) => {
    const room = resolveRoom(c.req.query('room'));
    return c.json({ messages: publicMessages(room) });
  });
  app.get('/mock/documents', (c) => {
    const room = resolveRoom(c.req.query('room'));
    return c.json({ documents: publicDocuments(room) });
  });
  // Offline only. These routes let the demo speak as Dana or Riya. They are not a security boundary.
  app.post('/mock/say', async (c) => {
    const body = await jsonObject(c);
    if (!body.ok) return body.response;
    if (typeof body.value.as !== 'string' || typeof body.value.body !== 'string') {
      return c.json({ detail: 'Expected {as, body}' }, 400);
    }
    try {
      const requestedRoom =
        typeof body.value.room === 'string' ? body.value.room : undefined;
      const roomId = requestedRoom ? resolveRoom(requestedRoom) : BUSINESS_ROOM;
      if (!roomId) throw new Error(`Unknown simulated room '${requestedRoom}'`);
      const actor = resolveHuman(String(body.value.as), roomId);
      const message = await postMessage(
        actor,
        roomId,
        String(body.value.body),
        typeof body.value.thread_id === 'string' ? body.value.thread_id : null,
      );
      return c.json({ message_id: message.message_id });
    } catch (error) {
      return c.json({ detail: (error as Error).message }, 400);
    }
  });
  app.post('/mock/reset', async (c) => {
    await reset();
    return c.json({ ok: true, mock: true });
  });
  app.post('/mock/delete-document', async (c) => {
    const body = await jsonObject(c);
    if (!body.ok) return body.response;
    if (typeof body.value.document_id !== 'string') {
      return c.json({ detail: 'Expected document_id' }, 400);
    }
    try {
      await deleteDocumentAsHuman(body.value.document_id);
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ detail: (error as Error).message }, 404);
    }
  });
  app.get('/mock/stream', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            client.close();
          }
        };
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': mock-switch simulation keepalive\n\n'));
          } catch {
            client.close();
          }
        }, 15_000);
        const client: SseClient = {
          send,
          close() {
            clearInterval(keepalive);
            sseClients.delete(client);
            try {
              controller.close();
            } catch {
              // The browser may already have closed its stream.
            }
          },
        };
        sseClients.add(client);
        send('ready', { mock: true });
      },
      cancel() {
        // The next write/keepalive removes the closed stream.
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });
  app.get('/', (c) => c.html(chatPage()));

  function requireAgent(id: string) {
    const agent = state.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new HttpError(400, `Agent ${id} not found`);
    return agent;
  }

  function participants(room: Room) {
    return [
      ...room.humans.map((human) => ({
        id: human.id,
        name: human.name,
        type: 'user' as const,
        agent_type: null,
        status: null,
        room_role: null,
        alias: null,
      })),
      ...state.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: 'agent' as const,
        agent_type: agent.connectorType,
        status: agentIsLive(agent.id, room.id) ? 'live' : 'no_session',
        room_role: null,
        alias: null,
      })),
    ];
  }

  function agentIsLive(agentId: string, roomId: string) {
    return [...connections.values()].some(
      (connection) =>
        connection.agentId === agentId &&
        connection.ws?.readyState === WebSocket.OPEN &&
        connection.rooms.has(roomId),
    );
  }

  function addressingView(agent: Agent, includeRules: boolean) {
    const rules =
      agent.addressing === 'anyone'
        ? []
        : [
            {
              rooms: '*',
              room_groups: '*',
              users: [],
              agents: [],
              owner: true,
              owner_agents: agent.addressing === 'owner_and_owner_agents',
              platform: false,
            },
          ];
    return includeRules ? { policy: agent.addressing, rules } : { policy: agent.addressing };
  }

  function agentDetail(agent: Agent, self: boolean) {
    const connectionModel = String(
      agent.integrationProfile.connection_model ?? 'session_addressable',
    );
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      icon_url: agent.iconUrl,
      display_name: agent.displayName,
      connector_type: agent.connectorType,
      connection_model: connectionModel,
      tool_count: 0,
      model_count: 0,
      owner_id: agent.ownerId,
      owner_name: 'Riya',
      oauth_client_id: null,
      created_at: agent.createdAt,
      parent_agent_id: null,
      known_agent_type: null,
      known_agent_options: null,
      agent_type: agent.connectorType,
      can_manage_agents: false,
      integration_profile: structuredClone(agent.integrationProfile),
      tools: [],
      models: [],
      rooms: rooms.map((room) => ({
        room_id: room.id,
        room_name: room.name,
        archived: false,
        status: agentIsLive(agent.id, room.id) ? 'live' : 'no_session',
        room_role: null,
      })),
      sessions: [],
      children: [],
      addressing: addressingView(agent, self),
    };
  }

  function connectShape(agent: Agent, room: Room, includeGeneral: boolean) {
    return {
      agent_id: agent.id,
      room_id: room.id,
      name: room.name,
      description: room.description,
      participants: participants(room),
      instructions: includeGeneral
        ? 'OFFLINE SIMULATION. This mock room follows the Switch agent protocol; it is not a real Switch deployment.'
        : '',
      reference_types: {},
      references: [],
      documents: state.documents
        .filter((document) => document.room_id === room.id)
        .map((document) => ({
          id: document.id,
          name: document.name,
          description: document.description,
          instructions: document.instructions,
        })),
      packages: [],
      linked_rooms: [],
      roles: [],
      warning: null,
    };
  }

  function normalizeThread(roomId: string, requested: string | null) {
    if (!requested) return null;
    const referenced = state.messages.find(
      (message) => message.room_id === roomId && message.message_id === requested,
    );
    if (!referenced) throw new HttpError(400, `Thread message ${requested} not found`);
    return referenced.thread_id ?? referenced.message_id;
  }

  async function runOperation(
    caller: Agent,
    operation: keyof typeof operationSpecs,
    args: Record<string, unknown>,
    connection: Connection | null,
  ): Promise<unknown> {
    if (operation === 'list_rooms') {
      return rooms.map((room) => ({
        room_id: room.id,
        name: room.name,
        description: room.description,
        connected: connection?.connectedRoom === room.id,
        archived: false,
      }));
    }
    if (operation === 'connect_to_room') {
      if (!connection) throw new HttpError(400, 'MCP session has no session id; cannot connect to room');
      const room = requireRoom(String(args.room_id));
      connection.connectedRoom = room.id;
      connection.rooms =
        connection.scope === 'single'
          ? new Set([room.id])
          : new Set(rooms.map((candidate) => candidate.id));
      return connectShape(caller, room, args.include_general_instructions !== false);
    }
    if (operation === 'get_agent_detail') {
      const target = requireAgent(String(args.agent_id));
      return agentDetail(target, caller.id === target.id);
    }
    if (operation === 'update_agent_detail') {
      const target = requireAgent(String(args.agent_id));
      if (target.ownerId !== caller.ownerId) {
        throw new HttpError(403, 'Agents do not have the same owner');
      }
      // The released protocol examples configure addressing with the agent's
      // own key, so the simulator permits self-configuration.
      if (args.addressing !== undefined && args.addressing !== null) {
        if (!['owner_only', 'owner_and_owner_agents', 'anyone'].includes(String(args.addressing))) {
          throw new HttpError(
            400,
            'addressing must be owner_only, owner_and_owner_agents, or anyone',
          );
        }
        target.addressing = args.addressing as Addressing;
      }
      if (typeof args.description === 'string') target.description = args.description;
      if (typeof args.display_name === 'string') target.displayName = args.display_name || null;
      if (typeof args.icon_url === 'string') target.iconUrl = args.icon_url || null;
      await persist();
      return { ...agentDetail(target, caller.id === target.id), managed: null };
    }
    if (operation === 'read_context') {
      const room = args.room_id
        ? requireRoom(String(args.room_id))
        : requireConnectedRoom(connection);
      const limit = args.limit === undefined ? 50 : Number(args.limit);
      if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit must be a positive integer');
      const since = parseTime('since', args.since);
      const before = parseTime('before', args.before);
      const all = state.messages.filter(
        (message) =>
          message.room_id === room.id &&
          (since === null || message.timestamp >= since) &&
          (before === null || message.timestamp < before),
      );
      const selected = all.slice(-limit);
      const selectedIds = new Set(selected.map((message) => message.message_id));
      const roots = selected.filter(
        (message) => !message.thread_id || !selectedIds.has(message.thread_id),
      );
      const groups = roots.map((root) => ({
        root: contextEntry(root),
        replies: selected
          .filter((message) => message.thread_id === root.message_id)
          .map(contextEntry),
      }));
      groups.sort(
        (a, b) =>
          latestContextTime(a) - latestContextTime(b),
      );
      return {
        threads: groups,
        truncated: selected.length < all.length,
        oldest_timestamp: selected[0]?.timestamp ?? null,
      };
    }
    if (operation === 'list_participants') {
      return participants(requireConnectedRoom(connection)).map(({ id, name, type, status, alias }) => ({
        id,
        name,
        type,
        status,
        alias,
      }));
    }
    if (operation === 'post_message') {
      const room = requireConnectedRoom(connection);
      const message = await postMessage(
        agentActor(caller),
        room.id,
        String(args.body),
        optionalThread(args.thread_id),
      );
      return { event_id: message.message_id };
    }
    if (operation === 'send_targeted_message') {
      const room = requireConnectedRoom(connection);
      const names = arrayOfStrings(args.target_names);
      const roles = arrayOfStrings(args.target_roles);
      if (!names.length && !roles.length) {
        throw new HttpError(400, 'at least one of target_names / target_roles is required');
      }
      if (roles.length) throw new HttpError(400, `Unknown role: ${roles[0]}`);
      const roomParticipants = participants(room);
      for (const name of names) {
        if (
          name.replace(/^@/, '').toLowerCase() !== 'everyone' &&
          !roomParticipants.some((participant) => participant.name === name)
        ) {
          throw new HttpError(400, `No participant named '${name}' in this room`);
        }
      }
      if (
        names.some((name) => name.replace(/^@/, '').toLowerCase() === 'everyone') &&
        args.thread_id
      ) {
        throw new HttpError(400, 'A room-wide mention cannot be sent in a thread');
      }
      const prefixed = names
        .map((name) => `@${name.replace(/^@/, '')}`)
        .join(' ');
      const content = `${prefixed}${prefixed ? ' ' : ''}${String(args.body)}`;
      const statuses: Record<string, string> = {};
      for (const name of names) {
        if (name.replace(/^@/, '').toLowerCase() === 'everyone') {
          statuses.everyone = 'sent';
          continue;
        }
        const target = state.agents.find((candidate) => candidate.name === name);
        if (!target) continue;
        statuses[name] = addressingAllowed(target, agentActor(caller), room.id)
          ? agentIsLive(target.id, room.id)
            ? 'live'
            : 'no_session'
          : 'not_permitted';
      }
      const message = await postMessage(
        agentActor(caller),
        room.id,
        content,
        optionalThread(args.thread_id),
      );
      return { event_id: message.message_id, target_statuses: statuses };
    }
    const room = requireConnectedRoom(connection);
    if (operation === 'create_room_document') {
      const content = String(args.content);
      checkDocumentSize(content);
      if (
        state.documents.some(
          (document) => document.room_id === room.id && document.name === args.name,
        )
      ) {
        throw new HttpError(
          400,
          `A room-scoped document named '${String(args.name)}' already exists in this room`,
        );
      }
      if (!String(args.name).trim()) throw new HttpError(400, 'name must not be empty');
      const document: MockDocument = {
        id: `mock-document-${++state.documentCounter}`,
        room_id: room.id,
        name: String(args.name),
        description: String(args.description),
        instructions: String(args.instructions),
        content,
        created_by_agent_id: caller.id,
      };
      state.documents.push(document);
      await persist();
      emitSse('documents', { room_id: room.id });
      return { document_id: document.id };
    }
    if (operation === 'load_internal_documents') {
      const ids = arrayOfStrings(args.ids);
      return ids.map((id) => {
        const document = state.documents.find(
          (candidate) => candidate.id === id && candidate.room_id === room.id,
        );
        if (!document) throw new HttpError(400, `Document ${id} is not attached to this room`);
        return {
          id: document.id,
          description: document.description,
          content: document.content,
        };
      });
    }
    const document = state.documents.find(
      (candidate) => candidate.id === String(args.document_id) && candidate.room_id === room.id,
    );
    if (!document) {
      throw new HttpError(
        400,
        `Room-scoped document ${String(args.document_id)} not found in room ${room.id}`,
      );
    }
    if (document.created_by_agent_id !== caller.id) {
      throw new HttpError(
        403,
        `Agent ${caller.id} did not create document ${document.id}`,
      );
    }
    if (operation === 'update_room_document') {
      if (typeof args.content === 'string') checkDocumentSize(args.content);
      if (typeof args.name === 'string' && !args.name.trim()) {
        throw new HttpError(400, 'name must not be empty');
      }
      if (
        typeof args.name === 'string' &&
        state.documents.some(
          (candidate) =>
            candidate.room_id === room.id &&
            candidate.id !== document.id &&
            candidate.name === args.name,
        )
      ) {
        throw new HttpError(
          400,
          `A room-scoped document named '${args.name}' already exists in this room`,
        );
      }
      for (const field of ['name', 'description', 'instructions', 'content'] as const) {
        if (typeof args[field] === 'string') document[field] = args[field];
      }
      await persist();
      emitSse('documents', { room_id: room.id });
      return { document_id: document.id, status: 'ok' };
    }
    state.documents = state.documents.filter((candidate) => candidate.id !== document.id);
    await persist();
    emitSse('documents', { room_id: room.id });
    return { document_id: document.id, status: 'ok' };
  }

  async function postMessage(
    sender: ReturnType<typeof agentActor> | ReturnType<typeof humanActor>,
    roomId: string,
    body: string,
    requestedThreadId: string | null,
    switchGenerated = false,
  ): Promise<MockMessage> {
    const room = requireRoom(roomId);
    const threadId = normalizeThread(room.id, requestedThreadId);
    const message: MockMessage = {
      message_id: `$evt-${++state.eventCounter}`,
      room_id: room.id,
      sender: sender.id,
      sender_name: sender.name,
      body,
      timestamp: Date.now(),
      thread_id: threadId,
      attachments: [],
      sender_type: sender.kind,
      ...(switchGenerated ? { switch_generated: true } : {}),
    };
    state.messages.push(message);
    const refusals: Agent[] = [];
    for (const agent of state.agents) {
      const visiblyMentioned = mentioned(body, agent.name);
      const admitted = addressingAllowed(agent, sender, room.id);
      const addressed = sender.id !== agent.id && visiblyMentioned && admitted && !switchGenerated;
      bufferMessage(agent, message, addressed);
      if (
        visiblyMentioned &&
        sender.id !== agent.id &&
        !admitted &&
        !switchGenerated
      ) {
        refusals.push(agent);
      }
    }
    await persist();
    emitSse('message', message);
    for (const agent of refusals) {
      const refusal =
        sender.kind === 'user' &&
        !sender.claimedBy &&
        agent.addressing !== 'anyone'
          ? ADDRESSING_UNCLAIMED_MESSAGE
          : ADDRESSING_DENIED_MESSAGE;
      await postMessage(
        agentActor(agent),
        room.id,
        refusal,
        threadId ?? message.message_id,
        true,
      );
    }
    return message;
  }

  function bufferMessage(agent: Agent, message: MockMessage, addressed: boolean) {
    const sequence = (state.sequences[agent.id] ?? 0) + 1;
    state.sequences[agent.id] = sequence;
    const frame: DomainFrame = {
      event: 'message',
      data: {
        type: 'message',
        room_id: message.room_id,
        bridge_id: null,
        channel_type: 'channel_public',
        payload: {
          addressed,
          sender: message.sender,
          sender_name: message.sender_name,
          message_id: message.message_id,
          body: message.body,
          timestamp: message.timestamp,
          thread_id: message.thread_id,
          attachments: [],
        },
        sequence,
      },
      id: sequence,
    };
    (state.buffers[agent.id] ??= []).push(frame);
    for (const connection of connections.values()) {
      if (
        connection.agentId === agent.id &&
        connection.ws?.readyState === WebSocket.OPEN &&
        connection.rooms.has(message.room_id) &&
        (connection.filter === 'all' || addressed)
      ) {
        connection.ws.send(JSON.stringify(frame));
      }
    }
  }

  function emitSse(event: string, data: unknown) {
    for (const client of [...sseClients]) client.send(event, data);
  }

  const httpServer: Server = createServer((request, response) => {
    void Promise.resolve(app.fetch(toRequest(request)))
      .then(async (honoResponse) => {
        response.statusCode = honoResponse.status;
        honoResponse.headers.forEach((value, key) => response.setHeader(key, value));
        if (!honoResponse.body) {
          response.end();
          return;
        }
        const reader = honoResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(value);
        }
        response.end();
      })
      .catch((error) => {
        response.statusCode = 500;
        response.end(JSON.stringify({ detail: String(error) }));
      });
  });
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    const origin = `http://${request.headers.host ?? 'localhost'}`;
    const url = new URL(request.url ?? '/', origin);
    const match = /^\/agents\/([^/]+)\/connection\/ws$/.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      attachWebSocket(ws, decodeURIComponent(match[1] ?? ''), request.headers.authorization, url);
    });
  });

  function attachWebSocket(
    ws: WebSocket,
    agentId: string,
    authorization: string | undefined,
    url: URL,
  ) {
    const agent = authenticatedAgent(agentId, authorization);
    if (!agent) {
      ws.close(4401, 'Not authenticated');
      return;
    }
    const connectionId = url.searchParams.get('connection_id');
    const scope = url.searchParams.get('scope') ?? 'single';
    const filter = url.searchParams.get('filter') ?? 'all';
    const startFrom = url.searchParams.get('start_from') ?? 'head';
    if (
      !connectionId ||
      !['single', 'all'].includes(scope) ||
      !['all', 'addressed'].includes(filter) ||
      (startFrom !== 'head' && !/^\d+$/.test(startFrom))
    ) {
      ws.close(4400, 'Invalid connection parameters');
      return;
    }
    const requestedRooms = (url.searchParams.get('rooms') ?? '')
      .split(',')
      .filter(Boolean);
    if (requestedRooms.some((id) => !rooms.some((room) => room.id === id))) {
      ws.send(JSON.stringify({
        event: 'refused',
        data: { status: 403, detail: 'Agent is not a member of this room' },
      }));
      ws.close(4403, 'Room cannot be served');
      return;
    }
    const previous = connections.get(connectionId);
    const expected = url.searchParams.get('expected_generation');
    if (previous && expected !== null && Number(expected) !== previous.generation) {
      ws.send(JSON.stringify({
        event: 'refused',
        data: { status: 409, detail: 'Connection was taken over' },
      }));
      ws.close(4409, 'taken_over');
      return;
    }
    if (previous?.ws?.readyState === WebSocket.OPEN) {
      previous.ws.send(
        JSON.stringify({
          event: 'evicted',
          data: {
            code: 'taken_over',
            reason: 'Another socket opened this connection id.',
            room_id: null,
          },
        }),
      );
      previous.ws.close(1000, 'taken_over');
      if (previous.pingTimer) clearInterval(previous.pingTimer);
    }
    const generation = (previous?.generation ?? 0) + 1;
    const coveredRooms =
      scope === 'all'
        ? new Set(rooms.map((room) => room.id))
        : new Set(requestedRooms);
    const head = state.sequences[agent.id] ?? 0;
    const cursor = startFrom === 'head' ? head : Number(startFrom);
    const connection: Connection = {
      id: connectionId,
      agentId: agent.id,
      generation,
      scope: scope as 'single' | 'all',
      filter: filter as 'all' | 'addressed',
      rooms: coveredRooms,
      cursor,
      ws,
      lastPong: Date.now(),
      pingTimer: null,
      connectedRoom: previous?.connectedRoom ?? requestedRooms[0] ?? null,
    };
    connections.set(connectionId, connection);
    ws.send(
      JSON.stringify({
        event: 'connection_state',
        data: {
          connection_id: connection.id,
          agent_id: agent.id,
          generation,
          scope: connection.scope,
          filter: connection.filter,
          spawn_capable: false,
          rooms: [...connection.rooms].sort(),
          cursor,
          position: {},
          protocol: 1,
          heartbeat_interval_seconds: 2,
          server: { version: 'mock-0.31' },
          client: null,
        },
      }),
    );
    if (startFrom !== 'head') {
      for (const frame of state.buffers[agent.id] ?? []) {
        if (
          frame.id > cursor &&
          connection.rooms.has(frame.data.room_id) &&
          (connection.filter === 'all' || frame.data.payload.addressed)
        ) {
          ws.send(JSON.stringify(frame));
        }
      }
    }
    connection.pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - connection.lastPong >= 6_000) {
        ws.send(
          JSON.stringify({
            event: 'evicted',
            data: {
              code: 'heartbeat_lapsed',
              reason: 'The connection stopped answering pings.',
              room_id: null,
            },
          }),
        );
        ws.close(1000, 'heartbeat_lapsed');
        connection.ws = null;
        if (connection.pingTimer) clearInterval(connection.pingTimer);
        connection.pingTimer = null;
        return;
      }
      ws.send(JSON.stringify({ event: 'ping', data: {} }));
    }, 2_000);
    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as { type?: string; cursor?: number };
        if (frame.type === 'pong') {
          connection.lastPong = Date.now();
          if (typeof frame.cursor === 'number' && frame.cursor > connection.cursor) {
            connection.cursor = frame.cursor;
          }
        }
      } catch {
        // Switch ignores non-pong and malformed client frames.
      }
    });
    ws.on('close', () => {
      if (connection.ws === ws) connection.ws = null;
      if (connection.pingTimer) clearInterval(connection.pingTimer);
      connection.pingTimer = null;
    });
  }

  async function reset() {
    for (const connection of connections.values()) {
      if (connection.pingTimer) clearInterval(connection.pingTimer);
      connection.ws?.close(1000, 'Mock Switch reset');
    }
    connections.clear();
    state = seedState();
    await persist();
    emitSse('reset', { mock: true });
    log('state reset (offline simulation)');
  }

  async function deleteDocumentAsHuman(documentId: string) {
    if (!state.documents.some((document) => document.id === documentId)) {
      throw new Error(`Document ${documentId} not found`);
    }
    state.documents = state.documents.filter((document) => document.id !== documentId);
    await persist();
    emitSse('documents', { deleted: documentId });
  }

  function authenticatedAgent(id: string, authorization: string | undefined) {
    const key = bearer(authorization);
    return state.agents.find((agent) => agent.id === id && agent.apiKey === key) ?? null;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Mock Switch did not bind a TCP port');
  const url = `http://127.0.0.1:${address.port}`;
  log(`OFFLINE SIMULATION listening on ${url}; this is not the real Switch`);

  return {
    url,
    async close() {
      if (closed) return;
      closed = true;
      for (const connection of connections.values()) {
        if (connection.pingTimer) clearInterval(connection.pingTimer);
        connection.ws?.close(1000, 'Mock Switch stopped');
      }
      for (const client of sseClients) client.close();
      await persistQueue;
      await new Promise<void>((resolve, reject) => {
        wss.close(() => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      });
    },
    reset,
    async say(as, body, threadId = null) {
      const roomId = personaDefaultRoom(as);
      const message = await postMessage(resolveHuman(as, roomId), roomId, body, threadId);
      return { messageId: message.message_id };
    },
    messages(roomId) {
      return publicMessages(roomId);
    },
    documents(roomId) {
      return publicDocuments(roomId);
    },
    deleteDocumentAsHuman,
  };

  function publicMessages(roomId?: string | null) {
    return state.messages
      .filter((message) => !roomId || message.room_id === roomId)
      .map((message) => structuredClone(message));
  }
  function publicDocuments(roomId?: string | null) {
    return state.documents
      .filter((document) => !roomId || document.room_id === roomId)
      .map((document) => structuredClone(document));
  }
}

function seedState(): PersistedState {
  return {
    agents: [],
    messages: [],
    documents: [],
    eventCounter: 0,
    documentCounter: 0,
    buffers: {},
    sequences: {},
  };
}

function normalizeState(state: PersistedState): PersistedState {
  return {
    agents: Array.isArray(state.agents) ? state.agents : [],
    messages: Array.isArray(state.messages) ? state.messages : [],
    documents: Array.isArray(state.documents) ? state.documents : [],
    eventCounter: Number.isInteger(state.eventCounter) ? state.eventCounter : 0,
    documentCounter: Number.isInteger(state.documentCounter) ? state.documentCounter : 0,
    buffers: state.buffers ?? {},
    sequences: state.sequences ?? {},
  };
}

function uniqueHex(agents: Agent[]) {
  let id: string;
  do id = randomBytes(3).toString('hex');
  while (agents.some((agent) => agent.id.includes(id)));
  return id;
}

function bearer(value: string | undefined) {
  const match = /^Bearer (.+)$/i.exec(value ?? '');
  return match?.[1] ?? null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function jsonObject(c: {
  req: { json(): Promise<unknown> };
  json(body: unknown, status?: 400): Response;
}): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  try {
    const value = await c.req.json();
    if (!isObject(value)) return { ok: false, response: c.json({ detail: 'Body must be an object' }, 400) };
    return { ok: true, value };
  } catch {
    return { ok: false, response: c.json({ detail: 'Invalid JSON body' }, 400) };
  }
}

function validateArguments(
  operation: keyof typeof operationSpecs,
  args: Record<string, unknown>,
): string | null {
  const accepted = new Set(Object.keys(operationSpecs[operation].input_schema.properties));
  const unexpected = Object.keys(args).filter((key) => !accepted.has(key)).sort();
  if (unexpected.length) return `${operation} does not accept: ${unexpected.join(', ')}`;
  const required = operationSpecs[operation].input_schema.required ?? [];
  const missing = required.filter((key) => !(key in args));
  if (missing.length) return `${operation} requires: ${missing.join(', ')}`;
  return null;
}

function requireRoom(id: string) {
  const room = rooms.find((candidate) => candidate.id === id);
  if (!room) throw new HttpError(400, `Room ${id} not found`);
  return room;
}

function requireConnectedRoom(connection: Connection | null) {
  if (!connection?.connectedRoom) {
    throw new HttpError(400, 'This operation requires a connected room; call connect_to_room first');
  }
  return requireRoom(connection.connectedRoom);
}

function resolveRoom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return rooms.find((room) => room.id === value || room.name === value)?.id;
}

function humanActor(human: Persona) {
  return {
    id: human.id,
    name: human.name,
    kind: 'user' as const,
    claimedBy: human.claimedBy,
    ownerId: null,
  };
}

function agentActor(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    kind: 'agent' as const,
    claimedBy: null,
    ownerId: agent.ownerId,
  };
}

function resolveHuman(as: string, roomId: string) {
  const room = requireRoom(roomId);
  const aliases: Record<string, string> =
    room.id === BUSINESS_ROOM
      ? { developer: 'Riya (developer)', client: 'Dana (client)', riya: 'Riya (developer)', dana: 'Dana (client)' }
      : { developer: 'Sam', client: 'Alex', sam: 'Sam', alex: 'Alex', partnera: 'Sam', partnerb: 'Alex' };
  const wanted = aliases[as.toLowerCase()] ?? as;
  const human = room.humans.find(
    (candidate) =>
      candidate.id === wanted || candidate.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (!human) throw new Error(`Unknown simulated human '${as}' in ${room.name}`);
  return humanActor(human);
}

function personaDefaultRoom(as: string) {
  return ['sam', 'alex', 'partnera', 'partnerb'].includes(as.toLowerCase())
    ? PERSONAL_ROOM
    : BUSINESS_ROOM;
}

function mentioned(body: string, name: string) {
  const stripped = body.replace(/[*_~]/g, '');
  return new RegExp(`@${escapeRegex(name)}(?![A-Za-z0-9._-])`, 'i').test(stripped);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addressingAllowed(
  agent: Agent,
  sender: ReturnType<typeof agentActor> | ReturnType<typeof humanActor>,
  _roomId: string,
) {
  if (agent.addressing === 'anyone') return true;
  if (sender.kind === 'user') return sender.claimedBy === agent.ownerId;
  return agent.addressing === 'owner_and_owner_agents' && sender.ownerId === agent.ownerId;
}

function optionalThread(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function arrayOfStrings(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HttpError(400, 'Expected a list of strings');
  }
  return value as string[];
}

function checkDocumentSize(content: string) {
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new HttpError(400, `content exceeds ${MAX_DOCUMENT_BYTES} bytes`);
  }
}

function parseTime(name: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${name} must be an ISO-8601 timestamp`);
  }
  return Date.parse(value);
}

function contextEntry(message: MockMessage) {
  return {
    id: message.message_id,
    kind: 'message',
    sender: message.sender,
    sender_name: message.sender_name,
    body: message.body,
    timestamp: message.timestamp,
    attachments: [],
  };
}

function latestContextTime(group: {
  root: ReturnType<typeof contextEntry>;
  replies: ReturnType<typeof contextEntry>[];
}) {
  return group.replies.at(-1)?.timestamp ?? group.root.timestamp;
}

function toRequest(request: import('node:http').IncomingMessage) {
  const origin = `http://${request.headers.host ?? 'localhost'}`;
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : (request as unknown as ReadableStream<Uint8Array>);
  return new Request(new URL(request.url ?? '/', origin), {
    method: request.method,
    headers: request.headers as unknown as Record<string, string>,
    body,
    duplex: body ? 'half' : undefined,
  } as RequestInit & { duplex?: 'half' });
}

class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function chatPage() {
  const roomData = JSON.stringify(
    rooms.map((room) => ({ id: room.id, name: room.name, humans: room.humans.map((human) => human.name) })),
  ).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Switch — Offline Simulation</title>
<style>
:root{color-scheme:light;--ink:#18211d;--muted:#69736e;--line:#dce3df;--paper:#f7f9f8;--green:#126149;--pale:#e7f1ec}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif}
.banner{position:sticky;top:0;z-index:3;background:#7b241c;color:#fff;padding:10px 20px;text-align:center;font-weight:800;letter-spacing:.05em}
header{display:flex;align-items:center;gap:18px;padding:18px max(20px,calc((100vw - 960px)/2));background:#fff;border-bottom:1px solid var(--line)}
h1{font-size:19px;margin:0}.mock{font-size:11px;background:#f5dedb;color:#7b241c;border-radius:99px;padding:4px 8px;font-weight:800}
select,textarea,button{font:inherit}select{margin-left:auto;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff}
main{max-width:960px;margin:auto;padding:24px 20px 180px}.empty{text-align:center;color:var(--muted);padding:60px 20px}
.message{display:grid;grid-template-columns:42px 1fr;gap:11px;padding:12px 0}.message.reply{margin-left:48px;border-left:2px solid var(--line);padding-left:16px}
.avatar{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--pale);color:var(--green);font-weight:800}
.meta{display:flex;align-items:center;gap:8px}.name{font-weight:750}.time{color:var(--muted);font-size:12px}.agent{font-size:10px;background:#dce9ff;color:#234f91;border-radius:4px;padding:2px 5px;font-weight:800}.switch{font-size:10px;background:#f5dedb;color:#7b241c;border-radius:4px;padding:2px 5px}
.body{margin-top:3px;overflow-wrap:anywhere}.body code{background:#e9eeeb;border-radius:4px;padding:1px 4px}.body details{margin-top:6px;border:1px solid var(--line);border-radius:7px;background:#fff}.body summary{padding:6px 9px;color:var(--muted);cursor:pointer}.body pre{margin:0;padding:10px;overflow:auto;border-top:1px solid var(--line)}
.composers{position:fixed;bottom:0;left:0;right:0;background:rgba(247,249,248,.96);border-top:1px solid var(--line);padding:12px max(20px,calc((100vw - 960px)/2));display:grid;grid-template-columns:1fr 1fr;gap:12px;backdrop-filter:blur(8px)}
.composer{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px}.composer label{display:block;font-size:12px;font-weight:750;margin-bottom:6px}.composer textarea{width:100%;height:54px;resize:none;border:0;outline:0}.composer button{float:right;border:0;border-radius:7px;background:var(--green);color:#fff;padding:6px 12px;font-weight:700;cursor:pointer}
@media(max-width:650px){.composers{grid-template-columns:1fr}.composer textarea{height:38px}main{padding-bottom:270px}}
</style></head>
<body>
<div class="banner">OFFLINE SIMULATION — mock Switch server, not the real product</div>
<header><h1>Team chat</h1><span class="mock">SIMULATION</span><select id="room"></select></header>
<main id="timeline"><div class="empty">No simulated messages yet.</div></main>
<section class="composers" id="composers"></section>
<script>
const rooms=${roomData};const roomSelect=document.querySelector('#room');const timeline=document.querySelector('#timeline');const composers=document.querySelector('#composers');
for(const room of rooms){const option=document.createElement('option');option.value=room.id;option.textContent='# '+room.name;roomSelect.append(option)}
function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function markdown(s){const fences=[];s=s.replace(/\`\`\`([^\\n]*)\\n?([\\s\\S]*?)\`\`\`/g,(_,lang,code)=>{fences.push('<details><summary>Code'+(lang?' — '+esc(lang):'')+'</summary><pre><code>'+esc(code)+'</code></pre></details>');return '@@FENCE'+(fences.length-1)+'@@'});s=esc(s).replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/\`([^\`]+)\`/g,'<code>$1</code>').replace(/\\n/g,'<br>');return s.replace(/@@FENCE(\\d+)@@/g,(_,n)=>fences[Number(n)])}
function renderComposer(room){composers.innerHTML='';room.humans.forEach(name=>{const box=document.createElement('form');box.className='composer';box.innerHTML='<label>Post as '+esc(name)+'</label><textarea aria-label="Message as '+esc(name)+'" placeholder="Write a simulated message…"></textarea><button>Send</button>';box.onsubmit=async e=>{e.preventDefault();const input=box.querySelector('textarea');if(!input.value.trim())return;await fetch('/mock/say',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({as:name,body:input.value,room:room.id})});input.value=''};composers.append(box)})}
async function render(){const room=roomSelect.value;const data=await fetch('/mock/messages?room='+encodeURIComponent(room)).then(r=>r.json());const messages=data.messages;if(!messages.length){timeline.innerHTML='<div class="empty">No simulated messages yet.</div>';return}const byId=new Map(messages.map(m=>[m.message_id,m]));timeline.innerHTML='';for(const m of messages){const el=document.createElement('article');el.className='message'+(m.thread_id?' reply':'');const initials=m.sender_name.split(/\\s+/).map(x=>x[0]).join('').slice(0,2);el.innerHTML='<div class="avatar">'+esc(initials)+'</div><div><div class="meta"><span class="name">'+esc(m.sender_name)+'</span>'+(m.sender_type==='agent'?'<span class="agent">AGENT</span>':'')+(m.switch_generated?'<span class="switch">SWITCH AUTO-REPLY</span>':'')+'<time class="time">'+new Date(m.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'</time></div><div class="body">'+markdown(m.body)+'</div></div>';timeline.append(el)}}
function roomChanged(){const room=rooms.find(r=>r.id===roomSelect.value);renderComposer(room);render()}
roomSelect.onchange=roomChanged;roomChanged();new EventSource('/mock/stream').addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.room_id===roomSelect.value)render()});new EventSource('/mock/stream').addEventListener('reset',render);
</script></body></html>`;
}
