/**
 * @payswap/route-planning — the INV-30 node-route eligibility gates
 * (P27-D, ADR-0020 D2/D6/D8; the P27-0 matrix §5 "eligibility decision
 * order", hard gates BEFORE ranking).
 *
 * THE NON-NEGOTIABLE LAW (INV-30): route decomposition, distribution,
 * relabeling or hop-chaining NEVER changes a transaction's purpose
 * classification, regulatory eligibility or provider-permission status.
 * These gates make that mechanical:
 *
 *  - the GOVERNING class is the maximum restriction rank among the
 *    intent's classification and EVERY leg's declared class (computed
 *    LOCALLY over the pinned rank table — a commerce-labelled leg can
 *    never lower a REGULATED_REMITTANCE_P2P intent; extra legs can only
 *    RAISE the governing class);
 *  - the governing class's §5 evidence burden is evaluated against the
 *    intent classification's evidence record (eligibility-validation.ts)
 *    — absent evidence is a typed refusal, never a fabricated approval;
 *  - the provider PRODUCT PERMISSION is evaluated for the GOVERNING
 *    class, never a leg's own declared label (the no-relabeling law);
 *  - every country the route touches must be ELIGIBLE — sanctioned,
 *    unsupported or UNKNOWN verdicts refuse the WHOLE route (fail-closed;
 *    UNKNOWN is never success);
 *  - every node-operated leg must carry an ADMITTED candidate fact (§6:
 *    signed and fresh is necessary, provider-evidenced is decisive);
 *  - a custody-bearing node leg must present its D8 licence/programme
 *    evidence (custody legs are regulated activity).
 *
 * The gate output is an honest DATA verdict (typed refusals, every reason
 * retained) — `eligibilityPermitsExecution` is the literal false.
 */

import { RoutePlanningValidationError } from "./errors.ts";
import { contentDigest, deepFreeze } from "./canonical.ts";
import type {
  PinnedNodeOfferAdmission,
  PinnedNodeRole,
  PinnedTransactionClass,
  PinnedTransactionClassification,
} from "./pins/node-network.ts";
import {
  PINNED_CLASS_REQUIREMENTS,
  PINNED_CLASS_RESTRICTION_RANKS,
  PINNED_NODE_ROLES,
} from "./pins/node-network.ts";
import {
  validateIntentClassification,
  validateLegDeclarations,
  validateTouchedCountries,
} from "./eligibility-validation.ts";

/** The fixed gate order (the §5 decision order; frozen; test-pinned). */
export const NODE_ELIGIBILITY_GATE_ORDER = Object.freeze([
  "PURPOSE_CLASS",
  "PROVIDER_PRODUCT_PERMISSION",
  "ACCOUNT_ENTITLEMENT",
  "COUNTRY",
  "CUSTODY_EVIDENCE",
] as const);

export type NodeEligibilityGateKind = (typeof NODE_ELIGIBILITY_GATE_ORDER)[number];

/** The closed refusal-code vocabulary (stable identities). */
export const NODE_ELIGIBILITY_REFUSAL_CODES = Object.freeze([
  "GOVERNING_CLASS_UNCLASSIFIABLE",
  "CLASS_EVIDENCE_MISSING",
  "PRODUCT_DOES_NOT_SERVE_CLASS",
  "NODE_OFFER_NOT_ADMITTED",
  "NODE_LEG_WITHOUT_ADMISSION",
  "NODE_ROLE_OUTSIDE_VOCABULARY",
  "COUNTRY_SANCTIONED",
  "COUNTRY_UNSUPPORTED",
  "COUNTRY_VERDICT_UNKNOWN",
  "CUSTODY_EVIDENCE_MISSING",
] as const);

export type NodeEligibilityRefusalCode = (typeof NODE_ELIGIBILITY_REFUSAL_CODES)[number];

/**
 * VALUE PIN — the country-gate verdict vocabulary (D10: country facts are
 * dated policy decisions, never flags; UNKNOWN is a typed verdict, never
 * success — the INV-04 discipline).
 */
export const NODE_COUNTRY_VERDICTS = Object.freeze([
  "ELIGIBLE",
  "REFUSED_SANCTIONED",
  "REFUSED_UNSUPPORTED",
  "UNKNOWN",
] as const);

