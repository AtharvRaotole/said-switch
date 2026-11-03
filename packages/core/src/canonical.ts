/**
 * Deterministic JSON: object keys sorted by UTF-16 code unit order, no whitespace,
 * `undefined` object members dropped, non-finite numbers rejected.
 */
export function canonicalJson(value: unknown): string {
  const out = encode(value, '$');
  if (out === undefined) throw new TypeError('canonicalJson: top-level value is not serializable');
  return out;
}

function encode(value: unknown, path: string): string | undefined {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(value);
    case 'undefined':
      return undefined;
    case 'object':
      return Array.isArray(value) ? encodeArray(value, path) : encodeObject(value as Record<string, unknown>, path);
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }
}

function encodeArray(items: unknown[], path: string): string {
  const parts = items.map((item, i) => encode(item, `${path}[${i}]`) ?? 'null');
  return `[${parts.join(',')}]`;
}

function encodeObject(obj: Record<string, unknown>, path: string): string {
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const encoded = encode(obj[key], `${path}.${key}`);
    if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
  }
  return `{${parts.join(',')}}`;
}
