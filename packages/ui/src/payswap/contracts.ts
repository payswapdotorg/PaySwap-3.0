/**
 * @zcode/ui/payswap — design-token CONTRACT types + oracle harness types.
 *
 * NET-NEW (P7-W1, MMP-10 adaptation onto the @zcode/ui substrate): the
 * versioned, canonical contract surface for the PaySwap design layer. The
 * token DATA lives in tokens.ts / state-tokens.ts (ADAPT of the old
 * @payswap/design); this module pins the CONTRACT SHAPES consumers and the
 * ported oracle suite compile against, so the design layer's public
 * guarantees are typed, versioned and machine-checked independently of the
 * data files.
 *
 * PACKAGE LAW (presentation-only design layer): every type here is
 * presentation vocabulary — no financial semantics, no business logic, no
 * network. Money is never a type here; state words are TONES, not outcomes
 * of any authority. The authoritative CONFIRMED/UNKNOWN/FAILED vocabulary
 * lives in @payswap/provider-runtime (packages/provider-runtime/src/
 * result-envelope.ts) and is pinned STRUCTURALLY by the product package
 * (packages/payswap-app/src/pins/) — the design layer only renders the
 * honest-state TONES it is given via props.
 */

import type { StatusTone } from "./tokens.js";
import type { EnvironmentKind, OutcomeState } from "./state-tokens.js";
import { TOKEN_VERSION } from "./tokens.js";

/* ====================================================================
 * Design-token contract (versioned, canonical)
 * ==================================================================== */

/** Which token family a design-layer contract belongs to. */
export type DesignTokenFamily =
  | "ramp"
  | "semantic"
  | "type"
  | "spacing"
  | "radius"
  | "motion"
  | "elevation"
  | "status-tone"
  | "state"
  | "environment";

/** The versioned design-token contract record the oracle suite verifies. */
export interface DesignTokenContract {
  /** The token contract version this surface compiled against (drift is detectable). */
  readonly tokenVersion: typeof TOKEN_VERSION;
  readonly family: DesignTokenFamily;
  /** Canonical token names in the family (CSS custom properties or ramp steps). */
  readonly names: readonly string[];
}

/** Oracle-facing summary of the honest-tone vocabulary law. */
export interface HonestToneContract {
  /**
   * The tone that renders an UNKNOWN observation. MUST be `unknown` —
   * UNKNOWN is never styled as failure (amber ramp + dashed border, never
   * the red/danger ramp).
   */
  readonly unknownTone: "unknown";
  /** The tones that are allowed to consume the danger (red) ramp. */
  readonly dangerTones: readonly Extract<StatusTone, "blocked" | "failed">[];
  /** Every tone the StatusPill renders, in canonical order. */
  readonly allTones: readonly StatusTone[];
}

/** Oracle-facing summary of the outcome-state chip vocabulary law. */
export interface OutcomeChipContract {
  /** Every outcome state StatusChip renders, in canonical order. */
  readonly states: readonly OutcomeState[];
  /** The only states allowed to consume the red ramp (failure ONLY). */
  readonly failureStates: readonly Extract<OutcomeState, "failed" | "blocked">[];
  /** The states rendered with a dashed border (in-flight / unknown). */
  readonly dashedStates: readonly OutcomeState[];
}

/** Oracle-facing summary of the environment marking law. */
export interface EnvironmentMarkContract {
  readonly kinds: readonly EnvironmentKind[];
  /** The inverted-stone mark exists so TEST can never read as error or success. */
  readonly testMarkIsInvertedStone: true;
}

/* ====================================================================
 * Oracle harness types (versioned, canonical)
 * ==================================================================== */

/**
 * Fixture shape the ported design oracle suite (jsdom) uses to drive every
 * component primitive: data arrives via props, never via network or ambient
 * state. Harness values are inert presentation inputs.
 */
export interface DesignOracleHarness {
  /** The token contract version the suite asserts (drift detection). */
  readonly expectedTokenVersion: typeof TOKEN_VERSION;
  readonly tones: HonestToneContract;
  readonly chips: OutcomeChipContract;
  readonly environments: EnvironmentMarkContract;
}

/** The canonical harness instance (pure data; tests may freeze it). */
export const DESIGN_ORACLE_HARNESS: DesignOracleHarness = {
  expectedTokenVersion: TOKEN_VERSION,
  tones: {
    unknownTone: "unknown",
    dangerTones: ["blocked", "failed"],
    allTones: ["ok", "attention", "unknown", "blocked", "disabled", "failed"],
  },
  chips: {
    states: [
      "succeeded",
      "processing",
      "failed",
      "refunded",
      "partially_refunded",
      "disputed",
      "blocked",
      "dropped",
    ],
    failureStates: ["failed", "blocked"],
    dashedStates: ["processing"],
  },
  environments: {
    kinds: ["test", "live"],
    testMarkIsInvertedStone: true,
  },
} as const;
