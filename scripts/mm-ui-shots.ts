/**
 * Headless Playwright screenshots of local throwaway Mattermost channel said-larkspur.
 */
import { chromium, type Page, type BrowserContext } from 'playwright';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SWITCH_LIVE = process.env.SWITCH_LIVE_DIR?.trim() || '/workspace/switch-live';
const OUT = process.env.SAID_UI_SHOTS?.trim() || '/workspace/said-live-shots/ui';
const MM = process.env.MATTERMOST_URL?.trim() || 'http://127.0.0.1:8065';

function loadDotEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, i)] = v;
  }
  return env;
}

const NAVY_THEME = JSON.stringify({
  awayIndicator: '#FABD2F',
  buttonBg: '#3B82F6',
  buttonColor: '#ffffff',
  centerChannelBg: '#0B1220',
  centerChannelColor: '#E8EEF7',
  codeTheme: 'solarized-dark',
  dndIndicator: '#F87171',
  errorTextColor: '#F87171',
  linkColor: '#93C5FD',
  mentionBg: '#3B82F6',
  mentionColor: '#ffffff',
  mentionHighlightBg: '#1E3A5F',
  mentionHighlightLink: '#93C5FD',
  newMessageSeparator: '#3B82F6',
  onlineIndicator: '#34D399',
  sidebarBg: '#070D18',
  sidebarHeaderBg: '#050A12',
  sidebarHeaderTextColor: '#E8EEF7',
  sidebarText: '#C7D2E5',
  sidebarTextActiveBorder: '#3B82F6',
  sidebarTextActiveColor: '#ffffff',
  sidebarTextHoverBg: '#132033',
  sidebarUnreadText: '#ffffff',
});

