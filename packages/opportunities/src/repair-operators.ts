/**
 * @payswap/opportunities — the typed REPAIR-OPERATOR CATALOGUE (P23-A,
 * lane A; ADR-0015 D2): the frozen exclusion→repair mapping over the
 * pinned 26-code corridor exclusion vocabulary (./pins/capability.ts —
 * authority @payswap/capability corridor-types.ts). This is DATA, never
 * an engine: the route-planning derivation (P23-C) consumes it through
 * the injected catalogue port and composes the actual conditionals,
 * platform work items and hypotheses; nothing here executes, nothing
 * here decides eligibility. The grounded exclusion facts the catalogue
 * consumes live in ./repair-facts.ts (the file-law split); the honest
 * non-operator classifications and the totality law live in
 * ./repair-classifications.ts.
 *
 * LAWS (mirrored from ADR-0015, never redefined):
 * - FROZEN: the 15 operator ids, the 3 kinds and the applicable-code sets
 *   are the ADR appendix A.2/A.3 values (as AMENDED 2026-10-29), pinned
 *   byte-identical by the battery.
 * - TOTAL: every one of the 26 pinned codes has EXACTLY ONE home — at
 *   least one operator's applicableExclusionCodes, or exactly one honest
 *   non-operator row (./repair-classifications.ts) — never both, never
 *   neither (`catalogueTotalityViolations()` is the machine check).
 * - MOST-SPECIFIC-APPLICABLE: on the P21 corridor (FLW-wallet funding +
 *   a Stripe receiving rail) the P21-specific operators SHADOW the general
 *   funding operators (`shadowedBy`); a foreign corridor NEVER emits the
 *   P21 names.
 * - HONEST EVIDENCE: every operator's `evidenceLaw` is frozen prose
 *   grounded in the VERBATIM exclusion facts, never invented; the
 *   state-conditioned operators (the honest no-route state, the two P21
 *   platform gaps) carry EMPTY applicable-code sets and are never emitted
 *   from exclusion facts — their home is the corridor state, recognized by
 *   the route-planning derivation. ADVISORY ONLY: `advisoryOnly: true`
 *   and `permitsExecution: false` are pinned literals on every entry — a
 *   repair operator is a typed repair CANDIDATE, never a command, never
 *   an authorization.
 */

import { PINNED_CORRIDOR_EXCLUSION_CODES } from "./pins/capability.ts";
import type { PinnedCorridorExclusionCode } from "./pins/capability.ts";
import { RepairCatalogueError, validateRepairExclusionFacts } from "./repair-facts.ts";
import type { RepairExclusionFact, RepairFactSide } from "./repair-facts.ts";
import type { ConditionalPartyChange } from "./conditional.ts";

// ---------------------------------------------------------------------------
// The frozen vocabularies (ADR-0015 A.2)
// ---------------------------------------------------------------------------

/** The repair-operator kinds (frozen, ADR-0015 A.2). */
export const REPAIR_OPERATOR_KINDS = Object.freeze(["PARTY_CHANGE", "PLATFORM_WORK", "MULTI_HOP"] as const);
export type RepairOperatorKind = (typeof REPAIR_OPERATOR_KINDS)[number];

export function isRepairOperatorKind(value: unknown): value is RepairOperatorKind {
  return typeof value === "string" && (REPAIR_OPERATOR_KINDS as readonly unknown[]).includes(value);
}

/**
 * The corridor facts a corridor-pattern condition consults (caller-supplied,
 * never derived here): the corridor's funding-method identity and the
 * receiving rail's provider — exactly the two dimensions the P21 pattern
 * recognition consumes.
 */
export interface RepairCorridorFacts {
  readonly fundingMethod?: string;
  readonly receivingProvider?: string;
}

/**
 * VALUE PIN — the P21 corridor pattern (frozen): FLW-wallet funding
 * declined by a Stripe receiving rail. Authority: ADR-0014 D7 + the P21-0
 * gap matrix §2 (the same values @payswap/route-planning pins as
 * PINNED_P21_FLW_WALLET_FUNDING_METHOD / PINNED_P21_STRIPE_PROVIDER_NAME
 * — pinned independently against the same ADR, never imported).
 */
export const P21_CORRIDOR_PATTERN: Readonly<RepairCorridorFacts> = Object.freeze({
  fundingMethod: "flutterwave_wallet",
  receivingProvider: "stripe",
});

