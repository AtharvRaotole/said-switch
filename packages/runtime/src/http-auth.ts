/** Reads SAID_HTTP_SHARED_SECRET. Empty / unset means auth is off (localhost bind is the control). */
export function sharedSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.SAID_HTTP_SHARED_SECRET;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the request carries the shared secret via Bearer or X-Said-Shared-Secret. */
export function requestHasSharedSecret(
  headers: { get(name: string): string | null },
  secret: string,
): boolean {
  const auth = headers.get('authorization') ?? headers.get('Authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? null;
  const header =
    headers.get('x-said-shared-secret')?.trim() ?? headers.get('X-Said-Shared-Secret')?.trim() ?? null;
  const provided = bearer ?? header;
  return Boolean(provided && provided === secret);
}
