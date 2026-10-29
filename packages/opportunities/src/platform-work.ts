/**
 * @payswap/opportunities — the PLATFORM WORK ITEMS (P23-A, lane A;
 * ADR-0015 D4): the review's "explicit platform/integration work items
 * with evidence" — what PaySwap itself would need to build, each citing
 * the VERBATIM grounded exclusion facts that prove the gap, never a
 * backlog fabrication, never conflated with a party prerequisite (the
 * ADR-0014 D9 labeling law, now first-class).
 *
 * LAWS:
 * - DETERMINISTIC IDENTITY: `platform-work:<gapId>:<digest-of-evidence>`
 *   (the ./canonical.ts digest over the evidence basis — identical facts
 *   yield the identical id, always).
 * - FAIL-CLOSED CONSTRUCTION: only a PLATFORM_WORK catalogue member
 *   constructs; the facts must be non-empty and each carry a code in the
 *   operator's applicable set; the STATE-CONDITIONED gaps (the P21 pair —
 *   empty applicable sets) cite the corridor's operator-applicable
 *   exclusions, because a recheck/wait/intake/revise classification never
 *   proves a platform gap.
 * - ADVISORY ONLY: `advisoryOnly: true`, `permitsExecution: false` and
 *   `status: "OPEN"` are pinned literals; the marker-field scan and the
 *   secret scan gate the built record; the title is vocabulary-scanned.
 */

import { ValidationError } from "./errors.ts";
import { contentDigest, deepFreeze } from "./canonical.ts";
import { OPERATOR_APPLICABLE_EXCLUSION_CODES, repairOperatorById } from "./repair-operators.ts";
import type { RepairOperator } from "./repair-operators.ts";
import type { PlatformGapId } from "./repair-operators.ts";
import type { RepairExclusionFact } from "./repair-facts.ts";
import { isPinnedCorridorExclusionCode } from "./pins/capability.ts";
import { pinnedAssertNotProtocolCommand } from "./pins/agents.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { assertNoSecretMaterial } from "./secret-free.ts";

/** Raised when a platform work item cannot be constructed (fail-closed). */
export class PlatformWorkError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "PlatformWorkError";
  }
}

/** The closed platform-work status vocabulary (frozen; the initial state is the only state this wave). */
export const PLATFORM_WORK_STATUSES = Object.freeze(["OPEN"] as const);
export type PlatformWorkStatus = (typeof PLATFORM_WORK_STATUSES)[number];

/**
 * One platform work item (pure frozen data): the gap, the honest title,
 * the operators that require it, the verbatim evidence basis that proves
 * it, and the pinned advisory literals. There is deliberately no method
 * and no execution-shaped field on this type.
 */
export interface PlatformWorkItem {
  /** Deterministic: `platform-work:<gapId>:<digest-of-evidence>`. */
  readonly workItemId: string;
  readonly gapId: PlatformGapId;
  /** Human-readable, vocabulary-scanned, derived from the operator + the verbatim facts. */
  readonly title: string;
  /** Non-empty; every member a repair-operator catalogue member. */
  readonly requiredByOperatorIds: readonly string[];
  /** Non-empty: the verbatim grounded exclusion facts (code, side, routeId, message) that prove the gap. */
  readonly evidenceBasis: readonly RepairExclusionFact[];
  readonly status: "OPEN";
  readonly advisoryOnly: true;
  readonly permitsExecution: false;
  /** The caller-supplied construction instant (no ambient clock). */
  readonly createdAt: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError("the platform work construction instant `at` must be a non-negative integer (ms; no ambient clock)");
  }
}

/** Fail-closed validation of the evidence basis (each fact a verbatim grounded exclusion). */
function validateEvidenceBasis(
  candidate: unknown,
  errors: string[],
): readonly RepairExclusionFact[] | null {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    errors.push("the evidence basis must be a NON-EMPTY array of grounded exclusion facts — there is no evidence-free platform work item");
    return null;
  }
  const facts: RepairExclusionFact[] = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const entry = candidate[index];
    if (entry === null || typeof entry !== "object") {
      errors.push(`evidenceBasis[${String(index)}] must be a grounded exclusion fact { side, routeId, code, message }`);
      return null;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    if (record["side"] !== "SENDER" && record["side"] !== "RECIPIENT") {
      errors.push(`evidenceBasis[${String(index)}].side must be one of [SENDER, RECIPIENT]`);
      return null;
    }
    if (!isNonEmptyString(record["routeId"])) {
      errors.push(`evidenceBasis[${String(index)}].routeId must be a non-empty string`);
      return null;
    }
    if (!isPinnedCorridorExclusionCode(record["code"])) {
      errors.push(`evidenceBasis[${String(index)}].code '${String(record["code"])}' is not one of the pinned 26 corridor exclusion codes`);
      return null;
    }
    if (!isNonEmptyString(record["message"])) {
      errors.push(`evidenceBasis[${String(index)}].message must be a non-empty string (the verbatim exclusion message)`);
      return null;
    }
    const fundingMethod = record["fundingMethod"];
    if (fundingMethod !== undefined && !isNonEmptyString(fundingMethod)) {
      errors.push(`evidenceBasis[${String(index)}].fundingMethod, when present, must be a non-empty string`);
      return null;
    }
    facts.push({
      side: record["side"],
      routeId: record["routeId"],
      code: record["code"],
      message: record["message"],
      ...(fundingMethod !== undefined ? { fundingMethod } : {}),
    });
  }
  return facts;
}

