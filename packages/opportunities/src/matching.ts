/**
 * @payswap/opportunities — criteria→offer matching with privacy audit
 * (P16-C, lane C; gap-matrix row C7). `matchOpportunities` is the PURE
 * match projection over FRESH eligible opportunities in the criteria's
 * families (reusing ./eligibility.ts staleness + policy), optionally
 * filtered by the ASSET SYMBOL extracted from the capital requirement —
 * sliced by PREFIX LENGTH (the `${railKey}/asset:` prefix; "/asset:" is 7
 * characters — a hardcoded +8 slices "SCD" out of "USCD" and never
 * matches; the 4-char fixture symbol is the regression probe).
 *
 * Every matched opportunity is disclosed through the SIX-FIELD
 * minimum-disclosure privacy audit, INCLUDING corridor_countries — an
 * FX-RAIL-ONLY derivation from `fx:<pair>` rail keys (an ONCHAIN-rail
 * opportunity can structurally never populate it). The disclosure is
 * consent-gated through ./consent.ts: the caller-side `consentIsValid`
 * liveness gate, the ledger's own REVOKED record THROWING in the
 * projection (DisclosureConsentError, imported from its DECLARING module
 * ./consent.ts), and the fail-closed scope law — the consented scope must
 * cover every audit field the projection discloses.
 */

import { ValidationError } from "./errors.ts";
import { DisclosureConsentError, consentIsValid, validateDisclosureConsent } from "./consent.ts";
import type { ConsentSnapshot } from "./consent.ts";
import { validateWaitCriteria } from "./wait-criteria.ts";
import type { WaitMatchCriteria } from "./wait-criteria.ts";
import { evaluateDiscoveryPolicy, isOpportunityStale } from "./eligibility.ts";
import { PINNED_ASSET_SYMBOL_PATTERN } from "./pins/onchain-domain.ts";
import type { FinancialOpportunity, OpportunityFamily, RailKind } from "./model.ts";

/** Raised when a matching input is malformed. */
export class MatchError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "MatchError";
  }
}

/** The frozen six-field minimum-disclosure audit vocabulary (wire order). */
export const MATCH_PRIVACY_AUDIT_FIELDS = Object.freeze([
  "opportunity_id",
  "family",
  "rail_kind",
  "asset_symbol",
  "corridor_countries",
  "evidence_version",
] as const);
export type MatchPrivacyAuditField = (typeof MATCH_PRIVACY_AUDIT_FIELDS)[number];

/** The six-field minimum-disclosure view of one matched opportunity. */
export interface MatchPrivacyAudit {
  readonly opportunity_id: string;
  readonly family: OpportunityFamily;
  readonly rail_kind: RailKind;
  /** The extracted asset symbol; null when the capital requirement is UNKNOWN. */
  readonly asset_symbol: string | null;
  /** FX-rail-only corridor derivation; [] on every other rail kind. */
  readonly corridor_countries: readonly string[];
  /** The primary observation's version (versioned-evidence provenance). */
  readonly evidence_version: number;
}

/**
 * The match criteria: the SHARED wait vocabulary (the wait-core fields are
 * validated by ./wait-criteria.ts `validateWaitCriteria`) plus the OPTIONAL
 * asset-symbol scope. A plain WaitMatchCriteria is structurally a valid
 * match criteria — the wait vocabulary IS the match vocabulary.
 */
export interface OpportunityMatchCriteria extends WaitMatchCriteria {
  /** OPTIONAL asset-symbol scope (pinned symbol pattern; membership only). */
  readonly currencies?: readonly string[];
}

/** One matched opportunity: its deterministic id + its privacy audit. */
export interface MatchedOpportunity {
  readonly opportunityId: string;
  readonly audit: MatchPrivacyAudit;
}

/** The pure match projection result (deterministically ordered). */
export interface MatchResult {
  /** Sorted by opportunityId (the deterministic total order). */
  readonly matched: readonly MatchedOpportunity[];
  readonly evaluatedAt: number;
}

