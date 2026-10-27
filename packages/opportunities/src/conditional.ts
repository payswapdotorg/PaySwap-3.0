/**
 * @payswap/opportunities — the CONDITIONAL opportunity (P21-C, lane C;
 * ADR-0014 D9): an evidence-backed opportunity composed with a
 * PARTY-CHANGE PRECONDITION. A conditional says: this observed
 * opportunity becomes real for this corridor only when the required
 * party changes happen — and, where a party change ALONE is
 * insufficient, the honest PLATFORM-PREREQUISITE note labels the
 * platform gap DISTINCT from the party prerequisite (never conflated,
 * never hidden).
 *
 * LAWS (mirrored from the package's own authorities, never redefined):
 * - EVIDENCE-BACKED ONLY: `publishConditionalOpportunity` re-validates
 *   the source through the FULL model validator, and the conditional
 *   carries its OWN non-empty versioned grounding-evidence chain (the
 *   ./model-fields.ts lineage law, reused) — which exclusion facts and
 *   observations ground the conditional.
 * - THE CLOSED PARTY VOCABULARY: parties and changes are frozen,
 *   typed, fail-closed (an unknown party or change never constructs).
 * - EXPLICIT ASSUMPTIONS: non-empty, bounded, unique, vocabulary-scanned
 *   (what must hold for the conditional route to exist).
 * - OPT-IN BEFORE PUBLICATION, EXPIRY STRICTLY AFTER, APPEND-ONLY
 *   HISTORY (./offer-lifecycle.ts laws; the transitions live in
 *   ./conditional-lifecycle.ts under the file law).
 * - PRIVACY/DISCLOSURE CONTROLS through the consent law
 *   (./consent.ts `DisclosureScope` + `validateConsentScope`, reused).
 * - ADVISORY ONLY: `conditionalPermitsExecution()` is the literal false
 *   and `rejectConditionalForExecution()` ALWAYS throws — a conditional
 *   is never a command, never an authorization (the discovery-tier
 *   brand; a match NEVER auto-dispatches).
 */

import { DiscoveryExecutionRejectedError, ValidationError } from "./errors.ts";
import { DISCOVERY_TIER, isDiscoveryTieredValue } from "./discovery-tier.ts";
import type { DisclosureScope } from "./consent.ts";
import type { OfferOptIn } from "./offer-lifecycle.ts";
import type { OpportunityFamily, SupportingObservation } from "./model.ts";
import type { EvidenceFreshness } from "./freshness.ts";

/** Raised when a conditional-opportunity input or transition is malformed. */
export class ConditionalOpportunityError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "ConditionalOpportunityError";
  }
}

// ---------------------------------------------------------------------------
// The frozen closed party vocabulary (ADR-0014 D9)
// ---------------------------------------------------------------------------

/** The closed party vocabulary (runtime-frozen; fail-closed validation). */
export const CONDITIONAL_PARTIES = Object.freeze(["SENDER", "RECIPIENT", "THIRD_PARTY"] as const);
export type ConditionalParty = (typeof CONDITIONAL_PARTIES)[number];

export function isConditionalParty(value: unknown): value is ConditionalParty {
  return typeof value === "string" && (CONDITIONAL_PARTIES as readonly unknown[]).includes(value);
}

/**
 * The closed party-change vocabulary (runtime-frozen): the named changes
 * the P21 cross-provider journey composes — the recipient enables an
 * eligible Flutterwave receiving method; the sender adds a genuinely
 * supported Stripe-compatible payment instrument; a verified
 * intermediary is introduced.
 */
export const CONDITIONAL_PARTY_CHANGES = Object.freeze([
  "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
  "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
  "INTERMEDIARY_INTRODUCED",
] as const);
export type ConditionalPartyChange = (typeof CONDITIONAL_PARTY_CHANGES)[number];

export function isConditionalPartyChange(value: unknown): value is ConditionalPartyChange {
  return typeof value === "string" && (CONDITIONAL_PARTY_CHANGES as readonly unknown[]).includes(value);
}

/** One required party change: WHO must change WHAT (conjunctive in a list). */
export interface RequiredPartyChange {
  readonly party: ConditionalParty;
  readonly change: ConditionalPartyChange;
}

/**
 * The honest platform prerequisite: what the PLATFORM must still provide
 * for the party change to make the corridor real — labeled DISTINCT from
 * the party prerequisite (never conflated, never hidden).
 */
