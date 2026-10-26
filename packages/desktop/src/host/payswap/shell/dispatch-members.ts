/**
 * PaySwap Desktop (P19-A, ADR-0012 D1/D2) — the DISPATCH channel
 * members, implemented over the REAL PaymentMissionRuntime + the lane
 * resolver, split from ./payment-mission-members.ts and
 * ./approval-members.ts for the ≤400-line file law (the P18-A member
 * pattern).
 *
 * THE ACT-TIME LAW (the wire carries a CHOICE, never a grant): the
 * dispatch member recomputes the eligible lane set HOST-SIDE at act
 * time — a connectionRef outside the recomputed ACTIVE SANDBOX set is
 * a typed refusal with NO attempt recorded (the check fires BEFORE
 * the runtime call, so nothing is consumed). The artifact (the
 * mission's latest unconsumed one), the operation
 * (CREATE_EXTERNAL_EFFECT) and the INV-25 execution mode (SANDBOX)
 * all resolve HOST-SIDE: the renderer supplies ONLY the mission id
 * and the operator-picked connectionRef — the artifact NEVER crosses,
 * not even as an input.
 *
 * THE OUTCOME CARRIES FACTS ONLY: { kind, attemptId, summary } — no
 * artifactId, no connectionRef echo, no envelope internals beyond the
 * people-language summary. The armed-effect READ derives over the
 * gate's mission-scoped snapshots (ADR-0012 D3) and NEVER bypasses
 * the dispatch path's own enforcing checks — an expired or consumed
 * artifact surfaces as not-armed with the verbatim reason and the
 * path back; the consume path remains the enforcing edge for the act.
 *
 * Instants are stamped HERE, at the channel edge, from the injected
 * host clock — never renderer-supplied. Every member fails closed
 * when the runtime was not composed (the typed
 * PaymentPlaneNotConfiguredError, thrown by the resolver the service
 * injects) and when the connections plane was not composed (the
 * typed ConnectionPlaneNotConfiguredError, thrown by the
 * lane-candidate port the service injects — the lane set is never
 * fabricated to mask a missing plane).
 */

import { PaymentMissionError } from "../payments/contracts.js";
import type { PaymentDispatchOutcome } from "../payments/payment-dispatch-runtime.js";
import type {
  MissionAuthorizationArtifactSnapshot,
  PaymentAuthorizationScope,
} from "../payments/authorization-gate.js";
import {
  resolveDispatchLanes,
  type DispatchLane,
  type DispatchLaneCandidateRecord,
} from "../payments/dispatch-lane-resolver.js";
import type { PaymentMissionChannelDeps } from "./payment-mission-members.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentAuthorizationScopeDto,
  PaymentMissionArmedEffectDto,
  PaymentMissionDispatchOutcomeDto,
} from "./payment-mission-contracts.js";

/** The pinned not-armed reasons (verbatim; asserted in tests). */
const NO_ARTIFACT_REASON =
  "no authorization artifact exists for this mission — a fresh preview and a fresh explicit approval are required";
const expiredArtifactReason = (expiresAt: string): string =>
  `the authorization artifact expired at ${expiresAt} — a fresh preview and a fresh explicit approval are required`;
const consumedArtifactReason = (consumedAt: string): string =>
  `the authorization artifact was consumed at ${consumedAt} — a fresh preview and a fresh explicit approval are required`;

/** What the dispatch members need from the service (injected — never ambient). */
export interface PaymentDispatchChannelDeps extends PaymentMissionChannelDeps {
  /**
   * The lane-candidate records port (ADR-0012 D2): the connections
   * registry's own read model. Fail-closed typed at the composition
   * edge when the connections plane is not configured.
   */
  readonly listLaneCandidateRecords: () => Promise<readonly DispatchLaneCandidateRecord[]>;
}

/** Copy the scope verbatim (fresh objects — the host record is never aliased onto the wire). */
function toScopeDto(scope: PaymentAuthorizationScope): PaymentAuthorizationScopeDto {
  return { ...scope, amount: { ...scope.amount } };
}

/** The latest unconsumed artifact snapshot (mint order — the last one), or null. */
function latestUnconsumed(
  snapshots: readonly MissionAuthorizationArtifactSnapshot[],
): MissionAuthorizationArtifactSnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index]!.consumedAt === null) {
      return snapshots[index]!;
    }
  }
  return null;
}

/** Resolve the lanes through the injected port (the recomputed eligible set). */
async function lanesFromRegistry(
  deps: PaymentDispatchChannelDeps,
): Promise<readonly DispatchLane[]> {
  return resolveDispatchLanes(await deps.listLaneCandidateRecords());
}

/** The people-language summary for one dispatch outcome (facts only — no lineage). */
function dispatchSummaryOf(outcome: PaymentDispatchOutcome): string {
  if (outcome.kind === "REFUSED") {
    return `The execution authority refused the command before any effect (${outcome.refusal.kind}) — definitively no effect; retryable under a fresh authorization.`;
  }
  if (outcome.kind === "REPLAYED") {
    return "The command was already recorded — the recorded envelope replayed with no duplicate write (idempotent replay); the attempt states on the mission detail carry the facts.";
  }
  switch (outcome.envelope.outcome) {
    case "CONFIRMED":
      return "The execution authority confirmed the effect — the recorded envelope stands as evidence; the attempt states on the mission detail carry the facts.";
    case "FAILED":
      return "The attempt definitively failed — the effect did not happen; the mission stays open for a fresh authorization and retry.";
    default:
      return "The outcome is unknown — the command may have landed; it reconciles before any retry and nothing is blindly repeated.";
  }
}

