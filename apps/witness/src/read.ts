import { assertDemoNotaryUrl } from './ports.js';

/** GET the pinned demo notary. Redirects are errors, so the host cannot move. */
export async function readDemoState(input: { notaryUrl: string; secret: string; fetchImpl?: typeof fetch }): Promise<unknown> {
  const origin = assertDemoNotaryUrl(input.notaryUrl);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (input.secret) headers['x-said-shared-secret'] = input.secret;
  const res = await (input.fetchImpl ?? fetch)(`${origin}/api/state`, { method: 'GET', headers, redirect: 'error' });
  if (!res.ok) throw new Error('demo notary refused the read');
  return (await res.json()) as unknown;
}
