/** Parse `git status --porcelain=v1 -z` into repo-relative paths (both sides of a rename). */
export function parsePorcelainZ(output: string): string[] {
  if (!output) return [];
  const records = output.split('\0');
  if (records.at(-1) === '') records.pop();
  const paths: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i] ?? '';
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    const renamed = status.includes('R') || status.includes('C');
    if (renamed) {
      const dest = records[++i];
      if (path) paths.push(path);
      if (dest) paths.push(dest);
    } else if (path) {
      paths.push(path);
    }
  }
  return paths;
}
