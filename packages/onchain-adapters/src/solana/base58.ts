/**
 * @payswap/onchain-adapters — base58 + base64 codecs (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/solana/index.ts base58 half).
 *
 * Pure BigInt arithmetic — zero dependencies, zero ambient host APIs (the
 * old repo leaned on a Node global for one base64 encoding; the 3.0 law
 * keeps src free of host globals, so the codec is implemented here in
 * full).
 */

import { ValidationError } from '../errors.ts';

// PUBLIC: the Bitcoin/Solana base58 encoding alphabet (a public constant, never a secret).
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes a base58 string into bytes (pure BigInt arithmetic). */
export function base58Decode(value: string): Uint8Array {
  if (value.length === 0) {
    throw new ValidationError('base58 input must be non-empty');
  }
  const index = new Map<string, number>([...BASE58_ALPHABET].map((char, i) => [char, i]));
  let numeric = 0n;
  for (const char of value) {
    const digit = index.get(char);
    if (digit === undefined) {
      throw new ValidationError(`'${char}' is not a base58 character`);
    }
    numeric = numeric * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (numeric > 0n) {
    bytes.unshift(Number(numeric % 256n));
    numeric /= 256n;
  }
  let leading = 0;
  while (leading < value.length && value[leading] === '1') {
    bytes.unshift(0);
    leading += 1;
  }
  return new Uint8Array(bytes);
}

/** Encodes bytes as base58 (pure BigInt arithmetic). */
export function base58Encode(bytes: Uint8Array): string {
  let numeric = 0n;
  for (const byte of bytes) {
    numeric = numeric * 256n + BigInt(byte);
  }
  let encoded = '';
  while (numeric > 0n) {
    encoded = BASE58_ALPHABET[Number(numeric % 58n)] + encoded;
    numeric /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) {
    encoded = '1' + encoded;
    leading += 1;
  }
  return encoded;
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodes bytes as base64 (pure — no ambient host APIs). */
export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : undefined;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : undefined;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}