export interface PlatformPrerequisite {
  /** Deterministic gap identity (e.g. `platform:flutterwave-send-operation`). */
  readonly gapId: string;
  /** Human-readable, vocabulary-scanned platform-gap note. */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// The conditional record
// ---------------------------------------------------------------------------

/** Nominal brand: this value is a conditional opportunity, never authority. */
export const CONDITIONAL_KIND = "ConditionalOpportunity" as const;

/** The closed conditional-state vocabulary (runtime-frozen). */
export const CONDITIONAL_STATES = Object.freeze(["OPEN", "DECLINED", "REVOKED"] as const);
export type ConditionalState = (typeof CONDITIONAL_STATES)[number];

export function isConditionalState(value: unknown): value is ConditionalState {
  return typeof value === "string" && (CONDITIONAL_STATES as readonly unknown[]).includes(value);
}

/** The closed conditional-event vocabulary (runtime-frozen). */
export const CONDITIONAL_EVENT_KINDS = Object.freeze(["PUBLISHED", "DECLINED", "REVOKED"] as const);
export type ConditionalEventKind = (typeof CONDITIONAL_EVENT_KINDS)[number];

/** One append-only lifecycle event with a deterministic id. */
export interface ConditionalEvent {
  readonly eventId: string;
  readonly kind: ConditionalEventKind;
  readonly recordedAt: number;
}

/**
 * A conditional opportunity (pure frozen data): an evidence-backed
 * opportunity composed with a party-change precondition, carrying its
 * own grounding-evidence chain, explicit assumptions, the honest
 * platform-prerequisite notes, the disclosure scope, the opt-in, the
 * expiry, and its append-only event history. There is deliberately no
 * method and no execution-shaped field on this type.
 */
export interface ConditionalOpportunity {
  readonly conditionalKind: typeof CONDITIONAL_KIND;
  /** Deterministic: `conditional:<PARTY>:<CHANGE>(+<PARTY>:<CHANGE>)*:<opportunityId>`. */
  readonly conditionalId: string;
  readonly opportunityId: string;
  readonly family: OpportunityFamily;
  readonly railKey: string;
  /** Human-readable summary (the source opportunity's title, re-scanned). */
  readonly summary: string;
  /** The party-change precondition (non-empty, closed vocabulary). */
  readonly requiredPartyChanges: readonly RequiredPartyChange[];
  /** What must hold for the conditional route to exist (non-empty, bounded). */
  readonly assumptions: readonly string[];
  /** The honest platform-gap notes (may be empty — a party change may suffice). */
  readonly platformPrerequisites: readonly PlatformPrerequisite[];
  /** The grounding-evidence chain (non-empty, versioned — the lineage law). */
  readonly evidence: readonly SupportingObservation[];
  /** Derived from the PRIMARY grounding observation (element zero). */
  readonly evidenceFreshness: EvidenceFreshness;
  /** The privacy/disclosure controls (the consent-law shape, reused). */
  readonly disclosureScope: DisclosureScope;
  /** The participant's explicit opt-in (precedes publication). */
  readonly optIn: OfferOptIn;
  readonly publishedAt: number;
  readonly expiresAt: number;
  readonly state: ConditionalState;
  readonly events: readonly ConditionalEvent[];
  readonly discoveryTier: typeof DISCOVERY_TIER;
}

/** Deterministic conditional-event identity (the append index is the order). */
export function conditionalEventId(conditionalId: string, index: number): string {
  return `conditional-event:${conditionalId}:${String(index)}`;
}

/** Each assumption is at most 200 characters (the bounded human surface). */
export const MAX_CONDITIONAL_ASSUMPTION_LENGTH = 200 as const;

/**
 * Deterministic conditional identity: the canonical sorted unique party
 * changes joined with `+`, then the underlying opportunity id.
 */
export function conditionalOpportunityId(
  opportunityId: string,
  changes: readonly RequiredPartyChange[],
): string {
  const canonical = [...changes]
    .map((change) => `${change.party}:${change.change}`)
    .sort()
    .join("+");
  return `conditional:${canonical}:${opportunityId}`;
}


/**
 * The conditional-never-dispatches law, restated as a literal: a
 * conditional opportunity NEVER permits execution. Returns false, always.
 */
export function conditionalPermitsExecution(): false {
  return false;
}

/**
 * THE downstream execution gate for conditionals: ALWAYS throws — the
 * only route onward from a conditional is fresh planning, preview and
 * new explicit authorization on the authorization lanes, never this
 * package.
 */
export function rejectConditionalForExecution(value: unknown): never {
  const description = isDiscoveryTieredValue(value)
    ? `a tiered conditional record (tier '${DISCOVERY_TIER}')`
    : "a non-tiered value passed where execution authority was demanded";
  throw new DiscoveryExecutionRejectedError(
    `execution rejected: ${description} carries no authority to execute — a conditional opportunity is an advisory presentation of what must change, never a command or authorization, and a match NEVER auto-dispatches (P21-C law, ADR-0014 D9)`,
  );
}
