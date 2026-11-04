/** Tiny HTTP helpers for talking to Said's own local services (`/health`, `/api/*`). */

function saidAuthHeaders(): Record<string, string> {
  const secret = process.env.SAID_HTTP_SHARED_SECRET?.trim();
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 3000): Promise<T> {
  const res = await fetch(url, {
    headers: saidAuthHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** True when the URL answers 2xx within the timeout. Never throws. */
export async function isUp(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls `url` until it answers 2xx. `aborted()` lets the caller stop early (for example
 * when the child process serving it has already exited).
 */
export async function waitForUp(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number; aborted?: () => string | null } = {},
): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    const reason = opts.aborted?.();
    if (reason) throw new Error(reason);
    if (await isUp(url)) return;
    await sleep(opts.intervalMs ?? 300);
  }
  throw new Error(`${url} did not become ready within ${Math.round((opts.timeoutMs ?? 60_000) / 1000)}s`);
}

/** Polls `read` until it returns a non-null value or the deadline passes. */
export async function pollUntil<T>(
  what: string,
  read: () => Promise<T | null | undefined | false>,
  opts: { timeoutMs?: number; intervalMs?: number; aborted?: () => string | null } = {},
): Promise<T> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    const reason = opts.aborted?.();
    if (reason) throw new Error(reason);
    try {
      const value = await read();
      if (value) return value;
      lastError = null;
    } catch (err) {
      lastError = err;
    }
    await sleep(opts.intervalMs ?? 250);
  }
  const suffix = lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
  throw new Error(`Timed out waiting for ${what}${suffix}`);
}
