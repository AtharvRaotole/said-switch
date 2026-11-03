/** Small terminal helpers shared by every operator script. Never print secret values through these. */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const wrap = (open: number, close: number) => (s: string) =>
  useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
};

export type Painter = (s: string) => string;

/** Distinct, readable prefix colors for child-process logs. */
export const serviceColors: Record<string, Painter> = {
  mock: c.blue,
  notary: c.magenta,
  builder: c.yellow,
  console: c.cyan,
  site: c.green,
};

export function paintFor(name: string): Painter {
  return serviceColors[name] ?? c.dim;
}

export const sym = {
  ok: c.green('✓'),
  fail: c.red('✖'),
  warn: c.yellow('!'),
  info: c.cyan('•'),
  step: c.cyan('▸'),
};

export function out(line = ''): void {
  console.log(line);
}

export function ok(msg: string): void {
  console.log(`${sym.ok} ${msg}`);
}
export function fail(msg: string): void {
  console.log(`${sym.fail} ${msg}`);
}
export function warn(msg: string): void {
  console.log(`${sym.warn} ${msg}`);
}
export function info(msg: string): void {
  console.log(`${sym.info} ${msg}`);
}
export function step(msg: string): void {
  console.log(`${sym.step} ${c.bold(msg)}`);
}
export function fixLine(msg: string): void {
  console.log(`    ${c.dim('fix:')} ${msg}`);
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Prints `lines` in a box. The width is measured without color codes. */
export function box(title: string, lines: string[]): void {
  const all = [title, ...lines];
  const width = Math.max(...all.map((l) => stripAnsi(l).length));
  const pad = (l: string) => `${l}${' '.repeat(width - stripAnsi(l).length)}`;
  console.log(`╔${'═'.repeat(width + 2)}╗`);
  console.log(`║ ${pad(c.bold(title))} ║`);
  console.log(`╟${'─'.repeat(width + 2)}╢`);
  for (const l of lines) console.log(`║ ${pad(l)} ║`);
  console.log(`╚${'═'.repeat(width + 2)}╝`);
}

/** A loud banner (used for the scripted-worker and offline-simulation warnings). */
export function banner(lines: string[], paint: Painter = c.yellow): void {
  const width = Math.max(...lines.map((l) => l.length));
  const bar = '═'.repeat(width + 4);
  console.log(paint(bar));
  for (const l of lines) console.log(paint(`  ${l.padEnd(width)}  `));
  console.log(paint(bar));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Exits the process after printing a clean one-line error (no stack) and an optional hint. */
export function die(message: string, hint?: string): never {
  console.error(`${sym.fail} ${message}`);
  if (hint) console.error(`  ${c.dim(hint)}`);
  process.exit(1);
}
