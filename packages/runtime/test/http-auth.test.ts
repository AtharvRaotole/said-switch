import { describe, expect, it } from 'vitest';
import { requestHasSharedSecret, sharedSecretFromEnv } from '../src/http-auth';

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
});
