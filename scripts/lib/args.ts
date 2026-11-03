import { parseArgs } from 'node:util';

type OptionSpec = { type: 'string' | 'boolean'; short?: string };

/**
 * Parses CLI flags (`npm run x -- --flag value`). Unknown flags are errors so typos
 * like `--overwite` never silently do nothing.
 */
export function parseFlags<T extends Record<string, OptionSpec>>(
  options: T,
  argv: string[] = process.argv.slice(2),
): { values: { [K in keyof T]?: T[K]['type'] extends 'boolean' ? boolean : string }; positionals: string[] } {
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  return { values: values as never, positionals };
}
