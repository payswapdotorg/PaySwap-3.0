/**
 * @payswap/route-planning — the stage-7 conditional-derivation validation
 * + grounding-evidence projection (P21-C, lane C; ADR-0014 D7/D9), split
 * from ./conditional-stage.ts under the 400-line file law (the
 * ./model-validation.ts discipline in @payswap/opportunities).
 *
 * Fail-closed laws:
 * - the DERIVATION INPUT validation: sides, the corridor-query agreement
 *   between the two snapshots (a side snapshot grounded on a foreign
 *   corridor never composes), the caller-supplied instants (opt-in
 *   BEFORE publication, expiry strictly after), the bounded disclosure
 *   purpose, the corridor rail identity and the stage-5 evaluation
 *   surface — every violation is the typed ConditionalDerivationError,
 *   never a repair, never a default;
 * - the GROUNDED-FACT projection: the corridor's VERBATIM typed
 *   exclusions (both sides, canonical order);
 * - the GROUNDING-EVIDENCE projection: every excluded rail snapshot
 *   record's verbatim observation grounding (instance, version,
 *   observed-at, provider, implementation) + its typed exclusion facts —
 *   the derived ids NAME those exact facts, never references to
 *   unobserved things (INV-07);
 * - the PORT-RESULT validation: a lying port (a foreign party change, a
 *   wrong tier, a wrong kind, a wrong expiry, a non-OPEN state, an empty
 *   evidence chain) never composes.
 */

import { ConditionalDerivationError } from "./conditional-stage.ts";
import { deepFreeze, isNonEmptyString, requireObject } from "./canonical.ts";
import type { EligibleRailSnapshot, EligibleRailSnapshotRecord } from "./rail-snapshot.ts";
import type { HardGateEvaluation } from "./hard-gates.ts";
import {
  PINNED_CONDITIONAL_KIND,
  PINNED_CONDITIONAL_PARTIES,
  PINNED_CONDITIONAL_PARTY_CHANGES,
  PINNED_DISCOVERY_TIER,
  PINNED_OPPORTUNITY_RAIL_KINDS,
} from "./pins/opportunities.ts";
import type {
  PinnedConditionalOpportunity,
  PinnedOfferOptIn,
  PinnedOpportunityRailKind,
  PinnedRequiredPartyChange,
  PinnedSupportingObservation,
} from "./pins/opportunities.ts";
import type { ConditionalConstructionRequest, ConditionalDerivationInput, GroundedExclusionFact } from "./conditional-stage.ts";

/** The canonical rail-key pattern (the opportunities pin's law, mirrored). */
export const CONDITIONAL_RAIL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

/** A non-negative integer millisecond instant (caller-supplied, no ambient clock). */
export function requireConditionalInstant(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ConditionalDerivationError(`${subject} must be a non-negative integer millisecond instant (caller-supplied, no ambient clock)`);
  }
  return value;
}

/** The derivation input's sender snapshot (validated: side SENDER). */
export function validatedSenderSnapshot(input: ConditionalDerivationInput): EligibleRailSnapshot {
  const sender = input.senderSnapshot;
  if (sender?.side !== "SENDER") {
    throw new ConditionalDerivationError("the derivation requires the SENDER snapshot first and the RECIPIENT snapshot second");
  }
  return sender;
}

/** The derivation input's recipient snapshot (validated: side RECIPIENT + the corridor agreement). */
export function validatedRecipientSnapshot(input: ConditionalDerivationInput, sender: EligibleRailSnapshot): EligibleRailSnapshot {
  const recipient = input.recipientSnapshot;
  if (recipient?.side !== "RECIPIENT") {
    throw new ConditionalDerivationError("the derivation requires the SENDER snapshot first and the RECIPIENT snapshot second");
  }
  const corridorQueriesMatch =
    sender.query.sourceCountry === recipient.query.sourceCountry &&
    sender.query.destinationCountry === recipient.query.destinationCountry &&
    sender.query.sourceCurrency === recipient.query.sourceCurrency &&
    sender.query.destinationCurrency === recipient.query.destinationCurrency &&
    sender.query.asOf === recipient.query.asOf;
  if (!corridorQueriesMatch) {
    throw new ConditionalDerivationError(
      "the sender and recipient snapshots were grounded on different corridor queries — a side snapshot never composes onto a foreign corridor",
    );
  }
  return recipient;
}

