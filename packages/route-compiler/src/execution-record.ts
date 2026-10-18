/**
 * @payswap/route-compiler — the quote-to-executed transition law (P5-W1).
 *
 * PORT of the old best-execution execution-record.ts (MMI-19): the
 * NO-FAKE-QUOTE seam. A quote — however fresh, however executable its
 * semantics — can NEVER produce an executed state. The ONLY path to an
 * executed state is a domain-validated EXECUTION OBSERVATION bound to
 * this record's executionRef and the route's chain, with finality
 * expressed ONLY as a candidate (INV-F06):
 *
 * ROUTE_SELECTED -> WRITE_PREPARED -> GATED_ALLOW -> EXECUTION_SUBMITTED
 *   -> (BROADCAST | CONFIRMED-without-candidate | CONFIRMED-with-candidate
 *       | FAILED | OUTCOME_UNKNOWN)
 *
 * - BLOCK at record level is terminal AND throws (rule 27: a BLOCKed
 *   route never proceeds to execution);
 * - UNKNOWN at record level throws (INV-X01: UNKNOWN is never converted
 *   into an allowance — resolve with fresh evidence and re-run);
 * - EXECUTION_SUBMITTED/BROADCAST/CONFIRMED-without-candidate are NOT
 *   executed (rule 29: submitted is not finality);
 * - EXECUTED_CANDIDATE and EXECUTION_FAILED are TERMINAL (a later
 *   CONFIRMED observation after FAILED throws; OUTCOME_UNKNOWN is
 *   resolvable by a later observation — reconciliation IS a new
 *   observation, INV-X02/X03);
 * - every pre-execution step re-asserts route validity (stale = re-run);
 * - the recorded write must be EXACTLY the gate-evaluated write (digest
 *   binding — a foreign write never binds).
 */

import { ExecutionTransitionError } from "./errors.ts";
import { deepFreeze } from "./canonical.ts";
import { assertSelectedRouteValid } from "./route-validity.ts";
import type { BestExecutionDecision } from "./best-execution.ts";

/** The closed route-execution status vocabulary (frozen). */
export const ROUTE_EXECUTION_STATUSES = Object.freeze([
  "ROUTE_SELECTED",
  "WRITE_PREPARED",
  "GATED_ALLOW",
  "ROUTE_BLOCKED",
  "EXECUTION_SUBMITTED",
  "EXECUTION_BROADCAST",
  "EXECUTION_CONFIRMED_OBSERVED",
  "EXECUTED_CANDIDATE",
  "EXECUTION_FAILED",
  "EXECUTION_OUTCOME_UNKNOWN",
] as const);

export type RouteExecutionStatus = (typeof ROUTE_EXECUTION_STATUSES)[number];

/** One recorded execution observation (append-only evidence). */
export interface RecordedExecutionObservation {
  readonly observation: {
    readonly observationId: string;
    readonly executionRef: string;
    readonly observedAt: string;
    readonly chainKey: string;
    readonly outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
    readonly finalityCandidate?: unknown;
    readonly failure?: unknown;
    readonly unknownReason?: string;
    readonly evidenceRefs: readonly string[];
  };
  readonly recordedAt: number;
  readonly resultingStatus: RouteExecutionStatus;
}

const ADMISSIBLE_FOR_OBSERVATION: readonly RouteExecutionStatus[] = Object.freeze([
  "EXECUTION_SUBMITTED",
  "EXECUTION_BROADCAST",
  "EXECUTION_CONFIRMED_OBSERVED",
  "EXECUTION_OUTCOME_UNKNOWN",
]);

/**
 * The route execution record: the append-only state machine from a
 * selected route to an executed CANDIDATE (or an honest terminal
 * failure). Constructed ONLY from a ROUTE_SELECTED decision.
 */
export class RouteExecutionRecord {
  private readonly decision: BestExecutionDecision;
  private readonly executionRefValue: string;
  private readonly observationsValue: RecordedExecutionObservation[] = [];
  private statusValue: RouteExecutionStatus = "ROUTE_SELECTED";

  private constructor(decision: BestExecutionDecision) {
    this.decision = decision;
    this.executionRefValue = `best-execution:${decision.provenance.executionId}`;
  }