/** Input to `matchOpportunities` (the consent snapshot is the gate). */
export interface MatchInput {
  readonly criteria: OpportunityMatchCriteria;
  readonly opportunities: readonly FinancialOpportunity[];
  readonly consent: ConsentSnapshot;
}

/**
 * THE currency extraction law: slices the `${railKey}/asset:` prefix BY
 * LENGTH (never a hardcoded offset — "/asset:" is 7 characters; the lost
 * wave's +8 off-by-one extracted "SCD" instead of "USCD" and could never
 * match a currency criterion). Returns null when the capital requirement
 * is UNKNOWN or the asset ref does not carry the rail's prefix.
 */
export function currencyOfCapitalRequirement(opportunity: FinancialOpportunity): string | null {
  if (opportunity.capitalRequired.kind !== "KNOWN") {
    return null;
  }
  const prefix = `${opportunity.rail.railKey}/asset:`;
  const assetRef = opportunity.capitalRequired.value.assetRef;
  return assetRef.startsWith(prefix) ? assetRef.slice(prefix.length) : null;
}

/**
 * The FX-RAIL-ONLY corridor derivation: `fx:<pair>` rail keys split into
 * the two uppercase corridor sides ("fx:eur-usd" -> ["EUR", "USD"]). Every
 * other rail kind — and any pair that is not exactly two non-empty sides —
 * derives [] (an ONCHAIN opportunity can structurally never populate it).
 */
export function corridorCountriesOf(opportunity: FinancialOpportunity): readonly string[] {
  if (opportunity.rail.railKind !== "FX") {
    return Object.freeze([]);
  }
  const railKey = opportunity.rail.railKey;
  if (!railKey.startsWith("fx:")) {
    return Object.freeze([]);
  }
  const sides = railKey.slice("fx:".length).split("-");
  const [left, right] = sides;
  if (sides.length !== 2 || left === undefined || right === undefined || left === "" || right === "") {
    return Object.freeze([]);
  }
  return Object.freeze([left.toUpperCase(), right.toUpperCase()]);
}

/** The six-field minimum-disclosure audit of one opportunity. */
export function privacyAuditOf(opportunity: FinancialOpportunity): MatchPrivacyAudit {
  return Object.freeze({
    opportunity_id: opportunity.opportunityId,
    family: opportunity.family,
    rail_kind: opportunity.rail.railKind,
    asset_symbol: currencyOfCapitalRequirement(opportunity),
    corridor_countries: corridorCountriesOf(opportunity),
    evidence_version: opportunity.primaryObservation.version,
  });
}

/**
 * Fail-closed match-criteria validation: the WAIT CORE delegates to
 * `validateWaitCriteria` (WaitCriteriaError — its own typed domain), the
 * match extension (the optional asset-symbol scope) throws MatchError.
 * Returns a NEW deep-frozen record.
 */
