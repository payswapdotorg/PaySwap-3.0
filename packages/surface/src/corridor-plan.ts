/**
 * @payswap/surface — the cross-provider corridor plan presentation (P22-B).
 *
 * NET-NEW module: the four-leg corridor plan PRESENTATION contract. The
 * corridor's ROUTE authority lives in @payswap/route-planning
 * (src/pins/corridor.ts, the ADR-0016 appendix pin contract); this module
 * pins the presentation vocabulary BY VALUE (the corridor-coverage
 * precedent — a projection, never an authority):
 *
 * - the leg kinds are DERIVED from the frozen skeleton index (a source can
 *   never author a mismatched leg kind — the shape is pinned);
 * - custody is CONTINUOUS by law (each leg's arrival point is the next
 *   leg's departure point — the chain never silently breaks);
 * - the onchain leg carries the ISSUER-SCOPED relay asset (two issuers of
 *   the same code are two assets — the collision law);
 * - every leg discloses its prerequisites in people language;
 * - the leg count is disclosed (a corridor is a four-leg plan, never a
 *   single hop dressed up).
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/**
 * VALUE PIN — authority: @payswap/route-planning src/pins/corridor.ts
 * `PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID`. The corridor route shape id.
 */
export const CORRIDOR_PLAN_SHAPE_ID = "cross-provider-corridor" as const;

/**
 * VALUE PIN — authority: @payswap/route-planning src/pins/corridor.ts
 * `PINNED_CORRIDOR_LEG_SKELETON`. The frozen four-leg skeleton, in order:
 * the fiat collect, the stablecoin issuance, the onchain transfer, the
 * off-ramp payout. A corridor plan presents EXACTLY these legs.
 */
export const CORRIDOR_PLAN_LEG_SKELETON = [
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "ONCHAIN_TRANSFER",
  "OFF_RAMP_PAYOUT",
] as const;

/** A corridor leg kind (derived from the skeleton index, never authored). */
export type CorridorPlanLegKind = (typeof CORRIDOR_PLAN_LEG_SKELETON)[number];

/**
 * VALUE PIN — authority: @payswap/route-planning src/pins/corridor.ts
 * `PINNED_CORRIDOR_DIRECTION_CLASSES`. A corridor is a MOVE or a CONVERT —
 * never a PAY (direct payments stay max-hops-1 by their own law).
 */
export const CORRIDOR_PLAN_DIRECTION_CLASSES = ["MOVE", "CONVERT"] as const;

/** The corridor's direction class (PAY is structurally excluded). */
export type CorridorPlanDirectionClass = (typeof CORRIDOR_PLAN_DIRECTION_CLASSES)[number];

/**
 * VALUE PIN — authority: @payswap/onchain-domain (mirrored at
 * @payswap/opportunities src/pins/onchain-domain.ts
 * `PINNED_ASSET_SYMBOL_PATTERN`). The asset-code format.
 */
export const CORRIDOR_PLAN_ASSET_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/**
 * VALUE PIN — authority: ADR-0016 appendix (the Stellar StrKey laws) /
 * @payswap/route-planning src/pins/corridor.ts issuer law. The G-address
 * account StrKey shape.
 */
export const CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN = /^G[A-Z2-7]{55}$/;

/**
 * VALUE PIN — authority: @payswap/opportunities src/pins/onchain-domain.ts
 * `pinnedIsValidCapitalAssetRef` (the three-segment issuer-scoped branch).
 * Behaviour-pinned: `${chainKey}/asset:${CODE}:${issuerG}`.
 */
export function isIssuerScopedCorridorAssetRef(
  chainKey: string,
  assetRef: unknown,
): assetRef is string {
  if (typeof assetRef !== "string") return false;
  const prefix = `${chainKey}/asset:`;
  if (!assetRef.startsWith(prefix)) return false;
  const remainder = assetRef.substring(prefix.length);
  const colonAt = remainder.indexOf(":");
  if (colonAt === -1) return false;
  const code = remainder.substring(0, colonAt);
  const issuer = remainder.substring(colonAt + 1);
  return (
    CORRIDOR_PLAN_ASSET_SYMBOL_PATTERN.test(code) &&
    CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN.test(issuer)
  );
}

/** The onchain leg's lane rides a chain; every other leg rides a provider. */
export type CorridorPlanLaneKind = "PROVIDER" | "ONCHAIN_CHAIN";

/** Which lane a leg rides (the people-language label renders verbatim). */
export interface CorridorPlanLegLane {
  readonly kind: CorridorPlanLaneKind;
  /** A provider id (PROVIDER legs) or a chain key (ONCHAIN_CHAIN legs). */
  readonly id: string;
  readonly label: string;
}

/** A custody point in people language (who holds the value at that moment). */
export interface CorridorPlanLegCustody {
  readonly from: string;
  readonly to: string;
}

