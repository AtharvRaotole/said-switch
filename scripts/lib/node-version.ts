export const MIN_NODE = [22, 12, 0] as const;

/** True when `version` (like `22.14.0`) is at least 22.12.0. */
export function nodeVersionOk(version: string = process.versions.node): boolean {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const have = parts[i] ?? 0;
    const need = MIN_NODE[i]!;
    if (have > need) return true;
    if (have < need) return false;
  }
  return true;
}

export const MIN_NODE_LABEL = MIN_NODE.join('.');
