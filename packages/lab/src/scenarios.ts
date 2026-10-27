/**
 * Lab scenario generation and the MANDATORY BASELINE SUITE (P6-W1; the
 * P6 rebuild of the old payswap.org@8a735bf packages/lab scenarios.ts,
 * W2-004 — LAB.md "Scenario generation" + "Promotion").
 *
 * The baseline suite covers the full LAB.md scenario taxonomy: normal
 * demand plus liquidity shortages, provider outages, FX volatility,
 * delayed writes, approval delays, stale observations, fraud, collusion,
 * malicious agents, incentive gaming, partial payments, congestion and
 * adversarial model behavior.
 *
 * The canonical payment-routing Domain Pack is declared here beside the
 * suite it evaluates (LAB.md: the pack's evaluationSuite references the
 * baseline suite id).
 *
 * Everything here is pure data: fixed amounts, fixed steps, no ambient
 * clock, no Math.random. The only entropy in any run is the caller-supplied
 * seed (see the simulation family).
 */

import type { SimulatedWorld } from "./simulation-world.ts";
import type {
  DemandPlan,
  ScenarioIncident,
  SimulationScenarioPlan,
} from "./simulation-plan.ts";
import type { LabScenarioTypeId, DomainPack } from "./domain-packs.ts";
import type { BaselineCandidate } from "./baseline-candidates.ts";
import { BASELINE_CANDIDATES } from "./baseline-candidates.ts";

// ---------------------------------------------------------------------------
// Lab scenarios
// ---------------------------------------------------------------------------

/** A runnable Lab scenario: world + plan, classified by the taxonomy. */
export interface LabScenario {
  readonly scenarioId: string;
  readonly domainPackId: string;
  readonly scenarioType: LabScenarioTypeId;
  readonly description: string;
  readonly world: SimulatedWorld;
  readonly plan: SimulationScenarioPlan;
}

// ---------------------------------------------------------------------------
// The baseline world (deterministic, shared by the baseline suite)
// ---------------------------------------------------------------------------

