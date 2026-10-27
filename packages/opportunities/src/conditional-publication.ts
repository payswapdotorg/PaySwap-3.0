/**
 * @payswap/opportunities — the CONDITIONAL opportunity CONSTRUCTOR (P21-C,
 * lane C; ADR-0014 D9): `publishConditionalOpportunity` and its fail-closed
 * aggregate validation, split from ./conditional.ts under the 400-line file
 * law (the ./model-validation.ts split discipline). The constructor
 * re-validates the source opportunity through the FULL model validator,
 * composes the party-change precondition, scans every human surface, and
 * secret-scans the built record — there is no conditional without an
 * evidenced opportunity, and no publication without the opt-in.
 */

import { ConditionalOpportunityError } from "./conditional.ts";
import {
  CONDITIONAL_KIND,
  conditionalEventId,
  conditionalOpportunityId,
  isConditionalParty,
  isConditionalPartyChange,
  MAX_CONDITIONAL_ASSUMPTION_LENGTH,
} from "./conditional.ts";
import type {
  ConditionalOpportunity,
  PlatformPrerequisite,
  RequiredPartyChange,
} from "./conditional.ts";
import { DISCOVERY_TIER } from "./discovery-tier.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { assertNoSecretMaterial } from "./secret-free.ts";
import { validateConsentScope } from "./consent.ts";
import type { DisclosureScope } from "./consent.ts";
import type { OfferOptIn } from "./offer-lifecycle.ts";
import { validateFinancialOpportunity } from "./model-validation.ts";
import { validateSupportingObservation } from "./model-fields.ts";
import type { FinancialOpportunity, SupportingObservation } from "./model.ts";

// ---------------------------------------------------------------------------
// Validation (fail-closed, aggregate)
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number, label: string): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`${label} must be a non-negative integer (ms; no ambient clock)`);
  }
}

function validateRequiredPartyChanges(
  candidate: unknown,
  errors: string[],
): readonly RequiredPartyChange[] | null {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    errors.push("requiredPartyChanges must be a non-empty array (a conditional names at least one required party change)");
    return null;
  }
  const changes: RequiredPartyChange[] = [];
  const seen = new Set<string>();
  for (const entry of candidate) {
    if (entry === null || typeof entry !== "object") {
      errors.push("requiredPartyChanges entries must be { party, change } objects");
      return null;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    if (!isConditionalParty(record["party"]) || !isConditionalPartyChange(record["change"])) {
      errors.push(
        `requiredPartyChange '${String(record["party"])}:${String(record["change"])}' is not a member of the closed party/change vocabulary`,
      );
      return null;
    }
    const key = `${String(record["party"])}:${String(record["change"])}`;
    if (seen.has(key)) {
      errors.push(`requiredPartyChanges carries duplicate '${key}' (a party change is named once)`);
      return null;
    }
    seen.add(key);
    changes.push({ party: record["party"], change: record["change"] });
  }
  return changes;
}

function validateAssumptions(candidate: unknown, errors: string[]): readonly string[] | null {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    errors.push("assumptions must be a non-empty array (what must hold for the conditional route to exist)");
    return null;
  }
  const seen = new Set<string>();
  for (const assumption of candidate) {
    if (!isNonEmptyString(assumption)) {
      errors.push("assumptions entries must be non-empty strings");
      return null;
    }
    if (assumption.length > MAX_CONDITIONAL_ASSUMPTION_LENGTH) {
      errors.push(`assumption exceeds the ${String(MAX_CONDITIONAL_ASSUMPTION_LENGTH)}-character bound`);
      return null;
    }
    if (seen.has(assumption)) {
      errors.push("assumptions must be unique (an assumption is stated once)");
      return null;
    }
    seen.add(assumption);
  }
  return [...candidate];
}

