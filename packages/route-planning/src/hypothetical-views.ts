/**
 * @payswap/route-planning — the hypothetical corridor views (P23-C, lane
 * C; ADR-0015 D5 — the one-change discipline over the merged corridor
 * view).
 *
 * The Lab intervention discipline EXTENDED to corridor views without
 * crossing INV-L01 (production corridor data never becomes Lab simulation
 * facts and vice versa): the base merged corridor view (candidates.ts
 * mergedCorridorView) is tamper-checked FIRST (the declared digest is
 * recomputed over the canonical projection — a mismatch NEVER proceeds),
 * exactly ONE named augmentation is applied per variant (the one-change
 * law — a second augmentation, or an already-hypothetical base, is the
 * typed error), the variant identity is
 * `hypothesis:<baseViewDigest>:<operatorId>`, and the output carries the
 * base view + the ONE assumed element, deep-frozen, with its own digest.
 *
 * THE DISTINCT-TYPE LAWS: an AssumedRail / AssumedConversionAsset /
 * AssumedConnectorOperation is a DISTINCT pinned type (pins/hypotheses.ts)
 * — the `assumed: true` brand, NO observation ids, NO instance ids,
 * provider names as plain assumed strings; a payload smuggling an
 * observationId or instanceId field fails closed, never becomes a fake
 * real rail. Deterministic: identical inputs -> byte-identical digests.
 */

import { contentDigest, deepFreeze, isNonEmptyString, isRecord, requireObject } from "./canonical.ts";
import { canonicalJsonStringify } from "./canonical.ts";
import { RoutePlanningError } from "./errors.ts";
import type { PinnedCorridorRouteEvaluation, PinnedCorridorView } from "./pins/capability.ts";
import { PINNED_HYPOTHESIS_AUGMENTATION_KINDS } from "./pins/hypotheses.ts";
import type {
  PinnedHypotheticalAugmentation,
  PinnedHypotheticalCorridorView,
} from "./pins/hypotheses.ts";

/** A hypothetical-view derivation input violated the one-change laws. */
export class HypotheticalViewError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "HYPOTHETICAL_VIEW_FAILED", details);
    this.name = "HypotheticalViewError";
  }
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
/** The assumed-element marker fields that must NEVER appear (the distinct-type law, machine-enforced). */
const FORBIDDEN_ASSUMED_FIELDS: readonly string[] = ["observationId", "instanceId", "observedAt", "observationVersion"];

function requireAssumedCurrency(value: unknown, subject: string): string {
  if (typeof value !== "string" || !CURRENCY_PATTERN.test(value)) {
    throw new HypotheticalViewError(`${subject} must be a three-letter currency code (the corridor's REAL dimension)`);
  }
  return value;
}

