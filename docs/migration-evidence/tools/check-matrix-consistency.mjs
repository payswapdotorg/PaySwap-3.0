#!/usr/bin/env node
/**
 * P0-W3 matrix consistency checker — INVENTORY TOOLING, not product code.
 *
 * Validates spec/migration/migration-matrix.json against the migration laws:
 *   1. Schema/enum/required-field discipline for every preserve-list item and package.
 *   2. Preserve-list coverage: every item named in spec/MIGRATION-FROM-PAYSWAP-ORG.md
 *      has exactly one matrix row (parsed from the file, not hardcoded).
 *   3. REUSE/ADAPT hard rule: exact old-repo file(s) must be named and — when the
 *      old-repo clone path is provided — must exist on disk.
 *   4. Package coverage: 36 unique packages; when the old-repo path is provided,
 *      package names must match the old repo's packages/ directories exactly.
 *   5. Summary counts must match the actual classifications.
 *   6. Markdown cross-consistency: every JSON row appears in the matching .md table
 *      with the same classification.
 *   7. File-size law: every markdown file under spec/migration/ and
 *      docs/migration-evidence/ is <= 400 lines.
 *
 * Usage: node docs/migration-evidence/tools/check-matrix-consistency.mjs \
 *          [canonical-repo-root] [old-repo-root]
 * Exit 0 + "MATRIX_CONSISTENCY_OK" on pass; exit 1 with the violation list on fail.
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(process.argv[2] ?? join(here, "..", "..", ".."));
const oldRepoRoot = process.argv[3] ? resolve(process.argv[3]) : null;

const violations = [];
const checks = [];
function check(name, ok, detail) {
  checks.push([name, ok, detail]);
  if (!ok) violations.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const CLASSES = ["REUSE", "ADAPT", "PORT", "REWRITE", "RETIRE"];
const MATRIX_JSON = join(repoRoot, "spec/migration/migration-matrix.json");
const ITEMS_MD = join(repoRoot, "spec/migration/MIGRATION-MATRIX.md");
const PACKAGES_MD = join(repoRoot, "spec/migration/MIGRATION-MATRIX-PACKAGES.md");
const PRESERVE_MD = join(repoRoot, "spec/MIGRATION-FROM-PAYSWAP-ORG.md");
const EVIDENCE_DIR = join(repoRoot, "docs/migration-evidence");

// ---------- load ----------
let matrix = null;
try {
  matrix = JSON.parse(readFileSync(MATRIX_JSON, "utf8"));
  check("matrix-json-parses", true);
} catch (e) {
  console.error(`FATAL: cannot parse ${MATRIX_JSON}: ${e.message}`);
  process.exit(1);
}
for (const p of [ITEMS_MD, PACKAGES_MD, PRESERVE_MD, EVIDENCE_DIR]) {
  check(`required-path-exists(${p.slice(repoRoot.length + 1)})`, existsSync(p));
}
const items = Array.isArray(matrix.preserve_list_items) ? matrix.preserve_list_items : [];
const packages = Array.isArray(matrix.old_repo_packages) ? matrix.old_repo_packages : [];

// ---------- 1. row discipline ----------
function rowOk(row, kind) {
  const id = row.id ?? "(no id)";
  const c = row.classification;
  check(`${kind}-${id}-classification-enum`, CLASSES.includes(c), `got '${c}'`);
  check(`${kind}-${id}-authority-owner`, typeof row.authority_owner === "string" && row.authority_owner.trim().length > 0);
  check(`${kind}-${id}-zcode-equivalent`, typeof row.zcode_equivalent === "string" && row.zcode_equivalent.trim().length > 0);
  check(`${kind}-${id}-rationale`, typeof row.rationale === "string" && row.rationale.trim().length >= 20);
  check(`${kind}-${id}-id-format`, /^(MMI|MMP)-\d{2}$/.test(id), `got '${id}'`);
}
items.forEach((r) => rowOk(r, "item"));
packages.forEach((r) => rowOk(r, "package"));
items.forEach((r) => check(`item-${r.id}-evidence-list`, Array.isArray(r.old_evidence) && r.old_evidence.length > 0));
packages.forEach((r) => check(`package-${r.id}-purpose`, typeof r.purpose === "string" && r.purpose.trim().length > 0));

const itemIds = items.map((r) => r.id);
const pkgIds = packages.map((r) => r.id);
check("item-ids-unique", new Set(itemIds).size === itemIds.length);
check("package-ids-unique", new Set(pkgIds).size === pkgIds.length);

// ---------- 2. preserve-list coverage (parsed from the authority file) ----------
const preserveTokens = [];
try {
  const md = readFileSync(PRESERVE_MD, "utf8");
  const line = md.split("\n").find((l) => l.startsWith("Preserve after source/test review:"));
  if (!line) {
    check("preserve-list-parse", false, "no 'Preserve after source/test review:' line found");
  } else {
    const body = line.slice("Preserve after source/test review:".length).replace(/\.$/, "").trim();
    for (const tok of body.split(";")) {
      const t = tok.trim();
      if (t) preserveTokens.push(t);
    }
    check("preserve-list-count-21", preserveTokens.length === 21, `parsed ${preserveTokens.length}`);
  }
} catch (e) {
  check("preserve-list-parse", false, e.message);
}
const matrixItemNames = items.map((r) => r.preserve_list_name);
for (const tok of preserveTokens) {
  check(`preserve-item-covered('${tok}')`, matrixItemNames.includes(tok));
}
check("no-extra-matrix-items", matrixItemNames.length === preserveTokens.length, `matrix has ${matrixItemNames.length} vs preserve list ${preserveTokens.length}`);
check("items-count-21", items.length === 21, `got ${items.length}`);

// ---------- 3. REUSE/ADAPT exact-file rule ----------
const PATH_RE = /[\w\-./]+\.(?:ts|tsx|css|md)/g;
function evidencePaths(row) {
  const blobs = [...(row.old_evidence ?? []), row.rationale ?? "", row.old_tests ?? ""].join("\n");
  const out = [];
  for (const m of blobs.matchAll(PATH_RE)) out.push(m[0]);
  return out;
}
function resolveOldPath(pkg, token) {
  if (token.startsWith("packages/") || token.startsWith("spec/") || token.startsWith("docs/")) return join(oldRepoRoot, token);
  return join(oldRepoRoot, "packages", pkg, token);
}
for (const row of [...items, ...packages]) {
  if (row.classification === "REUSE" || row.classification === "ADAPT") {
    const paths = evidencePaths(row);
    check(`${row.id}-${row.classification}-names-exact-old-files`, paths.length > 0, "no old-repo file path found in evidence/rationale");
    if (oldRepoRoot) {
      for (const p of paths) {
        const abs = resolveOldPath(row.package ?? "", p);
        check(`${row.id}-old-file-exists(${p})`, existsSync(abs));
      }
    }
  }
}

// ---------- 4. package coverage vs old repo ----------
if (oldRepoRoot) {
  const dirs = readdirSync(join(oldRepoRoot, "packages"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const matrixPkgs = packages.map((r) => r.package).sort();
  check("package-set-matches-old-repo", JSON.stringify(dirs) === JSON.stringify(matrixPkgs), `old repo: ${dirs.length}, matrix: ${matrixPkgs.length}`);
  check("old-repo-package-count-36", dirs.length === 36, `got ${dirs.length}`);
}
check("packages-count-36", packages.length === 36, `got ${packages.length}`);

// ---------- 5. summary counts ----------
const s = matrix.summary ?? {};
function tally(rows) {
  const t = { REUSE: 0, ADAPT: 0, PORT: 0, REWRITE: 0, RETIRE: 0 };
  for (const r of rows) if (t[r.classification] !== undefined) t[r.classification] += 1;
  return t;
}
const itemTally = tally(items);
const pkgTally = tally(packages);
check("summary-items-tally", JSON.stringify(s.items) === JSON.stringify(itemTally), `summary ${JSON.stringify(s.items)} vs actual ${JSON.stringify(itemTally)}`);
check("summary-packages-tally", JSON.stringify(s.packages) === JSON.stringify(pkgTally), `summary ${JSON.stringify(s.packages)} vs actual ${JSON.stringify(pkgTally)}`);
check("summary-items-total", s.preserve_list_items_total === items.length);
check("summary-packages-total", s.old_repo_packages_total === packages.length);
check("summary-unmapped-zero", s.unmapped === 0);

// ---------- 6. markdown cross-consistency ----------
function parseTable(mdPath, wantKind) {
  const out = new Map();
  if (!existsSync(mdPath)) return out;
  const lines = readFileSync(mdPath, "utf8").split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\| ID \|/.test(lines[i])) {
      const cells = lines[i].split("|").map((c) => c.trim());
      const classCol = cells.findIndex((c) => c === "Class");
      if (classCol >= 0) {
        for (let j = i + 2; j < lines.length; j++) {
          const row = lines[j];
          if (!row.startsWith("|")) {
            if (headerIdx >= 0) break;
            continue;
          }
          const rc = row.split("|").map((c) => c.trim());
          const id = rc[1];
          if (!new RegExp(`^${wantKind}-\\d{2}$`).test(id ?? "")) continue;
          out.set(id, { classification: rc[classCol], name: rc[2] });
        }
        headerIdx = i;
      }
    }
  }
  return out;
}
const mdItems = parseTable(ITEMS_MD, "MMI");
const mdPkgs = parseTable(PACKAGES_MD, "MMP");
for (const r of items) {
  const m = mdItems.get(r.id);
  check(`md-item-present(${r.id})`, m !== undefined);
  if (m) check(`md-item-class-match(${r.id})`, m.classification === r.classification, `md '${m.classification}' vs json '${r.classification}'`);
}
for (const r of packages) {
  const m = mdPkgs.get(r.id);
  check(`md-package-present(${r.id})`, m !== undefined);
  if (m) {
    check(`md-package-class-match(${r.id})`, m.classification === r.classification, `md '${m.classification}' vs json '${r.classification}'`);
    check(`md-package-name-match(${r.id})`, m.name === r.package, `md '${m.name}' vs json '${r.package}'`);
  }
}
check("md-items-count", mdItems.size === items.length, `md has ${mdItems.size}`);
check("md-packages-count", mdPkgs.size === packages.length, `md has ${mdPkgs.size}`);

// ---------- 7. 400-line law over the owned write surface ----------
function walkMd(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMd(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}
for (const p of [...walkMd(join(repoRoot, "spec/migration"), []), ...walkMd(EVIDENCE_DIR, [])]) {
  const n = readFileSync(p, "utf8").split("\n").length;
  check(`line-count<=400(${p.slice(repoRoot.length + 1)})`, n <= 400, `${n} lines`);
}
for (const tool of ["check-matrix-consistency.mjs"]) {
  const p = join(EVIDENCE_DIR, "tools", tool);
  if (existsSync(p) && statSync(p).isFile()) {
    const n = readFileSync(p, "utf8").split("\n").length;
    check(`line-count<=400(tools/${tool})`, n <= 400, `${n} lines`);
  }
}

// ---------- report ----------
const failed = violations.length;
console.log(`matrix consistency check: ${checks.length} checks, ${failed} violations`);
if (failed > 0) {
  for (const v of violations) console.error(`VIOLATION: ${v}`);
  process.exit(1);
}
console.log("MATRIX_CONSISTENCY_OK");
