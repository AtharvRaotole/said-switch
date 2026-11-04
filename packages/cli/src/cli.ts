import { readFile } from 'node:fs/promises';
import { verifyFile } from './verify.js';

function usage(): never {
  console.error(`Usage:
  npm run verify -- <ledger-or-receipt-file> --public-key <base64>
  npm run verify -- <ledger-or-receipt-file> --public-key-file <path>
  npm run verify -- verify <ledger-or-receipt-file> --public-key-file <path>

  (The verify subcommand is optional when the first argument is a file path.)

Verifies a Said signed ledger (markdown with a said-ledger fence, or raw SignedLedger JSON)
or a signed agreement receipt. Exits 0 on success, 1 on failure.

--public-key-file may be a raw base64 public key, or a Said public-keys.json
(uses the notary key).`);
  process.exit(2);
}

function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('-')) usage();
  return v;
}

async function loadPublicKey(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) usage();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { notary?: { publicKey?: string }; publicKey?: string };
      const key = parsed.notary?.publicKey ?? parsed.publicKey;
      if (typeof key === 'string' && key.trim()) return key.trim();
    } catch {
      // fall through: treat as raw key material
    }
  }
  return trimmed;
}

async function main(argv: string[]): Promise<void> {
  let rest = argv;
  // Ergonomic: `npm run verify -- <file> ...` (no explicit verify subcommand).
  if (rest[0] === 'verify') rest = rest.slice(1);
  const file = rest[0];
  if (!file || file.startsWith('-')) usage();
  const flags = rest.slice(1);

  let publicKey = argValue(flags, '--public-key');
  const keyFile = argValue(flags, '--public-key-file');
  if (keyFile) {
    publicKey = await loadPublicKey(await readFile(keyFile, 'utf8'));
  } else if (publicKey) {
    publicKey = await loadPublicKey(publicKey);
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