/** Fail-closed validation of one assumed payload (the distinct-type laws). */
function validatedAssumedPayload(augmentation: unknown): PinnedHypotheticalAugmentation {
  const record = requireObject(augmentation, "a hypothetical augmentation");
  const kind = record["kind"];
  if (typeof kind !== "string" || !(PINNED_HYPOTHESIS_AUGMENTATION_KINDS as readonly string[]).includes(kind)) {
    throw new HypotheticalViewError(
      `the augmentation kind '${String(kind)}' is not a member of the frozen A.5 vocabulary — the kinds are ${PINNED_HYPOTHESIS_AUGMENTATION_KINDS.join(" | ")}`,
    );
  }
  const payloadKey = kind === "ADD_ASSUMED_RAIL" ? "rail" : kind === "ADD_ASSUMED_CONVERSION_ASSET" ? "asset" : "operation";
  const payload = requireObject(record[payloadKey], `the ${kind} payload`);
  if (payload["assumed"] !== true) {
    throw new HypotheticalViewError(`the ${kind} payload must carry the \`assumed: true\` brand — an assumed element is never a real rail`);
  }
  for (const forbidden of FORBIDDEN_ASSUMED_FIELDS) {
    if (payload[forbidden] !== undefined) {
      throw new HypotheticalViewError(
        `the ${kind} payload carries the field '${forbidden}' — an assumed element NEVER carries observation or instance identity (the distinct-type law: never a fake real rail, never a fabricated observation id)`,
        { field: forbidden },
      );
    }
  }
  const requireId = (subject: string): string => {
    const id = payload[subject === "rail" ? "assumedRailId" : subject === "asset" ? "assumedAssetId" : "assumedOperationId"];
    if (!isNonEmptyString(id)) {
      throw new HypotheticalViewError(`the ${kind} payload must carry its assumed ${subject} id`);
    }
    return id;
  };
  if (kind === "ADD_ASSUMED_RAIL") {
    const id = requireId("rail");
    const providerName = payload["providerName"];
    const railKind = payload["railKind"];
    if (!isNonEmptyString(providerName) || providerName.startsWith("provider:")) {
      throw new HypotheticalViewError("an assumed rail's providerName is a plain assumed string, never a provider reference");
    }
    if (railKind !== "ONCHAIN" && railKind !== "FIAT" && railKind !== "FX") {
      throw new HypotheticalViewError("an assumed rail's railKind must be ONCHAIN, FIAT or FX");
    }
    requireAssumedCurrency(payload["sourceCurrency"], "an assumed rail's sourceCurrency");
    requireAssumedCurrency(payload["destinationCurrency"], "an assumed rail's destinationCurrency");
    if (!isNonEmptyString(payload["summary"])) throw new HypotheticalViewError("an assumed rail must carry a summary");
    return record as unknown as PinnedHypotheticalAugmentation;
  }
  if (kind === "ADD_ASSUMED_CONVERSION_ASSET") {
    requireId("asset");
    requireAssumedCurrency(payload["fromCurrency"], "an assumed conversion asset's fromCurrency");
    requireAssumedCurrency(payload["toCurrency"], "an assumed conversion asset's toCurrency");
    if (!isNonEmptyString(payload["summary"])) throw new HypotheticalViewError("an assumed conversion asset must carry a summary");
    return record as unknown as PinnedHypotheticalAugmentation;
  }
  requireId("operation");
  if (!isNonEmptyString(payload["providerName"]) || !isNonEmptyString(payload["operationKind"])) {
    throw new HypotheticalViewError("an assumed connector operation must carry a plain assumed providerName and an operationKind");
  }
  requireAssumedCurrency(payload["sourceCurrency"], "an assumed connector operation's sourceCurrency");
  requireAssumedCurrency(payload["destinationCurrency"], "an assumed connector operation's destinationCurrency");
  if (!isNonEmptyString(payload["summary"])) throw new HypotheticalViewError("an assumed connector operation must carry a summary");
  return record as unknown as PinnedHypotheticalAugmentation;
}

/**
 * The value-form digest over the base merged corridor view's CANONICAL
 * PROJECTION (ADR-0009 D4 — the one flavor of this package; the
 * projection guarantees the authority's lane-owned optional members with
 * absent values never enter the canonical form). Callers declare this
 * digest; deriveHypotheticalView recomputes it as the tamper check.
 */
export function corridorViewDigest(view: PinnedCorridorView): string {
  const record = requireObject(view, "the merged corridor view");
  const routes = record["routes"];
  if (!Array.isArray(routes) || !Array.isArray(record["eligibleRoutes"]) || !isRecord(record["query"])) {
    throw new HypotheticalViewError("the base view must be a merged corridor view (query, routes, eligibleRoutes)");
  }
  return contentDigest({
    projectionVersion: record["projectionVersion"],
    query: record["query"],
    routes: (routes as readonly PinnedCorridorRouteEvaluation[]).map((route) => ({
      routeId: route.routeId,
      eligible: route.eligible,
      exclusionReasons: route.exclusionReasons.map((exclusion) => ({
        code: exclusion.code,
        cause: exclusion.cause,
        layer: exclusion.layer,
        message: exclusion.message,
        ...(isRecord(exclusion.detail) ? { detail: exclusion.detail } : {}),
      })),
      effectiveAvailability: route.effectiveAvailability,
      lineage: route.lineage,
      offeredExecutionModes: route.offeredExecutionModes,
      termsRefs: route.termsRefs,
    })),
    eligibleRoutes: (record["eligibleRoutes"] as readonly PinnedCorridorRouteEvaluation[]).map((route) => route.routeId),
  });
}

/** The hypothetical-view derivation input (the one-change laws). */
export interface HypotheticalViewDerivationInput {
  /** The REAL merged corridor view (candidates.ts mergedCorridorView). */
  readonly baseView: PinnedCorridorView;
  /** The caller-declared base digest (corridorViewDigest) — tamper-checked FIRST. */
  readonly declaredBaseViewDigest: string;
  readonly operatorId: string;
  /** EXACTLY ONE augmentation per variant (the one-change law). */
  readonly augmentations: readonly PinnedHypotheticalAugmentation[];
}

