/**
 * @payswap/financial-certification — LAW 2: endpoint idempotency
 * (P8-W1).
 *
 * Replaying a command at the same endpoint with the SAME idempotency key
 * yields the RECORDED outcome, never a second external effect; DISTINCT
 * keys are DISTINCT intents. The per-operation contract shape is pinned
 * from @payswap/provider-runtime (there is NO universal mechanism — the
 * key scope, derivation and replay behavior are per-operation provider
 * evidence; a state-changing operation without a registered contract is
 * refused fail-closed).
 *
 * The verifier below consumes the subject's RECORDED DISPATCH LOG (the
 * deterministic artifact a corridor implementation under certification
 * submits) and proves, for every (endpoint, key) group: at most ONE
 * distinct external effect per key; every replay returns the recorded
 * outcome (same outcome class, same provider effect reference); the
 * same key with a DIFFERENT command digest is surfaced as a typed
 * CONFLICT (never a silent second success, never a re-execution); two
 * distinct keys never collapse into one external effect (distinct keys
 * are distinct intents); and — when the log carries command ids and the
 * operation's contract is supplied — every key derives exactly per the
 * pinned namespaced derivation law. Deterministic only: the log is
 * caller-submitted and fold order is the log's declared order.
 */

import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";
import type {
  PinnedOperationIdempotencyContract,
} from "./pins/provider-runtime.ts";
import { pinnedDeriveIdempotencyKey } from "./pins/provider-runtime.ts";
import type { PinnedExternalEffectOutcome } from "./pins/protocol.ts";

/** One recorded dispatch at an endpoint (the subject's artifact). */
export interface RecordedEndpointDispatch {
  readonly endpointId: string;
  readonly idempotencyKey: string;
  /** Digest of the command payload this dispatch carried. */
  readonly commandDigest: string;
  /** The command id (present when the log derives keys from commands). */
  readonly commandId?: string;
  /** Provider-side external effect reference (absent = no external effect). */
  readonly externalEffectId?: string;
  readonly outcome: PinnedExternalEffectOutcome;
  /** True when this dispatch was REJECTED as a typed key conflict. */
  readonly conflictSurfaced?: boolean;
}

/** The recorded outcome one key replays (the law's positive statement). */
export interface RecordedKeyOutcome {
  readonly endpointId: string;
  readonly idempotencyKey: string;
  readonly outcome: PinnedExternalEffectOutcome;
  readonly externalEffectId?: string;
}

/**
 * The recorded-outcome policy derived from a dispatch log: the lookup a
 * conforming endpoint answers a replay from (same endpoint + key → the
 * RECORDED outcome).
 */
export function recordedOutcomeFor(
  dispatches: readonly RecordedEndpointDispatch[],
): ReadonlyMap<string, RecordedKeyOutcome> {
  const byKey = new Map<string, RecordedKeyOutcome>();
  for (const dispatch of dispatches) {
    const key = `${dispatch.endpointId}::${dispatch.idempotencyKey}`;
    if (!byKey.has(key)) {
      const recorded: RecordedKeyOutcome = Object.freeze({
        endpointId: dispatch.endpointId,
        idempotencyKey: dispatch.idempotencyKey,
        outcome: dispatch.outcome,
        ...(dispatch.externalEffectId !== undefined
          ? { externalEffectId: dispatch.externalEffectId }
          : {}),
      });
      byKey.set(key, recorded);
    }
  }
  return byKey;
}

function validateDispatches(
  dispatches: readonly RecordedEndpointDispatch[],
): void {
  for (const dispatch of dispatches) {
    if (
      dispatch === null ||
      typeof dispatch !== "object" ||
      dispatch.endpointId.length === 0 ||
      dispatch.idempotencyKey.length === 0 ||
      dispatch.commandDigest.length === 0
    ) {
      throw new ConformanceError(
        "every recorded dispatch requires an endpoint, an idempotency key and a command digest",
      );
    }
    if (
      dispatch.outcome !== "CONFIRMED" &&
      dispatch.outcome !== "UNKNOWN" &&
      dispatch.outcome !== "FAILED"
    ) {
      throw new ConformanceError(
        `dispatch for key '${dispatch.idempotencyKey}' carries a non-canonical outcome '${String(dispatch.outcome)}'`,
      );
    }
  }
}

/**
 * CERTIFIES the endpoint-idempotency law over a recorded dispatch log
 * (FIN-LAW-02). The optional operation contract enables the key-
 * derivation check (the pinned namespaced law).
 */