export const BASELINE_WORLD: SimulatedWorld = {
  worldId: "lab.baseline-world",
  baseCurrency: "EUR",
  stepLatencyMs: 250,
  rails: [
    { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
    { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
    { railId: "rail-c", currency: "USD", latencyMs: 600, fixedFeeMinor: 15n, variableFeeBps: 12n, fxSpreadBps: 20n },
    { railId: "rail-d", currency: "EUR", latencyMs: 1_500, fixedFeeMinor: 5n, variableFeeBps: 4n },
  ],
  pools: [
    { poolId: "pool-a", railId: "rail-a", availableMinor: 10_000_000n },
    { poolId: "pool-b", railId: "rail-b", availableMinor: 8_000_000n },
    { poolId: "pool-c", railId: "rail-c", availableMinor: 6_000_000n },
    { poolId: "pool-d", railId: "rail-d", availableMinor: 1_200_000n },
  ],
};

const DEFAULT_DEADLINE_MS = 10_000;

function demand(
  demandId: string,
  atStep: number,
  amountMinor: bigint,
  extra?: Partial<
    Pick<
      DemandPlan,
      | "adversarial"
      | "partialBps"
      | "requiresApproval"
      | "currency"
      | "direction"
      | "deadlineMs"
    >
  >,
): DemandPlan {
  return {
    demandId,
    atStep,
    amountMinor,
    currency: extra?.currency ?? "EUR",
    direction: extra?.direction ?? "OUTBOUND",
    deadlineMs: extra?.deadlineMs ?? DEFAULT_DEADLINE_MS,
    ...(extra?.adversarial !== undefined ? { adversarial: extra.adversarial } : {}),
    ...(extra?.partialBps !== undefined ? { partialBps: extra.partialBps } : {}),
    ...(extra?.requiresApproval !== undefined
      ? { requiresApproval: extra.requiresApproval }
      : {}),
  };
}

function scenario(
  scenarioId: string,
  scenarioType: LabScenarioTypeId,
  description: string,
  demands: readonly DemandPlan[],
  incidents: readonly ScenarioIncident[] = [],
): LabScenario {
  return {
    scenarioId,
    domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
    scenarioType,
    description,
    world: BASELINE_WORLD,
    plan: { scenarioId, description, demands: [...demands], incidents: [...incidents] },
  };
}

// ---------------------------------------------------------------------------
// The canonical payment-routing Domain Pack
// ---------------------------------------------------------------------------

export const BASELINE_SUITE_ID = "lab.baseline-suite";
export const BASELINE_SUITE_VERSION = "1.0.0";

/**
 * The canonical payment-routing Domain Pack. Hard constraints
 * (AUTHORIZATION/COMPLIANCE/PRIVACY/DEADLINE/EXPLICIT_CREDIT) are
 * evaluated BEFORE the optimization objectives (the compliance-first
 * law); objectives follow LAB.md "Evaluation" (total cost, economic
 * compression, resilience, latency, liquidity, counterparty exposure,
 * operational complexity).
 */
export const PAYMENT_ROUTING_DOMAIN_PACK: DomainPack = {
  packId: "lab.domain-pack.payment-routing",
  version: "1.0.0",
  domain: "payment-routing",
  scenarioTypes: [
    "NORMAL_DEMAND", "LIQUIDITY_SHORTAGE", "PROVIDER_OUTAGE", "FX_VOLATILITY",
    "DELAYED_WRITE", "APPROVAL_DELAY", "STALE_OBSERVATION", "FRAUD", "COLLUSION", "MALICIOUS_AGENT",
    "INCENTIVE_GAMING", "PARTIAL_PAYMENT", "CONGESTION", "ADVERSARIAL_MODEL_BEHAVIOR",
  ],
  hardConstraints: ["AUTHORIZATION", "COMPLIANCE", "PRIVACY", "DEADLINE", "EXPLICIT_CREDIT"],
  objectives: [
    "TOTAL_COST", "ECONOMIC_COMPRESSION", "RESILIENCE", "LATENCY",
    "LIQUIDITY_LOCKED", "COUNTERPARTY_EXPOSURE", "OPERATIONAL_COMPLEXITY",
  ],
  observables: [
    "externalValueMovedMinor", "nettedInternallyMinor", "hops", "liquidityLockedMinor",
    "feesMinor", "fxSpreadPaidMinor", "totalLatencyMs", "degradedRouteExposureMinor",
    "creditExposureMinor", "unknownOutcomes", "adversarialSettled",
    "authorizationBypassEvents", "privacyViolations",
  ],
  actionSpace: [
    { dimensionId: "route-preference", description: "ordered preference over payment rails", domain: ["rail-a", "rail-b", "rail-c", "rail-d"] },
    { dimensionId: "netting", description: "co-directional batching within the delay window", domain: ["enabled", "disabled"] },
    { dimensionId: "network-credit", description: "explicit network credit for liquidity gaps", domain: ["enabled", "disabled"] },
    { dimensionId: "delay-tolerance", description: "steps a demand may be deferred for batching", domain: ["0", "1", "2", "3"] },
    { dimensionId: "adversarial-screening", description: "fraud/collusion/malicious/gaming screening", domain: ["enabled", "disabled"] },
    { dimensionId: "privacy-bound", description: "minimum-context routing", domain: ["bounded", "unbounded"] },
  ],
  failureTaxonomy: [
    "FAILED_NO_VIABLE_ROUTE", "UNKNOWN_REQUIRES_RECONCILIATION", "USER_ACTION_REQUIRED",
    "BLOCKED_FRAUD", "EXPIRED", "HARD_CONSTRAINT_VIOLATION",
  ],
  policySet: [
    "policy:protocol-authorization-required",
    "policy:adversarial-screening-required",
    "policy:privacy-minimum-context",
    "policy:credit-must-be-explicit",
  ],
  evaluationSuite: { suiteId: BASELINE_SUITE_ID, version: BASELINE_SUITE_VERSION },
  provenanceRequirements: [
    {
      requirementId: "simulation-seed-provenance",
      description: "every simulation result records its seed and program version",
      acceptedEvidenceKinds: ["TEST_RUN", "REPLAY"],
    },
    {
      requirementId: "promotion-evidence-provenance",
      description: "replay, counterfactual and robustness evidence are content-hashed",
      acceptedEvidenceKinds: ["REPLAY", "PROOF", "ATTESTATION"],
    },
    {
      requirementId: "connector-executable-grounding",
      description:
        "provider-backed selection is grounded in ConnectedCapabilityInstance + CapabilityObservation (INV-13)",
      acceptedEvidenceKinds: ["ATTESTATION"],
    },
  ],
};

// ---------------------------------------------------------------------------
// The baseline suite — one scenario per taxonomy entry (LAB.md)
// ---------------------------------------------------------------------------

export const BASELINE_SCENARIOS: readonly LabScenario[] = Object.freeze([
  scenario(
    "lab.baseline.normal-demand",
    "NORMAL_DEMAND",
    "steady outbound and inbound demand, no incidents",
    [
      demand("d-normal-1", 0, 250_000n),
      demand("d-normal-2", 1, 120_000n, { direction: "INBOUND" }),
      demand("d-normal-3", 2, 90_000n),
      demand("d-normal-4", 3, 310_000n, { direction: "INBOUND" }),
      demand("d-normal-5", 4, 60_000n),
    ],
  ),
  scenario(
    "lab.baseline.liquidity-shortage",
    "LIQUIDITY_SHORTAGE",
    "the primary pool is drained mid-flight; routes must fall back",
    [
      demand("d-liq-1", 0, 500_000n),
      demand("d-liq-2", 5, 700_000n),
      demand("d-liq-3", 6, 400_000n),
    ],
    [{ incidentType: "LIQUIDITY_SHORTAGE", atStep: 4, poolId: "pool-a", drainedMinor: 9_500_000n }],
  ),
  scenario(
    "lab.baseline.provider-outage",
    "PROVIDER_OUTAGE",
    "rail-a goes down at step 2; demand must re-route",
    [
      demand("d-out-1", 0, 200_000n),
      demand("d-out-2", 3, 240_000n),
      demand("d-out-3", 4, 150_000n),
    ],
    [{ incidentType: "PROVIDER_OUTAGE", atStep: 2, railId: "rail-a" }],
  ),
  scenario(
    "lab.baseline.fx-volatility",
    "FX_VOLATILITY",
    "cross-currency spread widens sharply at step 1",
    [
      demand("d-fx-1", 0, 300_000n, { currency: "USD" }),
      demand("d-fx-2", 2, 180_000n, { currency: "USD" }),
      demand("d-fx-3", 3, 220_000n),
    ],
    [{ incidentType: "FX_VOLATILITY", atStep: 1, spreadIncreaseBps: 150n }],
  ),
  scenario(
    "lab.baseline.delayed-write",
    "DELAYED_WRITE",
    "in-flight writes on rail-b become UNKNOWN and require reconciliation",
    [demand("d-dw-1", 0, 260_000n), demand("d-dw-2", 3, 140_000n)],
    [{ incidentType: "DELAYED_WRITE", atStep: 2, railId: "rail-b" }],
  ),
  scenario(
    "lab.baseline.approval-delay",
    "APPROVAL_DELAY",
    "a customer approval is delayed beyond the deadline window",
    [
      demand("d-ap-1", 0, 180_000n, { requiresApproval: true, deadlineMs: 5_000 }),
      demand("d-ap-2", 2, 130_000n),
    ],
    [{ incidentType: "APPROVAL_DELAY", atStep: 1, delayMs: 8_000 }],
  ),
  scenario(
    "lab.baseline.stale-observation",
    "STALE_OBSERVATION",
    "rail-a's observed facts go stale mid-flight; later settlements grounded on them cannot be claimed",
    [
      demand("d-st-1", 0, 200_000n),
      demand("d-st-2", 3, 240_000n),
      demand("d-st-3", 4, 150_000n),
    ],
    [{ incidentType: "STALE_OBSERVATION", atStep: 2, railId: "rail-a" }],
  ),
  scenario(
    "lab.baseline.fraud",
    "FRAUD",
    "fraudulent demands arrive alongside legitimate ones",
    [demand("d-fr-1", 0, 220_000n), demand("d-fr-2", 1, 95_000n, { adversarial: "FRAUD" }), demand("d-fr-3", 2, 160_000n)],
  ),
  scenario(
    "lab.baseline.collusion",
    "COLLUSION",
    "colluding counterparties attempt circular value extraction",
    [demand("d-col-1", 0, 140_000n), demand("d-col-2", 1, 75_000n, { adversarial: "COLLUSION" }), demand("d-col-3", 2, 55_000n, { adversarial: "COLLUSION", direction: "INBOUND" })],
  ),
  scenario(
    "lab.baseline.malicious-agent",
    "MALICIOUS_AGENT",
    "a malicious agent instance issues unauthorized movement demands",
    [demand("d-ma-1", 0, 210_000n), demand("d-ma-2", 1, 640_000n, { adversarial: "MALICIOUS_AGENT" })],
  ),
  scenario(
    "lab.baseline.incentive-gaming",
    "INCENTIVE_GAMING",
    "demands engineered to farm participation incentives",
    [demand("d-ig-1", 0, 30_000n), demand("d-ig-2", 1, 20_000n, { adversarial: "INCENTIVE_GAMING" }), demand("d-ig-3", 2, 25_000n, { adversarial: "INCENTIVE_GAMING" }), demand("d-ig-4", 3, 28_000n)],
  ),
  scenario(
    "lab.baseline.partial-payment",
    "PARTIAL_PAYMENT",
    "the provider executes only part of the demanded amount",
    [demand("d-pp-1", 0, 400_000n, { partialBps: 6_000n }), demand("d-pp-2", 1, 250_000n), demand("d-pp-3", 2, 180_000n, { partialBps: 4_500n })],
  ),
  scenario(
    "lab.baseline.congestion",
    "CONGESTION",
    "network-wide congestion degrades every rail's latency",
    [
      demand("d-con-1", 0, 170_000n),
      demand("d-con-2", 3, 190_000n),
      demand("d-con-3", 4, 120_000n, { deadlineMs: 3_000 }),
    ],
    [{ incidentType: "CONGESTION", atStep: 1, addedLatencyMs: 2_500 }],
  ),
  scenario(
    "lab.baseline.adversarial-model-behavior",
    "ADVERSARIAL_MODEL_BEHAVIOR",
    "an adversarially-behaving model routes a demand it must not touch",
    [demand("d-amb-1", 0, 260_000n), demand("d-amb-2", 1, 480_000n, { adversarial: "MALICIOUS_AGENT" }), demand("d-amb-3", 2, 150_000n)],
  ),
]);

// ---------------------------------------------------------------------------
// The suite accessor
// ---------------------------------------------------------------------------

/** The mandatory baseline suite (LAB.md "Promotion"). */
export interface BaselineSuite {
  readonly suiteId: string;
  readonly version: string;
  readonly domainPackId: string;
  readonly scenarios: readonly LabScenario[];
  readonly candidates: readonly BaselineCandidate[];
}

/** Default seed for baseline runs (deterministic, caller-overridable). */
export const BASELINE_SEED = "lab.baseline.seed.v1";

/**
 * Returns the mandatory baseline suite (LAB.md "Promotion"). Deterministic:
 * every call returns structurally identical data.
 */
export function getBaselineSuite(): BaselineSuite {
  return {
    suiteId: BASELINE_SUITE_ID,
    version: BASELINE_SUITE_VERSION,
    domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
    scenarios: BASELINE_SCENARIOS,
    candidates: BASELINE_CANDIDATES,
  };
}
