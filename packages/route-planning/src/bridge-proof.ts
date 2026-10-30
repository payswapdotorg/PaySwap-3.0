/**
 * @payswap/route-planning — the typed deterministic BRIDGE PROOF for the
 * multi-hop hypothesis stage (the P23 correctness patch, 2026-10-29:
 * `PLANNER_VERIFIED` must mean the EXACT assumed element provably
 * participates in a composed candidate — never merely that some real
 * route was eligible).
 *
 * THE DEFECT THIS CLOSES (the handoff §2.2 finding): the pre-patch
 * `deriveRouteHypothesis` computed `wouldCompose` as
 * `verifiedSegments.length > 0 && hypotheticalSegments.length > 0`, and
 * the desktop composition's re-run port enumerated candidates over the
 * UNCHANGED real sender/recipient snapshots — the assumed augmentation
 * never became part of the compiled candidate. A valid real route and an
 * unrelated assumed rail/asset/connector could therefore coexist and
 * incorrectly produce `PLANNER_VERIFIED`.
 *
 * THE PROOF STANDARD (honest about exactly what it proves): this module
 * compiles the ONE assumed element of a hypothetical corridor view into a
 * typed bridge proof by checking, fail-closed, that
 *   (1) EXACT-ELEMENT BINDING — the proof digests the view's own ONE
 *       augmentation (id, kind, currencies, summary) verbatim, so a proof
 *       can never be issued for a different element than the one the
 *       hypothesis assumes;
 *   (2) CONNECTIVITY — the element's declared currency pair EQUALS the
 *       corridor query's (source, destination) pair: it provably spans
 *       the corridor's full currency gap. A partial span cannot compose
 *       under the one-change discipline (exactly ONE augmentation per
 *       variant — hypothetical-views.ts LAW 2), so it stays unproven;
 *   (3) BRIDGE-WORTHINESS — the corridor's remaining REAL blockers are
 *       non-empty AND every one of them carries an exclusion code the
 *       element's own augmentation kind ANSWERS (the frozen answerable
 *       sets below, derived from the repair catalogue's own operator
 *       semantics). A blocker the element cannot answer is an unproven
 *       precondition: the corridor would NOT compose with only this
 *       element assumed, and the proof fails closed.
 *
 * THE HONEST BOUNDARY (named, never hidden): this is a STRUCTURAL proof
 * over the element's declared shape plus the corridor's verbatim typed
 * exclusion facts — it is NOT a full route-compiler pass. The full
 * contract, precondition, finality and execution-mode proof rides the
 * REAL compile only when the element becomes a real, observed,
 * connected rail; until then the proof's minted `hypothesis-plan:` id is
 * an ADVISORY candidate identity (namespaced so it can never collide
 * with a compiled `route-plan:` id), and every hypothesis carrying it
 * stays `neverExecutable: true` + `advisoryOnly: true` under the
 * structural guard (hypothesis-stage.ts).
 */

import { contentDigest, deepFreeze, isNonEmptyString, isRecord, requireObject } from "./canonical.ts";
import { RoutePlanningError } from "./errors.ts";
import type { PinnedCorridorQuery } from "./pins/capability.ts";
import type {
  PinnedHypotheticalAugmentation,
  PinnedHypotheticalCorridorView,
} from "./pins/hypotheses.ts";
import { PINNED_HYPOTHESIS_AUGMENTATION_KINDS } from "./pins/hypotheses.ts";
import type { GroundedExclusionFact } from "./conditional-stage.ts";

/** A bridge-proof derivation input violated the laws. */
export class BridgeProofError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "BRIDGE_PROOF_FAILED", details);
    this.name = "BridgeProofError";
  }
}

/**
 * VALUE PIN — the frozen answerable-exclusion sets per augmentation kind
 * (derived VERBATIM from the repair catalogue's own operator semantics,
 * ADR-0015 A.3 as amended): an assumed RAIL proves a served country pair
 * (the bridge-via-intermediary-rail operator answers exactly the country
 * codes); an assumed CONVERSION ASSET proves a supported currency pair
 * (convert-through-supported-asset answers exactly the currency codes);
 * an assumed CONNECTOR OPERATION (the split-transfer) answers the amount
 * maximum. The NO-ROUTE-STATE intermediary (`repair:intermediary-introduced`)
 * answers NO code by construction — its grounding is the whole corridor's
 * blocking facts, and an assumed rail's existence alone can never prove
 * those clearable — so in a corridor whose blockers exceed the answerable
 * set the honest proof result is NONE (the hypothesis stays UNVERIFIED).
 */
