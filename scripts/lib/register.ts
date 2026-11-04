import { SwitchApiError, registerAgent, type Addressing } from '@said/switch-client';

/** The slice of `SwitchOps` that registration needs (so tests can inject a stub). */
export interface AddressingOps {
  updateAgentDetail(input: { agentId: string; addressing?: Addressing }): Promise<unknown>;
  getAgentDetail(agentId?: string): Promise<unknown>;
}

export interface AgentHandle {
  name: string;
  id: string;
  ops: AddressingOps;
}

export type AddressingMethod = 'unchanged' | 'self' | 'peer' | 'manual';

export interface AddressingOutcome {
  name: string;
  desired: Addressing;
  effective: Addressing | string | null;
  method: AddressingMethod;
  /** What went wrong on the attempts that did not work (never contains secrets). */
  notes: string[];
}

const POLICY_ALIASES: Record<string, Addressing> = {
  owner: 'owner_only',
  owner_only: 'owner_only',
  'owner-agents': 'owner_and_owner_agents',
  owner_and_owner_agents: 'owner_and_owner_agents',
  anyone: 'anyone',
};

function aliasPolicy(raw: string): string {
  return POLICY_ALIASES[raw] ?? raw;
}

/**
 * Switch 0.31.0 `get_agent_detail` returns the stored `addressing_policy` blob
 * (null = open/"anyone"; otherwise a rules object). `_who_can_talk` in Switch
 * maps those presets the same way. Newer Switch builds instead attach
 * `addressing: { policy }` via `describe_addressing`.
 */
function classifyStoredPolicy(raw: unknown): string | null {
  if (raw === null) return 'anyone';
  if (typeof raw === 'string') return aliasPolicy(raw);
  if (!raw || typeof raw !== 'object') return null;
  const policy = (raw as { policy?: unknown }).policy;
  if (typeof policy === 'string') return aliasPolicy(policy);
  const rules = (raw as { rules?: unknown }).rules;
  if (!Array.isArray(rules) || rules.length !== 1) return 'custom';
  const rule = rules[0];
  if (!rule || typeof rule !== 'object') return 'custom';
  const r = rule as Record<string, unknown>;
  const openDims =
    r.rooms === '*' &&
    r.room_groups === '*' &&
    Array.isArray(r.users) &&
    r.users.length === 0 &&
    Array.isArray(r.agents) &&
    r.agents.length === 0 &&
    r.owner === true &&
    r.platform === false;
  if (!openDims) return 'custom';
  if (r.owner_agents === true) return 'owner_and_owner_agents';
  if (r.owner_agents === false) return 'owner_only';
  return 'custom';
}

/** Reads who may address an agent from a `get_agent_detail` result. */
export function effectivePolicy(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;

  if ('addressing' in record) {
    const addressing = record.addressing;
    if (typeof addressing === 'string') return aliasPolicy(addressing);
    if (addressing && typeof addressing === 'object') {
      const policy = (addressing as { policy?: unknown }).policy;
      if (typeof policy === 'string') return aliasPolicy(policy);
    }
  }

  // Switch 0.31.0: raw column on the agent row (null means open/"anyone").
  if ('addressing_policy' in record) return classifyStoredPolicy(record.addressing_policy);

  return null;
}

