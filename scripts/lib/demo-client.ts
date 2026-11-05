import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '@said/runtime';

/** True when the demo client template has its own dependencies installed. */
export function demoClientInstalled(root = repoRoot): boolean {
  return existsSync(join(root, 'demo', 'client-site', 'node_modules'));
}

export const DEMO_CLIENT_MISSING =
  'demo/client-site/node_modules is missing, so the offline end-to-end story and the client-repo prep test cannot run. `npm test` and `npm run test:coverage` install it first. Run `npm run ensure:demo-client`. Set SAID_E2E=0 only when you mean to skip the offline story.';

/** Fails the test. A missing install must not be reported as a skipped pass. */
export function assertDemoClient(root = repoRoot): void {
  if (!demoClientInstalled(root)) throw new Error(DEMO_CLIENT_MISSING);
}
