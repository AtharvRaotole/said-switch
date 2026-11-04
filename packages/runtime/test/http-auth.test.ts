import { describe, expect, it } from 'vitest';
import { requestHasSharedSecret, sharedSecretFromEnv, sharedSecretRequired } from '../src/http-auth';

describe('sharedSecretFromEnv', () => {
  it('treats missing and blank as disabled', () => {
    expect(sharedSecretFromEnv({})).toBeNull();
    expect(sharedSecretFromEnv({ SAID_HTTP_SHARED_SECRET: '' })).toBeNull();
    expect(sharedSecretFromEnv({ SAID_HTTP_SHARED_SECRET: '   ' })).toBeNull();
  });

  it('returns a trimmed secret when set', () => {
    expect(sharedSecretFromEnv({ SAID_HTTP_SHARED_SECRET: '  abc  ' })).toBe('abc');
  });
});

describe('sharedSecretRequired', () => {
  it('never requires or applies a secret in offline mode', () => {
    expect(sharedSecretRequired({ mode: 'offline', env: {} })).toEqual({ ok: true, secret: null });
    expect(
      sharedSecretRequired({ mode: 'offline', env: { SAID_HTTP_SHARED_SECRET: 'tok' } }),
    ).toEqual({ ok: true, secret: null });
  });

  it('requires a secret in live mode unless ALLOW_INSECURE', () => {
    const denied = sharedSecretRequired({ mode: 'live', env: {} });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.reason).toMatch(/SAID_HTTP_SHARED_SECRET/);

    expect(sharedSecretRequired({ mode: 'live', env: { SAID_HTTP_ALLOW_INSECURE: '1' } })).toEqual({
      ok: true,
      secret: null,
    });
    expect(sharedSecretRequired({ mode: 'live', env: { SAID_HTTP_SHARED_SECRET: 'tok' } })).toEqual({
      ok: true,
      secret: 'tok',
    });
  });
});

describe('requestHasSharedSecret', () => {
  it('accepts Bearer and header forms', () => {
    const secret = 's3cret';
    expect(
      requestHasSharedSecret(new Headers({ authorization: `Bearer ${secret}` }), secret),
    ).toBe(true);
    expect(requestHasSharedSecret(new Headers({ 'x-said-shared-secret': secret }), secret)).toBe(true);
    expect(requestHasSharedSecret(new Headers({ authorization: 'Bearer wrong' }), secret)).toBe(false);
    expect(requestHasSharedSecret(new Headers(), secret)).toBe(false);
  });

  it('accepts ?said_shared_secret= for EventSource clients', () => {
    const secret = 's3cret';
    expect(
      requestHasSharedSecret(new Headers(), secret, 'http://127.0.0.1:7410/api/events?said_shared_secret=s3cret'),
    ).toBe(true);
    expect(
      requestHasSharedSecret(new Headers(), secret, 'http://127.0.0.1:7410/api/events?said_shared_secret=wrong'),
    ).toBe(false);
  });
});