/**
 * Derive ONE hypothetical corridor view: tamper-check the base digest
 * FIRST, apply EXACTLY ONE named augmentation, and return the deep-frozen
 * variant with the identity `hypothesis:<baseViewDigest>:<operatorId>`
 * and its own deterministic digest. Never chains variants (an
 * already-hypothetical base fails closed); never fabricates observation or
 * instance identity.
 */
export function deriveHypotheticalView(input: HypotheticalViewDerivationInput): PinnedHypotheticalCorridorView {
  const request = requireObject(input, "the hypothetical-view derivation request");
  // LAW 1 — the tamper check FIRST: a mismatched declared digest never proceeds.
  const baseViewRecord = requireObject(request["baseView"], "the base merged corridor view");
  const declaredDigest = request["declaredBaseViewDigest"];
  if (typeof declaredDigest !== "string" || !/^fnv1a64:[0-9a-f]{16}$/.test(declaredDigest)) {
    throw new HypotheticalViewError("the declared base-view digest must be this package's value-form digest (fnv1a64:<16-hex>)");
  }
  const recomputedDigest = corridorViewDigest(baseViewRecord as unknown as PinnedCorridorView);
  if (recomputedDigest !== declaredDigest) {
    throw new HypotheticalViewError(
      "the declared base-view digest does not match the recomputed digest over the base view's canonical projection — a tampered base view never proceeds into a hypothesis",
      { declared: declaredDigest, recomputed: recomputedDigest },
    );
  }
  // The never-chain law: an already-hypothetical base is a second change.
  if (baseViewRecord["variantId"] !== undefined || baseViewRecord["augmentation"] !== undefined || baseViewRecord["hypotheticalViewDigest"] !== undefined) {
    throw new HypotheticalViewError("the base view is already a hypothetical variant — exactly ONE change per variant, never a chain");
  }
  const operatorId = request["operatorId"];
  if (!isNonEmptyString(operatorId)) {
    throw new HypotheticalViewError("the operatorId naming the variant's repair operator must be a non-empty string");
  }
  // LAW 2 — EXACTLY ONE augmentation per variant.
  const augmentations = request["augmentations"];
  const augmentationCount = Array.isArray(augmentations) ? augmentations.length : 0;
  if (!Array.isArray(augmentations) || augmentations.length !== 1) {
    throw new HypotheticalViewError(
      `exactly ONE augmentation per variant (the one-change law) — ${augmentationCount} given; a second change is a NEW variant over the REAL base, never a compound`,
    );
  }
  const augmentation = validatedAssumedPayload(augmentations[0]);
  const baseView = baseViewRecord as unknown as PinnedCorridorView;

  // LAW 3 — the variant identity; LAW 4 — the base view + the ONE assumed element.
  const variantId = `hypothesis:${declaredDigest}:${operatorId}`;
  const hypotheticalViewDigest = contentDigest({
    variantId,
    baseViewDigest: declaredDigest,
    operatorId,
    augmentation,
  });
  return deepFreeze({
    variantId,
    baseViewDigest: declaredDigest,
    operatorId,
    baseView: deepFreeze({
      projectionVersion: baseView.projectionVersion,
      query: deepFreeze({ ...baseView.query }),
      routes: deepFreeze([...baseView.routes]),
      eligibleRoutes: deepFreeze([...baseView.eligibleRoutes]),
    }),
    augmentation,
    hypotheticalViewDigest,
  });
}

/**
 * The canonical JSON of one hypothetical view (determinism proofs). The
 * projection is the variant's DEFINED identity fields — variantId,
 * baseViewDigest, operatorId, the augmentation and the variant digest —
 * because the base view's full content is already pinned byte-exactly by
 * baseViewDigest (the tamper-checked digest); serializing the raw nested
 * route records would carry their optional undefined fields, which the
 * value-form canonical JSON lawfully rejects (ADR-0009 D4).
 */
export function hypotheticalViewCanonicalJson(view: PinnedHypotheticalCorridorView): string {
  return canonicalJsonStringify({
    variantId: view.variantId,
    baseViewDigest: view.baseViewDigest,
    operatorId: view.operatorId,
    augmentation: view.augmentation,
    hypotheticalViewDigest: view.hypotheticalViewDigest,
  });
}
