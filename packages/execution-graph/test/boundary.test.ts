import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architectural boundary guard (P3-W2; ADAPT of the accepted
 * packages/capability boundary pattern + the old repository's
 * packages/execution/test/boundary.test.ts, W3-003):
 * `@payswap/execution-graph` is a deterministic domain package with ZERO
 * runtime dependencies. Frameworks, provider SDKs, drivers, every other
 * PaySwap package except the THREE accepted TYPE-ONLY sibling pins and all
 * platform packages can never cross into it.
 *
 * The accepted sibling pins (layer law, work order hard constraint 4):
 * @payswap/economic, @payswap/protocol, @payswap/capability — every one of
 * them TYPE-ONLY (erased at runtime, resolved via tsconfig paths; the
 * accepted P1/P2 integration pattern).
 *
 * It also guards determinism at the source level: no pseudo-randomness, no
 * ambient host clock, no timers, no filesystem/network access, no node:
 * imports in src/. File law: every file <= 400 lines, no TS enum, no TS
 * namespace. devDependencies are exactly the toolchain.
 */

// CI note: vitest runs with cwd = the package directory; process.cwd()
// keeps the ambient shim minimal and the package-local battery hermetic.
const packageRoot = process.cwd();
const srcDir = join(packageRoot, 'src');

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

/** All import statements targeting a module (for type-only enforcement). */
function extractImportStatements(source: string): readonly string[] {
  const statements: string[] = [];
  const statementPattern = /import\s+[\s\S]*?from\s+['"][^'"]+['"]/g;
  for (const match of source.matchAll(statementPattern)) {
    statements.push(match[0]);
  }
  return statements;
}

const ACCEPTED_SIBLINGS: readonly string[] = [
  '@payswap/economic',
  '@payswap/protocol',
  '@payswap/capability',
];

describe('architectural boundary: @payswap/execution-graph', () => {
  it('scans a non-empty source tree', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(20);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain('src/index.ts');
  });

  it('contains ONLY relative imports plus the THREE accepted sibling pins — each TYPE-ONLY (erased at runtime)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          if (!ACCEPTED_SIBLINGS.includes(specifier)) {
            offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
          }
        }
      }
      // Every accepted sibling import must be an `import type` statement.
      const statements = extractImportStatements(source);
      for (const statement of statements) {
        const match = /['"](@payswap\/[a-z-]+)['"]\s*$/.exec(statement);
        if (match !== null && ACCEPTED_SIBLINGS.includes(match[1] ?? '')) {
          if (!/^import\s+type[\s{]/.test(statement)) {
            offenders.push(
              `${relative(packageRoot, file)} -> '${match[1]}' must use \`import type\` (zero runtime coupling)`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is deterministic at the source level: no randomness, no ambient clock, no timers, no fs/network, no node: imports', () => {
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
      { pattern: /\bnode:fs\b/, label: 'node:fs import in src' },
      { pattern: /\bnode:path\b/, label: 'node:path import in src' },
      { pattern: /\bnode:process\b/, label: 'node:process import in src' },
      { pattern: /from\s+['"]node:/, label: 'node: import in src' },
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

  it('enforces the <= 400-line file law on every source file', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const lines = readFileSync(file, 'utf8').split('\n').length;
      if (lines > 400) {
        offenders.push(`${relative(packageRoot, file)}: ${lines} lines`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no TS enum and no TS namespace (plain-Node type-stripping compatibility)', () => {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(['typescript', 'vitest']);
  });

  it('never authorizes: no obligation/clearing/settlement calls anywhere in src (the identity law)', () => {
    // The package projects and reconciles; the financial protocol lane owns
    // obligations, clearing and settlement. No src file may even NAME those
    // surfaces as imports or calls (type-only pins of wire SHAPES are fine;
    // calls are not).
    const offenders: string[] = [];
    const FORBIDDEN = [
      /\bderiveObligations\b/,
      /\bclearObligations?\b/,
      /\bsettleObligation\b/,
      /\bmintObligation\b/,
      /\bderiveSettlementInstruction\b/,
      /\bpostSettlement\b/,
      /\bdeclareFinality\b/,
    ];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          offenders.push(`${relative(packageRoot, file)}: ${pattern.source}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