async function apiLogin(loginId: string, password: string) {
  const res = await fetch(`${MM}/api/v4/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login_id: loginId, password }),
  });
  if (!res.ok) throw new Error(`API login failed for ${loginId}: ${res.status}`);
  const token = res.headers.get('Token') || '';
  const user = (await res.json()) as { id: string; username: string };
  return { token, userId: user.id, username: user.username };
}

async function setPrefs(token: string, userId: string) {
  const prefs = [
    { user_id: userId, category: 'display_settings', name: 'name_format', value: 'full_name' },
    { user_id: userId, category: 'theme', name: '', value: NAVY_THEME },
    { user_id: userId, category: 'tutorial_step', name: userId, value: '999' },
    { user_id: userId, category: 'recommended_next_steps', name: 'hide', value: 'true' },
  ];
  await fetch(`${MM}/api/v4/users/${userId}/preferences`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(prefs),
  });
}

async function clickViewInBrowser(page: Page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.getByRole('button', { name: /view in browser/i });
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      // Prefer remembering
      const remember = page.getByLabel(/remember my preference/i);
      if (await remember.isVisible({ timeout: 500 }).catch(() => false)) {
        await remember.check({ force: true }).catch(() => undefined);
      }
      await btn.click();
      await page.waitForTimeout(1000);
      continue;
    }
    break;
  }
}

async function dismissUiChrome(page: Page) {
  await clickViewInBrowser(page);
  const selectors = [
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    'button:has-text("Done")',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    '[data-testid="close-welcome-screen"]',
    '.AnnouncementBar button',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 300 })) await loc.click({ timeout: 500 });
    } catch {
      /* ignore */
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function ensureChannel(page: Page, username: string, password: string, team: string, channel: string) {
  await page.goto(`${MM}/${team}/channels/${channel}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(800);
  await clickViewInBrowser(page);

  if (page.url().includes('/landing') || (await page.getByText(/where would you like to view/i).isVisible().catch(() => false))) {
    await clickViewInBrowser(page);
  }

  if (page.url().includes('/login') || (await page.locator('input[type="password"]').isVisible().catch(() => false))) {
    console.log('form login as', username);
    const userInput = page.locator('#input_loginId, input[name="loginId"], input[id*="login"]').first();
    const passInput = page.locator('#input_password, input[name="password"], input[type="password"]').first();
    await userInput.fill(username);
    await passInput.fill(password);
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")').first().click();
    await page.waitForTimeout(2000);
    await clickViewInBrowser(page);
    await page.goto(`${MM}/${team}/channels/${channel}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1000);
    await clickViewInBrowser(page);
  }

  // Direct channel again after interstitial
  if (!(await page.locator('.post, #postListContent, .post-list__content').first().isVisible().catch(() => false))) {
    await page.goto(`${MM}/${team}/channels/${channel}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1000);
    await clickViewInBrowser(page);
  }

  await dismissUiChrome(page);
  await page.waitForSelector('.post, #postListContent, .post-list__content, [class*="Post"]', { timeout: 45_000 });
  await page.waitForTimeout(1000);
  await dismissUiChrome(page);
  console.log('channel ready', page.url());
}

async function scrollToText(page: Page, text: string) {
  // Mattermost virtualizes; use in-page find via evaluate scroll of matching post
  const found = await page.evaluate((needle) => {
    const posts = Array.from(document.querySelectorAll('.post, [id^="post_"], .post__content'));
    for (const el of posts) {
      if ((el.textContent || '').includes(needle)) {
        el.scrollIntoView({ block: 'center' });
        return true;
      }
    }
    // Also try message text nodes
    const texts = Array.from(document.querySelectorAll('.post-message__text, .post__body'));
    for (const el of texts) {
      if ((el.textContent || '').includes(needle)) {
        el.scrollIntoView({ block: 'center' });
        return true;
      }
    }
    return false;
  }, text);
  await page.waitForTimeout(500);
  return found;
}

async function scrollBottom(page: Page) {
  await page.evaluate(() => {
    const candidates = [
      document.querySelector('#post-list'),
      document.querySelector('#postListContent'),
      document.querySelector('.post-list__content'),
      document.querySelector('[data-testid="post-list"]'),
      document.querySelector('.overflow--scroll'),
    ];
    for (const scroller of candidates) {
      if (scroller) {
        (scroller as HTMLElement).scrollTop = (scroller as HTMLElement).scrollHeight;
      }
    }
    // Also keyboard End in center
    window.scrollTo(0, document.body.scrollHeight);
  });
  // Mattermost: focus post list and press End
  await page.keyboard.press('End').catch(() => undefined);
  await page.waitForTimeout(600);
}

async function shot(page: Page, file: string) {
  await dismissUiChrome(page);
  await page.screenshot({ path: file, type: 'png' });
  console.log('wrote', file);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const env = loadDotEnv(join(SWITCH_LIVE, '.env'));
  const secrets = JSON.parse(readFileSync(join(SWITCH_LIVE, 'live-e2e-secrets.json'), 'utf8'));
  const channel = secrets.channel_name || 'said-larkspur';
  const adminTok = await apiLogin(env.MATTERMOST_ADMIN_USER, env.MATTERMOST_ADMIN_PASSWORD);
  const team = await fetch(`${MM}/api/v4/teams/${secrets.team_id}`, {
    headers: { authorization: `Bearer ${adminTok.token}` },
  }).then((r) => r.json() as Promise<{ name: string }>);
  const teamName = team.name;

  const riyaApi = await apiLogin(secrets.riya_username, env.MATTERMOST_USER_PASSWORD);
  const danaApi = await apiLogin(secrets.dana_username, secrets.dana_password);
  await setPrefs(riyaApi.token, riyaApi.userId);
  await setPrefs(danaApi.token, danaApi.userId);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  async function withUser(label: string, token: string, userId: string, username: string, password: string, shots: Array<{ file: string; seek?: string; bottom?: boolean }>) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    });
    // Skip desktop app landing via localStorage after first load; also set cookies
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem('__landingPageSeen__', 'true');
        window.localStorage.setItem('was_logged_in', 'true');
      } catch {
        /* ignore */
      }
    });
    await ctx.addCookies([
      { name: 'MMAUTHTOKEN', value: token, url: MM },
      { name: 'MMUSERID', value: userId, url: MM },
    ]);
    const page = await ctx.newPage();
    await ensureChannel(page, username, password, teamName, channel);
    for (const s of shots) {
      if (s.seek) {
        const ok = await scrollToText(page, s.seek);
        console.log(label, 'seek', s.seek, ok);
        if (!ok) {
          // Load more history: scroll up repeatedly then seek again
          for (let i = 0; i < 8; i++) {
            await page.evaluate(() => {
              const scroller =
                document.querySelector('#post-list') ||
                document.querySelector('#postListContent') ||
                document.querySelector('.post-list__content');
              if (scroller) (scroller as HTMLElement).scrollTop = 0;
            });
            await page.waitForTimeout(400);
          }
          await scrollToText(page, s.seek);
        }
      }
      if (s.bottom) await scrollBottom(page);
      await shot(page, join(OUT, s.file));
    }
    await ctx.close();
  }

  await withUser('riya', riyaApi.token, riyaApi.userId, secrets.riya_username, env.MATTERMOST_USER_PASSWORD, [
    { file: '01-riya-overview-bottom.png', bottom: true },
    { file: '02-riya-builder-refuse.png', seek: 'did not start work' },
    { file: '03-riya-terms-accept.png', seek: 'Terms DRF-001' },
    { file: '04-riya-dispute-quote.png', seek: 'not agreed' },
    { file: '05-riya-lock-handoff.png', seek: 'AGR-001 locked' },
    { file: '06-riya-builder-complete.png', seek: 'completed, commit' },
    { file: '07-riya-amend-drf002.png', bottom: true },
  ]);

  await withUser('dana', danaApi.token, danaApi.userId, secrets.dana_username, secrets.dana_password, [
    { file: '08-dana-lock-handoff.png', seek: 'AGR-001 locked' },
    { file: '09-dana-complete-and-cr.png', bottom: true },
  ]);

  await browser.close();
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify({ team: teamName, channel, viewport: '1440x900@2x', at: new Date().toISOString() }, null, 2),
  );
  console.log('done', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
