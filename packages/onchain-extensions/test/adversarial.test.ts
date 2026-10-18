import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as onchainExtensions from '../src/index.ts';

/**
 * ADVERSARIAL GUARDS for the extension packs (PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-venues/test/adversarial.test.ts):
 *
 * 1. CORE-BARREL PACK NEUTRALITY: the pack-neutral files (the vocabulary,
 *    wire shapes, validators and registry) contain ZERO concrete pack
 *    vocabulary — venue-specific shapes live ONLY in the pack files
 *    (mirroring the old venue-neutrality scan).
 * 2. DEPENDENCY DIRECTION: packs import the core; the core never imports a
 *    pack. No vendor SDK is imported anywhere.
 * 3. SECRET-FIELD GUARD (rule 25): no key/seed/mnemonic/secret/password
 *    fields anywhere in src.
 * 4. NO LIVE ENDPOINTS: declarative packs never embed network endpoints
 *    (packs are offline descriptors; integration arrives with the
 *    adapters).
 */

const SRC_ROOT = join(process.cwd(), 'src');
const PACK_DIRECTORY = 'packs';
const PACK_VOCABULARY = [
  /uniswap/i,
  /zeroswap/i,
  /solverbatch/i,
  /lockport/i,
  /coinramp/i,
  /tidalpools/i,
  /meridian/i,
];

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

const ALL_SRC_FILES = listSourceFiles(SRC_ROOT);
const NEUTRAL_FILES = ALL_SRC_FILES.filter(
  (file) => !(file.split(/[\\/]/).slice(-2)[0] ?? '').startsWith(PACK_DIRECTORY),
);
const PACK_FILES = ALL_SRC_FILES.filter((file) =>
  file.includes(join('src', PACK_DIRECTORY)),
);

describe('CORE-BARREL PACK NEUTRALITY (pack shapes live only in pack files)', () => {
  it('the neutral files (vocabulary, wire, validation, registry) contain no pack vocabulary', () => {
    expect(NEUTRAL_FILES.length).toBeGreaterThanOrEqual(15);
    const violations: string[] = [];
    for (const file of NEUTRAL_FILES) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of PACK_VOCABULARY) {
        if (pattern.test(source)) {
          violations.push(`${file}: leaks '${pattern.source}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the pack directory exists and carries the concrete pack shapes', () => {
    expect(PACK_FILES.length).toBeGreaterThanOrEqual(7);
  });
});

describe('DEPENDENCY DIRECTION (pack -> core, never core -> pack)', () => {
  it('all src imports are relative modules (the zero-sibling law)', () => {
    const violations: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      const importPattern = /from\s+["']([^"']+)["']/g;
      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(source)) !== null) {
        const specifier = match[1] as string;
        if (specifier.startsWith('.')) {
          continue;
        }
        violations.push(`${file}: imports non-relative module '${specifier}'`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no third-party vendor SDK is imported anywhere (no ethers/viem/web3/…)', () => {
    const violations: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      if (
        /from\s+["'](ethers|viem|web3|@ethersproject\/[^"']+|@solana\/web3\.js|bitcoinjs-lib|@scure\/[^"']+|@noble\/[^"']+)["']/.test(
          source,
        )
      ) {
        violations.push(`${file}: imports a vendor SDK`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the neutral barrel never imports a pack file (subpath isolation)', () => {
    for (const file of NEUTRAL_FILES) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+["']\.\.?\/(packs)\//);
    }
  });
});

describe('SECRET-FIELD GUARD (rule 25)', () => {
  it('src/** declares no key/seed/mnemonic/secret/password-shaped property', () => {
    const violations: string[] = [];
    const propertyDeclaration =
      /^\s*(?:export\s+)?(?:readonly\s+)?(?:declare\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(\?)?\s*:/;
    const forbiddenFieldName =
      /^(privatekey|priv_?key|seed_?phrase|seedwords|mnemonic|secret|secret_?key|password|passphrase|api_?key|access_?token|refreshtoken|session_?secret|client_?secret|keystore_?json|encrypted_?key)$/i;
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        const match = propertyDeclaration.exec(line);
        if (match !== null) {
          const fieldName = match[1] as string;
          if (forbiddenFieldName.test(fieldName)) {
            violations.push(`${file}: ${line.trim()}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no raw secret vocabulary appears anywhere in src', () => {
    const violations: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of [
        'privateKey',
        'private_key',
        'seedPhrase',
        'seed_phrase',
        'mnemonic',
        'password',
      ]) {
        if (source.includes(forbidden)) {
          violations.push(`${file} contains '${forbidden}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no git-style push token or credential-shaped string appears in src', () => {
    const violations: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      if (/ghp_[A-Za-z0-9]{20,}/.test(source)) {
        violations.push(`${file}: contains a push-token-shaped string`);
      }
      if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(source)) {
        violations.push(`${file}: contains a bearer-token-shaped string`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('NO LIVE ENDPOINTS (offline declarative packs)', () => {
  it('src/** embeds no network endpoint URLs', () => {
    const violations: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const source = readFileSync(file, 'utf8');
      if (/https?:\/\/(?!github\.com|ethereum\.org)[^\s"']+/i.test(source)) {
        violations.push(`${file}: embeds a network endpoint`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the package exports the neutral contract surface only', () => {
    const exportedNames = Object.keys(onchainExtensions).sort();
    expect(exportedNames).toContain('PACKAGE_NAME');
    expect(exportedNames).toContain('validateOnchainExtensionPack');
    expect(exportedNames).toContain('OnchainExtensionPackRegistry');
    // No pack-specific export leaks into the neutral barrel.
    for (const name of exportedNames) {
      expect(PACK_VOCABULARY.some((pattern) => pattern.test(name))).toBe(false);
    }
  });
});