export const PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES: Readonly<
  Record<(typeof PINNED_HYPOTHESIS_AUGMENTATION_KINDS)[number], readonly string[]>
> = Object.freeze({
  ADD_ASSUMED_RAIL: Object.freeze([
    "SOURCE_COUNTRY_NOT_SERVED",
    "DESTINATION_COUNTRY_NOT_SERVED",
  ]),
  ADD_ASSUMED_CONVERSION_ASSET: Object.freeze([
    "SOURCE_CURRENCY_NOT_SUPPORTED",
    "DESTINATION_CURRENCY_NOT_SUPPORTED",
  ]),
  ADD_ASSUMED_CONNECTOR_OPERATION: Object.freeze([
    "AMOUNT_ABOVE_MAXIMUM",
  ]),
});

/** The typed bridge proof (a PLANNING artifact — never a RoutePlan). */
export interface AssumedElementBridgeProof {
  readonly proofKind: "ASSUMED_ELEMENT_BRIDGE_PROOF";
  /** The EXACT assumed element this proof binds (its own pinned id). */
  readonly assumedElementId: string;
  readonly augmentationKind: (typeof PINNED_HYPOTHESIS_AUGMENTATION_KINDS)[number];
  /** The corridor pair the element provably spans (== the corridor query's pair). */
  readonly spansSourceCurrency: string;
  readonly spansDestinationCurrency: string;
  /** Every remaining blocker code, each answered by the kind's frozen answerable set. */
  readonly answeredBlockerCodes: readonly string[];
  /** The ADVISORY candidate identity (namespaced — never a compiled route-plan id). */
  readonly hypothesisPlanId: string;
  readonly proofDigest: string;
}

/** The bridge-proof compilation input. */
export interface AssumedElementBridgeInput {
  /** The genuine hypothetical corridor view (ONE augmentation, tamper-checked base). */
  readonly view: PinnedHypotheticalCorridorView;
  /** The corridor query both side snapshots were grounded on. */
  readonly corridorQuery: PinnedCorridorQuery;
  /** The corridor's remaining REAL blockers (the re-run's verbatim grounded facts). */
  readonly blockers: readonly GroundedExclusionFact[];
}

/** The bridge-proof compilation result: the proof + the advisory plan ids (empty iff unproven). */
export interface AssumedElementBridgeCompilation {
  readonly proof: AssumedElementBridgeProof | null;
  /**
   * The plan ids the proof supports ([hypothesisPlanId] iff the proof
   * holds; the empty set is the honest "cannot prove participation"
   * answer the hypothesis stage maps onto UNVERIFIED).
   */
  readonly assumedElementPlanIds: readonly string[];
}

/** The assumed element's declared identity + currency pair, extracted by kind (fail-closed). */
function assumedElementOf(
  augmentation: PinnedHypotheticalAugmentation,
): {
  readonly id: string;
  readonly kind: (typeof PINNED_HYPOTHESIS_AUGMENTATION_KINDS)[number];
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
} {
  const kind = augmentation.kind;
  if (!(PINNED_HYPOTHESIS_AUGMENTATION_KINDS as readonly string[]).includes(kind)) {
    throw new BridgeProofError(
      `the augmentation kind '${String(kind)}' is not a member of the frozen A.5 vocabulary — a bridge proof is never issued for an unknown kind`,
    );
  }
  if (kind === "ADD_ASSUMED_RAIL") {
    const rail = augmentation.rail;
    if (!isRecord(rail) || rail["assumed"] !== true || !isNonEmptyString(rail["assumedRailId"])) {
      throw new BridgeProofError("the ADD_ASSUMED_RAIL payload must carry the assumed brand and its assumedRailId");
    }
    return {
      id: rail.assumedRailId,
      kind,
      sourceCurrency: rail.sourceCurrency,
      destinationCurrency: rail.destinationCurrency,
    };
  }
  if (kind === "ADD_ASSUMED_CONVERSION_ASSET") {
    const asset = augmentation.asset;
    if (!isRecord(asset) || asset["assumed"] !== true || !isNonEmptyString(asset["assumedAssetId"])) {
      throw new BridgeProofError("the ADD_ASSUMED_CONVERSION_ASSET payload must carry the assumed brand and its assumedAssetId");
    }
    return {
      id: asset.assumedAssetId,
      kind,
      sourceCurrency: asset.fromCurrency,
      destinationCurrency: asset.toCurrency,
    };
  }
  const operation = augmentation.operation;
  if (!isRecord(operation) || operation["assumed"] !== true || !isNonEmptyString(operation["assumedOperationId"])) {
    throw new BridgeProofError("the ADD_ASSUMED_CONNECTOR_OPERATION payload must carry the assumed brand and its assumedOperationId");
  }
  return {
    id: operation.assumedOperationId,
    kind,
    sourceCurrency: operation.sourceCurrency,
    destinationCurrency: operation.destinationCurrency,
  };
}

