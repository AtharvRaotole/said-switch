const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m', dim: '\x1b[2m' } as const;

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(name: string): Logger {
  const tty = process.stdout.isTTY;
  const prefix = (level: 'info' | 'warn' | 'error') => {
    const time = new Date().toISOString().slice(11, 19);
    return tty ? `${colors.dim}${time}${colors.reset} ${colors[level]}${name}${colors.reset}` : `${time} ${name} ${level}`;
  };
  return {
    info: (...a) => console.log(prefix('info'), ...a),
    warn: (...a) => console.warn(prefix('warn'), ...a),
    error: (...a) => console.error(prefix('error'), ...a),
  };
}
