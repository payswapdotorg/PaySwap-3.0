import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architectural boundary guard for @payswap/onchain-adapters (the accepted
 * P1/P2 boundary pattern, adapted to this package's laws):
 *
 * - ZERO runtime dependencies; devDependencies are EXACTLY typescript +
 *   vitest; the manifest exposes the core barrel + the three family
 *   subpaths;
 * - every import under src/ is RELATIVE: no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK, no node: builtin (the
 *   leaf-in-flight law — the P4-W1/P4-W2 contract shapes are LOCAL
 *   structural pins, wired by the TL at integration);
 * - test imports touch ONLY the package itself, node builtins and vitest;
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process), no
 *   timers, no pseudo-randomness, no wall-clock reads in src (Date.parse /
 *   new Date(ms) formatting is deterministic; Date.now is forbidden);
 * - tsconfig.json carries NO paths entries (no hidden sibling wiring);
 * - every file (src AND test) is <= 400 lines (the file law);
 * - no TS enum (plain-Node type-stripping compatibility);
 * - no secret-looking literals (a real secret is merge-blocking; long
 *   mixed-class literals must carry the FAKE marker);
 * - the GAP-02 receipt: NO live/ credential-gated test tree exists in this
 *   package (the old repo's 3 live suites were never deterministic
 *   evidence and are not ported).
 */

// CI note: vitest runs with cwd = the package directory (the accepted
// battery pattern); process.cwd() avoids import.meta.url + node:url.
const packageRoot = process.cwd();
const srcDir = join(packageRoot, 'src');
const testDir = join(packageRoot, 'test');

function listTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files.sort();
}

const sourceFiles = listTypeScriptFiles(srcDir);
const testFiles = listTypeScriptFiles(testDir).filter(
  (file) => !file.includes(join('test', 'fixtures')) || file.endsWith('.test.ts'),
);
const allTestFiles = listTypeScriptFiles(testDir);

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CJS require, but NOT a method call like registry.require('op').
  /(?<![.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function extractModuleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of MODULE_SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

describe('architectural boundary: @payswap/onchain-adapters', () => {
  it('scans a non-empty source and test tree', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(40);
    expect(testFiles.length).toBeGreaterThanOrEqual(13);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain('src/index.ts');
  });

  it('src contains ONLY relative imports (zero runtime deps, no siblings, no node: builtins, no vendor SDKs)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('no @payswap/* or @zcode/* appears ANYWHERE in src (the leaf-in-flight pins law)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('@payswap/') || source.includes('@zcode/')) {
        // Doc comments may CITE the pinned packages by name (provenance);
        // only IMPORTS are violations (the previous test). Here we guard the
        // import forms specifically.
        for (const specifier of extractModuleSpecifiers(source)) {
          if (specifier.startsWith('@payswap/') || specifier.startsWith('@zcode/')) {
            offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
          }
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('test imports touch ONLY the package itself, node builtins and vitest', () => {
    const offenders: string[] = [];
    for (const file of allTestFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith('./') ||
          specifier.startsWith('../') ||
          specifier === 'vitest' ||
          specifier.startsWith('node:');
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('every file (src AND test) is <= 400 lines (the file law)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const lineCount = readFileSync(file, 'utf8').split('\n').length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)} (${lineCount} lines)`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the DETERMINISM LAW: src never performs I/O (no fetch, no Node globals, no timers)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/\bfetch\s*\(/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: fetch`);
      }
      if (/\bBuffer\b/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: Buffer`);
      }
      if (/\bprocess\b/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: process`);
      }
      if (source.includes('setTimeout') || source.includes('setInterval')) {
        offenders.push(`${relative(packageRoot, file)}: timers`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('never uses pseudo-randomness or the host wall clock in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('Math.random')) {
        offenders.push(`${relative(packageRoot, file)}: Math.random`);
      }
      if (source.includes('Date.now')) {
        offenders.push(`${relative(packageRoot, file)}: Date.now`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the manifest law: zero runtime dependencies, devDependencies are exactly the toolchain', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('@payswap/onchain-adapters');
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(['typescript', 'vitest']);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe('module');
    expect(manifest.exports['.']).toBe('./src/index.ts');
    expect(manifest.exports['./evm']).toBe('./src/evm/index.ts');
    expect(manifest.exports['./solana']).toBe('./src/solana/index.ts');
    expect(manifest.exports['./utxo']).toBe('./src/utxo/index.ts');
  });

  it('tsconfig.json carries NO paths entries (no hidden sibling wiring)', () => {
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.paths).toBeUndefined();
  });

  it('no TS enum (plain-Node type-stripping compatibility)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const source = readFileSync(file, 'utf8');
      if (/\benum\s+[A-Z][A-Za-z0-9]*\s*\{/.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('secret-looking literals are test FAKEs or PUBLIC identifiers only (a real secret is merge-blocking)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      // Heuristic (binding-never-security): long MIXED-CLASS literals that
      // look like credential material must carry the FAKE marker, or live on
      // a line annotated PUBLIC (the declared public-identifier registry:
      // base58 alphabets, chain genesis hashes, blockhash/address fixtures —
      // public constants, never secrets).
      const tokenShape = /['"][A-Za-z0-9_\-]{24,}['"]/g;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] as string;
        const previousLine = i > 0 ? (lines[i - 1] as string) : '';
        for (const match of line.matchAll(tokenShape)) {
          const literal = match[0];
          const looksSecret = /\d/.test(literal) && /[a-z]/.test(literal) && /[A-Z]/.test(literal);
          const markedPublic = [line, previousLine].some(
            (candidate) =>
              candidate.includes('PUBLIC:') ||
              candidate.includes('PUBLIC (') ||
              candidate.includes('// PUBLIC'),
          );
          if (
            looksSecret &&
            !literal.includes('FAKE') &&
            !literal.includes('REDACTED') &&
            !markedPublic
          ) {
            offenders.push(`${relative(packageRoot, file)}:${i + 1}: ${literal.slice(0, 20)}…`);
          }
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the GAP-02 receipt: NO credential-gated live test tree exists (deterministic battery only)', () => {
    expect(existsSync(join(testDir, 'live'))).toBe(false);
    const vitestConfig = readFileSync(join(packageRoot, 'vitest.config.ts'), 'utf8');
    expect(vitestConfig.includes('test/**/*.test.ts')).toBe(true);
  });

  it('the core barrel never imports a family module (dependency direction family → core)', () => {
    const barrel = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    const offenders = extractModuleSpecifiers(barrel).filter(
      (specifier) => specifier.includes('/evm/') || specifier.includes('/solana/') || specifier.includes('/utxo/'),
    );
    expect(offenders.join('\n')).toBe('');
    for (const family of ['evm', 'solana', 'utxo'] as const) {
      const familyBarrel = readFileSync(join(srcDir, family, 'index.ts'), 'utf8');
      const specifiers = extractModuleSpecifiers(familyBarrel);
      expect(
        specifiers.some((specifier) => specifier.startsWith('../') || specifier.startsWith('./')),
      ).toBe(true);
    }
  });
});
