import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architectural boundary guard for @payswap/provider-runtime (the P1
 * boundary pattern, adapted): the package is a deterministic runtime
 * package with ZERO runtime dependencies. Provider SDKs, frameworks,
 * every sibling @payswap/* package (capability/surface in flight,
 * protocol/trust/economic accepted but unwired until TL integration) and
 * all @zcode/* platform packages can never cross into it. Every import
 * under src/ must be relative.
 *
 * Additional P2-W2 laws guarded here:
 * - every file (src AND test) is <= 400 lines (the file law);
 * - no pseudo-randomness (Math.random), no ambient host clock outside the
 *   declared clock.ts edge adapter, no timers standing in for providers;
 * - the NAME LAW: nothing in the package names or aliases the package
 *   "provider" (the inherited packages/provider is ZCode's AI-model
 *   provider selection — a different concept);
 * - the manifest law: devDependencies are exactly typescript + vitest;
 * - no secret-looking literals committed in source (long high-entropy
 *   strings marked FAKE are the only permitted test material).
 */

// CI note: vitest runs with cwd = the package directory (the accepted P1
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
const testFiles = listTypeScriptFiles(testDir);

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CJS require, but NOT a method call like registry.require('op') — the
  // lookbehind refuses a preceding dot or word char.
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

describe('architectural boundary: @payswap/provider-runtime', () => {
  it('scans a non-empty source and test tree', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(15);
    expect(testFiles.length).toBeGreaterThanOrEqual(10);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain('src/index.ts');
  });

  it('src contains ONLY relative imports (zero runtime deps, no siblings, no @zcode/*)', () => {
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

  it('test imports touch ONLY the package itself, its sources, node builtins and vitest', () => {
    const offenders: string[] = [];
    for (const file of testFiles) {
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
    for (const file of [...sourceFiles, ...testFiles]) {
      const lineCount = readFileSync(file, 'utf8').split('\n').length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)} (${lineCount} lines)`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('never uses pseudo-random sources (src only — this guard names the forbidden symbol)', () => {
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

  it('never schedules timers in src (this guard names the forbidden symbols)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('setTimeout') || source.includes('setInterval')) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the NAME LAW: no file names or aliases the package "provider" (ZCode collision)', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('@payswap/provider-runtime');
    // The package must never be aliased as bare "provider" in any import.
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...testFiles]) {
      for (const specifier of extractModuleSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier === 'provider' || specifier.startsWith('@zcode/provider')) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('the manifest law: zero runtime dependencies, devDependencies are exactly the toolchain', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(['typescript', 'vitest']);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe('module');
    expect(manifest.exports['.']).toBe('./src/index.ts');
  });

  it('no TS enum (plain-Node type-stripping compatibility for the import smoke battery)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...testFiles]) {
      const source = readFileSync(file, 'utf8');
      if (/\benum\s+[A-Z][A-Za-z0-9]*\s*\{/.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('secret-looking literals are test FAKEs only (a real secret is merge-blocking)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...testFiles]) {
      const source = readFileSync(file, 'utf8');
      // Heuristic (binding-never-security): long MIXED-CLASS literals that
      // look like credential material must carry the FAKE marker.
      // ALL_CAPS identifiers and pure vocabulary strings are not secrets.
      const tokenShape = /['"][A-Za-z0-9_\-]{24,}['"]/g;
      for (const match of source.matchAll(tokenShape)) {
        const literal = match[0];
        const looksSecret = /\d/.test(literal) && /[a-z]/.test(literal) && /[A-Z]/.test(literal);
        if (looksSecret && !literal.includes('FAKE') && !literal.includes('REDACTED')) {
          offenders.push(`${relative(packageRoot, file)}: ${literal.slice(0, 20)}…`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });
});