/** Project the runtime outcome to the wire DTO (outcome facts only — ADR-0012 D1). */
function toOutcomeDto(outcome: PaymentDispatchOutcome): PaymentMissionDispatchOutcomeDto {
  return { kind: outcome.kind, attemptId: outcome.attemptId, summary: dispatchSummaryOf(outcome) };
}

/** The armed-card derivation (ADR-0012 D1) over the gate's mission-scoped snapshots. */
function armedCardOf(
  snapshots: readonly MissionAuthorizationArtifactSnapshot[],
  lanes: readonly DispatchLane[],
): PaymentMissionArmedEffectDto {
  const unconsumed = latestUnconsumed(snapshots);
  if (unconsumed !== null) {
    if (unconsumed.expired) {
      return { armed: false, reason: expiredArtifactReason(unconsumed.expiresAt), lanes };
    }
    return {
      armed: true,
      scope: toScopeDto(unconsumed.scope),
      expiresAt: unconsumed.expiresAt,
      lanes,
    };
  }
  const latest = snapshots[snapshots.length - 1];
  if (latest !== undefined) {
    return { armed: false, reason: consumedArtifactReason(latest.consumedAt ?? latest.expiresAt), lanes };
  }
  return { armed: false, reason: NO_ARTIFACT_REASON, lanes };
}

/**
 * Create the dispatch channel members over the injected runtime + lane
 * port (P19-A, ADR-0012 D1). Returned as a Pick of the mission-member
 * interface so the service can spread them beside the P17-A and P18-A
 * members over the SAME fail-closed resolver and host clock.
 */
export function createPaymentDispatchChannelMembers(
  deps: PaymentDispatchChannelDeps,
): Pick<
  IPaySwapDesktopPaymentMissionMembers,
  "paymentMissionArmedEffect" | "paymentMissionDispatch"
> {
  return {
    async paymentMissionArmedEffect(missionId) {
      const runtime = deps.resolveRuntime();
      // Fail-closed on the channel-supplied mission id BEFORE the
      // runtime call (the RPC boundary carries no types).
      if (typeof missionId !== "string" || missionId.length === 0) {
        throw new PaymentMissionError(
          "MISSION_NOT_FOUND",
          "missionId must be a non-empty string (the mission whose armed effect is read)",
        );
      }
      if ((await runtime.getMission(missionId)) === null) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      const lanes = await lanesFromRegistry(deps);
      const snapshots = await runtime.artifactsForMission(missionId, deps.now());
      const card = armedCardOf(snapshots, lanes);
      deps.log(
        "info",
        `payswap-desktop: armed effect read for mission ${missionId} (armed=${String(card.armed)}, ${String(lanes.length)} lane(s)) — the artifact stays host-side`,
      );
      return card;
    },

    async paymentMissionDispatch(missionId, connectionRef) {
      const runtime = deps.resolveRuntime();
      // Fail-closed input validation at the edge — the same typed
      // discipline as the approval members (a malformed id or lane
      // choice is a typed refusal, never a silently-guessed dispatch).
      if (typeof missionId !== "string" || missionId.length === 0) {
        throw new PaymentMissionError(
          "MISSION_NOT_FOUND",
          "missionId must be a non-empty string (the mission the dispatch act runs over)",
        );
      }
      if (typeof connectionRef !== "string" || connectionRef.length === 0) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "connectionRef must be a non-empty string (the operator-picked executing lane)",
          { missionId },
        );
      }
      if ((await runtime.getMission(missionId)) === null) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      // THE CHOICE-VALIDATION LAW (ADR-0012 D1): the eligible set is
      // recomputed HOST-SIDE at act time — the wire carried a CHOICE,
      // never a grant. A connectionRef outside the recomputed ACTIVE
      // SANDBOX set is a typed refusal BEFORE the runtime call: no
      // attempt is recorded and nothing is consumed.
      const lanes = await lanesFromRegistry(deps);
      const chosen = lanes.find(
        (lane) => lane.connectionRef === connectionRef && lane.ineligible === undefined,
      );
      if (chosen === undefined) {
        const ineligible = lanes.find((lane) => lane.connectionRef === connectionRef);
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          ineligible === undefined
            ? `connectionRef '${connectionRef}' is not an executing lane on this host — the eligible set is recomputed host-side at act time (ACTIVE SANDBOX connections only); no attempt was recorded`
            : `connectionRef '${connectionRef}' is not eligible for dispatch (${ineligible.ineligible?.reason ?? "not an ACTIVE SANDBOX connection"}); no attempt was recorded`,
          { missionId },
        );
      }
      // The artifact resolves HOST-SIDE: the mission's latest
      // unconsumed one (the same lookup the armed-effect read derives
      // over). The enforcing checks — single-use, preview binding,
      // digest binding, expiry — stay in the dispatch path, unchanged.
      const snapshots = await runtime.artifactsForMission(missionId, deps.now());
      const artifact = latestUnconsumed(snapshots);
      if (artifact === null) {
        throw new PaymentMissionError(
          "AUTHORIZATION_REQUIRED",
          `Mission ${JSON.stringify(missionId)} has no unconsumed authorization artifact — a fresh preview and a fresh explicit approval are required before any dispatch`,
          { missionId },
        );
      }
      const outcome = await runtime.dispatch.dispatch(
        missionId,
        "CREATE_EXTERNAL_EFFECT",
        {
          authorizationArtifactId: artifact.artifactId,
          connectionRef,
          executionMode: "SANDBOX",
        },
        deps.now(),
      );
      deps.log(
        "info",
        `payswap-desktop: dispatch ${outcome.kind} for mission ${missionId} (attempt ${outcome.attemptId}) — the artifact, the operation and the INV-25 mode resolved host-side; outcome facts only on the wire`,
      );
      return toOutcomeDto(outcome);
    },
  };
}
