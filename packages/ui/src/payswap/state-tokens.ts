/**
 * @zcode/ui/payswap — PaySwap design tokens, part 2: the outcome-state and
 * environment token contracts.
 *
 * ADAPT of payswap.org@8a735bf packages/design/src/tokens.ts (457L) §"Outcome
 * states" and §"Environment tokens" — split out of tokens.ts to respect the
 * <=400-line file law; no semantic change vs the old module. Old-repo
 * provenance: UX contract 02 §2 / 03 §2.2, v1.1 — TL-review R1.
 *
 * The EIGHT-state outcome vocabulary is the single source for outcome
 * rendering; StatusChip is its only renderer. Layered over the ramps
 * declared in tokens.ts only. Pure data: no React, no DOM, no network.
 */

import { neutral, emerald, amber, red } from "./tokens.js";

/* ====================================================================
 * Outcome states (UX contract 02 §2 / 03 §2.2, v1.1 — TL-review R1).
 * ==================================================================== */

export const OUTCOME_STATES = [
  "succeeded",
  "processing",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
  "blocked",
  "dropped",
] as const;

export type OutcomeState = (typeof OUTCOME_STATES)[number];

/** Word labels — chips render words, never codes (contract 02 §7). */
export const stateLabel: Record<OutcomeState, string> = {
  succeeded: "Succeeded",
  processing: "Processing",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  disputed: "Disputed",
  blocked: "Blocked",
  dropped: "Dropped",
};

/** CSS class applied per state by StatusChip — the visual vocabulary. */
export const stateChipClass: Record<OutcomeState, string> = {
  succeeded: "ps-chip--succeeded",
  processing: "ps-chip--processing",
  failed: "ps-chip--failed",
  refunded: "ps-chip--refunded",
  partially_refunded: "ps-chip--partially_refunded",
  disputed: "ps-chip--disputed",
  blocked: "ps-chip--blocked",
  dropped: "ps-chip--dropped",
};

/** Which state token each state consumes (documentation + tests). */
export const stateTokenFamily: Record<OutcomeState, string> = {
  succeeded: "--ps-state-succeeded",
  processing: "--ps-state-processing",
  failed: "--ps-state-failed",
  refunded: "--ps-state-refunded",
  partially_refunded: "--ps-state-partially_refunded",
  disputed: "--ps-state-disputed",
  blocked: "--ps-state-blocked",
  dropped: "--ps-state-dropped",
};

/**
 * Border treatment per state. `processing` is the only dashed chip: in-flight
 * (never final, never red). Every other state renders a solid border; the
 * ramp + fill treatment carries the rest of the distinction.
 */
export const stateBorderStyle: Record<OutcomeState, "solid" | "dashed"> = {
  succeeded: "solid",
  processing: "dashed",
  failed: "solid",
  refunded: "solid",
  partially_refunded: "solid",
  disputed: "solid",
  blocked: "solid",
  dropped: "solid",
};

/** The canonical outcome-state token names (CSS custom properties). */
export const STATE_TOKEN_NAMES = [
  "--ps-state-succeeded",
  "--ps-state-succeeded-tint",
  "--ps-state-processing",
  "--ps-state-processing-tint",
  "--ps-state-failed",
  "--ps-state-failed-tint",
  "--ps-state-refunded",
  "--ps-state-refunded-tint",
  "--ps-state-partially_refunded",
  "--ps-state-partially_refunded-tint",
  "--ps-state-disputed",
  "--ps-state-disputed-tint",
  "--ps-state-blocked",
  "--ps-state-blocked-tint",
  "--ps-state-dropped",
  "--ps-state-dropped-tint",
] as const;

export type StateTokenName = (typeof STATE_TOKEN_NAMES)[number];

/**
 * Light-theme state values (resolved ramp hex; "transparent" marks the
 * outline treatments). `processing` resolves to the amber ramp, NEVER red;
 * `dropped` (unknown/timeout) is amber-outline, also never red.
 */
export const stateTokenLight: Record<StateTokenName, string> = {
  "--ps-state-succeeded": emerald[700],
  "--ps-state-succeeded-tint": emerald[50],
  "--ps-state-processing": amber[700],
  "--ps-state-processing-tint": amber[50],
  "--ps-state-failed": red[700],
  "--ps-state-failed-tint": red[50],
  "--ps-state-refunded": neutral[600],
  "--ps-state-refunded-tint": "transparent",
  "--ps-state-partially_refunded": neutral[700],
  "--ps-state-partially_refunded-tint": neutral[100],
  "--ps-state-disputed": amber[700],
  "--ps-state-disputed-tint": amber[100],
  "--ps-state-blocked": red[700],
  "--ps-state-blocked-tint": "transparent",
  "--ps-state-dropped": amber[700],
  "--ps-state-dropped-tint": "transparent",
};

/** Dark-theme state values. */
export const stateTokenDark: Record<StateTokenName, string> = {
  "--ps-state-succeeded": emerald[400],
  "--ps-state-succeeded-tint": "rgba(52, 211, 153, 0.12)",
  "--ps-state-processing": amber[400],
  "--ps-state-processing-tint": "rgba(251, 191, 36, 0.08)",
  "--ps-state-failed": red[400],
  "--ps-state-failed-tint": "rgba(248, 113, 113, 0.12)",
  "--ps-state-refunded": neutral[400],
  "--ps-state-refunded-tint": "transparent",
  "--ps-state-partially_refunded": neutral[300],
  "--ps-state-partially_refunded-tint": "rgba(255, 255, 255, 0.08)",
  "--ps-state-disputed": amber[400],
  "--ps-state-disputed-tint": "rgba(251, 191, 36, 0.14)",
  "--ps-state-blocked": red[400],
  "--ps-state-blocked-tint": "transparent",
  "--ps-state-dropped": amber[400],
  "--ps-state-dropped-tint": "transparent",
};

/* ====================================================================
 * Environment tokens (UX contract 02 §2 / 01 §2).
 * `env.test` is an INVERTED stone mark: distinct from every state color, so
 * "test" can never read as "error" or "success". `env.live` is the default
 * world with no special marking.
 * ==================================================================== */

export const ENVIRONMENT_KINDS = ["test", "live"] as const;

export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

/** Which environment token each kind consumes (documentation + tests). */
export const envTokenFamily: Record<EnvironmentKind, string> = {
  test: "--ps-env-test",
  live: "--ps-env-live",
};

/** The canonical environment token names (CSS custom properties). */
export const ENV_TOKEN_NAMES = [
  "--ps-env-test",
  "--ps-env-test-on",
  "--ps-env-live",
  "--ps-env-live-tint",
] as const;

export type EnvTokenName = (typeof ENV_TOKEN_NAMES)[number];

/** Light-theme environment values (inverted stone for test). */
export const envTokenLight: Record<EnvTokenName, string> = {
  "--ps-env-test": neutral[950],
  "--ps-env-test-on": neutral[0],
  "--ps-env-live": neutral[600],
  "--ps-env-live-tint": "transparent",
};

/** Dark-theme environment values (inversion flips with the theme). */
export const envTokenDark: Record<EnvTokenName, string> = {
  "--ps-env-test": neutral[0],
  "--ps-env-test-on": neutral[950],
  "--ps-env-live": neutral[400],
  "--ps-env-live-tint": "transparent",
};
