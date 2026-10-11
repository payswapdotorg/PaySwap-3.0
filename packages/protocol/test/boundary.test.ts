import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architectural boundary guard (adapted from the old repository's
 * packages/protocol/test/boundary.test.ts):
 * `@payswap/protocol` is the Financial Protocol Authority — a deterministic
 * domain package with ZERO runtime dependencies. Provider SDKs, frameworks,
 * drivers, every other PaySwap package (economic/trust in flight) and all
 * @zcode/* platform packages can never cross into it. Every import under
 * src/ must be relative.
 *
 * It also guards determinism at the source level: no pseudo-randomness, no
 * ambient host clock outside the declared edge adapter (clock.ts), no
 * timers standing in for settlement.
 *
 * P1-W2 additions: every file must be <= 400 lines, and no TS `enum`
 * (plain-Node type-stripping compatibility for the import smoke battery).
 */

// CI note (P1-W2 integration): vitest runs with cwd = the package directory
// (the accepted trust/economic boundary pattern); process.cwd() avoids
// import.meta.url + node:url, keeping the ambient shim minimal and the
// package-local battery hermetic on CI runners without @types/node.
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

describe('architectural boundary: @payswap/protocol', () => {
  it('scans a non-empty source tree', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(20);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain('src/index.ts');
  });

  it('contains ONLY relative imports plus the ONE accepted post-integration sibling: a TYPE-ONLY import of @payswap/trust (the AmountSpec wire authority; TL integration swap, financial -> trust layer law)', () => {
    const ACCEPTED_SIBLING = '@payswap/trust';
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          if (specifier !== ACCEPTED_SIBLING) {
            offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
          } else {
            // the accepted sibling import must be TYPE-ONLY (erased at runtime — zero runtime coupling)
            const importRe = new RegExp(
              `import\\s+type\\s+\\{[^}]*\\}\\s+from\\s+['\"]${ACCEPTED_SIBLING.replace('/', '\\/')}['\"]`,
            );
            if (!importRe.test(source)) {
              offenders.push(
                `${relative(packageRoot, file)} -> '${specifier}' (NOT type-only — runtime coupling forbidden)`,
              );
            }
          }
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('never uses pseudo-random sources (Math.random is forbidden everywhere)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (readFileSync(file, 'utf8').includes('Math.random')) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('reads the host wall clock ONLY inside the clock.ts edge adapter', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const relativePath = relative(srcDir, file);
      if (relativePath === 'clock.ts') {
        continue; // declared edge adapter
      }
      if (readFileSync(file, 'utf8').includes('Date.now')) {
        offenders.push(relativePath);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('never schedules timers (no setTimeout standing in for settlement)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (readFileSync(file, 'utf8').includes('setTimeout')) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('every source file is <= 400 lines (file law)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const lineCount = readFileSync(file, 'utf8').split('\n').length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)}: ${lineCount} lines`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('uses no TypeScript enums (plain-Node type-stripping compatibility)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/\benum\s+[A-Z]/.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the package manifest declares zero runtime dependencies (the trust wire-type link is type-only, resolved via tsconfig paths — not a package dependency)', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(['typescript', 'vitest']);
  });
});