/** What the fold reads from one corridor leg (the leg kind is NOT authored — the skeleton index derives it). */
export interface CorridorPlanLegSource {
  readonly lane: CorridorPlanLegLane;
  readonly custody: CorridorPlanLegCustody;
  /** The relay asset (issuer-scoped) — required on the onchain leg only. */
  readonly assetRef?: string;
  /** Per-leg prerequisites in people language (non-empty by law). */
  readonly prerequisites: readonly string[];
}

/** What the fold reads from a corridor-shaped plan. */
export interface CorridorPlanSource {
  readonly planId: string;
  readonly directionClass: CorridorPlanDirectionClass;
  /** The on-ramp funding method (the corridor's collect-lane lane identity). */
  readonly fundingMethod: string;
  /** The off-ramp payout method (the payout-lane lane identity). */
  readonly payoutMethod: string;
  /**
   * The issuer-scoped relay asset carried across the onchain leg, e.g.
   * `stellar:testnet/asset:USDC:<issuerG>` (ADR-0016 D3 — issuer-scoped).
   */
  readonly relayAssetRef: string;
  /** Exactly the four skeleton legs, in skeleton order. */
  readonly legs: readonly CorridorPlanLegSource[];
}

/** One presented corridor leg. */
export interface CorridorPlanLegView {
  readonly legIndex: number;
  readonly legKind: CorridorPlanLegKind;
  /** The people-language label for the leg kind (frozen). */
  readonly peopleLabel: string;
  readonly lane: CorridorPlanLegLane;
  readonly custody: CorridorPlanLegCustody;
  readonly assetRef?: string;
  readonly prerequisites: readonly string[];
}

/** The presented corridor plan. */
export interface CorridorPlanPresentation {
  readonly planId: string;
  readonly shapeId: typeof CORRIDOR_PLAN_SHAPE_ID;
  readonly directionClass: CorridorPlanDirectionClass;
  /** The leg count, disclosed (always the skeleton length). */
  readonly legCount: number;
  readonly legs: readonly CorridorPlanLegView[];
  /** The custody points in chain order (N legs => N+1 points, continuous). */
  readonly custodyChain: readonly string[];
  readonly relayAssetRef: string;
  /** The chain key the onchain leg rides (e.g. "stellar:testnet"). */
  readonly relayChainKey: string;
  readonly fundingMethod: string;
  readonly payoutMethod: string;
  /** The SIMPLE outcome line (people language, leg count disclosed). */
  readonly outcomeLine: string;
  readonly provenance: SurfaceContractProvenance;
}

/**
 * The frozen people-language labels per leg kind. The presentation renders
 * these verbatim; the lane labels carry the instance facts.
 */
export const CORRIDOR_PLAN_LEG_PEOPLE_LABELS: Readonly<
  Record<CorridorPlanLegKind, string>
> = Object.freeze({
  FIAT_PSP_COLLECT: "Collect the departure currency from the payer's provider account",
  PSP_STABLECOIN_ISSUANCE: "Issue the stablecoin against the collected fiat",
  ONCHAIN_TRANSFER: "Transfer the stablecoin onchain to the off-ramp's receiving address",
  OFF_RAMP_PAYOUT: "Pay out the arrival currency to the beneficiary's bank account",
});

/** Raised when a corridor plan source is invalid (fail-closed). */
export class InvalidCorridorPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCorridorPlanError";
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidCorridorPlanError(`${field} must be a non-empty string (blank is not a value)`);
  }
  return value;
}

function validateLane(lane: CorridorPlanLegLane, legIndex: number): void {
  requireNonEmptyString(lane?.id, `leg ${legIndex}: lane.id`);
  requireNonEmptyString(lane?.label, `leg ${legIndex}: lane.label`);
  if (lane?.kind !== "PROVIDER" && lane?.kind !== "ONCHAIN_CHAIN") {
    throw new InvalidCorridorPlanError(
      `leg ${legIndex}: lane.kind must be "PROVIDER" or "ONCHAIN_CHAIN"`,
    );
  }
}

/**
 * Fold a corridor-shaped plan into the presentation view. Pure and
 * fail-closed: the skeleton order, the custody continuity, the onchain
 * lane law, the issuer-scoped relay asset and the per-leg prerequisites
 * are all enforced — a plan that violates any law is refused, never
 * silently reshaped.
 */