export type PinnedCountryVerdict = (typeof NODE_COUNTRY_VERDICTS)[number];

/**
 * The custody-bearing node roles (ADR-0020 D8: a node that takes custody
 * of, or transmits, funds on behalf of others) — the pinned D5 role
 * vocabulary minus the pure TECHNICAL_ROUTER (the disclosed conservative
 * projection: every other role must present D8 licence/programme evidence
 * for its custody-bearing legs).
 */
export const CUSTODY_BEARING_NODE_ROLES: readonly PinnedNodeRole[] = Object.freeze(
  PINNED_NODE_ROLES.filter((role) => role !== "TECHNICAL_ROUTER"),
);

/** One leg's declaration: its identity, its declared class, its operator. */
export interface NodeRouteLegDeclaration {
  readonly legId: string;
  /** The leg's DECLARED transaction class (a label — it can only RAISE the governing class). */
  readonly declaredClass: PinnedTransactionClass;
  /** The node operating this leg (null = the local PaySwap instance). */
  readonly operatingNodeId: string | null;
}

/** One typed eligibility refusal (the every-reason law — never just the first). */
export interface NodeEligibilityRefusal {
  readonly code: NodeEligibilityRefusalCode;
  readonly message: string;
  readonly legId?: string;
  readonly country?: string;
  readonly nodeId?: string;
}

/** The eligibility-gate evaluation (the gates-before-ranking output contract). */
export interface NodeRouteEligibilityEvaluation {
  readonly intentRef: string;
  /** The most restrictive class among the intent and every leg (INV-30). */
  readonly governingClass: PinnedTransactionClass;
  readonly gateOrder: readonly NodeEligibilityGateKind[];
  readonly verdict: "ELIGIBLE" | "REFUSED";
  /** Empty iff eligible; every gate's refusal retained (never dropped). */
  readonly refusals: readonly NodeEligibilityRefusal[];
  readonly eligibilityDigest: string;
  /** LITERAL: eligibility gating never permits execution. */
  readonly eligibilityPermitsExecution: false;
}

/**
 * Evaluate the INV-30 node-route eligibility gates (BEFORE ranking — the
 * structural law): every violated gate contributes a typed refusal (the
 * every-reason law); only a route with ZERO refusals is ELIGIBLE.
 */
