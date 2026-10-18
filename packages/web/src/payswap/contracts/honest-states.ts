/**
 * @zcode/web/payswap — honest-state view CONTRACTS: the P7-W1 share of the
 * old @payswap/ux honest-state/error-reason vocabulary (MMP-35 PORT),
 * re-specified over the CANONICAL PaySwap 3.0 vocabulary.
 *
 * Old-repo provenance (payswap.org@8a735bf packages/ux/src/honest-states.ts
 * + error-reasons.ts): HonestStateView with tone/headline/guidance/actions,
 * the INV-X01 law (UNKNOWN is NEVER mapped to FAILED — it renders as
 * reconciling with the reconciliation path surfaced) and the actionable
 * error-category mapping. The old modules imported @payswap/interfaces +
 * @payswap/execution (packages that do not exist in PaySwap 3.0); this
 * contract re-pins the same LAWS over the accepted canonical vocabulary:
 * provider-runtime's CONFIRMED/UNKNOWN/FAILED envelope (+ AMBIGUITY_REASONS)
 * and surface's 16-stage progress lifecycle (StageStatus). The P7-W3 share
 * of the old ux package (command grammar core, messaging-adapters,
 * trusted-approvals) is NOT ported here — receipted in
 * docs/web-evidence/BASELINE-VERIFICATION-RECORD.md.
 */

import type {
  AmbiguityReasonPin,
  ExternalEffectOutcomePin,
  ProviderFailureMetadataPin,
} from "../pins/provider-runtime-pins.js";
import type { StageStatusPin } from "../pins/surface-pins.js";
import type { HonestTone } from "./view-models.js";

/* ====================================================================
 * Execution-outcome honest views (over the pinned envelope vocabulary)
 * ==================================================================== */

/** A typed action a state view offers (never a fabricated authority verb). */
export interface HonestViewAction {
  readonly actionId: string;
  readonly label: string;
  readonly kind: "NAVIGATION" | "EVIDENCE_VIEW" | "REFRESH" | "EXTERNAL_OPEN";
  /** Reference to the authoritative record the action reads (never the record). */
  readonly authorityRef: string;
}

/** The honest view of ONE external-effect outcome (total over the 3-value vocabulary). */
export interface ExecutionOutcomeView {
  readonly outcome: ExternalEffectOutcomePin;
  readonly tone: HonestTone;
  readonly headline: string;
  readonly guidance: string;
  readonly actions: readonly HonestViewAction[];
  /** Present for UNKNOWN — the reconciliation path (reconcile before retry, INV-04). */
  readonly reconciliationNote?: string;
}

/** Input to the fold: an envelope-shaped observation (already provider-verified). */
export interface ExecutionOutcomeFoldInput {
  readonly outcome: ExternalEffectOutcomePin;
  readonly providerFailure?: ProviderFailureMetadataPin;
  readonly ambiguityReason?: AmbiguityReasonPin;
  readonly authorityRef: string;
}

/* ====================================================================
 * Progress-stage honest views (over the pinned lifecycle vocabulary)
 * ==================================================================== */

/** The honest view of one stage observation's status (total over StageStatus). */
export interface StageStatusView {
  readonly status: StageStatusPin;
  readonly tone: HonestTone;
  readonly headline: string;
  readonly guidance: string;
}

/* ====================================================================
 * Error-reason views (people language, actionable, never a fake failure)
 * ==================================================================== */

/** A typed error family the web product can honestly render. */
export type WebErrorFamily =
  | { readonly kind: "AMBIGUOUS_OUTCOME"; readonly reason: AmbiguityReasonPin }
  | { readonly kind: "PROVIDER_FAILURE"; readonly retryable: boolean }
  | { readonly kind: "NOT_CONFIGURED"; readonly missing: string }
  | { readonly kind: "INVALID_INPUT"; readonly detail: string };

/** The people-language view of an error family — deterministic fold output. */
export interface ErrorReasonView {
  readonly family: WebErrorFamily["kind"];
  readonly tone: HonestTone;
  readonly headline: string;
  readonly guidance: string;
  /** AMBIGUOUS_OUTCOME renders as UNKNOWN reconciliation — never as failure. */
  readonly rendersAsUnknown: boolean;
}

/* ====================================================================
 * Incumbent provenance views (evidence strength ordering, INV-E04 posture)
 * ==================================================================== */

/**
 * Provenance strength order: UI/browser artifacts are never stronger than
 * their authenticated provenance (old ux incumbent-views.ts law, ported).
 */
export const PROVENANCE_STRENGTH_ORDER = [
  "AUTHENTICATED_RECORD",
  "PROVIDER_OBSERVATION",
  "DECLARED_TERMS",
  "UI_ARTIFACT",
] as const;

export type ProvenanceStrength = (typeof PROVENANCE_STRENGTH_ORDER)[number];

/** A provenance-labeled reference (the weaker provenance never overrides). */
export interface IncumbentProvenanceRef {
  readonly label: string;
  readonly strength: ProvenanceStrength;
  readonly reference: string;
}