/** Does the corridor match the pattern? Every DEFINED pattern field must equal the corridor's (deterministic, total). */
export function matchesRepairCorridorPattern(
  corridor: Readonly<RepairCorridorFacts>,
  pattern: Readonly<RepairCorridorFacts>,
): boolean {
  if (pattern.fundingMethod !== undefined && corridor.fundingMethod !== pattern.fundingMethod) {
    return false;
  }
  if (pattern.receivingProvider !== undefined && corridor.receivingProvider !== pattern.receivingProvider) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The operator record + the frozen catalogue (ADR-0015 A.3, as amended)
// ---------------------------------------------------------------------------

/** The frozen 15 operator ids (ADR-0015 A.3, canonical order). */
export const REPAIR_OPERATOR_IDS = Object.freeze([
  "repair:recipient-enables-flw-receiving-method",
  "repair:sender-adds-stripe-compatible-instrument",
  "repair:recipient-enables-served-funding-method",
  "repair:sender-adds-served-funding-instrument",
  "repair:recipient-enables-served-payout-method",
  "repair:sender-completes-provider-permissions",
  "repair:intermediary-introduced",
  "repair:convert-through-supported-asset",
  "repair:bridge-via-intermediary-rail",
  "repair:split-below-maximum",
  "platform:connector-operation",
  "platform:provider-integration",
  "platform:permission-model",
  "platform:cross-provider-route-shape",
  "platform:flutterwave-send-operation",
] as const);
export type RepairOperatorId = (typeof REPAIR_OPERATOR_IDS)[number];

/** The frozen platform gap id space (the PLATFORM_WORK operator ids ARE the gap ids; D4). */
export const PLATFORM_GAP_IDS = Object.freeze([
  "platform:connector-operation",
  "platform:provider-integration",
  "platform:permission-model",
  "platform:cross-provider-route-shape",
  "platform:flutterwave-send-operation",
] as const);
export type PlatformGapId = (typeof PLATFORM_GAP_IDS)[number];

/**
 * One typed repair operator (pure frozen data): what a party change, a
 * platform work item or a multi-hop hypothesis would propose for the
 * exclusions it applies to. There is deliberately no method and no
 * execution-shaped field on this type.
 */
export interface RepairOperator {
  readonly operatorId: RepairOperatorId;
  readonly kind: RepairOperatorKind;
  /** Subset of the pinned 26, canonical (pinned-list) order; EMPTY for the state-conditioned operators. */
  readonly applicableExclusionCodes: readonly PinnedCorridorExclusionCode[];
  /** OPTIONAL side condition (P21-specific operators): the corridor side whose facts ground the operator. */
  readonly side?: RepairFactSide;
  /** OPTIONAL corridor-pattern condition (P21-specific operators): fail-closed unless the corridor matches. */
  readonly corridorPattern?: Readonly<RepairCorridorFacts>;
  /** For PARTY_CHANGE operators: the grown party-change member proposed (the ACTING party is the member's own semantics). */
  readonly partyChange?: ConditionalPartyChange;
  /** For PLATFORM_WORK operators: the gap kind (the gap id space). */
  readonly platformGap?: PlatformGapId;
  readonly p21Specific: boolean;
  /** The P21 operator that shadows this general one on the P21 corridor. */
  readonly shadowedBy?: RepairOperatorId;
  /** Frozen prose: grounded in the VERBATIM exclusion facts, never invented. */
  readonly evidenceLaw: string;
  readonly advisoryOnly: true;
  readonly permitsExecution: false;
}

type OperatorConditions = Pick<RepairOperator, "p21Specific"> &
  Partial<Pick<RepairOperator, "side" | "corridorPattern" | "partyChange" | "platformGap" | "shadowedBy">>;

function operator(
  operatorId: RepairOperatorId,
  kind: RepairOperatorKind,
  applicableExclusionCodes: readonly PinnedCorridorExclusionCode[],
  evidenceLaw: string,
  conditions: OperatorConditions = { p21Specific: false },
): RepairOperator {
  return Object.freeze({
    operatorId,
    kind,
    applicableExclusionCodes: Object.freeze([...applicableExclusionCodes]),
    evidenceLaw,
    advisoryOnly: true,
    permitsExecution: false,
    ...conditions,
  });
}

/** The frozen 15-entry repair-operator catalogue (ADR-0015 A.3, as amended). */
export const REPAIR_OPERATORS: readonly RepairOperator[] = Object.freeze([
  operator(
    "repair:recipient-enables-flw-receiving-method",
    "PARTY_CHANGE",
    ["FUNDING_METHOD_NOT_SERVED"],
    "grounded only in the verbatim recipient-side FUNDING_METHOD_NOT_SERVED exclusion whose detail names the corridor's Flutterwave-wallet funding method — the receiving rail's own restriction message is the entire evidence; no provider state beyond the fact is assumed",
    {
      p21Specific: true,
      side: "RECIPIENT",
      corridorPattern: Object.freeze({ fundingMethod: "flutterwave_wallet" }),
      partyChange: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
    },
  ),
  operator(
    "repair:sender-adds-stripe-compatible-instrument",
    "PARTY_CHANGE",
    ["FUNDING_METHOD_NOT_SERVED"],
    "grounded only in the verbatim recipient-side FUNDING_METHOD_NOT_SERVED exclusion on a corridor whose receiving rail is Stripe — the decline names the funding method the sender must replace; no eligibility beyond the fact is assumed",
    {
      p21Specific: true,
      side: "RECIPIENT",
      corridorPattern: Object.freeze({ receivingProvider: "stripe" }),
      partyChange: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
    },
  ),
  operator(
    "repair:recipient-enables-served-funding-method",
    "PARTY_CHANGE",
    ["FUNDING_METHOD_NOT_SERVED"],
    "grounded only in the verbatim FUNDING_METHOD_NOT_SERVED exclusion — the provider-neutral repair proposes enabling a receiving method already inside the served set; on the P21 corridor the Flutterwave-specific operator shadows this one",
    { p21Specific: false, partyChange: "ENABLES_COMPATIBLE_RECEIVING_METHOD", shadowedBy: "repair:recipient-enables-flw-receiving-method" },
  ),
  operator(
    "repair:sender-adds-served-funding-instrument",
    "PARTY_CHANGE",
    ["FUNDING_METHOD_NOT_SERVED"],
    "grounded only in the verbatim FUNDING_METHOD_NOT_SERVED exclusion over any receiving rail — the provider-neutral repair proposes adding a funding instrument the served set already names; on a Stripe receiving rail the P21 operator shadows this one",
    { p21Specific: false, partyChange: "ADDS_COMPATIBLE_FUNDING_INSTRUMENT", shadowedBy: "repair:sender-adds-stripe-compatible-instrument" },
  ),
  operator(
    "repair:recipient-enables-served-payout-method",
    "PARTY_CHANGE",
    ["PAYOUT_METHOD_NOT_SERVED"],
    "grounded only in the verbatim PAYOUT_METHOD_NOT_SERVED exclusion — the payout decline names the served-set gap the recipient would close; nothing beyond the fact is assumed",
    { p21Specific: false, partyChange: "ENABLES_COMPATIBLE_RECEIVING_METHOD" },
  ),
  operator(
    "repair:sender-completes-provider-permissions",
    "PARTY_CHANGE",
    ["AUTHORIZATION_NOT_ACTIVE", "MISSING_PERMISSIONS"],
    "grounded only in the verbatim AUTHORIZATION_NOT_ACTIVE or MISSING_PERMISSIONS exclusion — the credential's own permission state is the evidence; the operator proposes completing the grant, never assuming the provider's willingness",
    { p21Specific: false, partyChange: "COMPLETES_PROVIDER_PERMISSIONS" },
  ),
  operator(
    "repair:intermediary-introduced",
    "MULTI_HOP",
    [],
    "grounded only in the honest no-route state — rails observed on both corridor sides, nothing eligible, nothing rank-eligible — never in an invented intermediary; the composed conditional names THIRD_PARTY:INTERMEDIARY_INTRODUCED and the platform gap stays the cross-provider route shape",
    { p21Specific: true },
  ),
  operator(
    "repair:convert-through-supported-asset",
    "MULTI_HOP",
    ["SOURCE_CURRENCY_NOT_SUPPORTED", "DESTINATION_CURRENCY_NOT_SUPPORTED"],
    "grounded only in the verbatim SOURCE_CURRENCY_NOT_SUPPORTED or DESTINATION_CURRENCY_NOT_SUPPORTED exclusion — the conversion asset must be one the served sets already support; no rate and no leg is assumed",
    { p21Specific: false },
  ),
  operator(
    "repair:bridge-via-intermediary-rail",
    "MULTI_HOP",
    ["SOURCE_COUNTRY_NOT_SERVED", "DESTINATION_COUNTRY_NOT_SERVED"],
    "grounded only in the verbatim SOURCE_COUNTRY_NOT_SERVED or DESTINATION_COUNTRY_NOT_SERVED exclusion — the bridge rail must itself be evidenced; the honest no-route state over the corridor is part of the same grounding",
    { p21Specific: false },
  ),
  operator(
    "repair:split-below-maximum",
    "MULTI_HOP",
    ["AMOUNT_ABOVE_MAXIMUM"],
    "grounded only in the verbatim AMOUNT_ABOVE_MAXIMUM exclusion — the fact's own maximum is the bound; the split arithmetic stays deterministic downstream, never here",
    { p21Specific: false },
  ),
  operator(
    "platform:connector-operation",
    "PLATFORM_WORK",
    ["INSTANCE_INELIGIBLE", "IMPLEMENTATION_SCOPE_NOT_SERVED", "NOT_EXECUTABLE_CAPABILITY"],
    "grounded only in the verbatim INSTANCE_INELIGIBLE, IMPLEMENTATION_SCOPE_NOT_SERVED or NOT_EXECUTABLE_CAPABILITY exclusions — the capability exists in the model while no executable connector operation serves it; the work item cites those exact facts",
    { p21Specific: false, platformGap: "platform:connector-operation" },
  ),
  operator(
    "platform:provider-integration",
    "PLATFORM_WORK",
    ["INSTANCE_GEOGRAPHY_NOT_SERVED", "INSTANCE_CURRENCY_NOT_SUPPORTED", "CUSTOMER_TYPE_NOT_SERVED", "RECIPIENT_TYPE_NOT_SERVED"],
    "grounded only in the verbatim served-set exclusions (INSTANCE_GEOGRAPHY_NOT_SERVED, INSTANCE_CURRENCY_NOT_SUPPORTED, CUSTOMER_TYPE_NOT_SERVED, RECIPIENT_TYPE_NOT_SERVED) — a provider integration would have to serve them; the work item cites those exact facts",
    { p21Specific: false, platformGap: "platform:provider-integration" },
  ),
  operator(
    "platform:permission-model",
    "PLATFORM_WORK",
    ["MISSING_PERMISSIONS"],
    "grounded only in the verbatim MISSING_PERMISSIONS exclusion where the credential model cannot express the grant — the permission-model gap is platform work, distinct from the party completing its own permissions",
    { p21Specific: false, platformGap: "platform:permission-model" },
  ),
  operator(
    "platform:cross-provider-route-shape",
    "PLATFORM_WORK",
    [],
    "grounded only in the honest no-route state over the cross-provider fiat pair — the frozen route-shape vocabulary has no cross-provider composition (the P21-0 C8 law); the work item cites the corridor's verbatim operator-applicable exclusions",
    { p21Specific: true, platformGap: "platform:cross-provider-route-shape" },
  ),
  operator(
    "platform:flutterwave-send-operation",
    "PLATFORM_WORK",
    [],
    "grounded only in the verbatim corridor exclusions proving the FLW receiving-method gap — P21 implements no Flutterwave send operation, so the party change alone cannot make the corridor real; the work item cites the funding-decline facts",
    { p21Specific: true, platformGap: "platform:flutterwave-send-operation" },
  ),
]);

/**
 * The operator-applicable code set (the 16 codes with at least one repair
 * operator; canonical pinned order, derived frozen). The complementary 10
 * codes carry exactly one non-operator row each (./repair-classifications.ts).
 */
export const OPERATOR_APPLICABLE_EXCLUSION_CODES: readonly PinnedCorridorExclusionCode[] = Object.freeze(
  (PINNED_CORRIDOR_EXCLUSION_CODES as readonly PinnedCorridorExclusionCode[]).filter((code) =>
    (REPAIR_OPERATORS as readonly RepairOperator[]).some((entry) =>
      (entry.applicableExclusionCodes as readonly string[]).includes(code),
    ),
  ),
);

// ---------------------------------------------------------------------------
// The pure lookups (deterministic, fail-closed)
// ---------------------------------------------------------------------------

/**
 * Pure code lookup: every catalogue operator whose applicable set carries
 * the code, in canonical catalogue order. A code whose home is a
 * non-operator row returns the honest EMPTY set; a code outside the
 * pinned 26 fails closed (typed, never guessed).
 */
export function lookupRepairOperators(exclusionCode: string): readonly RepairOperator[] {
  if (!(PINNED_CORRIDOR_EXCLUSION_CODES as readonly string[]).includes(exclusionCode)) {
    throw new RepairCatalogueError(
      `exclusion code '${String(exclusionCode)}' is not one of the pinned 26 corridor exclusion codes — the catalogue never guesses (fail closed)`,
    );
  }
  return Object.freeze((REPAIR_OPERATORS as readonly RepairOperator[]).filter(
    (entry) => (entry.applicableExclusionCodes as readonly string[]).includes(exclusionCode),
  ));
}

/**
 * THE facts lookup (deterministic, fail-closed): the catalogue operators
 * grounded in the verbatim exclusion facts, in canonical catalogue order,
 * under the most-specific-applicable-operator rule:
 * - an operator applies when at least one fact carries a code in its
 *   applicable set (an operator with a `side` condition counts only facts
 *   on that side; the state-conditioned operators — empty applicable sets
 *   — are NEVER emitted from facts);
 * - an operator with a `corridorPattern` applies only when the caller
 *   supplied corridor facts AND they match (a foreign or absent corridor
 *   never emits the P21 names — fail closed, never guessed);
 * - a general operator is SUPPRESSED when its `shadowedBy` P21 shadower
 *   is emitted (the D2 shadowing law).
 */
export function operatorsForFacts(
  facts: readonly RepairExclusionFact[],
  corridor?: Readonly<RepairCorridorFacts>,
): readonly RepairOperator[] {
  if (!Array.isArray(facts as unknown)) {
    throw new RepairCatalogueError("operatorsForFacts requires the grounded exclusion facts as an array");
  }
  const validated = validateRepairExclusionFacts(facts);
  const errors: string[] = [];
  if (corridor !== undefined) {
    if (corridor === null || typeof corridor !== "object") {
      errors.push("the corridor facts, when supplied, must be an object { fundingMethod?, receivingProvider? }");
    } else {
      const record = corridor as Readonly<Record<string, unknown>>;
      if (record["fundingMethod"] !== undefined && (typeof record["fundingMethod"] !== "string" || record["fundingMethod"].length === 0)) {
        errors.push("corridor.fundingMethod, when present, must be a non-empty string");
      }
      if (record["receivingProvider"] !== undefined && (typeof record["receivingProvider"] !== "string" || record["receivingProvider"].length === 0)) {
        errors.push("corridor.receivingProvider, when present, must be a non-empty string");
      }
    }
  }
  if (errors.length > 0) {
    throw new RepairCatalogueError(`Invalid repair-fact lookup: ${errors.join("; ")}`, { errors: [...errors] });
  }
  const emitted: RepairOperator[] = [];
  for (const entry of REPAIR_OPERATORS as readonly RepairOperator[]) {
    if (entry.applicableExclusionCodes.length === 0) {
      continue; // the state-conditioned operators never derive from exclusion facts
    }
    const grounded = validated.some(
      (fact) =>
        (entry.applicableExclusionCodes as readonly string[]).includes(fact.code) &&
        (entry.side === undefined || fact.side === entry.side),
    );
    if (!grounded) {
      continue;
    }
    if (entry.corridorPattern !== undefined) {
      if (corridor === undefined || !matchesRepairCorridorPattern(corridor, entry.corridorPattern)) {
        continue; // the P21 names never emit on a foreign or absent corridor
      }
    }
    emitted.push(entry);
  }
  const emittedIds = new Set(emitted.map((entry) => entry.operatorId));
  return Object.freeze(emitted.filter((entry) => entry.shadowedBy === undefined || !emittedIds.has(entry.shadowedBy)));
}

/** Pure id lookup: the catalogue member, or null (typed accessor for consumers). */
export function repairOperatorById(operatorId: string): RepairOperator | null {
  return (REPAIR_OPERATORS as readonly RepairOperator[]).find((entry) => entry.operatorId === operatorId) ?? null;
}