/** The derivation instant (validated) + the strictly-later expiry (validated). */
export function validatedInstants(input: ConditionalDerivationInput): { at: number; expiresAt: number } {
  const at = requireConditionalInstant(input.at, "the derivation instant `at`");
  if (typeof input.expiresAt !== "number" || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= at) {
    throw new ConditionalDerivationError("expiresAt must be an integer strictly after the derivation instant (an expired-on-arrival conditional is malformed)");
  }
  return { at, expiresAt: input.expiresAt };
}

/** The opt-in (validated: non-empty participant, optedInAt PRECEDES the derivation instant). */
export function validatedOptIn(input: ConditionalDerivationInput, at: number): PinnedOfferOptIn {
  const optIn = requireObject(input.optIn, "the opt-in");
  if (!isNonEmptyString(optIn["participantRef"]) || requireConditionalInstant(optIn["optedInAt"], "optIn.optedInAt") > at) {
    throw new ConditionalDerivationError("the opt-in must carry a non-empty participantRef and an optedInAt that PRECEDES the derivation instant (opt-in before publication)");
  }
  return optIn as unknown as PinnedOfferOptIn;
}

/** The bounded disclosure purpose (validated). */
export function validatedDisclosurePurpose(input: ConditionalDerivationInput): string {
  const purpose = input.disclosurePurpose;
  if (typeof purpose !== "string" || purpose.length === 0 || purpose.length > 200) {
    throw new ConditionalDerivationError("the disclosure purpose must be a non-empty string of at most 200 characters");
  }
  return purpose;
}

/** The corridor rail identity (validated: closed-vocabulary railKind + canonical railKey). */
export function validatedCorridorRail(input: ConditionalDerivationInput): { railKind: PinnedOpportunityRailKind; railKey: string } {
  const corridorRail = requireObject(input.corridorRail, "the corridor rail identity");
  if (
    !(PINNED_OPPORTUNITY_RAIL_KINDS as readonly string[]).includes(String(corridorRail["railKind"])) ||
    typeof corridorRail["railKey"] !== "string" ||
    !CONDITIONAL_RAIL_KEY_PATTERN.test(corridorRail["railKey"])
  ) {
    throw new ConditionalDerivationError("the corridor rail identity must carry a closed-vocabulary railKind and a canonical `${namespace}:${network}` railKey");
  }
  return { railKind: corridorRail["railKind"] as PinnedOpportunityRailKind, railKey: corridorRail["railKey"] as string };
}

/** The stage-5 hard-gate evaluation surface (validated: rankEligible + gated + digest). */
export function validatedHardGates(input: ConditionalDerivationInput): HardGateEvaluation {
  const hardGates = input.hardGates;
  if (!Array.isArray(hardGates?.rankEligible) || !Array.isArray(hardGates?.gated) || typeof hardGates?.hardGateDigest !== "string") {
    throw new ConditionalDerivationError("the stage-5 hard-gate evaluation must carry rankEligible, gated and hardGateDigest (the derivation consumes the stage-5 results)");
  }
  return hardGates;
}

/** The corridor's VERBATIM typed exclusions as grounded facts (both sides, canonical order). */
export function groundedFactsOf(side: "SENDER" | "RECIPIENT", snapshot: EligibleRailSnapshot): GroundedExclusionFact[] {
  const facts: GroundedExclusionFact[] = [];
  for (const rail of [...snapshot.rails].sort((a, b) => (a.routeId < b.routeId ? -1 : 1))) {
    for (const exclusion of rail.exclusions) {
      const detail = exclusion.detail as Readonly<Record<string, unknown>> | undefined;
      const fundingMethod = typeof detail?.["fundingMethod"] === "string" ? detail["fundingMethod"] : undefined;
      facts.push(
        deepFreeze({
          side,
          routeId: rail.routeId,
          code: exclusion.code,
          message: exclusion.message,
          ...(fundingMethod !== undefined ? { fundingMethod } : {}),
        }),
      );
    }
  }
  return facts;
}

