export interface StreamOptions {
  url: string;
  /** Named SSE events; each handler receives the parsed JSON `data`. */
  events: Record<string, (data: unknown) => void>;
  onOpen: () => void;
  onDown: () => void;
}

const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 10_000;

/**
 * EventSource gives up for good on HTTP errors and CORS failures, so every
 * error closes the stream and schedules a fresh one with capped backoff.
 */
export function openStream(options: StreamOptions): () => void {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = MIN_DELAY_MS;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    const es = new EventSource(options.url);
    source = es;
    es.onopen = () => {
      delay = MIN_DELAY_MS;
      options.onOpen();
    };
    es.onerror = () => {
      es.close();
      if (source === es) source = null;
      if (stopped) return;
      options.onDown();
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };
    for (const [name, handler] of Object.entries(options.events)) {
      es.addEventListener(name, (event) => {
        const data = parseData((event as MessageEvent).data);
        if (data !== undefined) handler(data);
      });
    }
  };

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    source?.close();
    source = null;
  };
}

function parseData(raw: unknown): unknown {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export async function getJson(url: string, timeoutMs = 5_000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
