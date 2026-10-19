/**
 * Scenario plans: normal demand plus the LAB.md incident taxonomy
 * (P6-W1; the P6 rebuild of the old simulation.ts plan section, W2-004).
 *
 * The adversarial demand taxonomy (fraud, collusion, malicious agents,
 * incentive gaming) is what the scenario generator must cover: a screened
 * program blocks all of them; a program that lets one settle fails the
 * evaluator's COMPLIANCE hard constraint.
 *
 * Deterministic pure data: fixed amounts, fixed steps, no ambient clock,
 * no randomness. The only entropy in any run is the caller-supplied seed.
 */

// ---------------------------------------------------------------------------
// Demands
// ---------------------------------------------------------------------------

/** The direction vocabulary for planned money-movement demands. */
export const DEMAND_DIRECTIONS = ["OUTBOUND", "INBOUND"] as const;

/** The direction a planned money-movement demand arrives with. */
export type DemandDirection = (typeof DEMAND_DIRECTIONS)[number];

/** Total predicate over the demand-direction vocabulary. */
export function isDemandDirection(value: unknown): value is DemandDirection {
  return (
    typeof value === "string" &&
    (DEMAND_DIRECTIONS as readonly unknown[]).includes(value)
  );
}

/**
 * The adversarial demand taxonomy the scenario generator must cover
 * (LAB.md "Scenario generation": fraud, collusion, malicious agents,
 * incentive gaming).
 */
export const ADVERSARIAL_DEMAND_KINDS = [
  "FRAUD",
  "COLLUSION",
  "MALICIOUS_AGENT",
  "INCENTIVE_GAMING",
] as const;

export type AdversarialDemandKind = (typeof ADVERSARIAL_DEMAND_KINDS)[number];

/** Total predicate over the adversarial demand taxonomy. */
export function isAdversarialDemandKind(
  value: unknown,
): value is AdversarialDemandKind {
  return (
    typeof value === "string" &&
    (ADVERSARIAL_DEMAND_KINDS as readonly unknown[]).includes(value)
  );
}

/**
 * One planned money-movement demand arriving into the simulated world.
 */
export interface DemandPlan {
  readonly demandId: string;
  readonly atStep: number;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly direction: DemandDirection;
  readonly deadlineMs: number;
  /** Fraudulent/colluding/malicious/gaming demand; screened programs block it. */
  readonly adversarial?: AdversarialDemandKind;
  /** Provider executes only this fraction (basis points of the amount). */
  readonly partialBps?: bigint;
  /** Demand gated on a customer approval arriving via the approval surface. */
  readonly requiresApproval?: boolean;
}

// ---------------------------------------------------------------------------
// Incidents (the LAB.md fault-injection taxonomy)
// ---------------------------------------------------------------------------

/**
 * One incident injected into a scenario at a discrete step. The taxonomy:
 * provider outage, liquidity shortage, FX volatility, congestion, delayed
 * writes (UNKNOWN discipline) and approval delays.
 */
export type ScenarioIncident =
  | {
      readonly incidentType: "PROVIDER_OUTAGE";
      readonly atStep: number;
      readonly railId: string;
    }
  | {
      readonly incidentType: "LIQUIDITY_SHORTAGE";
      readonly atStep: number;
      readonly poolId: string;
      readonly drainedMinor: bigint;
    }
  | {
      readonly incidentType: "FX_VOLATILITY";
      readonly atStep: number;
      readonly spreadIncreaseBps: bigint;
    }
  | {
      readonly incidentType: "CONGESTION";
      readonly atStep: number;
      readonly addedLatencyMs: number;
    }
  | {
      /** In-flight writes on the rail become UNKNOWN (requires reconciliation). */
      readonly incidentType: "DELAYED_WRITE";
      readonly atStep: number;
      readonly railId: string;
    }
  | {
      readonly incidentType: "APPROVAL_DELAY";
      readonly atStep: number;
      readonly delayMs: number;
    };

/** The incident-type vocabulary (used by scenario validation). */
export const SCENARIO_INCIDENT_TYPES = [
  "PROVIDER_OUTAGE",
  "LIQUIDITY_SHORTAGE",
  "FX_VOLATILITY",
  "CONGESTION",
  "DELAYED_WRITE",
  "APPROVAL_DELAY",
] as const;

export type ScenarioIncidentType = (typeof SCENARIO_INCIDENT_TYPES)[number];

/** Total predicate over the incident-type vocabulary. */
export function isScenarioIncidentType(
  value: unknown,
): value is ScenarioIncidentType {
  return (
    typeof value === "string" &&
    (SCENARIO_INCIDENT_TYPES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The scenario plan
// ---------------------------------------------------------------------------

/** A scenario plan: demands plus incidents, run against a world. */
export interface SimulationScenarioPlan {
  readonly scenarioId: string;
  readonly description?: string;
  readonly demands: readonly DemandPlan[];
  readonly incidents: readonly ScenarioIncident[];
}

// ---------------------------------------------------------------------------
// The simulation program (the strategy under test)
// ---------------------------------------------------------------------------

/**
 * A deterministic routing/settlement policy under simulation. This type is
 * pure data: it carries no authority, no credentials and no
 * protocol-command shape. A candidate is compiled into one of these for
 * evaluation.
 *
 * SUBSET-TYPING: field-compatible with the accepted
 * @payswap/execution-graph StrategyProgram (P3-W2) — asserted by
 * test/type-contracts.test.ts; the TL wires the imports at integration.
 * A program may declare a bypass (DECLARED_BYPASS) so the evaluator can
 * fail it — declaring is the only way to reach it; the Lab never
 * fabricates authorization.
 */
export interface SimulationProgram {
  readonly programId: string;
  readonly programVersion: string;
  /** Ordered rail preferences; the first usable rail wins. */
  readonly routePreference: readonly string[];
  /** Batch co-directional demands inside the delay window (netting). */
  readonly useNetting: boolean;
  /** Cover liquidity gaps with explicit network credit (INV-02 discipline). */
  readonly useNetworkCredit: boolean;
  /** How many steps a demand may be deferred for batching. */
  readonly delayToleranceSteps: number;
  /** Screen fraudulent demands (hard compliance constraint). */
  readonly fraudScreening: boolean;
  /** Context receives only the minimum data required (privacy discipline). */
  readonly privacyBounded: boolean;
  /**
   * A program may declare a bypass — the simulator will then settle
   * without authorization and the evaluator's AUTHORIZATION hard
   * constraint fails. Declaring the bypass is the only way to "reach" it;
   * the Lab itself never fabricates authorization.
   */
  readonly authorizationMode: "PROTOCOL_AUTHORIZED" | "DECLARED_BYPASS";
}