export function certifyEndpointIdempotency(input: {
  readonly subjectRef: string;
  readonly dispatches: readonly RecordedEndpointDispatch[];
  readonly contract?: PinnedOperationIdempotencyContract;
  readonly evidenceRefs: readonly string[];
}): ConformanceVerdict {
  validateDispatches(input.dispatches);
  const violations: string[] = [];

  interface GroupState {
    readonly outcome: PinnedExternalEffectOutcome;
    readonly externalEffectId?: string;
    readonly commandDigest: string;
    effects: Set<string>;
  }
  const groups = new Map<string, GroupState>();
  const effectOwners = new Map<string, string>();

  for (const dispatch of input.dispatches) {
    const groupKey = `${dispatch.endpointId}::${dispatch.idempotencyKey}`;
    if (dispatch.externalEffectId !== undefined && dispatch.externalEffectId.length === 0) {
      throw new ConformanceError(
        "an external effect reference must be a non-empty string when present",
      );
    }
    if (dispatch.externalEffectId !== undefined) {
      const owner = effectOwners.get(dispatch.externalEffectId);
      if (owner !== undefined && owner !== groupKey) {
        violations.push(
          `FIN-LAW-02 (distinct intents): external effect '${dispatch.externalEffectId}' was produced under BOTH key '${owner}' and key '${groupKey}' — distinct keys are distinct intents; the same effect is reachable only through the key that recorded it`,
        );
      } else {
        effectOwners.set(dispatch.externalEffectId, groupKey);
      }
    }
    const existing = groups.get(groupKey);
    if (existing === undefined) {
      groups.set(groupKey, {
        outcome: dispatch.outcome,
        ...(dispatch.externalEffectId !== undefined
          ? { externalEffectId: dispatch.externalEffectId }
          : {}),
        commandDigest: dispatch.commandDigest,
        effects: new Set(
          dispatch.externalEffectId !== undefined ? [dispatch.externalEffectId] : [],
        ),
      });
      continue;
    }
    // A repeat under the same key: the idempotency laws apply.
    if (dispatch.commandDigest !== existing.commandDigest) {
      if (dispatch.conflictSurfaced === true && dispatch.externalEffectId === undefined) {
        continue; // the typed conflict path — correctly surfaced, no effect
      }
      violations.push(
        `FIN-LAW-02 (typed conflict): key '${dispatch.idempotencyKey}' at endpoint '${dispatch.endpointId}' was re-submitted with a DIFFERENT command digest but not surfaced as a typed conflict — same key + different intent must be a typed conflict, never a silent success and never a re-execution`,
      );
      continue;
    }
    if (dispatch.outcome !== existing.outcome) {
      violations.push(
        `FIN-LAW-02 (recorded outcome): the replay of key '${dispatch.idempotencyKey}' at endpoint '${dispatch.endpointId}' answered '${dispatch.outcome}' but the recorded outcome is '${existing.outcome}' — a replay yields the recorded outcome`,
      );
    }
    if (dispatch.externalEffectId !== undefined) {
      if (existing.externalEffectId === undefined) {
        violations.push(
          `FIN-LAW-02 (second effect): the replay of key '${dispatch.idempotencyKey}' at endpoint '${dispatch.endpointId}' produced external effect '${dispatch.externalEffectId}' when the original recording carried NONE — a replay never creates a second external effect`,
        );
      } else if (dispatch.externalEffectId !== existing.externalEffectId) {
        violations.push(
          `FIN-LAW-02 (second effect): the replay of key '${dispatch.idempotencyKey}' at endpoint '${dispatch.endpointId}' produced external effect '${dispatch.externalEffectId}' but the recorded effect is '${existing.externalEffectId}' — a replay never creates a second external effect`,
        );
      }
    }
  }

  if (input.contract !== undefined) {
    for (const dispatch of input.dispatches) {
      if (dispatch.commandId === undefined) {
        continue;
      }
      const derived = pinnedDeriveIdempotencyKey(input.contract, dispatch.commandId);
      if (derived !== dispatch.idempotencyKey) {
        violations.push(
          `FIN-LAW-02 (derivation): command '${dispatch.commandId}' used key '${dispatch.idempotencyKey}' but the pinned namespaced derivation for operation '${input.contract.operationId}' derives '${derived}'`,
        );
      }
    }
  }

  return conformanceVerdict({
    lawId: "FIN-LAW-02",
    scenarioId: "ENDPOINT_IDEMPOTENCY",
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: input.evidenceRefs,
  });
}
