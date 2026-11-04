import { randomInt } from 'node:crypto';

/** Uppercase letters and digits without look-alikes (no O/0, I/1, L). 31 symbols. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Eight characters from 31 symbols. Short enough to paste, too large to guess in a chat. */
export const CODE_LENGTH = 8;

export function generateCode(length = CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** `count` distinct codes. */
export function generateCodes(count: number, length = CODE_LENGTH): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateCode(length));
  return [...codes];
}
