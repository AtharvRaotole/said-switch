import { verifyFile } from './verify.js';

function usage(): never {
  console.error(`Usage:
  said verify <ledger-or-receipt-file> --public-key <base64>
  said verify <ledger-or-receipt-file> --public-key-file <path>

Verifies a Said signed ledger (markdown with a said-ledger fence, or raw SignedLedger JSON)
or a signed agreement receipt. Exits 0 on success, 1 on failure.`);
  process.exit(2);
}

function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('-')) usage();
  return v;
}

async function main(argv: string[]): Promise<void> {
  const [cmd, file, ...rest] = argv;
  if (cmd !== 'verify' || !file) usage();
  let publicKey = argValue(rest, '--public-key');
  const keyFile = argValue(rest, '--public-key-file');
  if (keyFile) {
    const { readFile } = await import('node:fs/promises');
    publicKey = (await readFile(keyFile, 'utf8')).trim();
  }
  if (!publicKey) usage();
  const result = await verifyFile(file, publicKey);
  if (result.ok) {
    console.log(result.summary);
    return;
  }
  console.error(`VERIFY FAILED: ${result.reason}`);
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
