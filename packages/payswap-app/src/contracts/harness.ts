/**
 * @payswap/app — ORACLE HARNESS types (versioned, canonical).
 *
 * The ported behavioral-oracle suites (old @payswap/web 38f/561t node-env
 * suite + the P7-W1 share of the old @payswap/ux 14f/332t suite) drive the
 * NEW product through these harness shapes: pages render from EXPLICIT
 * view inputs (the old Next.js pages baked evidence imports into modules;
 * the new product receives data via props/contracts — presentation-only),
 * and every fixture is inert, deterministic data. No network, no clock, no
 * ambient state (determinism law; the substrate battery runs `npx vitest
 * run` from the package dir with a node environment).
 */

import type { CoverageSource } from "./view-models.js";
import type { ExecutionOutcomeFoldInput } from "./honest-states.js";
import type { OutcomeDeploymentContextPin } from "../pins/surface-pins.js";

/** The canonical oracle harness record version (drift-detectable). */
export const WEB_ORACLE_HARNESS_VERSION = "1.0.0" as const;

/**
 * The static-render harness: pages are rendered with
 * `renderToStaticMarkup` (node environment — the old web suite's approach,
 * kept so markup-level honesty assertions stay deterministic).
 */
export interface WebOracleHarness {
  readonly version: typeof WEB_ORACLE_HARNESS_VERSION;
  /** The deployment facts every page fold receives (honest defaults). */
  readonly deployment: OutcomeDeploymentContextPin;
  /** The recorded provider evidence (empty = the honest no-evidence view). */
  readonly coverage: CoverageSource;
  /** Execution-outcome observations for honest-state assertions. */
  readonly executionOutcomes: readonly ExecutionOutcomeFoldInput[];
}

/**
 * The honest default deployment context of THIS repository phase: no
 * economic intake configured, no capability observations, no merchant
 * plane — every outcome action renders its typed missing prerequisite
 * (never a dead button, never a fabricated success; INV-24 posture).
 */
export const HONEST_DEPLOYMENT_CONTEXT: OutcomeDeploymentContextPin = {
  economicIntakeConfigured: false,
  capabilityObservationsAvailable: false,
  merchantCheckoutContextBound: false,
} as const;

/**
 * The recorded provider evidence of THIS repository phase: none. The new
 * repository has no committed provider-probe/rollout evidence records yet
 * (the old repo's spec/development-state JSONs are old-repo evidence and
 * are NOT carried); the coverage explorer therefore renders the honest
 * no-evidence state — never invented providers, never upgraded statuses.
 */
export const NO_EVIDENCE_COVERAGE: CoverageSource = {
  probedAt: "",
  releaseId: "payswap-3.0-phase-2-base",
  connected: [],
  nonConnections: [],
  supportingServices: [],
} as const;

/** The canonical harness instance the oracle suites share. */
export const WEB_ORACLE_HARNESS: WebOracleHarness = {
  version: WEB_ORACLE_HARNESS_VERSION,
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  executionOutcomes: [
    { outcome: "CONFIRMED", authorityRef: "harness:confirmed" },
    {
      outcome: "UNKNOWN",
      ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      authorityRef: "harness:unknown-timeout",
    },
    {
      outcome: "FAILED",
      providerFailure: { retryable: false, ambiguity: "NONE" },
      authorityRef: "harness:failed",
    },
  ],
} as const;
