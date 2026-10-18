/**
 * @zcode/ui/payswap — design-layer LAW tests (NET-NEW, P7-W1).
 *
 * The design layer's package law, machine-checked (MMP-10 ADAPT
 * acceptance):
 * - L1 presentation-only: NO network calls of any form in src/payswap
 *   (no fetch / XMLHttpRequest / WebSocket / EventSource / navigator.sendBeacon).
 * - L2 no financial semantics: no money types or money arithmetic — the
 *   layer renders tones and words, never amounts' truth (MoneyInput is a
 *   digit-grouping INPUT, it never computes value).
 * - L3 no authority verbs: the public barrel exports nothing named like
 *   authorize/commit/execute/sign/capture/settle/refund/cancel/approve/
 *   dispatch (INV-23 posture at the design boundary).
 * - L4 substrate law: no @payswap/* imports anywhere in the substrate
 *   package source (packages/ui depends on @zcode/* only).
 * - L5 determinism: no ambient clock/random in the design layer
 *   (Date.now / Math.random / new Date()).
 * - L6 the oracle harness contract matches the token data it summarizes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DESIGN_ORACLE_HARNESS,
  TOKEN_VERSION,
  STATUS_TONES,
} from "../../src/payswap/index.js";
import {
  OUTCOME_STATES,
  stateBorderStyle,
} from "../../src/payswap/state-tokens.js";

const DESIGN_ROOT = join(process.cwd(), "src", "payswap");

function tsSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...tsSources(p));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const SOURCES = tsSources(DESIGN_ROOT);
const SOURCES_WITH_TEXT = SOURCES.map((file) => ({
  file,
  rel: file.slice(process.cwd().length + 1),
  text: readFileSync(file, "utf8"),
}));

const NETWORK_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/,
  /\bnew\s+XMLHttpRequest\b/,
  /\bnew\s+WebSocket\b/,
  /\bnew\s+EventSource\b/,
  /navigator\.sendBeacon/,
];

describe("design-layer law L1: presentation-only — no network in src/payswap", () => {
  it("no design-layer source performs or initiates any network call", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES_WITH_TEXT) {
      for (const pattern of NETWORK_PATTERNS) {
        if (pattern.test(text)) {
          offenders.push(`${rel}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("design-layer law L2: no financial semantics", () => {
  it("the design layer never defines money types or money arithmetic", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES_WITH_TEXT) {
      // Money wire shapes and money arithmetic belong to the domain lanes;
      // the design layer renders words, tones and grouped digits only.
      // (Word-bounded: MoneyInputProps is an INPUT prop shape — grouping
      // digits — not a money type.)
      if (/interface\s+(Amount|Money|MoneyAmount|MinorUnits)\b/.test(text)) {
        offenders.push(`${rel}: money type`);
      }
      if (/minorUnits\s*[+\-*/]|BigInt\(/.test(text)) {
        offenders.push(`${rel}: money arithmetic`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("MoneyInput is digit grouping only — it never parses or computes a value", () => {
    const moneyInput = SOURCES_WITH_TEXT.find(({ rel }) =>
      rel.endsWith("components/MoneyInput.tsx"),
    );
    expect(moneyInput).toBeDefined();
    expect(moneyInput!.text).not.toMatch(/Number\.parseFloat|parseInt|BigInt/);
  });
});

describe("design-layer law L3: no authority verbs on the design surface", () => {
  it("the public barrel exports no authority verb", async () => {
    const barrel = await import("../../src/payswap/index.js");
    const authorityVerb = /^(authorize|commit|execute|sign|capture|settle|refund|cancel|approve|dispatch)/i;
    const offenders = Object.keys(barrel).filter((name) => authorityVerb.test(name));
    expect(offenders).toEqual([]);
  });
});

describe("design-layer law L4: substrate packages import @zcode/* only", () => {
  it("no @payswap/* import exists anywhere in packages/ui source", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES_WITH_TEXT) {
      if (/from\s+["']@payswap\//.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * The single receipted exception: Toast's auto-dismiss uses Date.now() for
 * INTERACTION TIMING (how long a toast stays on screen) — the same pattern
 * the old @payswap/design carried and its 218-test oracle accepted. No
 * RENDERED DERIVATION reads the clock: token/state/component output is a
 * pure function of props (the old suite's render assertions all pass with
 * no clock injection, which is the actual determinism law).
 */
const CLOCK_ALLOWLIST = ["src/payswap/components/Toast.tsx"];

describe("design-layer law L5: determinism — no ambient clock or randomness", () => {
  it("no Date.now / new Date / Math.random in any rendered derivation", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES_WITH_TEXT) {
      if (/Date\.now\(|new\s+Date\(|Math\.random\(/.test(text)) {
        if (!CLOCK_ALLOWLIST.includes(rel)) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("design-layer law L6: the oracle harness contract matches the token data", () => {
  it("the harness summarizes the real tone/chip/environment vocabularies", () => {
    expect(DESIGN_ORACLE_HARNESS.expectedTokenVersion).toBe(TOKEN_VERSION);
    expect(DESIGN_ORACLE_HARNESS.tones.allTones).toEqual(STATUS_TONES);
    expect(DESIGN_ORACLE_HARNESS.tones.unknownTone).toBe("unknown");
    expect(DESIGN_ORACLE_HARNESS.chips.states).toEqual(OUTCOME_STATES);
    expect(DESIGN_ORACLE_HARNESS.chips.failureStates).toEqual(["failed", "blocked"]);
    expect(DESIGN_ORACLE_HARNESS.environments.kinds).toEqual(["test", "live"]);
    expect(DESIGN_ORACLE_HARNESS.environments.testMarkIsInvertedStone).toBe(true);
  });

  it("the dashed-state set is exactly the in-flight chip (UNKNOWN never dashed-as-danger)", () => {
    const dashed = OUTCOME_STATES.filter((state) => stateBorderStyle[state] === "dashed");
    expect(DESIGN_ORACLE_HARNESS.chips.dashedStates).toEqual(dashed);
    expect(dashed).toEqual(["processing"]);
  });
});
