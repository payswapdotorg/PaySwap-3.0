// yaml-mini.mjs — vendored minimal YAML subset parser (P0-W2).
//
// WHY VENDORED: the validator must run offline with `node` only, on a fresh
// clone with no installed node_modules (hard constraint of WORK ORDER P0-W2:
// "no new heavy dependencies — prefer zero-dep; if you need a parser, vendor
// a minimal one and document it"). spec/architecture/MODULE-OWNERSHIP.yaml
// uses a small YAML subset, so a focused ~180-line parser is sufficient and
// auditable. Documented supported subset:
//   - nested block mappings via consistent indentation
//   - block sequences of scalars (`- item` lines) for files like
//     pnpm-workspace.yaml (sequence items must be plain scalars; nested
//     mappings inside sequence items are NOT supported and raise)
//   - scalars: bare strings, quoted strings, true/false, numbers, null
//   - inline flow sequences:  [a, b, c]  (strings/booleans only)
//   - full-line and trailing comments (# ...) and blank lines are skipped
// Anything outside this subset raises YamlMiniError (fail-closed: the
// validator never silently guesses on a policy file it cannot fully parse).

export class YamlMiniError extends Error {
  constructor(message, line) {
    super(`yaml-mini: ${message} (line ${line})`);
    this.name = "YamlMiniError";
    this.line = line;
  }
}

const SCALAR_RE = /^(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*$/;

function parseScalar(raw, line) {
  const text = String(raw).trim();
  if (text === "") return null;
  if (text.startsWith("[")) return parseFlowSequence(text, line);
  if (text.startsWith('"') || text.startsWith("'")) {
    const match = SCALAR_RE.exec(text);
    if (!match || (match[1] === undefined && match[2] === undefined)) {
      throw new YamlMiniError(`unterminated quoted scalar: ${text}`, line);
    }
    return match[1] !== undefined ? match[1] : match[2];
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const hash = findCommentStart(text);
  const bare = (hash === -1 ? text : text.slice(0, hash)).trim();
  if (bare === "") return null;
  return bare;
}

function findCommentStart(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") return i;
  }
  return -1;
}

function parseFlowSequence(text, line) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new YamlMiniError(`unsupported YAML construct: "${text}"`, line);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  const items = [];
  let current = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ",") {
      items.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") items.push(current);
  return items.map((item) => parseScalar(item, line));
}

function indentOf(line) {
  const match = /^ */.exec(line);
  return match ? match[0].length : 0;
}

/**
 * Parse a YAML subset document into a plain JS object.
 * @param {string} text raw YAML text
 * @returns {Record<string, unknown>}
 */
export function parseYamlMini(text) {
  const rawLines = text.split(/\r?\n/);
  /** @type {{number:number, indent:number, text:string}[]} */
  const lines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const original = rawLines[i];
    const hash = findCommentStart(original);
    const noComment = hash === -1 ? original : original.slice(0, hash);
    if (noComment.trim() === "") continue;
    lines.push({ number: i + 1, indent: indentOf(noComment), text: noComment.trimEnd() });
  }
  if (lines.length === 0) return {};

  const KEY_RE = /^([^:]+):\s*(.*)$/;
  let pos = 0;

  function parseSequence(seqIndent) {
    const items = [];
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < seqIndent) break;
      if (line.indent > seqIndent) {
        throw new YamlMiniError(
          `unexpected deeper indent ${line.indent} inside sequence (nested map items are unsupported)`,
          line.number,
        );
      }
      const trimmed = line.text.trim();
      if (!trimmed.startsWith("- ")) {
        break; // back out to the mapping parser (mixed blocks raise there if stray)
      }
      const itemText = trimmed.slice(2).trim();
      pos += 1;
      items.push(parseScalar(itemText, line.number));
    }
    if (items.length === 0) {
      throw new YamlMiniError(`empty or malformed sequence at indent ${seqIndent}`, lines[pos]?.number ?? 0);
    }
    return items;
  }

  function parseMap(mapIndent) {
    const result = {};
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < mapIndent) break;
      if (line.indent > mapIndent) {
        throw new YamlMiniError(
          `unexpected deeper indent ${line.indent} under "${lastKey}" (expected ${mapIndent})`,
          line.number,
        );
      }
      const trimmed = line.text.trim();
      if (trimmed.startsWith("- ")) {
        throw new YamlMiniError(
          `unexpected sequence item "${trimmed}" inside mapping (mixed block)`,
          line.number,
        );
      }
      const match = KEY_RE.exec(trimmed);
      if (!match) {
        throw new YamlMiniError(`expected "key:" mapping, got "${line.text.trim()}"`, line.number);
      }
      const key = match[1].trim();
      if (key.includes(":")) {
        throw new YamlMiniError(`ambiguous key "${match[1]}"`, line.number);
      }
      const rest = match[2].trim();
      pos += 1;
      if (rest === "") {
        const nextLine = pos < lines.length ? lines[pos] : null;
        if (nextLine && nextLine.indent > mapIndent) {
          if (nextLine.text.trim().startsWith("- ")) {
            result[key] = parseSequence(nextLine.indent);
          } else {
            result[key] = parseMap(nextLine.indent);
          }
        } else {
          result[key] = null;
        }
      } else {
        result[key] = parseScalar(rest, line.number);
      }
      var lastKey = key;
    }
    return result;
  }

  if (lines[0].indent !== 0) {
    throw new YamlMiniError(`top-level keys must start at column 0`, lines[0].number);
  }
  const value = parseMap(0);
  if (pos < lines.length) {
    throw new YamlMiniError(`trailing content at indent ${lines[pos].indent}`, lines[pos].number);
  }
  return value;
}
