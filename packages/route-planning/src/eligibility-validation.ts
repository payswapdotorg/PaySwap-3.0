/**
 * @payswap/route-planning — the fail-closed input validation + the §5
 * evidence projection for the INV-30 node-route eligibility gates (P27-D,
 * ADR-0020 D2/D3/D6; split from eligibility-gates.ts per the 400-line
 * file law).
 *
 * The classification arrives as DATA (D3 — derived from the intent's real
 * facts by the accepting authority, reviewable, never model-chosen); this
 * module validates its pinned shape and projects the §5 evidence-burden
 * verdict for any governed class. EMPTY evidence is HONEST: the class is
 * then simply not satisfiable — a typed exclusion, never a fabricated
 * approval (INV-13).
 */

import { RoutePlanningValidationError } from "./errors.ts";
import { deepFreeze } from "./canonical.ts";
import type {
  PinnedClassificationEligibility,
  PinnedTransactionClass,
  PinnedTransactionClassification,
} from "./pins/node-network.ts";
import {
  PINNED_CLASS_REQUIREMENTS,
  PINNED_TRANSACTION_CLASSES,
} from "./pins/node-network.ts";
import type { NodeRouteLegDeclaration } from "./eligibility-gates.ts";

/** True iff the value is a member of the closed class vocabulary. */
export function isPinnedTransactionClass(value: unknown): value is PinnedTransactionClass {
  return (
    typeof value === "string" && (PINNED_TRANSACTION_CLASSES as readonly unknown[]).includes(value)
  );
}

/** Fail-closed structural validation of the pinned intent classification. */
export function validateIntentClassification(candidate: unknown): PinnedTransactionClassification {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new RoutePlanningValidationError(
      "the intent classification must be an object (the pinned three-plane record, ADR-0020 D3)",
    );
  }
  const record = candidate as Record<string, unknown>;
  if (
    typeof record["classificationVersion"] !== "string" ||
    record["classificationVersion"].length === 0
  ) {
    throw new RoutePlanningValidationError(
      "the intent classification must carry its classificationVersion",
    );
  }
  if (!isPinnedTransactionClass(record["transactionClass"])) {
    throw new RoutePlanningValidationError(
      "the intent classification's transactionClass must be a member of the closed class vocabulary (derived from real facts, never invented)",
    );
  }
  const derivedFrom = record["derivedFrom"];
  const derivedIntentRef =
    typeof derivedFrom === "object" && derivedFrom !== null
      ? (derivedFrom as Record<string, unknown>)["intentRef"]
      : undefined;
  const derivedFactsDigest =
    typeof derivedFrom === "object" && derivedFrom !== null
      ? (derivedFrom as Record<string, unknown>)["factsDigest"]
      : undefined;
  if (
    typeof derivedIntentRef !== "string" ||
    derivedIntentRef.length === 0 ||
    typeof derivedFactsDigest !== "string" ||
    derivedFactsDigest.length === 0
  ) {
    throw new RoutePlanningValidationError(
      "the intent classification must carry derivedFrom (intentRef + factsDigest — reviewable, D3)",
    );
  }
  if (record["classifiedBy"] !== "OPERATOR_REVIEW" && record["classifiedBy"] !== "DECLARED_FACTS") {
    throw new RoutePlanningValidationError(
      "the intent classification's classifiedBy must be OPERATOR_REVIEW or DECLARED_FACTS (never model-chosen)",
    );
  }
  const evidence = record["evidence"];
  if (typeof evidence !== "object" || evidence === null) {
    throw new RoutePlanningValidationError(
      "the intent classification must carry its evidence reference record",
    );
  }
  for (const field of [
    "purposeEvidenceRefs",
    "licenceRefs",
    "providerProductApprovalRefs",
    "custodyProgrammeRefs",
  ] as const) {
    const refs = (evidence as Record<string, unknown>)[field];
    if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string" || ref.length === 0)) {
      throw new RoutePlanningValidationError(
        `the intent classification's evidence.${field} must be an array of non-empty reference strings (EMPTY is honest absence)`,
      );
    }
  }
  return candidate as PinnedTransactionClassification;
}

