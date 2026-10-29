/**
 * PaySwap Desktop renderer (P21-B run 3, ADR-0014 D9/D10) — the WAIT
 * RE-CHECK composition root: binds P21-C's REAL re-check evaluator
 * (@payswap/opportunities recheckWait — the pure "check now" service)
 * into the app's pinned WaitRecheckPlanePort at the desktop renderer's
 * business-root initialization (the missionIntakeComposition pattern).
 *
 * THE WIRING LAWS (ADR-0014 D9/D10):
 * - THE REAL EVALUATOR, never a parallel matcher: the port maps the
 *   app's pinned wait-criteria record onto the evaluator's own
 *   OpportunityMatchCriteria (the structural mirror) and the outcome
 *   back onto the pinned facts (the match ids, the wait evaluation's
 *   five keys, the staleness facts, the never-dispatch literals).
 * - FRESH OBSERVATIONS: the `observations` DI seam supplies the
 *   opportunities discovered at re-check time. The PRODUCT DEFAULT is
 *   the honest EMPTY set — no channel member carries opportunity
 *   observations today (the deployment records none; a discovery plane
 *   over the capability bridge is the named follow-on). NOTHING is
 *   fabricated.
 * - THE CONSENT GATE: recheckWait is consent-gated (the P16-C
 *   minimum-disclosure law). The PRODUCT DEFAULT is the honest
 *   NOT-GRANTED snapshot — the evaluator fails closed with its own
 *   typed error and the control surfaces it verbatim (never masked,
 *   never bypassed; a real consent plane is the named follow-on).
 * - The re-check instant: the host tier supplies it at the
 *   user-triggered call (DATA — carried in the outcome's recheckedAt);
 *   the battery injects a fixed clock.
 */

import {
  bindSharedWaitRecheckPlane,
  resetSharedWaitRecheckPlane,
  type RoutePlanningWaitCriteriaPin,
  type WaitRecheckOutcomePin,
  type WaitRecheckPlanePort,
} from "@payswap/app";
// The REAL P21-C evaluator (@payswap/opportunities — a zero-dependency
// leaf package), imported by RELATIVE SOURCE PATH: the desktop package
// declares no @payswap/* deps (the source-alias discipline, tsconfig
// (TL-normalized at integration: the @payswap/opportunities alias triplet —
// vitest.config.ts + tsconfig.mirror-check.json paths + the vite build aliases —
// the P17-C routePlanningEngineAdapter precedent.)
import {
  recheckWait,
  type ConsentSnapshot,
  type FinancialOpportunity,
  type OpportunityMatchCriteria,
} from "@payswap/opportunities";

/** The fresh-observation source (the DI seam — the discovery plane lands with the follow-on). */
export type WaitRecheckObservationsSource = () => Promise<readonly FinancialOpportunity[]>;

/** The consent snapshot source (the DI seam — the consent plane lands with the follow-on). */
export type WaitRecheckConsentSource = () => Promise<ConsentSnapshot>;

/** The composed binding handle (the port + the reset for the bridge-tier battery). */
export interface WaitRecheckComposition {
  readonly plane: WaitRecheckPlanePort;
  /** Restore the seam's honest default (unbound — the not-wired note). */
  readonly reset: () => void;
}

/** The honest NOT-GRANTED consent snapshot (never a forged grant). */
function notGrantedConsent(): ConsentSnapshot {
  return { subject: "payswap-desktop-composer", granted: null, revocation: null };
}

/**
 * Compose + bind the wait re-check plane over the REAL evaluator. Called
 * ONCE at the renderer's business-root initialization; the observation
 * and consent sources are DI seams (the honest defaults stand until the
 * host-side discovery + consent planes land — both named gaps).
 */