export function evaluateNodeRouteEligibility(input: {
  readonly intentClassification: PinnedTransactionClassification;
  readonly legs: readonly NodeRouteLegDeclaration[];
  /** Every country the route touches (origin, hops, destination). */
  readonly countries: readonly string[];
  /** The dated country-gate policy decisions (D10) — every touched country must be covered. */
  readonly countryVerdicts: Readonly<Record<string, PinnedCountryVerdict>>;
  /** The capability chain's admission outcome per operating node (INV-13). */
  readonly nodeAdmissions: Readonly<Record<string, PinnedNodeOfferAdmission>>;
  /** The transaction classes the LOCAL connected products serve (§5). */
  readonly localProductPurposes: readonly PinnedTransactionClass[];
}): NodeRouteEligibilityEvaluation {
  const intentClassification = validateIntentClassification(input.intentClassification);
  const legs = validateLegDeclarations(input.legs);
  const countries = validateTouchedCountries(input.countries);
  for (const recordField of ["countryVerdicts", "nodeAdmissions"] as const) {
    if (
      typeof input[recordField] !== "object" ||
      input[recordField] === null ||
      Array.isArray(input[recordField])
    ) {
      throw new RoutePlanningValidationError(`${recordField} must be a record object`);
    }
  }
  if (!Array.isArray(input.localProductPurposes)) {
    throw new RoutePlanningValidationError(
      "localProductPurposes must be an array of the local products' served classes",
    );
  }
  const refusals: NodeEligibilityRefusal[] = [];

  // GATE 1 — PURPOSE CLASS (INV-30: the most restrictive class governs the WHOLE route).
  let governing: PinnedTransactionClass = intentClassification.transactionClass;
  for (const leg of legs) {
    if (
      PINNED_CLASS_RESTRICTION_RANKS[leg.declaredClass] > PINNED_CLASS_RESTRICTION_RANKS[governing]
    ) {
      governing = leg.declaredClass;
    }
  }
  if (governing === "OTHER_UNCLEAR") {
    refusals.push({
      code: "GOVERNING_CLASS_UNCLASSIFIABLE",
      message:
        "the governing classification is OTHER_UNCLEAR — the model asks for the missing facts; nothing routes until the class is derived from reviewable facts (D3)",
    });
  }
  // The §5 burden of the GOVERNING class, straight from the pinned table
  // (never re-derived — the table IS the law; PINNED_CLASS_REQUIREMENTS is
  // fidelity-pinned byte-identical to the node-network authority).
  const requirements = PINNED_CLASS_REQUIREMENTS[governing];
  const evidence = intentClassification.evidence;
  if (requirements.purposeEvidenceRequired && evidence.purposeEvidenceRefs.length === 0) {
    refusals.push({
      code: "CLASS_EVIDENCE_MISSING",
      message: `the governing class ${governing} requires purpose/transaction evidence (invoice, order, contract) — the intent classification's evidence record carries none (§5)`,
    });
  }
  if (requirements.licenceEvidenceRequired && evidence.licenceRefs.length === 0) {
    refusals.push({
      code: "CLASS_EVIDENCE_MISSING",
      message: `the governing class ${governing} is regulated activity — licence evidence is required before any route is eligible, and none is on record (§5; INV-30: relabeling legs changes nothing)`,
    });
  }
  if (requirements.providerProductApprovalRequired && evidence.providerProductApprovalRefs.length === 0) {
    refusals.push({
      code: "CLASS_EVIDENCE_MISSING",
      message: `the governing class ${governing} requires the provider's explicit written product approval for the disclosed model — none is on record (§5)`,
    });
  }
  if (requirements.custodyProgrammeEvidenceRequired && evidence.custodyProgrammeRefs.length === 0) {
    refusals.push({
      code: "CLASS_EVIDENCE_MISSING",
      message: `the governing class ${governing} involves custody/transmission of funds — ADR-0020 D8 custody/safeguarding programme evidence is a route precondition and none is on record`,
    });
  }

  // GATE 2 — PROVIDER PRODUCT PERMISSION (for the GOVERNING class — the no-relabeling law).
  for (const leg of legs) {
    if (leg.operatingNodeId === null) {
      if (!(input.localProductPurposes as readonly unknown[]).includes(governing)) {
        refusals.push({
          code: "PRODUCT_DOES_NOT_SERVE_CLASS",
          legId: leg.legId,
          message: `the local product does not serve the governing class ${governing} (leg '${leg.legId}' is local; the permission is evaluated for the GOVERNING class, never the leg's own '${leg.declaredClass}' label — INV-30)`,
        });
      }
      continue;
    }
    const admission = input.nodeAdmissions[leg.operatingNodeId];
    if (admission !== undefined && admission.admitted) {
      if (!(admission.fact.constraints.purposes as readonly unknown[]).includes(governing)) {
        refusals.push({
          code: "PRODUCT_DOES_NOT_SERVE_CLASS",
          legId: leg.legId,
          nodeId: leg.operatingNodeId,
          message: `node '${leg.operatingNodeId}'s offer serves classes [${admission.fact.constraints.purposes.join(", ")}] — it does not serve the governing class ${governing} (evaluated for the WHOLE route, never the leg's own '${leg.declaredClass}' label — INV-30)`,
        });
      }
    }
  }

  // GATE 3 — ACCOUNT ENTITLEMENT (INV-13/§6: provider evidence is decisive).
  for (const leg of legs) {
    if (leg.operatingNodeId === null) {
      continue;
    }
    const admission = input.nodeAdmissions[leg.operatingNodeId];
    if (admission === undefined) {
      refusals.push({
        code: "NODE_LEG_WITHOUT_ADMISSION",
        legId: leg.legId,
        nodeId: leg.operatingNodeId,
        message: `leg '${leg.legId}' is operated by node '${leg.operatingNodeId}' but no admission outcome was presented — fail closed (an unverified operator leg is never eligible)`,
      });
      continue;
    }
    if (!admission.admitted) {
      refusals.push({
        code: "NODE_OFFER_NOT_ADMITTED",
        legId: leg.legId,
        nodeId: leg.operatingNodeId,
        message: `node '${leg.operatingNodeId}'s offer was not admitted by the capability chain (${admission.refusals.map((refusal) => refusal.code).join("; ")}) — an unsigned, expired, revoked or fixture offer, or a non-ACTIVE/not-eligible local instance, contributes NOTHING (§6: signed and fresh is necessary, provider-evidenced is decisive)`,
      });
    }
  }

  // GATE 4 — COUNTRY (every touched country; fail closed on UNKNOWN — hop-chaining changes nothing).
  for (const country of countries) {
    const verdict = input.countryVerdicts[country];
    if (verdict === "REFUSED_SANCTIONED") {
      refusals.push({
        code: "COUNTRY_SANCTIONED",
        country,
        message: `the route touches country '${country}' which is under sanctions — the WHOLE route is refused regardless of hops (INV-30: hop-chaining changes nothing)`,
      });
    } else if (verdict === "REFUSED_UNSUPPORTED") {
      refusals.push({
        code: "COUNTRY_UNSUPPORTED",
        country,
        message: `the route touches country '${country}' which no connected product supports on today's evidence — the WHOLE route is refused (D10: dated evidence, never flags)`,
      });
    } else if (verdict !== "ELIGIBLE") {
      refusals.push({
        code: "COUNTRY_VERDICT_UNKNOWN",
        country,
        message: `the route touches country '${country}' with no ELIGIBLE verdict (${verdict === undefined ? "no policy decision presented" : `verdict '${verdict}'`}) — UNKNOWN is never success; the whole route is refused pending the dated policy decision (INV-04 discipline)`,
      });
    }
  }

  // GATE 5 — CUSTODY EVIDENCE (ADR-0020 D8: custody legs are regulated activity).
  for (const leg of legs) {
    if (leg.operatingNodeId === null) {
      continue;
    }
    const admission = input.nodeAdmissions[leg.operatingNodeId];
    if (admission === undefined || !admission.admitted) {
      continue; // already refused at gate 3 — no fact to inspect
    }
    const fact = admission.fact;
    if (!(PINNED_NODE_ROLES as readonly unknown[]).includes(fact.custodyRole)) {
      refusals.push({
        code: "NODE_ROLE_OUTSIDE_VOCABULARY",
        legId: leg.legId,
        nodeId: leg.operatingNodeId,
        message: `node '${leg.operatingNodeId}'s custody role '${fact.custodyRole}' is outside the pinned D5 role vocabulary — the role is explicit, never inferred; fail closed`,
      });
      continue;
    }
    if (
      (CUSTODY_BEARING_NODE_ROLES as readonly unknown[]).includes(fact.custodyRole) &&
      fact.custodyProgrammeRefs.length === 0
    ) {
      refusals.push({
        code: "CUSTODY_EVIDENCE_MISSING",
        legId: leg.legId,
        nodeId: leg.operatingNodeId,
        message: `leg '${leg.legId}' places custody with node '${leg.operatingNodeId}' (role '${fact.custodyRole}') but the signed offer carries no D8 licence/programme references — a custody-bearing leg is eligible only when the operating node presents its licence/programme evidence as a route precondition (ADR-0020 D8)`,
      });
    }
  }

  const verdict: "ELIGIBLE" | "REFUSED" = refusals.length === 0 ? "ELIGIBLE" : "REFUSED";
  const eligibilityDigest = contentDigest({
    intentRef: intentClassification.derivedFrom.intentRef,
    governingClass: governing,
    gateOrder: NODE_ELIGIBILITY_GATE_ORDER,
    refusals,
    verdict,
    legs: legs.map((leg) => ({
      legId: leg.legId,
      declaredClass: leg.declaredClass,
      operatingNodeId: leg.operatingNodeId,
    })),
    countries,
  });
  return deepFreeze({
    intentRef: intentClassification.derivedFrom.intentRef,
    governingClass: governing,
    gateOrder: NODE_ELIGIBILITY_GATE_ORDER,
    verdict,
    refusals: Object.freeze(refusals),
    eligibilityDigest,
    eligibilityPermitsExecution: false as const,
  });
}