  /** Open a record on a ROUTE_SELECTED decision (else throws). */
  static open(decision: BestExecutionDecision): RouteExecutionRecord {
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new ExecutionTransitionError(
        "an execution record opens only on a ROUTE_SELECTED decision (an empty decision executes nothing)",
      );
    }
    return new RouteExecutionRecord(decision);
  }

  get executionRef(): string {
    return this.executionRefValue;
  }

  get status(): RouteExecutionStatus {
    return this.statusValue;
  }

  get selectedRouteRef(): string {
    return this.decision.decision === "ROUTE_SELECTED" ? this.decision.selected.routeRef : "";
  }

  /** True ONLY in the EXECUTED_CANDIDATE state (finality is candidate-only). */
  get isExecutedCandidate(): boolean {
    return this.statusValue === "EXECUTED_CANDIDATE";
  }

  /** The finality candidate of the last CONFIRMED-with-candidate observation. */
  get finalityCandidate(): unknown {
    if (this.statusValue !== "EXECUTED_CANDIDATE") {
      return undefined;
    }
    for (let index = this.observationsValue.length - 1; index >= 0; index -= 1) {
      const recorded = this.observationsValue[index] as RecordedExecutionObservation;
      if (recorded.observation.outcome === "CONFIRMED" && recorded.observation.finalityCandidate !== undefined) {
        return recorded.observation.finalityCandidate;
      }
    }
    return undefined;
  }

  /** A copy of the recorded observations (append-only evidence). */
  observations(): readonly RecordedExecutionObservation[] {
    return [...this.observationsValue];
  }

  /** Record the prepared write (must be EXACTLY the gate-evaluated write). */
  recordPreparedWrite(
    write: { readonly writeDigest: string },
    at: number,
  ): RouteExecutionStatus {
    if (this.statusValue !== "ROUTE_SELECTED") {
      throw new ExecutionTransitionError(
        `a prepared write is recorded only from ROUTE_SELECTED (current status ${this.statusValue})`,
      );
    }
    assertSelectedRouteValid(this.decision, at);
    if (this.decision.decision !== "ROUTE_SELECTED") {
      throw new ExecutionTransitionError("the decision is no longer selected");
    }
    if (write.writeDigest !== this.decision.selected.write.writeDigest) {
      throw new ExecutionTransitionError(
        "the recorded write does not bind to the selected route (the executed write must be exactly the gate-evaluated write)",
      );
    }
    this.statusValue = "WRITE_PREPARED";
    return this.statusValue;
  }

  /** Record the gate decision (BLOCK is terminal AND throws; UNKNOWN throws). */
  recordGateDecision(
    gate: { readonly decision: "ALLOW" | "BLOCK" | "UNKNOWN" },
    at: number,
  ): RouteExecutionStatus {
    if (this.statusValue !== "WRITE_PREPARED") {
      throw new ExecutionTransitionError(
        `a gate decision is recorded only from WRITE_PREPARED (current status ${this.statusValue})`,
      );
    }
    assertSelectedRouteValid(this.decision, at);
    if (gate.decision === "BLOCK") {
      this.statusValue = "ROUTE_BLOCKED";
      throw new ExecutionTransitionError(
        "a BLOCKed route never proceeds to execution (rule 27 — security BLOCK is terminal, no override)",
      );
    }
    if (gate.decision === "UNKNOWN") {
      throw new ExecutionTransitionError(
        "UNKNOWN is never converted into an allowance (INV-X01) — resolve with fresh evidence and re-run best execution",
      );
    }
    this.statusValue = "GATED_ALLOW";
    return this.statusValue;
  }

  /** Record the broadcast handoff (submission is not finality, rule 29). */
  recordBroadcastHandoff(handoffRef: string, at: number): RouteExecutionStatus {
    if (this.statusValue !== "GATED_ALLOW") {
      throw new ExecutionTransitionError(
        `a broadcast handoff is recorded only from GATED_ALLOW (current status ${this.statusValue})`,
      );
    }
    if (typeof handoffRef !== "string" || handoffRef.length === 0) {
      throw new ExecutionTransitionError("the broadcast handoff reference must be a non-empty string");
    }
    assertSelectedRouteValid(this.decision, at);
    this.statusValue = "EXECUTION_SUBMITTED";
    return this.statusValue;
  }

  /**
   * Record an execution observation — THE ONLY PATH to an executed
   * state. The observation must be domain-valid (outcome couplings
   * enforced), bound to THIS record's executionRef and the route's
   * chain; a FAILED record is terminal (later observations throw).
   */
  recordExecutionObservation(observation: unknown, at: number): RouteExecutionStatus {
    if (!ADMISSIBLE_FOR_OBSERVATION.includes(this.statusValue)) {
      throw new ExecutionTransitionError(
        `an execution observation is recorded only after submission (current status ${this.statusValue})`,
      );
    }
    if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
      throw new ExecutionTransitionError("the recording instant must be a non-negative integer");
    }
    const validated = validateExecutionObservation(observation);
    if (validated.executionRef !== this.executionRefValue) {
      throw new ExecutionTransitionError(
        `the observation's executionRef '${validated.executionRef}' is not this record's '${this.executionRefValue}' — an observation of a different execution is not evidence`,
      );
    }
    if (this.decision.decision !== "ROUTE_SELECTED") {
      throw new ExecutionTransitionError("the decision is no longer selected");
    }
    if (validated.chainKey !== this.decision.selected.quote.chain) {
      throw new ExecutionTransitionError(
        `the observation's chainKey '${validated.chainKey}' does not match the selected route's chain '${this.decision.selected.quote.chain}'`,
      );
    }
    switch (validated.outcome) {
      case "BROADCAST":
        this.statusValue = "EXECUTION_BROADCAST";
        break;
      case "CONFIRMED":
        this.statusValue =
          validated.finalityCandidate !== undefined ? "EXECUTED_CANDIDATE" : "EXECUTION_CONFIRMED_OBSERVED";
        break;
      case "FAILED":
        if (this.observationsValue.some((recorded) => recorded.observation.outcome === "FAILED")) {
          throw new ExecutionTransitionError("the record is already terminally FAILED (a later observation cannot rewrite history)");
        }
        this.statusValue = "EXECUTION_FAILED";
        break;
      case "OUTCOME_UNKNOWN":
        this.statusValue = "EXECUTION_OUTCOME_UNKNOWN";
        break;
    }
    this.observationsValue.push(
      deepFreeze({
        observation: validated,
        recordedAt: at,
        resultingStatus: this.statusValue,
      }),
    );
    return this.statusValue;
  }
}