export function composeWaitRecheckBinding(options?: {
  readonly observations?: WaitRecheckObservationsSource;
  readonly consent?: WaitRecheckConsentSource;
  readonly clock?: () => number;
}): WaitRecheckComposition {
  const readObservations = options?.observations ?? (async () => []);
  const readConsent = options?.consent ?? (async () => notGrantedConsent());
  const clock = options?.clock ?? (() => Date.now());
  const plane: WaitRecheckPlanePort = {
    async recheckWait(input): Promise<WaitRecheckOutcomePin> {
      // The app's pinned criteria record IS the structural mirror of the
      // evaluator's own criteria (the same keys; the optional exact-rational
      // bounds stay in the opportunities authority — never constructed here).
      const criteria = input.criteria as unknown as OpportunityMatchCriteria;
      const [opportunities, consent] = await Promise.all([readObservations(), readConsent()]);
      const at = clock();
      const outcome = recheckWait({ criteria, opportunities, consent }, at);
      return {
        recheckedAt: new Date(at).toISOString(),
        matchedOpportunityIds: [...outcome.match.matched.map((entry) => entry.opportunityId)],
        categoryAttribution: outcome.waitEvaluation.categoryAttribution,
        staleOpportunityIds: [...outcome.staleOpportunityIds],
        expired: outcome.waitEvaluation.expired,
        reasons: [...outcome.waitEvaluation.reasons],
        waitingNeverDispatches: false,
        neverAutoDispatches: true,
      };
    },
  };
  bindSharedWaitRecheckPlane(plane);
  return { plane, reset: resetSharedWaitRecheckPlane };
}

/** Re-export the app's criteria pin type for composition consumers. */
export type { RoutePlanningWaitCriteriaPin };

/* ---------------- (P23-B, ADR-0015 D9d) the chains-derived observations source ---------------- */

import { discoverOpportunity } from "@payswap/opportunities";
import type { PaySwapConnectionCapabilityChainDto } from "./consoleConnectionsWire.js";

/**
 * VALUE PIN — authority: the host's onchain chain derivation
 * (src/host/payswap/connections/onchain-chain-derivation.ts — the
 * definition id `capability:onchain-rail:<chainKey>`; P22-H landed
 * exactly ONE: the stellar:testnet rail). The marker that selects the
 * ONCHAIN branch of the rail-key law below.
 */
const ONCHAIN_RAIL_DEFINITION_ID = "capability:onchain-rail:stellar:testnet" as const;

/**
 * The DISCOVERY PLANE over the capability bridge (the named P21 follow-on,
 * realized renderer-side per ADR-0015 D9d — NO new host member): each ACTIVE
 * connection's chain becomes ONE honest UNKNOWN-heavy opportunity through
 * the REAL discoverOpportunity constructor. The mapping is deliberately
 * conservative: a rail observation is NOT a liquidity/lending/staking/
 * incentive/arbitrage opportunity — the family is "other" with the honest
 * policy provenance, the estimates stay UNKNOWN (the zero-rate unverified
 * component records the observation), and the exit path is UNKNOWN until a
 * real opportunity plane exists. The consequence is honest: the wait's
 * criteria (families ["liquidity"], FEES_KNOWN) do NOT match these records —
 * a match still requires a REAL opportunity with verified fees, never a
 * rail observation dressed up as one.
 */
