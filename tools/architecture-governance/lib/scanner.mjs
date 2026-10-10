// scanner.mjs — vendored minimal TS/JS import-edge scanner (P0-W2).
//
// WHY VENDORED: hard constraint — the validator must run offline with `node`
// only on a fresh clone (no node_modules). The repo's existing dependency
// tooling (scripts/dependency-graph.mjs) imports the `typescript` package,
// which is not installed in a fresh clone, so this scanner is a documented
// zero-dependency substitute focused on specifier extraction.
//
// DESIGN (documented, auditable):
//  1. A single-pass state machine walks each source file and rewrites
//     comments to whitespace while replacing every string / template literal
//     with a unique placeholder of the form "§N§" (quotes preserved).
//     A side table records each placeholder's real text and 1-based line.
//  2. Import/require/export-from forms are then matched on the placeholder
//     text, so accidental matches inside string contents are impossible.
//
// CAPTURED FORMS:
//  - import ... from "spec"   (incl. multi-line clauses; a clause that begins
//    with the `type` keyword — `import type ... from` — is recorded typeOnly)
//  - import "spec"            (side-effect import)
//  - export ... from "spec"   (`export type ... from` recorded typeOnly)
//  - require("spec")          (CommonJS interop)
//  - import("spec")           (dynamic import with literal specifier)
//
// DOCUMENTED LIMITATIONS (fail-closed reporting of what is NOT captured):
//  - computed / concatenated dynamic import specifiers are not statically
//    analyzable and are not captured (noted in the violation register);
//  - `import { type A } from "x"` (inline type modifiers) counts as a VALUE
//    import — only whole-clause `import type` is classified typeOnly;
//  - exotic statement layouts may be missed by the `^`/`;`/newline/`}`
//    statement anchors — a missed edge can only ever under-report
//    violations, never fabricate them (bias documented for governance use).
//
// This file deliberately never prints file contents: it only emits
// specifiers (module paths).

const CODE_EXTENSIONS = [
  ".d.ts",
  ".d.mts",
  ".d.cts",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

export function isCodeFile(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  for (const ext of CODE_EXTENSIONS) {
    if (normalized.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Rewrite comments to spaces and string/template literals to placeholders.
 * @param {string} source
 * @returns {{ text: string, strings: {key: string, text: string, line: number}[] }}
 */
export function stripAndPlaceholder(source) {
  const out = [];
  /** @type {{key: string, text: string, line: number}[]} */
  const strings = [];
  let line = 1;
  let i = 0;
  const n = source.length;
  let placeholderIndex = 0;

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : "";

    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out.push(" ");
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out.push(" ", " ");
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") {
          out.push("\n");
          line += 1;
        } else {
          out.push(" ");
        }
        i += 1;
      }
      if (i < n) {
        out.push(" ", " ");
        i += 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const startLine = line;
      const literal = [ch];
      i += 1;
      while (i < n && source[i] !== ch) {
        if (source[i] === "\\") {
          literal.push(source[i], source[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (source[i] === "\n") line += 1;
        literal.push(source[i]);
        i += 1;
      }
      i += 1; // closing quote
      literal.push(ch);
      const key = `\u00a7${placeholderIndex}\u00a7`;
      placeholderIndex += 1;
      strings.push({ key, text: literal.join(""), line: startLine });
      out.push(`"${key}"`);
      continue;
    }
    if (ch === "`") {
      const startLine = line;
      const literal = ["`"];
      i += 1;
      let depth = 0;
      while (i < n) {
        const c = source[i];
        if (c === "\\") {
          literal.push(c, source[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (c === "\n") line += 1;
        literal.push(c);
        if (c === "$" && source[i + 1] === "{") {
          depth += 1;
          literal.push(source[i + 1]);
          i += 2;
          continue;
        }
        if (c === "}" && depth > 0) depth -= 1;
        if (c === "`" && depth === 0) {
          i += 1;
          break;
        }
        i += 1;
      }
      const key = `\u00a7${placeholderIndex}\u00a7`;
      placeholderIndex += 1;
      strings.push({ key, text: literal.join(""), line: startLine });
      out.push(`\`${key}\``);
      continue;
    }
    if (ch === "\n") line += 1;
    out.push(ch);
    i += 1;
  }

  return { text: out.join(""), strings };
}

const SPEC = String.raw`(?<q>["'])(\u00a7\d+\u00a7)\k<q>`;
const CLAUSE = String.raw`[^;'"` + "`" + String.raw`]*?`;
const ANCHOR = String.raw`(?:^|[;\n{}][ \t]*)`;

const STATEMENT_IMPORT_FORM = new RegExp(
  String.raw`${ANCHOR}import\s(${CLAUSE})\bfrom\s*${SPEC}`,
  "gm",
);
const STATEMENT_EXPORT_FORM = new RegExp(
  String.raw`${ANCHOR}export\s(${CLAUSE})\bfrom\s*${SPEC}`,
  "gm",
);
const SIDE_EFFECT_FORM = new RegExp(String.raw`${ANCHOR}import\s*${SPEC}`, "gm");
const REQUIRE_FORM = new RegExp(String.raw`\brequire\s*\(\s*${SPEC}\s*\)`, "g");
const DYNAMIC_FORM = new RegExp(String.raw`\bimport\s*\(\s*${SPEC}\s*\)`, "g");

function decode(placeholder, strings) {
  const entry = strings.find((item) => item.key === placeholder);
  if (!entry) return null;
  return { specifier: entry.text.slice(1, -1), line: entry.line };
}

/**
 * Extract import specifiers from one source file.
 * @param {string} source file text
 * @returns {{specifier: string, line: number, kind: string, typeOnly: boolean}[]}
 */
export function scanImports(source) {
  const { text, strings } = stripAndPlaceholder(source);
  /** @type {Map<string, {specifier: string, line: number, kind: string, typeOnly: boolean}>} */
  const found = new Map();

  const record = (placeholder, kind, typeOnly) => {
    const decoded = decode(placeholder, strings);
    if (!decoded) return;
    const key = `${decoded.specifier}::${decoded.line}`;
    const existing = found.get(key);
    if (existing) {
      // Same specifier on the same line: value usage wins over type-only.
      existing.typeOnly = existing.typeOnly && typeOnly;
      return;
    }
    found.set(key, {
      specifier: decoded.specifier,
      line: decoded.line,
      kind,
      typeOnly,
    });
  };

  const runStatements = (regex, kind) => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const clause = match[1] ?? "";
      const typeOnly = /^\s*type\b/.test(clause);
      record(match[3], kind, typeOnly);
    }
  };

  const runSimple = (regex, kind) => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      record(match[2], kind, false);
    }
  };

  runStatements(STATEMENT_IMPORT_FORM, "import");
  runStatements(STATEMENT_EXPORT_FORM, "export");
  runSimple(SIDE_EFFECT_FORM, "side-effect");
  runSimple(REQUIRE_FORM, "require");
  runSimple(DYNAMIC_FORM, "dynamic-import");

  return Array.from(found.values()).sort(
    (a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier),
  );
}
