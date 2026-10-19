/**
 * @payswap/opportunities — record-validation sections (P6-W2, lane r4-w2;
 * the assessment/lineage/policy sections of the old model.ts record
 * validator, split out under the file law).
 *
 * Each collector returns the FULL error list for its section (never just
 * the first): assessment fields (exit path, lock-up, risks, max-loss
 * bound), the versioned evidence lineage (supporting observations,
 * primary-observation + freshness coherence), and the policy/lineage-ref
 * fields. The main validator (./model-validation.ts) aggregates them.
 */

import { InvalidOpportunityError } from "./errors.ts";
import { validateEvidenceFreshness } from "./freshness.ts";
import { validateExactRational } from "./rational.ts";
import type { ExactRational } from "./rational.ts";
import { validateKnowable } from "./knowable.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { isExitPathStatus, isRiskLevel } from "./model.ts";
import type {
  ExitPathAssessment,
  LockUp,
  SupportingObservation,
} from "./model.ts";
import { PINNED_INTENT_ARCHETYPES } from "./pins/economic.ts";
import {
  isNonEmptyString,
  validateArbitrageLeg,
  validateSupportingObservation,
} from "./model-fields.ts";

type Record0 = Readonly<Record<string, unknown>>;

/** Pushes a required-non-empty error or the vocabulary-scan error for one surface. */
function pushVocabularyErrors(
  surface: unknown,
  label: string,
  emptyMessage: string,
  errors: string[],
): void {
  if (!isNonEmptyString(surface)) {
    errors.push(emptyMessage);
    return;
  }
  try {
    assertNoGuaranteeLanguage(surface, label);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

/** The assessment section: exit path, lock-up, both risks, max-loss bound. */
export function collectAssessmentErrors(record: Record0): string[] {
  const errors: string[] = [];
  const exitPath = record.exitPath;
  if (exitPath === null || typeof exitPath !== "object") {
    errors.push("exitPath must be an ExitPathAssessment");
  } else {
    if (!isExitPathStatus((exitPath as ExitPathAssessment).status)) {
      errors.push(
        "exitPath.status must be one of [AVAILABLE, RESTRICTED, UNKNOWN, BLOCKED, SUSPECT_HONEYPOT]",
      );
    }
    pushVocabularyErrors(
      (exitPath as ExitPathAssessment).description,
      "exitPath.description",
      "exitPath.description must be a non-empty string",
      errors,
    );
    const constraints = (exitPath as ExitPathAssessment).constraints;
    if (!Array.isArray(constraints)) {
      errors.push("exitPath.constraints must be an array");
    } else {
      for (const constraint of constraints) {
        if (!isNonEmptyString(constraint)) {
          errors.push("exitPath.constraints entries must be non-empty strings");
          break;
        }
        pushVocabularyErrors(
          constraint,
          "exitPath.constraints entry",
          "exitPath.constraints entry must be a non-empty string",
          errors,
        );
      }
    }
  }

  const lockUp = record.lockUp;
  if (lockUp === null || typeof lockUp !== "object") {
    errors.push("lockUp must be a LockUp");
  } else {
    if (typeof (lockUp as LockUp).locked !== "boolean") {
      errors.push("lockUp.locked must be a boolean");
    }
    const duration = (lockUp as LockUp).durationMs;
    if (
      duration !== null &&
      (typeof duration !== "number" ||
        !Number.isSafeInteger(duration) ||
        duration < 0)
    ) {
      errors.push(
        "lockUp.durationMs must be a non-negative integer (ms) or null (UNKNOWN)",
      );
    }
    if (!Array.isArray((lockUp as LockUp).unlockConditions)) {
      errors.push("lockUp.unlockConditions must be an array of strings");
    }
  }

  for (const riskLabel of ["smartContractRisk", "oracleBridgeRisk"] as const) {
    const risk = record[riskLabel];
    if (risk === null || typeof risk !== "object") {
      errors.push(`${riskLabel} must be a RiskRating`);
      continue;
    }
    if (!isRiskLevel((risk as { level: unknown }).level)) {
      errors.push(
        `${riskLabel}.level must be one of [LOW, MODERATE, HIGH, UNKNOWN]`,
      );
    }
    const audited = (risk as { audited: unknown }).audited;
    if (audited !== null && typeof audited !== "boolean") {
      errors.push(`${riskLabel}.audited must be a boolean or null (UNKNOWN)`);
    }
    pushVocabularyErrors(
      (risk as { summary: unknown }).summary,
      `${riskLabel}.summary`,
      `${riskLabel}.summary must be a non-empty string`,
      errors,
    );
  }

  const maxLoss = record.maxLossBound;
  if (maxLoss === null || typeof maxLoss !== "object") {
    errors.push("maxLossBound must be a Knowable (KNOWN or UNKNOWN)");
  } else {
    try {
      validateKnowable(
        maxLoss as unknown as Parameters<typeof validateKnowable>[0],
        "maxLossBound",
        (value) => {
          validateExactRational(
            (value as { fractionOfCapital: ExactRational }).fractionOfCapital,
          );
        },
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

/** The versioned evidence lineage section (the observation law, hard law 1). */
export function collectLineageErrors(record: Record0): string[] {
  const errors: string[] = [];
  const lineage = record.supportingObservations;
  if (!Array.isArray(lineage) || lineage.length === 0) {
    errors.push(
      "supportingObservations is MANDATORY and non-empty: there is no evidence-free opportunity (the versioned lineage law)",
    );
  } else {
    const seenIds = new Set<string>();
    for (const observation of lineage) {
      try {
        validateSupportingObservation(
          observation as SupportingObservation,
          "supportingObservations entry",
        );
        const typed = observation as SupportingObservation;
        const key = `${typed.observationId}:v${String(typed.version)}`;
        if (seenIds.has(key)) {
          throw new InvalidOpportunityError(
            `supportingObservations carries duplicate observation '${key}' (the lineage is a set of versioned observations, never a repeated one)`,
          );
        }
        seenIds.add(key);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const primary = record.primaryObservation;
    if (primary === null || typeof primary !== "object") {
      errors.push("primaryObservation is MANDATORY (the observation law)");
    } else {
      try {
        validateSupportingObservation(
          primary as SupportingObservation,
          "primaryObservation",
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      const primaryTyped = primary as SupportingObservation;
      const first = lineage[0] as SupportingObservation;
      if (
        first !== undefined &&
        typeof first === "object" &&
        (first.observationId !== primaryTyped.observationId ||
          first.version !== primaryTyped.version)
      ) {
        errors.push(
          "the primary observation must be element zero of the supporting-observation lineage (identity AND version)",
        );
      }
    }
  }

  // evidenceFreshness coherence: must be the primary observation's window.
  if (
    record.evidenceFreshness === null ||
    typeof record.evidenceFreshness !== "object"
  ) {
    errors.push("evidenceFreshness is MANDATORY (the observation law)");
  } else {
    try {
      const freshness = validateEvidenceFreshness(
        record.evidenceFreshness,
        "evidenceFreshness",
      );
      const primary = record.primaryObservation as
        | SupportingObservation
        | undefined;
      if (
        primary !== undefined &&
        primary !== null &&
        typeof primary === "object"
      ) {
        const primaryWindow = validateEvidenceFreshness(
          primary.freshness,
          "primaryObservation.freshness",
        );
        if (
          freshness.asOfMs !== primaryWindow.asOfMs ||
          freshness.maxAgeMs !== primaryWindow.maxAgeMs
        ) {
          throw new InvalidOpportunityError(
            "evidenceFreshness must equal the primary observation's freshness window (the coherence law)",
          );
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

/** The policy + advisory-lineage + family-evidence section. */
export function collectPolicyErrors(record: Record0): string[] {
  const errors: string[] = [];
  const policy = record.policyEligibility;
  if (policy === null || typeof policy !== "object") {
    errors.push("policyEligibility must be a PolicyEligibility");
  } else {
    if (typeof (policy as { eligible: unknown }).eligible !== "boolean") {
      errors.push("policyEligibility.eligible must be a boolean");
    }
    if ((policy as { decidedBy: unknown }).decidedBy !== "discovery-policy") {
      errors.push("policyEligibility.decidedBy must be 'discovery-policy'");
    }
    const reasons = (policy as { reasons: unknown }).reasons;
    if (!Array.isArray(reasons)) {
      errors.push("policyEligibility.reasons must be an array of strings");
    } else if (
      (policy as { eligible: unknown }).eligible === false &&
      reasons.length === 0
    ) {
      errors.push(
        "policyEligibility: an ineligible opportunity carries at least one machine-readable reason (never guessed)",
      );
    }
  }

  if (record.servesIntentArchetype !== undefined) {
    const archetype = record.servesIntentArchetype as unknown;
    if (
      typeof archetype !== "string" ||
      !(PINNED_INTENT_ARCHETYPES as readonly string[]).includes(archetype)
    ) {
      errors.push(
        `servesIntentArchetype, when present, must be one of [${PINNED_INTENT_ARCHETYPES.join(", ")}] (the pinned economic-lane archetype vocabulary)`,
      );
    }
  }

  if (Array.isArray(record.arbitrageLegs)) {
    for (const leg of record.arbitrageLegs) {
      try {
        validateArbitrageLeg(leg as never);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (
    record.policyApprovalRef !== undefined &&
    !isNonEmptyString(record.policyApprovalRef)
  ) {
    errors.push("policyApprovalRef, when present, must be a non-empty string");
  }
  return errors;
}