/** Domain validation of an execution observation (the outcome couplings). */
function validateExecutionObservation(candidate: unknown): NonNullable<RecordedExecutionObservation["observation"]> {
  if (typeof candidate !== "object" || candidate === null) {
    throw new ExecutionTransitionError("an execution observation must be an object");
  }
  const record = candidate as Record<string, unknown>;
  const observationId = record["observationId"];
  const executionRef = record["executionRef"];
  const observedAt = record["observedAt"];
  const chainKey = record["chainKey"];
  const outcome = record["outcome"];
  if (typeof observationId !== "string" || observationId.length === 0) {
    throw new ExecutionTransitionError("observation.observationId must be a non-empty string");
  }
  if (typeof executionRef !== "string" || executionRef.length === 0) {
    throw new ExecutionTransitionError("observation.executionRef must be a non-empty string");
  }
  if (typeof observedAt !== "string" || observedAt.length === 0) {
    throw new ExecutionTransitionError("observation.observedAt must be a non-empty string");
  }
  if (typeof chainKey !== "string" || chainKey.length === 0) {
    throw new ExecutionTransitionError("observation.chainKey must be a non-empty string");
  }
  if (outcome !== "BROADCAST" && outcome !== "CONFIRMED" && outcome !== "FAILED" && outcome !== "OUTCOME_UNKNOWN") {
    throw new ExecutionTransitionError("observation.outcome must be BROADCAST, CONFIRMED, FAILED or OUTCOME_UNKNOWN");
  }
  const finalityCandidate = record["finalityCandidate"];
  const failure = record["failure"];
  const unknownReason = record["unknownReason"];
  const evidenceRefs = record["evidenceRefs"];
  if (outcome === "FAILED" && (typeof failure !== "object" || failure === null)) {
    throw new ExecutionTransitionError("a FAILED observation requires its failure descriptor (never a bare failure)");
  }
  if (outcome === "OUTCOME_UNKNOWN" && (typeof unknownReason !== "string" || unknownReason.length === 0)) {
    throw new ExecutionTransitionError("an OUTCOME_UNKNOWN observation requires its unknown reason (INV-X01)");
  }
  if (outcome === "OUTCOME_UNKNOWN" && failure !== undefined) {
    throw new ExecutionTransitionError("an OUTCOME_UNKNOWN observation must NOT carry a failure (UNKNOWN is not failure)");
  }
  if (outcome === "BROADCAST" && finalityCandidate !== undefined) {
    throw new ExecutionTransitionError("a BROADCAST observation must NOT carry a finality candidate (submitted is not finality)");
  }
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    throw new ExecutionTransitionError("observation.evidenceRefs must be a non-empty array (INV-E02)");
  }
  const frozen: Record<string, unknown> = {
    observationId,
    executionRef,
    observedAt,
    chainKey,
    outcome,
    evidenceRefs: Object.freeze([...evidenceRefs]),
  };
  if (finalityCandidate !== undefined) {
    frozen["finalityCandidate"] = finalityCandidate;
  }
  if (failure !== undefined) {
    frozen["failure"] = failure;
  }
  if (unknownReason !== undefined) {
    frozen["unknownReason"] = unknownReason;
  }
  return deepFreeze(frozen) as NonNullable<RecordedExecutionObservation["observation"]>;
}