export function chainDerivedWaitRecheckObservations(
  services: { readonly payswapDesktopService?: unknown },
): WaitRecheckObservationsSource {
  const client = services.payswapDesktopService as unknown as
    | { connectionCapabilityChains?: () => Promise<readonly PaySwapConnectionCapabilityChainDto[]> }
    | undefined;
  const readChains =
    client !== undefined && typeof client.connectionCapabilityChains === "function"
      ? client.connectionCapabilityChains.bind(client)
      : null;
  return async (): Promise<readonly FinancialOpportunity[]> => {
    if (readChains === null) {
      // The member is absent (an older host) — the honest EMPTY set, fail-closed.
      return [];
    }
    let chains: readonly PaySwapConnectionCapabilityChainDto[];
    try {
      chains = await readChains();
    } catch {
      // The honest read-failure posture: no observations this cycle (never fabricated).
      return [];
    }
    const opportunities: FinancialOpportunity[] = [];
    for (const chain of chains) {
      if (chain.instance.authorization.status !== "ACTIVE") {
        continue;
      }
      const asOfMs = Date.parse(chain.observation.observedAt);
      if (!Number.isSafeInteger(asOfMs) || asOfMs < 0) {
        continue;
      }
      const providerName = chain.instance.providerName;
      // (P22-B, ADR-0016 D5/D9) THE ONCHAIN RAIL BRANCH: the stellar:testnet
      // chain derives from the onchain plane's own four-layer hierarchy —
      // its definition id is the pinned rail marker and its instance
      // providerName IS the chain key ("stellar:testnet" — a valid rail key
      // on its own, never a "fiat:" prefix). The rail rides railKind
      // "ONCHAIN" (the corridor relay rail); the PSP branch below stays
      // untouched for every payment-provider chain.
      const isOnchainRail = chain.definition.id === ONCHAIN_RAIL_DEFINITION_ID;
      const railKind = isOnchainRail ? ("ONCHAIN" as const) : ("FIAT" as const);
      // The canonical rail-key law (PINNED_RAIL_KEY_PATTERN — lowercase
      // namespace:network): the provider's display name is title-cased
      // ("Flutterwave"), so the provider-scoped fiat rail key lowercases it
      // (the bridge battery's catch: an uppercase rail key is rejected by
      // discoverOpportunity and the record was silently skipped — the
      // source returned the empty set while the chains were ACTIVE).
      const railKey = isOnchainRail
        ? providerName
        : `fiat:${providerName.toLowerCase()}`;
      const observation = {
        family: "other" as const,
        observationId: `chain-observation:${chain.instance.instanceId}`,
        observationVersion: chain.observation.observationVersion,
        venueId: `provider:${providerName}`,
        railKind,
        railKey,
        adapterId: chain.implementation.adapterRef,
        observerId: `connection-bridge:${chain.observation.provenance.source}`,
        freshness: { asOfMs, maxAgeMs: 3_600_000 },
        evidenceRefs: [
          `connection-chain:${chain.instance.instanceId}:${chain.observation.observationVersion}`,
        ],
        title: isOnchainRail
          ? `the ${providerName} onchain rail (the corridor's relay)`
          : `the ${providerName} connection rail`,
        description: isOnchainRail
          ? "an observed onchain rail over the capability bridge — the corridor's relay chain, an honest UNKNOWN-tier opportunity record for the wait re-check, never a liquidity claim"
          : "an observed connection rail over the capability bridge — an honest UNKNOWN-tier opportunity record for the wait re-check, never a liquidity claim",
        exitPath: {
          status: "UNKNOWN" as const,
          description: "the exit path is not observed for a rail-connection record",
          constraints: [],
        },
        lockUp: { locked: false, durationMs: null, unlockConditions: [] },
        smartContractRisk: { level: "UNKNOWN" as const, audited: null, summary: "not observed for a rail-connection record" },
        oracleBridgeRisk: { level: "UNKNOWN" as const, audited: null, summary: "not observed for a rail-connection record" },
        returnComponents: [
          {
            componentId: `chain-observation:${chain.instance.instanceId}:composition-gap`,
            kind: "INCENTIVE_YIELD" as const,
            ratePerYear: { numerator: "0", denominator: "1" },
            evidenceVerified: false,
            description:
              "no return is observed for a rail-connection record — the zero-rate unverified component keeps the estimate UNKNOWN (the honesty law)",
          },
        ],
        policyApprovalRef: "policy:connection-capability-bridge",
      };
      try {
        opportunities.push(discoverOpportunity(observation, asOfMs));
      } catch {
        // A chain whose observation cannot construct honestly is skipped —
        // never fabricated, never a crash of the whole re-check.
      }
    }
    return opportunities;
  };
}
