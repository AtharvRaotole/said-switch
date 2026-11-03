import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, bytesToHex, canonicalJson, hexToBytes } from '../src/index';

describe('canonicalJson', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2, c: 3 })).toBe(canonicalJson({ c: 3, a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested objects and keeps no whitespace', () => {
    expect(canonicalJson({ z: { y: 1, x: [{ b: true, a: null }] }, a: 'é "q"' })).toBe(
      '{"a":"é \\"q\\"","z":{"x":[{"a":null,"b":true}],"y":1}}',
    );
  });

  it('preserves array order and maps undefined array items to null', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([1, undefined, 'x'])).toBe('[1,null,"x"]');
  });

  it('drops undefined object members', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rejects NaN and infinities', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson([Number.POSITIVE_INFINITY])).toThrow(/non-finite/);
    expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('rejects unsupported types', () => {
    expect(() => canonicalJson({ a: 1n })).toThrow(/bigint/);
    expect(() => canonicalJson(undefined)).toThrow();
  });
});

describe('encoding', () => {
  it('round-trips base64 including padding cases', () => {
    for (const len of [0, 1, 2, 3, 4, 31, 32, 64]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
    expect(bytesToBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=');
    expect(new TextDecoder().decode(base64ToBytes('aGVsbG8='))).toBe('hello');
  });

  it('rejects invalid base64', () => {
    expect(() => base64ToBytes('a$bc')).toThrow();
    expect(() => base64ToBytes('abcde')).toThrow();
  });

  it('round-trips hex and emits lowercase', () => {
    const bytes = Uint8Array.from([0, 1, 0xab, 0xff, 0x10]);
    expect(bytesToHex(bytes)).toBe('0001abff10');
    expect(hexToBytes('0001ABff10')).toEqual(bytes);
    expect(() => hexToBytes('abc')).toThrow();
    expect(() => hexToBytes('zz')).toThrow();
  });
});