/** Room ids an agent belongs to, from `get_agent_detail.rooms`. `null` when the shape is unrecognised. */
export function roomIdsOf(detail: unknown): string[] | null {
  if (!detail || typeof detail !== 'object') return null;
  const rooms = (detail as { rooms?: unknown }).rooms;
  if (!Array.isArray(rooms)) return null;
  const ids: string[] = [];
  for (const r of rooms) {
    if (typeof r === 'string') ids.push(r);
    else if (r && typeof r === 'object') {
      const id = (r as { room_id?: unknown; id?: unknown }).room_id ?? (r as { id?: unknown }).id;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

function isAuthFailure(err: unknown): boolean {
  return err instanceof SwitchApiError && err.status === 401;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readPolicy(handle: AgentHandle): Promise<string | null> {
  try {
    return effectivePolicy(await handle.ops.getAgentDetail(handle.id));
  } catch (err) {
    if (isAuthFailure(err)) throw err;
    return null;
  }
}

/**
 * Sets who may address `target` and verifies the result by reading it back.
 *
 * Current Switch refuses an agent changing its OWN settings (`refuse_managing_self`) but lets an
 * agent change ANOTHER agent with the same owner; the released docs show self-update. So: try self
 * first, then the peer's key. Anything still wrong is reported as `manual` for the caller to explain.
 */
export async function ensureAddressing(
  target: AgentHandle,
  desired: Addressing,
  peer: AgentHandle | null,
): Promise<AddressingOutcome> {
  const notes: string[] = [];
  const before = await readPolicy(target);
  if (before === desired) return { name: target.name, desired, effective: before, method: 'unchanged', notes };

  const attempts: Array<{ method: 'self' | 'peer'; by: AgentHandle }> = [{ method: 'self', by: target }];
  if (peer) attempts.push({ method: 'peer', by: peer });

  for (const attempt of attempts) {
    try {
      await attempt.by.ops.updateAgentDetail({ agentId: target.id, addressing: desired });
    } catch (err) {
      if (isAuthFailure(err)) throw err;
      notes.push(
        attempt.method === 'self'
          ? `${target.name} changing its own settings was refused: ${describe(err)}`
          : `${peer?.name} changing ${target.name}'s settings was refused: ${describe(err)}`,
      );
      continue;
    }
    const after = await readPolicy(target);
    if (after === desired) return { name: target.name, desired, effective: after, method: attempt.method, notes };
    notes.push(`${attempt.method} update returned without error but the policy reads back as ${after ?? 'unknown'}`);
  }
  return { name: target.name, desired, effective: await readPolicy(target), method: 'manual', notes };
}

export const MANUAL_ADDRESSING_FIX =
  'Switch Console → Your Agents → <agent> → Settings → "Who can talk to your agent" → ' as const;

export function manualAddressingFix(name: string, desired: Addressing): string {
  const choice = desired === 'anyone' ? 'Anyone' : desired === 'owner_and_owner_agents' ? 'Me and my agents' : 'Only me';
  return `${MANUAL_ADDRESSING_FIX.replace('<agent>', name)}${choice}`;
}

export class RegistrationConflictError extends Error {
  constructor(readonly agentName: string) {
    super(
      `An agent named "${agentName}" already exists on this Switch server, and this repo has no working API key for it ` +
        '(Switch shows an API key only once).\n' +
        '  • Rotate its key and keep going:  npm run register -- --overwrite   (the agent id stays; the old key stops working)\n' +
        `  • Or delete "${agentName}" in Switch Console → Your Agents and run \`npm run register\` again.\n` +
        '  • Or register under another name: set SAID_AGENT_NAME / BUILDER_AGENT_NAME in .env.',
    );
    this.name = 'RegistrationConflictError';
  }
}

export interface RegisterOneInput {
  baseUrl: string;
  registrationKey: string;
  name: string;
  description: string;
  displayName: string;
  overwrite: boolean;
  /** Credentials this repo already holds for this agent name, if any. */
  existing: { agentId: string; apiKey: string } | null;
}

export interface RegisterOneDeps {
  register?: typeof registerAgent;
  /** True when the key still works (a cheap authenticated call). */
  keyWorks: (creds: { agentId: string; apiKey: string }) => Promise<boolean>;
}

export interface RegisteredAgent {
  id: string;
  apiKey: string;
  /** True when saved credentials were reused and nothing was registered. */
  reused: boolean;
}

export async function registerOne(input: RegisterOneInput, deps: RegisterOneDeps): Promise<RegisteredAgent> {
  if (!input.overwrite && input.existing && (await deps.keyWorks(input.existing))) {
    return { id: input.existing.agentId, apiKey: input.existing.apiKey, reused: true };
  }
  const register = deps.register ?? registerAgent;
  try {
    const created = await register({
      baseUrl: input.baseUrl,
      registrationKey: input.registrationKey,
      name: input.name,
      description: input.description,
      displayName: input.displayName,
      overwrite: input.overwrite ? true : undefined,
    });
    return { ...created, reused: false };
  } catch (err) {
    if (err instanceof SwitchApiError && err.status === 409 && !input.overwrite) {
      throw new RegistrationConflictError(input.name);
    }
    throw err;
  }
}
