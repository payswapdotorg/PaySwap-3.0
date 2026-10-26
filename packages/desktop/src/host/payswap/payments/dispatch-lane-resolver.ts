/**
 * PaySwap Desktop (P19-A, ADR-0012 D2) — the DISPATCH LANE RESOLVER:
 * computes the executing lanes a dispatch may run on, from the
 * connections registry's own read model.
 *
 * THE ELIGIBILITY LAW (INV-25 + the deployment truth):
 * - a lane is ELIGIBLE exactly when the connection record is ACTIVE
 *   and its execution mode is SANDBOX — LIVE mode requires the
 *   live-grant derivation that belongs to the execution-lane wave's
 *   own amendment, so a LIVE record is listed as INELIGIBLE with its
 *   reason, never silently hidden (an ACTIVE LIVE connection looks
 *   connected to the operator; hiding it would lie by omission);
 * - non-ACTIVE records are listed as ineligible with their state's
 *   reason (nothing is hidden; the Connections section owns the
 *   lifecycle detail);
 * - NO credentials, NO credential handles and NO secrets appear on
 *   any shape here: the resolver reads the registry's ids + lifecycle
 *   facts only, and the lane it produces carries exactly
 *   { connectionRef, label, providerId, ineligible? { reason } }.
 *
 * The resolver is a PURE function over the candidate records; the
 * records arrive through the `listLaneCandidateRecords()` port the
 * shell composition injects (over the connection session authority's
 * own connectionStatuses read model). When the connections plane is
 * not configured, the PORT fails closed with the typed error at the
 * composition edge — this module never fabricates an empty lane set
 * to mask a missing plane. Zero candidates is the honest empty lane.
 */

import {
  PINNED_PAYMENT_PROVIDER_REGISTRY,
  type PinnedConnectionExecutionMode,
  type PinnedConnectionLifecycleState,
} from "../connections/provider-pins.js";

/**
 * One lane-candidate record — a STRUCTURAL subset of the registry's
 * own read model (the connection status view), so the shell
 * composition can inject the real authority's statuses without an
 * adapter and tests can inject minimal records honestly.
 */
export interface DispatchLaneCandidateRecord {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly state: PinnedConnectionLifecycleState;
  readonly executionMode: PinnedConnectionExecutionMode;
}

/**
 * The port the shell composition injects: lists the lane-candidate
 * records from the connections registry. Fail-closed typed at the
 * composition edge when the connections plane is not configured (the
 * typed ConnectionPlaneNotConfiguredError — never a fabricated empty
 * set); a configured plane with zero records yields the empty list.
 */
export interface DispatchLaneCandidateRecordsPort {
  listLaneCandidateRecords(): Promise<readonly DispatchLaneCandidateRecord[]>;
}

/** One executing lane on the armed card — ids + people language only. */
export interface DispatchLane {
  /** The operator's choice key (the registry's connection id). */
  readonly connectionRef: string;
  /** People language (the registry's own display names — never guessed). */
  readonly label: string;
  readonly providerId: string;
  /** Present exactly when the lane is NOT dispatchable, with its reason. */
  readonly ineligible?: { readonly reason: string };
}

/** The pinned reason a LIVE connection is not dispatchable here (verbatim; asserted in tests). */
export const LIVE_LANE_INELIGIBLE_REASON =
  "This connection runs in LIVE mode — live execution requires the live-grant derivation this deployment does not perform; only sandbox executions are dispatchable here.";

/** The people-language label for one candidate (the registry's own display names). */
function laneLabelOf(record: DispatchLaneCandidateRecord): string {
  const entry = PINNED_PAYMENT_PROVIDER_REGISTRY.find(
    (candidate) => candidate.providerId === record.providerId,
  );
  const displayName = entry?.displayName ?? record.providerId;
  return `${displayName} (${record.useCaseRef})`;
}

/**
 * Resolve the executing lanes from the candidate records (ADR-0012 D2).
 * Every candidate is LISTED — eligible or ineligible with its reason —
 * and the order is deterministic (connectionRef ascending, the registry's
 * own id): the same registry always yields the same lane list.
 */
export function resolveDispatchLanes(
  records: readonly DispatchLaneCandidateRecord[],
): readonly DispatchLane[] {
  return [...records]
    .sort((a, b) => (a.connectionId === b.connectionId ? 0 : a.connectionId < b.connectionId ? -1 : 1))
    .map((record) => {
      if (record.state !== "ACTIVE") {
        return {
          connectionRef: record.connectionId,
          label: laneLabelOf(record),
          providerId: record.providerId,
          ineligible: {
            reason: `This connection is not ACTIVE (${record.state}) — only a connection whose read-only verification probe confirmed it ACTIVE can execute a payment.`,
          },
        };
      }
      if (record.executionMode === "LIVE") {
        return {
          connectionRef: record.connectionId,
          label: laneLabelOf(record),
          providerId: record.providerId,
          ineligible: { reason: LIVE_LANE_INELIGIBLE_REASON },
        };
      }
      return {
        connectionRef: record.connectionId,
        label: laneLabelOf(record),
        providerId: record.providerId,
      };
    });
}

/** The eligible (dispatchable) subset of a resolved lane list. */
export function eligibleLanesOf(lanes: readonly DispatchLane[]): readonly DispatchLane[] {
  return lanes.filter((lane) => lane.ineligible === undefined);
}