export function foldCorridorPlan(source: CorridorPlanSource): CorridorPlanPresentation {
  requireNonEmptyString(source?.planId, "planId");
  if (
    source?.directionClass !== "MOVE" &&
    source?.directionClass !== "CONVERT"
  ) {
    throw new InvalidCorridorPlanError(
      `plan ${source?.planId}: directionClass must be MOVE or CONVERT — a corridor is never a direct payment (direct payments stay max-hops-1 by their own law)`,
    );
  }
  requireNonEmptyString(source?.fundingMethod, `plan ${source.planId}: fundingMethod`);
  requireNonEmptyString(source?.payoutMethod, `plan ${source.planId}: payoutMethod`);
  requireNonEmptyString(source?.relayAssetRef, `plan ${source.planId}: relayAssetRef`);

  const legs = source?.legs ?? [];
  if (legs.length !== CORRIDOR_PLAN_LEG_SKELETON.length) {
    throw new InvalidCorridorPlanError(
      `plan ${source.planId}: a corridor plan presents exactly ${CORRIDOR_PLAN_LEG_SKELETON.length} legs (the frozen skeleton) — got ${legs.length}`,
    );
  }

  const onchainIndex = CORRIDOR_PLAN_LEG_SKELETON.indexOf("ONCHAIN_TRANSFER");
  const onchainLeg = legs[onchainIndex];
  const relayChainKey = onchainLeg?.lane?.id ?? "";
  if (!isIssuerScopedCorridorAssetRef(relayChainKey, source.relayAssetRef)) {
    throw new InvalidCorridorPlanError(
      `plan ${source.planId}: relayAssetRef must be the issuer-scoped form \`${relayChainKey}/asset:<CODE>:<issuerG>\` (two issuers of the same code are two assets — the collision law)`,
    );
  }

  const legViews: CorridorPlanLegView[] = [];
  const custodyChain: string[] = [];
  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index];
    if (leg === undefined) {
      throw new InvalidCorridorPlanError(`plan ${source.planId}: leg ${index} is absent`);
    }
    const legKind = CORRIDOR_PLAN_LEG_SKELETON[index];
    if (legKind === undefined) {
      throw new InvalidCorridorPlanError(`plan ${source.planId}: leg ${index} has no skeleton kind`);
    }
    validateLane(leg.lane, index);
    requireNonEmptyString(leg.custody?.from, `leg ${index}: custody.from`);
    requireNonEmptyString(leg.custody?.to, `leg ${index}: custody.to`);
    if (index > 0) {
      const previous = legs[index - 1];
      if (previous === undefined || previous.custody?.to !== leg.custody?.from) {
        throw new InvalidCorridorPlanError(
          `plan ${source.planId}: custody is discontinuous at leg ${index} — "${previous?.custody?.to ?? "<absent>"}" does not hand to "${leg.custody?.from ?? "<absent>"}" (the chain never silently breaks)`,
        );
      }
    } else {
      custodyChain.push(leg.custody.from);
    }
    custodyChain.push(leg.custody.to);
    if (legKind === "ONCHAIN_TRANSFER") {
      if (leg.lane.kind !== "ONCHAIN_CHAIN") {
        throw new InvalidCorridorPlanError(
          `plan ${source.planId}: the onchain leg (leg ${index}) must ride an ONCHAIN_CHAIN lane — got "${leg.lane.kind}"`,
        );
      }
      if (leg.assetRef !== source.relayAssetRef) {
        throw new InvalidCorridorPlanError(
          `plan ${source.planId}: the onchain leg must carry the plan's issuer-scoped relay asset — got "${leg.assetRef ?? "<absent>"}"`,
        );
      }
    } else if (leg.lane.kind !== "PROVIDER") {
      throw new InvalidCorridorPlanError(
        `plan ${source.planId}: leg ${index} (${legKind}) must ride a PROVIDER lane — got "${leg.lane.kind}"`,
      );
    }
    if (!Array.isArray(leg.prerequisites) || leg.prerequisites.length === 0) {
      throw new InvalidCorridorPlanError(
        `plan ${source.planId}: leg ${index} (${legKind}) must disclose at least one prerequisite in people language`,
      );
    }
    for (const prerequisite of leg.prerequisites) {
      requireNonEmptyString(prerequisite, `leg ${index}: prerequisite`);
    }
    legViews.push({
      legIndex: index,
      legKind,
      peopleLabel: CORRIDOR_PLAN_LEG_PEOPLE_LABELS[legKind],
      lane: leg.lane,
      custody: leg.custody,
      ...(leg.assetRef !== undefined ? { assetRef: leg.assetRef } : {}),
      prerequisites: leg.prerequisites,
    });
  }

  const outcomeLine =
    `A ${CORRIDOR_PLAN_LEG_SKELETON.length}-leg cross-provider corridor plan (${source.directionClass}): ` +
    `collect, issue, transfer onchain, pay out — custody passes through ` +
    `${custodyChain.length} named points and the onchain leg carries the ` +
    `issuer-scoped stablecoin. The leg count is disclosed, never hidden.`;

  return {
    planId: source.planId,
    shapeId: CORRIDOR_PLAN_SHAPE_ID,
    directionClass: source.directionClass,
    legCount: CORRIDOR_PLAN_LEG_SKELETON.length,
    legs: legViews,
    custodyChain,
    relayAssetRef: source.relayAssetRef,
    relayChainKey,
    fundingMethod: source.fundingMethod,
    payoutMethod: source.payoutMethod,
    outcomeLine,
    provenance: surfaceProvenance("P22-B"),
  };
}
