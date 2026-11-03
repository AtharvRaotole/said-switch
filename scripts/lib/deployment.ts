import { createHash } from 'node:crypto';

/**
 * Lowercases scheme and host, drops default ports, query, fragment and trailing slashes,
 * so `HTTP://Localhost:8000/` and `http://localhost:8000` are the same deployment.
 */
export function normalizeSwitchUrl(raw: string): string {
  const url = new URL(raw.trim());
  const isDefaultPort =
    (url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443');
  const host = isDefaultPort ? url.hostname : url.host;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${host}${path}`.toLowerCase();
}

/** First 12 hex characters of sha256 over the normalized Switch URL. */
export function deploymentIdFor(switchUrl: string): string {
  return createHash('sha256').update(normalizeSwitchUrl(switchUrl)).digest('hex').slice(0, 12);
}