function validatePlatformPrerequisites(
  candidate: unknown,
  errors: string[],
): readonly PlatformPrerequisite[] | null {
  if (candidate === undefined) {
    return [];
  }
  if (!Array.isArray(candidate)) {
    errors.push("platformPrerequisites, when present, must be an array (possibly empty — a party change may suffice)");
    return null;
  }
  const prerequisites: PlatformPrerequisite[] = [];
  for (const entry of candidate) {
    if (entry === null || typeof entry !== "object") {
      errors.push("platformPrerequisites entries must be { gapId, note } objects");
      return null;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    if (!isNonEmptyString(record["gapId"]) || !isNonEmptyString(record["note"])) {
      errors.push("every platform prerequisite carries a non-empty gapId and note (the platform gap is named, never hidden)");
      return null;
    }
    prerequisites.push({ gapId: record["gapId"], note: record["note"] });
  }
  return prerequisites;
}

function validateGroundingEvidence(
  candidate: unknown,
  errors: string[],
): readonly SupportingObservation[] | null {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    errors.push("groundingEvidence is MANDATORY and non-empty: there is no evidence-free conditional (the lineage law)");
    return null;
  }
  const seen = new Set<string>();
  for (let index = 0; index < candidate.length; index += 1) {
    const observation = candidate[index] as SupportingObservation;
    try {
      validateSupportingObservation(observation, `groundingEvidence[${String(index)}]`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    }
    const key = `${observation.observationId}:v${String(observation.version)}`;
    if (seen.has(key)) {
      errors.push(`groundingEvidence carries duplicate observation '${key}' (the lineage is a set of versioned observations)`);
      return null;
    }
    seen.add(key);
  }
  return [...candidate];
}

function validateOptIn(optIn: unknown, at: number, errors: string[]): OfferOptIn | null {
  if (optIn === null || typeof optIn !== "object") {
    errors.push("a conditional requires an explicit optIn { participantRef, optedInAt }");
    return null;
  }
  const candidate = optIn as Partial<OfferOptIn>;
  if (!isNonEmptyString(candidate.participantRef)) {
    errors.push("optIn.participantRef must be a non-empty string (a conditional exists only FOR an explicitly opted-in participant)");
    return null;
  }
  if (typeof candidate.optedInAt !== "number" || !Number.isSafeInteger(candidate.optedInAt) || candidate.optedInAt < 0) {
    errors.push("optIn.optedInAt must be a non-negative integer (the caller-supplied opt-in instant)");
    return null;
  }
  if (candidate.optedInAt > at) {
    errors.push(`optIn.optedInAt (${String(candidate.optedInAt)}) may not follow the publication instant (${String(at)}) — the explicit opt-in PRECEDES the conditional`);
    return null;
  }
  return { participantRef: candidate.participantRef, optedInAt: candidate.optedInAt };
}

/** Input to `publishConditionalOpportunity` (the caller supplies the expiry). */
export interface ConditionalPublicationInput {
  readonly optIn: OfferOptIn;
  /** Strictly after the publication instant (expired-on-arrival is malformed). */
  readonly expiresAt: number;
  readonly requiredPartyChanges: readonly RequiredPartyChange[];
  readonly assumptions: readonly string[];
  /** OPTIONAL: empty when the party change alone makes the corridor real. */
  readonly platformPrerequisites?: readonly PlatformPrerequisite[];
  /** The grounding-evidence chain (which exclusion facts / observations ground the conditional). */
  readonly groundingEvidence: readonly SupportingObservation[];
  /** The disclosure controls (validated through the consent law). */
  readonly disclosureScope: DisclosureScope;
}

/**
 * THE conditional constructor: derives one conditional opportunity from a
 * VALIDATED FinancialOpportunity (the FULL model validator runs first —
 * there is no conditional without an evidenced opportunity) composed with
 * the party-change precondition, the explicit assumptions, the honest
 * platform-prerequisite notes, the grounding-evidence chain, the
 * disclosure scope and the opt-in. Deterministic: identical inputs and
 * instant yield byte-identical conditionals.
 */
export function publishConditionalOpportunity(
  opportunity: FinancialOpportunity,
  input: ConditionalPublicationInput,
  at: number,
): ConditionalOpportunity {
  validateInstant(at, "the conditional publication instant `at`");
  let validated: FinancialOpportunity;
  try {
    validated = validateFinancialOpportunity(opportunity);
  } catch (error) {
    throw new ConditionalOpportunityError(
      `the underlying opportunity failed validation — a conditional derives only from an evidenced opportunity: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (input === null || typeof input !== "object") {
    throw new ConditionalOpportunityError("a conditional publication requires an input { optIn, expiresAt, requiredPartyChanges, assumptions, groundingEvidence, disclosureScope }");
  }
  const errors: string[] = [];
  const requiredPartyChanges = validateRequiredPartyChanges(input.requiredPartyChanges, errors);
  const assumptions = validateAssumptions(input.assumptions, errors);
  const platformPrerequisites = validatePlatformPrerequisites(input.platformPrerequisites, errors);
  const groundingEvidence = validateGroundingEvidence(input.groundingEvidence, errors);
  const optIn = validateOptIn(input.optIn, at, errors);
  if (typeof input.expiresAt !== "number" || !Number.isSafeInteger(input.expiresAt)) {
    errors.push("expiresAt must be an integer (the caller-supplied expiry instant)");
  } else if (input.expiresAt <= at) {
    errors.push(`expiresAt (${String(input.expiresAt)}) must be strictly after the publication instant (${String(at)}) — an expired-on-arrival conditional is malformed`);
  }
  let disclosureScope: DisclosureScope | null = null;
  try {
    disclosureScope = validateConsentScope(input.disclosureScope);
  } catch (error) {
    // The consent law's DIRECT typed path (GuaranteeLanguageError on the
    // purpose) rethrows unchanged; structural violations aggregate here.
    if (error instanceof Error && error.name === "GuaranteeLanguageError") {
      throw error;
    }
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (errors.length > 0) {
    throw new ConditionalOpportunityError(`Invalid conditional opportunity publication: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const summary = validated.title;
  assertNoGuaranteeLanguage(summary, `conditional '${conditionalOpportunityId(validated.opportunityId, requiredPartyChanges as readonly RequiredPartyChange[])}' summary`);
  for (const assumption of assumptions as readonly string[]) {
    assertNoGuaranteeLanguage(assumption, "conditional assumption");
  }
  for (const prerequisite of platformPrerequisites as readonly PlatformPrerequisite[]) {
    assertNoGuaranteeLanguage(prerequisite.note, `platform prerequisite '${prerequisite.gapId}' note`);
  }
  const evidence = Object.freeze(
    (groundingEvidence as readonly SupportingObservation[]).map((observation) => Object.freeze({ ...observation })),
  );
  const conditionalId = conditionalOpportunityId(
    validated.opportunityId,
    requiredPartyChanges as readonly RequiredPartyChange[],
  );
  const conditional: ConditionalOpportunity = Object.freeze({
    conditionalKind: CONDITIONAL_KIND,
    conditionalId,
    opportunityId: validated.opportunityId,
    family: validated.family,
    railKey: validated.rail.railKey,
    summary,
    requiredPartyChanges: Object.freeze(
      (requiredPartyChanges as readonly RequiredPartyChange[]).map((change) => Object.freeze({ ...change })),
    ),
    assumptions: Object.freeze([...(assumptions as readonly string[])]),
    platformPrerequisites: Object.freeze(
      (platformPrerequisites as readonly PlatformPrerequisite[]).map((prerequisite) => Object.freeze({ ...prerequisite })),
    ),
    evidence,
    evidenceFreshness: (evidence[0] as SupportingObservation).freshness,
    disclosureScope: Object.freeze({
      fields: Object.freeze([...(disclosureScope as DisclosureScope).fields]),
      purpose: (disclosureScope as DisclosureScope).purpose,
    }),
    optIn: Object.freeze({ participantRef: (optIn as OfferOptIn).participantRef, optedInAt: (optIn as OfferOptIn).optedInAt }),
    publishedAt: at,
    expiresAt: input.expiresAt,
    state: "OPEN",
    events: Object.freeze([
      Object.freeze({ eventId: conditionalEventId(conditionalId, 0), kind: "PUBLISHED", recordedAt: at }),
    ]),
    discoveryTier: DISCOVERY_TIER,
  });
  assertNoSecretMaterial(conditional, `conditional '${conditionalId}'`);
  return conditional;
}