/** Fail-closed validation of the per-leg declarations (unique ids, typed classes/operators). */
export function validateLegDeclarations(candidate: unknown): readonly NodeRouteLegDeclaration[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new RoutePlanningValidationError(
      "the route must carry at least one leg declaration (an empty route has no eligibility)",
    );
  }
  const legs: NodeRouteLegDeclaration[] = [];
  const seen = new Set<string>();
  for (const entry of candidate) {
    if (typeof entry !== "object" || entry === null) {
      throw new RoutePlanningValidationError("every leg declaration must be an object");
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["legId"] !== "string" || record["legId"].length === 0) {
      throw new RoutePlanningValidationError("every leg declaration must carry a non-empty legId");
    }
    if (seen.has(record["legId"])) {
      throw new RoutePlanningValidationError(
        `duplicate legId '${record["legId"]}' — the leg identity is unique`,
      );
    }
    seen.add(record["legId"]);
    if (!isPinnedTransactionClass(record["declaredClass"])) {
      throw new RoutePlanningValidationError(
        `leg '${record["legId"]}' must carry a declaredClass within the closed class vocabulary`,
      );
    }
    const operatingNodeId = record["operatingNodeId"];
    if (
      operatingNodeId !== null &&
      (typeof operatingNodeId !== "string" || operatingNodeId.length === 0)
    ) {
      throw new RoutePlanningValidationError(
        `leg '${record["legId"]}' must carry its operatingNodeId (a non-empty node id, or null for the local instance)`,
      );
    }
    legs.push(
      deepFreeze({
        legId: record["legId"],
        declaredClass: record["declaredClass"],
        operatingNodeId: operatingNodeId ?? null,
      }),
    );
  }
  return Object.freeze(legs);
}

/** Deduplicated typed validation of the touched-country list. */
export function validateTouchedCountries(candidate: unknown): readonly string[] {
  if (!Array.isArray(candidate)) {
    throw new RoutePlanningValidationError(
      "countries must be an array of the route's touched two-letter codes",
    );
  }
  const countries: string[] = [];
  for (const country of candidate) {
    if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) {
      throw new RoutePlanningValidationError(
        `country '${String(country)}' must be a two-letter code (the touched-country list is typed)`,
      );
    }
    if (!countries.includes(country)) {
      countries.push(country);
    }
  }
  return Object.freeze(countries);
}

/**
 * Project the §5 evidence-burden verdict for a GOVERNED class from the
 * intent classification's evidence record (the honest DATA verdict — a
 * typed exclusion, never a throw; the route-level evaluation in
 * eligibility-gates.ts remains the enforcement path).
 */
export function classificationEligibilityOfGoverned(
  governingClass: PinnedTransactionClass,
  intentClassification: PinnedTransactionClassification,
): PinnedClassificationEligibility {
  const validated = validateIntentClassification(intentClassification);
  if (governingClass === "OTHER_UNCLEAR") {
    return deepFreeze({
      verdict: "REFUSED_UNCLASSIFIABLE",
      transactionClass: governingClass,
      missing: Object.freeze([
        {
          requirement: "CLASSIFICATION_FACTS",
          message:
            "the governing class is OTHER_UNCLEAR — nothing routes until the class is derived from reviewable facts (D3)",
        },
      ]),
    });
  }
  const requirements = PINNED_CLASS_REQUIREMENTS[governingClass];
  const missing: { requirement: string; message: string }[] = [];
  if (requirements.purposeEvidenceRequired && validated.evidence.purposeEvidenceRefs.length === 0) {
    missing.push({
      requirement: "PURPOSE_EVIDENCE",
      message: "the governing class requires purpose/transaction evidence (invoice, order, contract)",
    });
  }
  if (requirements.licenceEvidenceRequired && validated.evidence.licenceRefs.length === 0) {
    missing.push({
      requirement: "LICENCE_EVIDENCE",
      message: "the governing class is regulated activity — licence evidence is required (§5)",
    });
  }
  if (
    requirements.providerProductApprovalRequired &&
    validated.evidence.providerProductApprovalRefs.length === 0
  ) {
    missing.push({
      requirement: "PROVIDER_PRODUCT_APPROVAL",
      message: "the governing class requires the provider's explicit product approval (§5)",
    });
  }
  if (
    requirements.custodyProgrammeEvidenceRequired &&
    validated.evidence.custodyProgrammeRefs.length === 0
  ) {
    missing.push({
      requirement: "CUSTODY_PROGRAMME_EVIDENCE",
      message: "the governing class involves custody/transmission — D8 programme evidence is required",
    });
  }
  return deepFreeze({
    verdict: missing.length === 0 ? "ELIGIBLE" : "REFUSED_CLASS_EVIDENCE_MISSING",
    transactionClass: governingClass,
    missing: Object.freeze(missing),
  });
}
