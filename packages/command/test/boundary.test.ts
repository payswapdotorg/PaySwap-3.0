import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architectural boundary guard for @payswap/command (the P7-W3 laws,
 * machine-checked):
 *
 * 1. ZERO sibling imports: no @payswap/* anywhere; tsconfig.json has NO
 *    paths entries (the v1 platform pattern — structural mirrors are
 *    pinned locally; the TL wires real imports at integration).
 * 2. Every src module specifier is RELATIVE (src has no node: imports and
 *    no toolchain imports at all — deterministic, hermetic contracts).
 * 3. Every test module specifier is relative or one of the exact toolchain
 *    specifiers {vitest, node:fs, node:path, node:crypto} (the battery
 *    runner + the ambient-declared builtins the scanner/fixtures use).
 * 4. Determinism at the source level: no randomness, no ambient clock, no
 *    timers, no network, no node:/process.env reads anywhere in src/.
 * 5. The <= 400-line file law on every src AND test file.
 * 6. No TS enum, no TS namespace (plain-Node type-stripping compatibility).
 * 7. devDependencies are exactly the toolchain (typescript + vitest), no
 *    runtime dependencies.
 */

// CI note: vitest runs with cwd = the package directory; process.cwd()
// keeps the ambient shim minimal and the package-local battery hermetic.
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
const allTestFiles = listTypeScriptFiles(testDir);
const testFiles = allTestFiles.filter(
  (file) => !file.endsWith('node.d.ts') && !file.endsWith('type-utils.ts') && !file.endsWith('fixtures.ts'),
);

/** The exact toolchain specifiers permitted in test files (nothing else). */
const TEST_TOOLCHAIN_SPECIFIERS: ReadonlySet<string> = new Set([
  'vitest',
  'node:fs',
  'node:path',
  'node:crypto',
]);

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
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

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

describe('architectural boundary: @payswap/command', () => {
  it('scans a non-empty source tree and a non-empty test tree', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(15);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain('src/index.ts');
    expect(testFiles.length).toBeGreaterThanOrEqual(15);
    expect(testFiles.map((file) => relative(packageRoot, file))).toContain('test/boundary.test.ts');
  });

  it('src/** contains ONLY relative imports (no node:, no toolchain, no siblings)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!isRelative(specifier)) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('test/** contains only relative imports plus the exact toolchain {vitest, node:fs, node:path, node:crypto} — no @payswap/* import anywhere', () => {
    const offenders: string[] = [];
    for (const file of testFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        if (isRelative(specifier)) {
          continue;
        }
        if (!TEST_TOOLCHAIN_SPECIFIERS.has(specifier)) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      // The import law covers module specifiers (docblock provenance
      // citations of the old repository's packages are house style; the
      // PACKAGE_NAME self-reference is the package's own identity).
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith('@payswap/')) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tsconfig.json has NO paths entries (zero sibling resolution)', () => {
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: Record<string, unknown>;
    };
    expect(tsconfig.compilerOptions?.['paths']).toBeUndefined();
  });

  it('is deterministic at the source level: no randomness, no ambient clock, no timers, no fs/network', () => {
    const offenders: string[] = [];
    const FORBIDDEN_PATTERNS: readonly { readonly pattern: RegExp; readonly label: string }[] = [
      { pattern: /\bMath\.random\b/, label: 'Math.random' },
      { pattern: /\bcrypto\.randomUUID\b/, label: 'crypto.randomUUID' },
      { pattern: /\bnew\s+Date\b/, label: 'new Date (ambient clock)' },
      { pattern: /\bDate\.now\b/, label: 'Date.now (ambient clock)' },
      { pattern: /\bperformance\.now\b/, label: 'performance.now' },
      { pattern: /\bsetTimeout\b/, label: 'setTimeout' },
      { pattern: /\bsetInterval\b/, label: 'setInterval' },
      { pattern: /\bfetch\s*\(/, label: 'fetch (network)' },
      { pattern: /\bnode:/, label: 'node: import in src' },
      { pattern: /\bprocess\.env\b/, label: 'process.env' },
    ];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_PATTERNS) {
        if (forbidden.pattern.test(source)) {
          offenders.push(`${relative(packageRoot, file)}: ${forbidden.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('enforces the <= 400-line file law on every src AND test file', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const lines = readFileSync(file, 'utf8').split('\n').length;
      if (lines > 400) {
        offenders.push(`${relative(packageRoot, file)}: ${lines} lines`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no TS enum and no TS namespace in src (plain-Node type-stripping compatibility)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/\benum\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: TS enum`);
      }
      if (/\bnamespace\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: TS namespace`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('devDependencies are exactly the toolchain (typescript + vitest), no runtime dependencies', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.name).toBe('@payswap/command');
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(['typescript', 'vitest']);
  });

  it('THE NO-FINANCIAL-AUTHORITY VOCABULARY LAW: the method effect classes and extension permissions contain no authority member', () => {
    const indexSource = readFileSync(join(srcDir, 'method-registry.ts'), 'utf8');
    const permissionSource = readFileSync(join(srcDir, 'permission.ts'), 'utf8');
    expect(indexSource).toContain("export const METHOD_EFFECT_CLASSES = ['NO_EFFECT', 'OBSERVATION', 'PROPOSAL'] as const;");
    expect(permissionSource).toContain("'SURFACE_RENDER'");
    expect(permissionSource).toContain("'OBSERVATION_READ'");
    expect(permissionSource).toContain("'COMMAND_PROPOSE'");
    expect(permissionSource).toContain("'NOTIFICATION_RECEIVE'");
    // The vocabulary denies every authority verb: no execute/sign/settle/
    // withdraw/capture/authorize member can be expressed.
    const AUTHORITY_VERBS = /\b(EXECUTE|SIGN|SETTLE|WITHDRAW|CAPTURE|AUTHORIZE|REFUND|CANCEL|TRANSFER)\b/;
    for (const source of [indexSource, permissionSource]) {
      const declaredMembers = source.match(/'([A-Z_]+)'/g) ?? [];
      for (const member of declaredMembers) {
        expect(
          AUTHORITY_VERBS.test(member),
          `vocabulary member ${member} carries an authority verb — the command surface cannot express financial authority`,
        ).toBe(false);
      }
    }
  });
});
