/**
 * Drive the Said bilateral story against a local Switch + Mattermost stack.
 *
 * Prerequisites (see docs/LIVE_RUN.md and scripts/live-e2e.sh):
 *   - Switch + Mattermost + Postgres up under SWITCH_LIVE_DIR (default /workspace/switch-live)
 *   - Said agents registered; room bridged from a Mattermost channel
 *   - Said notary + builder running with SAID_HOME pointing at that deployment
 *   - live-e2e-secrets.json with channel_id, riya/dana passwords (never committed)
 *
 * Usage:
 *   npx tsx scripts/live-e2e.ts                 # full story (assumes enrolled)
 *   npx tsx scripts/live-e2e.ts --capture-only  # refresh evidence from current channel
 *   npx tsx scripts/live-e2e.ts --change-request-only
 *
 * Leaves the stack running. Writes evidence under SAID_LIVE_SHOTS (default /workspace/said-live-shots).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SWITCH_LIVE = process.env.SWITCH_LIVE_DIR?.trim() || '/workspace/switch-live';
const SHOTS = process.env.SAID_LIVE_SHOTS?.trim() || '/workspace/said-live-shots';
const MM = process.env.MATTERMOST_URL?.trim() || 'http://127.0.0.1:8065';
const NOTARY = process.env.SAID_NOTARY_URL?.trim() || 'http://127.0.0.1:7410';
const BUILDER = process.env.SAID_BUILDER_URL?.trim() || 'http://127.0.0.1:7420';

type Secrets = {
  channel_id: string;
  team_id?: string;
  riya_username?: string;
  dana_username?: string;
  dana_password: string;
  riya_password?: string;
};

function loadDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i);
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

async function mmLogin(loginId: string, password: string): Promise<{ token: string; user: { id: string; username: string } }> {
  const res = await fetch(`${MM}/api/v4/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login_id: loginId, password }),
  });
  if (!res.ok) throw new Error(`MM login failed for ${loginId}: ${res.status} ${await res.text()}`);
  const token = res.headers.get('Token') || res.headers.get('token');
  if (!token) throw new Error(`MM login for ${loginId} returned no Token header`);
  const user = (await res.json()) as { id: string; username: string };
  return { token, user };
}

async function mmPost(token: string, channelId: string, message: string): Promise<{ id: string; create_at: number }> {
  const res = await fetch(`${MM}/api/v4/posts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ channel_id: channelId, message }),
  });
  if (!res.ok) throw new Error(`MM post failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; create_at: number };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitNotary(pred: (s: any) => boolean, label: string, timeoutMs = 30_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await fetch(`${NOTARY}/api/state`).then((r) => r.json());
    if (pred(s)) return s;
    await sleep(500);
  }
  throw new Error(`timeout waiting for notary: ${label}`);
}

async function captureTranscript(token: string, channelId: string): Promise<unknown[]> {
  const res = await fetch(`${MM}/api/v4/channels/${channelId}/posts?per_page=200`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`transcript fetch failed: ${res.status}`);
  const posts = (await res.json()) as { order: string[]; posts: Record<string, any> };
  const users: Record<string, string> = {};
  const rows: unknown[] = [];
  for (const pid of [...posts.order].reverse()) {
    const p = posts.posts[pid];
    const uid = p.user_id as string;
    if (!users[uid]) {
      const u = await fetch(`${MM}/api/v4/users/${uid}`, {
        headers: { authorization: `Bearer ${token}` },
      }).then((r) => r.json() as Promise<{ username: string }>);
      users[uid] = u.username;
    }
    rows.push({ id: p.id, user: users[uid], message: p.message || '', create_at: p.create_at });
  }
  return rows;
}

function writeHtmlTranscript(rows: Array<{ user: string; message: string; create_at: number }>, path: string): void {
  const lines = [
    '<!doctype html><html><head><meta charset=utf-8><title>Said live Mattermost transcript</title>',
    '<style>body{font:14px/1.4 system-ui;background:#1e1e1e;color:#ddd;max-width:860px;margin:24px auto;padding:0 16px}',
    '.msg{margin:10px 0;padding:10px 12px;border-radius:8px;background:#2a2a2a}',
    '.u{font-weight:700;color:#89b4fa}.said{color:#a6e3a1}.builder{color:#f9e2af}.meta{opacity:.55;font-size:12px}</style></head><body>',
    '<h1>Said live Mattermost channel (API export)</h1>',
    '<p class=meta>Local throwaway instance. Captured from Mattermost API for judges / README media.</p>',
  ];
  for (const r of rows) {
    const cls = r.user === 'said' ? 'said' : r.user === 'builder' ? 'builder' : '';
    const ts = new Date(r.create_at).toISOString();
    const msg = (r.message || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    lines.push(`<div class=msg><div class="u ${cls}">@${r.user}</div><div class=meta>${ts}</div><div>${msg}</div></div>`);
  }
  lines.push('</body></html>');
  writeFileSync(path, lines.join('\n'));
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  mkdirSync(SHOTS, { recursive: true });

  const env = loadDotEnv(join(SWITCH_LIVE, '.env'));
  const secretsPath = join(SWITCH_LIVE, 'live-e2e-secrets.json');
  if (!existsSync(secretsPath)) {
    throw new Error(`Missing ${secretsPath}. Create it locally (gitignored) with channel_id + dana_password.`);
  }
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8')) as Secrets;
  const riyaUser = secrets.riya_username || env.MATTERMOST_USER || 'user';
  const danaUser = secrets.dana_username || 'dana-client';
  const riyaPass = secrets.riya_password || env.MATTERMOST_USER_PASSWORD;
  if (!riyaPass) throw new Error('No Riya/Mattermost user password (env MATTERMOST_USER_PASSWORD or secrets.riya_password)');

  const healthN = await fetch(`${NOTARY}/health`).then((r) => r.json()).catch(() => null);
  const healthB = await fetch(`${BUILDER}/health`).then((r) => r.json()).catch(() => null);
  if (!healthN || (healthN as { status?: string }).status !== 'ok') throw new Error(`Notary not healthy at ${NOTARY}`);
  if (!healthB || (healthB as { status?: string }).status !== 'ok') throw new Error(`Builder not healthy at ${BUILDER}`);

  const riya = await mmLogin(riyaUser, riyaPass);
  const dana = await mmLogin(danaUser, secrets.dana_password);
  console.log(`logged in as ${riya.user.username} and ${dana.user.username}`);

  const posts: Array<{ who: string; message: string; post_id: string; create_at: number }> = [];
  const record = async (who: 'riya' | 'dana', token: string, message: string) => {
    const p = await mmPost(token, secrets.channel_id, message);
    posts.push({ who, message, post_id: p.id, create_at: p.create_at });
    console.log(`${who}: ${message.slice(0, 100)}`);
    return p;
  };

  if (args.has('--capture-only')) {
    const rows = (await captureTranscript(riya.token, secrets.channel_id)) as Array<{
      user: string;
      message: string;
      create_at: number;
    }>;
    writeFileSync(join(SHOTS, 'mm-transcript.json'), JSON.stringify(rows, null, 2));
    writeHtmlTranscript(rows, join(SHOTS, 'mm-transcript.html'));
    const state = await fetch(`${NOTARY}/api/state`).then((r) => r.json());
    writeFileSync(join(SHOTS, 'notary-state.json'), JSON.stringify(state, null, 2));
    console.log(`captured ${rows.length} posts -> ${SHOTS}`);
    return;
  }

  if (args.has('--change-request-only')) {
    await record('dana', dana.token, 'Propose: add a contrast-safe theme toggle | Terms: +1 day, +$150');
    await sleep(2500);
    await record('riya', riya.token, 'Accept DRF-002 v1');
    await sleep(2500);
    const state = await waitNotary((s) => {
      const drafts = s?.signedLedger?.payload?.drafts || [];
      return drafts.some((d: any) => d.id === 'DRF-002' && d.status === 'PENDING' && d.approvals?.developer);
    }, 'DRF-002 developer-only');
    writeFileSync(join(SHOTS, 'story-mid.json'), JSON.stringify({ change_request: 'DRF-002', stateSnippet: state.signedLedger?.payload?.drafts }, null, 2));
  } else if (!args.has('--skip-story')) {
    // Core story beats. Safe to re-run after reset; on an already-completed AGR-001 the amend/propose beats still demo refusal + dual-sig.
    await record('dana', dana.token, "@builder Also add dark mode while you're in there");
    await sleep(2500);
    await record('riya', riya.token, 'Propose: Add dark mode | Terms: +2 days, +$400');
    await sleep(3000);
    await record('riya', riya.token, 'Accept DRF-001 v1');
    await sleep(2500);
    await record('dana', dana.token, 'Wait, I thought we agreed dark mode was free?');
    await sleep(2500);
    await record('dana', dana.token, 'I accept DRF-001 v1');
    // Dual lock -> signed handoff -> scripted builder (~2s). Catch mid-work amend window if still RUNNING.
    await sleep(800);
    await record('dana', dana.token, 'Amend AGR-001: also add a contrast-safe toggle | Terms: +1 day, +$150');
    await sleep(5000);
    // Change request needing both signatures (post-complete amend is refused; Propose opens DRF-002).
    await record('dana', dana.token, 'Propose: add a contrast-safe theme toggle | Terms: +1 day, +$150');
    await sleep(3000);
    await record('riya', riya.token, 'Accept DRF-002 v1');
    await sleep(3000);
  }

  writeFileSync(join(SHOTS, 'story-posts.json'), JSON.stringify(posts, null, 2));
  const rows = (await captureTranscript(riya.token, secrets.channel_id)) as Array<{
    user: string;
    message: string;
    create_at: number;
  }>;
  writeFileSync(join(SHOTS, 'mm-transcript.json'), JSON.stringify(rows, null, 2));
  writeHtmlTranscript(rows, join(SHOTS, 'mm-transcript.html'));
  const state = await fetch(`${NOTARY}/api/state`).then((r) => r.json());
  writeFileSync(join(SHOTS, 'notary-state.json'), JSON.stringify(state, null, 2));
  console.log(`done. posts=${rows.length} evidence in ${SHOTS}`);
  console.log('Leave stack running. Optional: google-chrome --headless=new --screenshot=... file://.../mm-transcript.html');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
