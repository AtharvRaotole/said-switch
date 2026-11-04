import { canonicalJson } from './canonical';

export type FenceLang = 'said-start' | 'said-receipt' | 'said-ledger' | 'said-agreement-receipt';

export function fenceJson(lang: FenceLang, value: unknown): string {
  return `\`\`\`${lang}\n${canonicalJson(value)}\n\`\`\``;
}

/** Raw contents of every complete ```<lang> block in `body`, in order. */
export function findFencedBlocks(body: string, lang: FenceLang): string[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== `\`\`\`${lang}`) continue;
    const end = lines.findIndex((line, j) => j > i && line.trim() === '```');
    if (end === -1) break;
    blocks.push(lines.slice(i + 1, end).join('\n'));
    i = end;
  }
  return blocks;
}

export function extractFencedJson<T>(body: string, lang: FenceLang): T | null {
  const [first] = findFencedBlocks(body, lang);
  if (first === undefined) return null;
  try {
    return JSON.parse(first) as T;
  } catch {
    return null;
  }
}