export function validateOpportunityMatchCriteria(candidate: unknown): OpportunityMatchCriteria {
  const core = validateWaitCriteria(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (record.currencies === undefined) {
    return core;
  }
  if (!Array.isArray(record.currencies) || record.currencies.length === 0) {
    throw new MatchError("currencies, when present, must be a non-empty array of asset symbols (an empty scope is malformed)");
  }
  const seen = new Set<string>();
  for (const currency of record.currencies) {
    if (typeof currency !== "string" || !PINNED_ASSET_SYMBOL_PATTERN.test(currency)) {
      throw new MatchError(`currency '${String(currency)}' is not a canonical asset symbol (the pinned uppercase-led pattern)`);
    }
    if (seen.has(currency)) {
      throw new MatchError(`currency '${currency}' is declared twice (a scope entry is named once)`);
    }
    seen.add(currency);
  }
  return Object.freeze({ ...core, currencies: Object.freeze([...record.currencies]) });
}

/**
 * The consent gate (the honest composition): the caller-side
 * `consentIsValid` liveness gate is applied INSIDE the projection too;
 * when the snapshot is not live, the projection reads the ledger's own
 * REVOKED record and THROWS the typed DisclosureConsentError (a
 * pre-revocation GRANTED snapshot cannot throw here — that is the
 * caller-side gate's law); with no revocation at all there is no live
 * GRANTED consent and the projection fails closed with MatchError.
 */
function gateConsent(consent: ConsentSnapshot): { readonly subject: string; readonly fields: readonly string[] } {
  if (!consentIsValid(consent)) {
    const revocation =
      consent !== null && typeof consent === "object"
        ? (consent as unknown as Readonly<Record<string, unknown>>).revocation
        : undefined;
    if (revocation !== null && revocation !== undefined) {
      // The ledger's OWN revoked record: validate it, then throw naming it.
      const revoked = validateDisclosureConsent(revocation);
      throw new DisclosureConsentError(
        `disclosure consent for subject '${revoked.subject}' is REVOKED (revocation '${revoked.consentId}' at ${String(revoked.revokedAt)}) — the match projection discloses nothing against a revoked consent (P16-C law)`,
      );
    }
    throw new MatchError(
      "a live GRANTED disclosure consent is required before any match projection — the caller-side consentIsValid gate is false",
    );
  }
  const granted = validateDisclosureConsent(consent.granted);
  return { subject: granted.subject, fields: granted.scope.fields };
}

/**
 * THE match projection (pure, deterministic): fresh eligible opportunities
 * in the criteria's families (and, when scoped, asset symbols), each
 * disclosed through the six-field privacy audit, deterministically ordered
 * by opportunityId. Never a command, never an authorization — the result
 * is advisory discovery evidence only.
 */
export function matchOpportunities(input: MatchInput, at: number): MatchResult {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError("the match evaluation instant `at` must be a non-negative integer (ms; no ambient clock)");
  }
  if (input === null || typeof input !== "object") {
    throw new MatchError("matchOpportunities requires an input { criteria, opportunities, consent }");
  }
  const criteria = validateOpportunityMatchCriteria(input.criteria);
  const consentView = gateConsent(input.consent);
  // The fail-closed scope law: the projection discloses EXACTLY the six
  // audit fields — the consented scope must cover every one of them.
  for (const field of MATCH_PRIVACY_AUDIT_FIELDS) {
    if (!consentView.fields.includes(field)) {
      throw new MatchError(
        `the consented disclosure scope does not cover the audit field '${field}' — minimum disclosure is fail closed (consent must cover all six audit fields for subject '${consentView.subject}')`,
      );
    }
  }
  if (!Array.isArray(input.opportunities)) {
    throw new MatchError("opportunities must be an array (an empty set is an honest no-match)");
  }
  const families = new Set<OpportunityFamily>(criteria.families);
  const currencies =
    criteria.currencies === undefined ? null : new Set<string>(criteria.currencies);
  const matched: MatchedOpportunity[] = [];
  for (const opportunity of input.opportunities) {
    // The observation law: STALE evidence never matches (never attractive).
    if (isOpportunityStale(opportunity, at)) {
      continue;
    }
    if (!evaluateDiscoveryPolicy(opportunity, at).eligible) {
      continue;
    }
    if (!families.has(opportunity.family)) {
      continue;
    }
    if (currencies !== null) {
      const symbol = currencyOfCapitalRequirement(opportunity);
      if (symbol === null || !currencies.has(symbol)) {
        continue;
      }
    }
    matched.push({ opportunityId: opportunity.opportunityId, audit: privacyAuditOf(opportunity) });
  }
  matched.sort((a, b) => (a.opportunityId < b.opportunityId ? -1 : a.opportunityId > b.opportunityId ? 1 : 0));
  return Object.freeze({
    matched: Object.freeze(matched.map((entry) => Object.freeze({ ...entry }))),
    evaluatedAt: at,
  });
}

/** Structural purity helper for consumers/tests: no dispatch-shaped key at any name. */
export function matchResultIsStructurallyPure(result: unknown): boolean {
  const forbidden = ["action", "command", "dispatch", "execute", "authorize"] as const;
  const seen = new Set<unknown>();
  const scan = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") {
      return true;
    }
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      if ((forbidden as readonly string[]).some((word) => normalized.includes(word))) {
        return false;
      }
      if (!scan((value as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  };
  return scan(result);
}
