/** Reads SAID_HTTP_SHARED_SECRET. Empty / unset means no secret configured. */
export function sharedSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.SAID_HTTP_SHARED_SECRET;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Live mode requires SAID_HTTP_SHARED_SECRET unless SAID_HTTP_ALLOW_INSECURE=1
 * (explicit loopback-dev opt-out when the browser console cannot send headers).
 * Offline / simulation never requires it.
 */
export function sharedSecretRequired(opts: {
  mode: 'live' | 'offline';
  env?: NodeJS.ProcessEnv;
}): { ok: true; secret: string | null } | { ok: false; reason: string } {
  const env = opts.env ?? process.env;
  const secret = sharedSecretFromEnv(env);
  // Offline / simulation: never gate HTTP (mock Switch on loopback). Live: require secret unless opted out.
  if (opts.mode !== 'live') return { ok: true, secret: null };
  const allowInsecure =
    env.SAID_HTTP_ALLOW_INSECURE === '1' || env.SAID_HTTP_ALLOW_INSECURE === 'true';
  if (secret) return { ok: true, secret };
  if (allowInsecure) return { ok: true, secret: null };
  return {
    ok: false,
    reason:
      'Live mode requires SAID_HTTP_SHARED_SECRET (set in .env). For loopback-only console work without a secret, set SAID_HTTP_ALLOW_INSECURE=1.',
  };
}

/** True when the request carries the shared secret via Bearer, X-Said-Shared-Secret, or ?said_shared_secret=. */
export function requestHasSharedSecret(
  headers: { get(name: string): string | null },
  secret: string,
  url?: string | URL | null,
): boolean {
  const auth = headers.get('authorization') ?? headers.get('Authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? null;
  const header =
    headers.get('x-said-shared-secret')?.trim() ?? headers.get('X-Said-Shared-Secret')?.trim() ?? null;
  let query: string | null = null;
  if (url) {
    try {
      const u = typeof url === 'string' ? new URL(url, 'http://127.0.0.1') : url;
      query = u.searchParams.get('said_shared_secret')?.trim() ?? null;
    } catch {
      query = null;
    }
  }
  const provided = bearer ?? header ?? query;
  return Boolean(provided && provided === secret);
}