/**
 * Compile the typed bridge proof for ONE hypothetical view: prove (or
 * honestly fail to prove) that the view's EXACT assumed element bridges
 * the corridor. Deterministic (identical inputs -> byte-identical proof
 * digests); fail-closed on every shape law; NEVER a RoutePlan and never
 * carrying a RoutePlan-shaped field.
 */
export function compileAssumedElementBridge(
  input: AssumedElementBridgeInput,
): AssumedElementBridgeCompilation {
  const request = requireObject(input, "the bridge-proof compilation request");
  const viewRecord = requireObject(request["view"], "the hypothetical corridor view");
  const view = viewRecord as unknown as PinnedHypotheticalCorridorView;
  if (
    !isNonEmptyString(view.variantId) ||
    !isNonEmptyString(view.baseViewDigest) ||
    !isNonEmptyString(view.operatorId) ||
    !isRecord(view.augmentation) ||
    !isRecord(view.baseView)
  ) {
    throw new BridgeProofError(
      "the bridge proof requires a genuine hypothetical corridor view (variantId, baseViewDigest, operatorId, baseView and its ONE augmentation — hypothetical-views.ts deriveHypotheticalView)",
    );
  }
  const query = requireObject(request["corridorQuery"], "the corridor query");
  if (!isNonEmptyString(query["sourceCurrency"]) || !isNonEmptyString(query["destinationCurrency"])) {
    throw new BridgeProofError("the corridor query must carry its source and destination currency codes");
  }
  const blockersRecord = request["blockers"];
  if (!Array.isArray(blockersRecord)) {
    throw new BridgeProofError("the corridor's remaining blockers must be an array of grounded exclusion facts");
  }
  for (const blocker of blockersRecord) {
    const fact = requireObject(blocker, "a remaining blocker");
    if (!isNonEmptyString(fact["code"]) || !isNonEmptyString(fact["routeId"]) || !isNonEmptyString(fact["message"])) {
      throw new BridgeProofError("every remaining blocker must be a verbatim grounded exclusion fact (side, routeId, code, message)");
    }
  }
  const blockers = blockersRecord as readonly GroundedExclusionFact[];

  const element = assumedElementOf(view.augmentation);

  // (2) CONNECTIVITY — the element must span the corridor's EXACT declared pair.
  const spansPair =
    element.sourceCurrency === query.sourceCurrency &&
    element.destinationCurrency === query.destinationCurrency;

  // (3) BRIDGE-WORTHINESS — non-empty blockers, every one answered by the kind.
  const answerable = PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES[element.kind];
  const answeredBlockerCodes = blockers.map((blocker) => blocker.code);
  const everyBlockerAnswered =
    blockers.length > 0 && answeredBlockerCodes.every((code) => (answerable as readonly string[]).includes(code));

  if (!spansPair || !everyBlockerAnswered) {
    // The honest failure: no proof is issued — the hypothesis stage maps
    // the empty plan-id set onto UNVERIFIED with its own honest reason.
    return deepFreeze({ proof: null, assumedElementPlanIds: Object.freeze([]) }) as AssumedElementBridgeCompilation;
  }

  const hypothesisPlanId = `hypothesis-plan:${view.variantId}`;
  const proofDigest = contentDigest({
    proofKind: "ASSUMED_ELEMENT_BRIDGE_PROOF",
    assumedElementId: element.id,
    augmentationKind: element.kind,
    spansSourceCurrency: element.sourceCurrency,
    spansDestinationCurrency: element.destinationCurrency,
    answeredBlockerCodes: Object.freeze([...answeredBlockerCodes]),
    hypothesisPlanId,
    advisoryOnly: true,
    neverExecutable: true,
  });
  const proof: AssumedElementBridgeProof = deepFreeze({
    proofKind: "ASSUMED_ELEMENT_BRIDGE_PROOF",
    assumedElementId: element.id,
    augmentationKind: element.kind,
    spansSourceCurrency: element.sourceCurrency,
    spansDestinationCurrency: element.destinationCurrency,
    answeredBlockerCodes: Object.freeze([...answeredBlockerCodes]),
    hypothesisPlanId,
    proofDigest,
  });
  return deepFreeze({
    proof,
    assumedElementPlanIds: Object.freeze([hypothesisPlanId]),
  }) as AssumedElementBridgeCompilation;
}
