import type { SwitchAgentCredentials } from './types.js';

export class SwitchApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? describeError(status, body));
    this.name = 'SwitchApiError';
    this.status = status;
    this.body = body;
  }
}

function describeError(status: number, body: unknown): string {
  const detail = body !== null && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string') return `Switch API ${status}: ${detail}`;
  if (detail !== undefined) return `Switch API ${status}: ${JSON.stringify(detail)}`;
  if (typeof body === 'string' && body.length > 0) return `Switch API ${status}: ${body}`;
  return `Switch API ${status}`;
}

export function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Performs a request and returns the parsed JSON body; throws `SwitchApiError` on non-2xx. */
export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const res = await fetchImpl(url, init);
  const body = await readBody(res);
  if (!res.ok) throw new SwitchApiError(res.status, body);
  return body;
}

export function bearer(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

/** `GET /health` is public; a 200 means this is the bridge base URL. */
export async function health(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${trimBase(baseUrl)}/health`);
    await res.arrayBuffer().catch(() => undefined);
    return res.status === 200;
  } catch {
    return false;
  }
}

export interface RegisterAgentInput {
  baseUrl: string;
  registrationKey: string;
  name: string;
  description: string;
  displayName?: string;
  connectorType?: string;
  overwrite?: boolean;
}

/**
 * `POST /agents` with a registration key. The API key in the response is
 * returned once by the server: the caller must persist it.
 */
export async function registerAgent(
  input: RegisterAgentInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; apiKey: string }> {
  const body: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    connector_type: input.connectorType ?? 'said-custom',
    integration_profile: {
      connection_model: 'always_on',
      message_exchange: true,
      pre_invocation_mediation: [],
      post_invocation_mediation: [],
      event_reporting: [],
    },
  };
  if (input.displayName !== undefined) body.display_name = input.displayName;
  if (input.overwrite !== undefined) body.overwrite = input.overwrite;

  const result = (await requestJson(fetchImpl, `${trimBase(input.baseUrl)}/agents`, {
    method: 'POST',
    headers: { ...bearer(input.registrationKey), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })) as { id?: unknown; api_key?: unknown } | null;

  if (!result || typeof result.id !== 'string' || typeof result.api_key !== 'string') {
    throw new SwitchApiError(200, result, 'Switch registration response is missing id or api_key');
  }
  return { id: result.id, apiKey: result.api_key };
}

export function credsBase(creds: SwitchAgentCredentials): string {
  return `${trimBase(creds.baseUrl)}/agents/${encodeURIComponent(creds.agentId)}`;
}
