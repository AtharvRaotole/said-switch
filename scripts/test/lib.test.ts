import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, generateCode, generateCodes } from '../lib/codes.js';
import { deploymentIdFor, normalizeSwitchUrl } from '../lib/deployment.js';
import { buildEnrollment, enrollLine } from '../lib/enrollment.js';
import { nodeVersionOk } from '../lib/node-version.js';
import { chooseWorker } from '../lib/offline.js';
import { enrollmentSchema } from '@said/runtime';

describe('enrollment codes', () => {
  it('uses 4 uppercase characters and no look-alikes', () => {
    expect(CODE_LENGTH).toBe(4);
    expect(CODE_ALPHABET).not.toMatch(/[O0I1L]/);
    expect(CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('generates distinct codes', () => {
    for (let i = 0; i < 300; i++) {
      const [a, b] = generateCodes(2);
      expect(a).not.toBe(b);
    }
    expect(new Set(generateCodes(20)).size).toBe(20);
  });

  it('builds a schema-valid enrollment with two different codes', () => {
    const e = buildEnrollment('room-1', { roomMode: 'business', labels: { developer: 'Riya', client: 'Dana' } }, 1234);
    expect(() => enrollmentSchema.parse(e)).not.toThrow();
    expect(e.codes.map((c) => c.role)).toEqual(['developer', 'client']);
    expect(e.codes[0]!.code).not.toBe(e.codes[1]!.code);
    expect(enrollLine('said', e.codes[0]!.code)).toBe(`@said enroll ${e.codes[0]!.code}`);

    const p = buildEnrollment('room-2', { roomMode: 'personal', labels: { partnerA: 'Sam', partnerB: 'Alex' } });
    expect(p.codes.map((c) => c.role)).toEqual(['partnerA', 'partnerB']);
  });

  it('refuses a missing name', () => {
    expect(() => buildEnrollment('r', { roomMode: 'business', labels: { developer: 'Riya' } })).toThrow(/client/);
  });
});

describe('deploymentId', () => {
  it('is the first 12 hex of sha256 of the normalized URL', () => {
    const expected = createHash('sha256').update('http://localhost:8000').digest('hex').slice(0, 12);
    expect(deploymentIdFor('http://localhost:8000')).toBe(expected);
    expect(deploymentIdFor('http://localhost:8000')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignores case, trailing slashes and default ports', () => {
    const id = deploymentIdFor('http://localhost:8000');
    expect(deploymentIdFor('HTTP://LocalHost:8000/')).toBe(id);
    expect(deploymentIdFor('http://localhost:8000///')).toBe(id);
    expect(normalizeSwitchUrl('https://Switch.Example.com:443/')).toBe('https://switch.example.com');
    expect(normalizeSwitchUrl('http://x.test:80/base/')).toBe('http://x.test/base');
  });

  it('differs between deployments', () => {
    expect(deploymentIdFor('http://localhost:8000')).not.toBe(deploymentIdFor('http://localhost:8001'));
    expect(deploymentIdFor('https://a.example.com')).not.toBe(deploymentIdFor('https://b.example.com'));
  });
});

describe('node version gate', () => {
  it('requires 22.12.0', () => {
    expect(nodeVersionOk('22.12.0')).toBe(true);
    expect(nodeVersionOk('22.14.0')).toBe(true);
    expect(nodeVersionOk('23.0.0')).toBe(true);
    expect(nodeVersionOk('22.11.9')).toBe(false);
    expect(nodeVersionOk('20.18.0')).toBe(false);
  });
});

describe('offline worker choice', () => {
  const only = (...present: string[]) => (cmd: string) => present.includes(cmd);

  it('honors SAID_WORKER when its binary exists', () => {
    expect(chooseWorker('codex', only('codex', 'claude')).worker).toBe('codex');
    expect(chooseWorker('scripted', only()).scripted).toBe(true);
  });

  it('falls back to scripted (loudly flagged) when the requested CLI is missing', () => {
    const choice = chooseWorker('claude', only());
    expect(choice.worker).toBe('scripted');
    expect(choice.scripted).toBe(true);
    expect(choice.reason).toMatch(/not on PATH/);
  });

  it('prefers claude, then codex, then scripted when unset', () => {
    expect(chooseWorker(undefined, only('claude', 'codex')).worker).toBe('claude');
    expect(chooseWorker(undefined, only('codex')).worker).toBe('codex');
    expect(chooseWorker('', only()).worker).toBe('scripted');
  });

  it('rejects unknown workers', () => {
    expect(() => chooseWorker('gpt', only())).toThrow(/claude, codex or scripted/);
  });
});