/**
 * The grounding evidence for one rail snapshot record: a PROJECTION of the
 * record's verbatim observation grounding (instance, version, observed-at,
 * provider, implementation) + its typed exclusion facts. The derived ids
 * NAME those exact facts — nothing is referenced that was not observed.
 */
export function groundingObservationOf(side: "SENDER" | "RECIPIENT", rail: EligibleRailSnapshotRecord): PinnedSupportingObservation {
  const asOfMs = Date.parse(rail.observedAt);
  if (!Number.isSafeInteger(asOfMs) || asOfMs < 0) {
    throw new ConditionalDerivationError(
      `the rail snapshot record '${rail.routeId}' carries an unparseable observedAt stamp '${rail.observedAt}' — the grounding evidence never guesses`,
    );
  }
  return deepFreeze({
    observationId: `rail-snapshot:${side}:${rail.routeId}:v${String(rail.observationVersion)}`,
    version: rail.observationVersion,
    venueId: `provider:${rail.lineage.providerName}`,
    adapterId: `implementation:${rail.lineage.providerImplementationId}:${rail.lineage.implementationVersion}`,
    observerId: `corridor-projection:${rail.lineage.connectedInstanceId}`,
    freshness: deepFreeze({ asOfMs, maxAgeMs: rail.freshnessPolicy.maxAgeSeconds * 1000 }),
    evidenceRefs: Object.freeze(
      rail.exclusions.map((exclusion) => `corridor-exclusion:${rail.routeId}:${exclusion.code}`),
    ),
  });
}

/** Fail-closed validation of the port's returned conditional (a lying port never composes). */
export function validatePortResult(
  result: unknown,
  request: ConditionalConstructionRequest,
  seen: Set<string>,
): PinnedConditionalOpportunity {
  const record = requireObject(result, "a conditional construction result");
  const errors: string[] = [];
  if (record["conditionalKind"] !== PINNED_CONDITIONAL_KIND) {
    errors.push(`conditionalKind must be '${PINNED_CONDITIONAL_KIND}'`);
  }
  if (record["discoveryTier"] !== PINNED_DISCOVERY_TIER) {
    errors.push(`discoveryTier must be '${PINNED_DISCOVERY_TIER}' (the structural never-authorization tier)`);
  }
  if (record["state"] !== "OPEN") {
    errors.push("a freshly derived conditional must be OPEN");
  }
  if (!isNonEmptyString(record["conditionalId"])) {
    errors.push("conditionalId must be a non-empty string");
  } else if (seen.has(record["conditionalId"])) {
    errors.push(`duplicate conditionalId '${record["conditionalId"]}'`);
  }
  const changes = record["requiredPartyChanges"];
  if (!Array.isArray(changes) || changes.length === 0) {
    errors.push("requiredPartyChanges must be a non-empty array");
  } else {
    for (const change of changes) {
      const entry = change as Partial<PinnedRequiredPartyChange>;
      if (
        !(PINNED_CONDITIONAL_PARTIES as readonly string[]).includes(String(entry.party)) ||
        !(PINNED_CONDITIONAL_PARTY_CHANGES as readonly string[]).includes(String(entry.change))
      ) {
        errors.push("requiredPartyChanges entries must name a closed-vocabulary party and change");
      }
    }
  }
  if (!Array.isArray(record["evidence"]) || record["evidence"].length === 0) {
    errors.push("evidence must be a non-empty grounding chain (there is no evidence-free conditional)");
  }
  if (!Array.isArray(record["assumptions"]) || record["assumptions"].length === 0) {
    errors.push("assumptions must be a non-empty array");
  }
  if (record["expiresAt"] !== request.expiresAt || record["publishedAt"] !== request.at) {
    errors.push("the derived conditional must carry the requested publication and expiry instants");
  }
  if (errors.length > 0) {
    throw new ConditionalDerivationError(
      `the conditional construction port returned an invalid conditional — a lying port never composes: ${errors.join("; ")}`,
    );
  }
  seen.add(record["conditionalId"] as string);
  return record as unknown as PinnedConditionalOpportunity;
}