/**
 * Deterministic work-item identity: `platform-work:<gapId>:<digest>` over
 * the canonical content digest of the evidence basis (identical evidence
 * -> identical id, always).
 */
export function platformWorkItemId(gapId: string, evidence: readonly RepairExclusionFact[]): string {
  return `platform-work:${gapId}:${contentDigest(evidence)}`;
}

/**
 * THE platform-work constructor (deterministic, fail-closed): derives one
 * work item from a PLATFORM_WORK catalogue member and the verbatim
 * exclusion facts that prove its gap. The gap id space is frozen (the
 * catalogue's PLATFORM_WORK operator ids ARE the gap ids); the title is
 * derived from the operator and the facts (codes and route ids, canonical
 * fact order) and vocabulary-scanned; the built record is marker-scanned,
 * secret-scanned and deep-frozen before it is returned.
 */
export function constructPlatformWorkItem(
  operator: RepairOperator,
  facts: readonly RepairExclusionFact[],
  at: number,
): PlatformWorkItem {
  validateInstant(at);
  const errors: string[] = [];
  if (operator === null || typeof operator !== "object") {
    throw new PlatformWorkError("a platform work item derives only from a repair-operator catalogue member (an object)");
  }
  const catalogueMember = repairOperatorById(String((operator as Partial<RepairOperator>).operatorId ?? ""));
  if (catalogueMember === null) {
    throw new PlatformWorkError(
      `operator '${String((operator as Partial<RepairOperator>).operatorId)}' is not a member of the frozen repair-operator catalogue — a platform work item never cites an unknown operator`,
    );
  }
  if (catalogueMember.kind !== "PLATFORM_WORK") {
    throw new PlatformWorkError(
      `operator '${catalogueMember.operatorId}' is kind '${catalogueMember.kind}' — only a PLATFORM_WORK catalogue member derives a platform work item (the party-change repairs compose conditionals; the multi-hop repairs compose hypotheses; neither is platform work)`,
    );
  }
  const gapId = catalogueMember.platformGap;
  if (gapId === undefined) {
    throw new PlatformWorkError(
      `operator '${catalogueMember.operatorId}' carries no platformGap — the frozen gap id space is malformed (the totality law asserts this never happens)`,
    );
  }
  const evidenceBasis = validateEvidenceBasis(facts, errors);
  if (evidenceBasis !== null) {
    for (let index = 0; index < evidenceBasis.length; index += 1) {
      const code = evidenceBasis[index]?.code as string;
      const applicable =
        catalogueMember.applicableExclusionCodes.length > 0
          ? (catalogueMember.applicableExclusionCodes as readonly string[]).includes(code)
          : (OPERATOR_APPLICABLE_EXCLUSION_CODES as readonly string[]).includes(code);
      if (!applicable) {
        errors.push(
          `evidenceBasis[${String(index)}].code '${code}' does not prove the '${gapId}' gap — every fact must carry a code in the operator's applicable set${
            catalogueMember.applicableExclusionCodes.length > 0 ? "" : " (the state-conditioned gaps cite the corridor's operator-applicable exclusions — a recheck/wait/intake/revise classification never proves a platform gap)"
          }`,
        );
      }
    }
  }
  if (errors.length > 0) {
    throw new PlatformWorkError(`Invalid platform work item: ${errors.join("; ")}`, { errors: [...errors] });
  }
  const basis = evidenceBasis as readonly RepairExclusionFact[];
  const codes = [...new Set(basis.map((fact) => fact.code))];
  const routeIds = [...new Set(basis.map((fact) => fact.routeId))].sort();
  const title =
    `platform work '${gapId}': the verbatim exclusions [${codes.join(", ")}] over route(s) [${routeIds.join(", ")}] prove the gap — what PaySwap itself would need to build, never a party prerequisite`;
  assertNoGuaranteeLanguage(title, `platform work item '${gapId}' title`);
  const item: PlatformWorkItem = {
    workItemId: platformWorkItemId(gapId, basis),
    gapId,
    title,
    requiredByOperatorIds: Object.freeze([catalogueMember.operatorId]),
    evidenceBasis: Object.freeze(basis.map((fact) => Object.freeze({ ...fact }))),
    status: "OPEN",
    advisoryOnly: true,
    permitsExecution: false,
    createdAt: at,
  };
  pinnedAssertNotProtocolCommand(item);
  assertNoSecretMaterial(item, `platform work item '${item.workItemId}'`);
  return deepFreeze(item);
}

/**
 * The platform-work-never-executes law, restated as a literal: a platform
 * work item NEVER permits execution. Returns false, always.
 */
export function platformWorkPermitsExecution(): false {
  return false;
}
