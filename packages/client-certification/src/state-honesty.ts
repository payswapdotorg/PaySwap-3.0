/**
 * @payswap/client-certification — truthful customer-facing states
 * (P8-W2, hard law 3).
 *
 * REAUTHORED from the old-repo honesty disciplines (payswap.org@8a735bf
 * packages/certification production-audit "no-simulated-success" +
 * packages/operations browser-verification INV-X01 law) onto the
 * canonical architecture: every CONSEQUENTIAL state a customer-facing
 * surface renders must be one of
 *
 *   { known-success (evidence-backed), known-failure (reasoned),
 *     UNKNOWN-with-reason (+ reconciliation pointer) }
 *
 * — never synthetic success (success without evidence, or fed by a mock
 * path), never a hidden mock path, never UNKNOWN silently styled as
 * failure or success. The render-tone law is pinned from @payswap/ui
 * (UNKNOWN renders the `unknown` tone; only blocked/failed may consume
 * the danger ramp).
 *
 * Deterministic only: a pure fold over the declared states.
 */

import type { PinnedStatusTone } from "./pins/ui.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 3). */
const LAW = "truthful-states" as const;

/** The closed vocabulary of truthful customer-facing consequential states. */
export const CUSTOMER_FACING_STATE_KINDS = Object.freeze([
  "known-success",
  "known-failure",
  "unknown",
] as const);

export type CustomerFacingStateKind =
  (typeof CUSTOMER_FACING_STATE_KINDS)[number];

/** Where a consequential state's data comes from. */
export type StateDataPath = "live" | "mock";

/**
 * One consequential customer-facing state as DECLARED by the surface
 * under certification (the surface's own registry — the gate folds it).
 * `exactOptionalPropertyTypes` discipline: absent means absent.
 */
export interface ConsequentialStateDeclaration {
  readonly stateId: string;
  readonly label: string;
  readonly kind: CustomerFacingStateKind;
  /**
   * Required for known-success: non-empty evidence references backing
   * the success claim (a success without evidence is synthetic).
   */
  readonly evidenceRefs?: readonly string[];
  /** Required for known-failure: why it failed. */
  readonly failureReason?: string;
  /** Required for known-failure: the recourse path offered to the person. */
  readonly recourseRef?: string;
  /** Required for unknown: why the outcome is not knowable. */
  readonly unknownReason?: string;
  /** Required for unknown: the reconciliation pointer (INV-04/INV-X01). */
  readonly reconciliationRef?: string;
  /** The render tone the surface uses (pinned @payswap/ui vocabulary). */
  readonly renderTone: PinnedStatusTone;
  /** The data path feeding the state. `mock` on a consequential state is a violation. */
  readonly dataPath: StateDataPath;
}

/** The tones a kind may render (the pinned tone law). */
export const REQUIRED_TONES = Object.freeze({
  "known-success": Object.freeze(["ok"] as const),
  "known-failure": Object.freeze(["blocked", "failed"] as const),
  unknown: Object.freeze(["unknown"] as const),
} as const satisfies Readonly<
  Record<CustomerFacingStateKind, readonly PinnedStatusTone[]>
>);

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

function nonEmptyList(value: readonly string[] | undefined): boolean {
  return (
    typeof value !== "undefined" &&
    value.length > 0 &&
    value.every((entry) => nonEmpty(entry))
  );
}

/**
 * Fold ONE declared state into its violation list (deterministic; used
 * by the gate and directly by tests).
 */
export function stateHonestyViolations(
  state: ConsequentialStateDeclaration,
): readonly CertificationViolation[] {
  const violations: CertificationViolation[] = [];
  const id = state.stateId;
  if (!nonEmpty(id)) {
    return [
      violationOf(LAW, "malformed_state", "a state declaration requires a stateId"),
    ];
  }
  switch (state.kind) {
    case "known-success":
      if (!nonEmptyList(state.evidenceRefs)) {
        violations.push(
          violationOf(
            LAW,
            "synthetic_success",
            `state '${id}' claims known-success with no evidence references — success without evidence is synthetic`,
          ),
        );
      }
      break;
    case "known-failure":
      if (!nonEmpty(state.failureReason)) {
        violations.push(
          violationOf(
            LAW,
            "failure_without_reason",
            `state '${id}' claims known-failure with no failure reason`,
          ),
        );
      }
      if (!nonEmpty(state.recourseRef)) {
        violations.push(
          violationOf(
            LAW,
            "failure_without_recourse",
            `state '${id}' claims known-failure with no recourse path for the person`,
          ),
        );
      }
      break;
    case "unknown":
      if (!nonEmpty(state.unknownReason)) {
        violations.push(
          violationOf(
            LAW,
            "unknown_without_reason",
            `state '${id}' renders UNKNOWN with no reason — an honest UNKNOWN always carries why`,
          ),
        );
      }
      if (!nonEmpty(state.reconciliationRef)) {
        violations.push(
          violationOf(
            LAW,
            "unknown_without_reconciliation",
            `state '${id}' renders UNKNOWN with no reconciliation pointer — UNKNOWN is worked, never parked`,
          ),
        );
      }
      break;
  }
  if (state.dataPath === "mock") {
    violations.push(
      violationOf(
        LAW,
        "hidden_mock_path",
        `state '${id}' is fed by a mock data path — no hidden mock path may feed a customer-facing consequential state`,
      ),
    );
  }
  const allowedTones: readonly string[] = REQUIRED_TONES[state.kind];
  if (!allowedTones.includes(state.renderTone)) {
    violations.push(
      violationOf(
        LAW,
        "tone_law_violation",
        `state '${id}' of kind '${state.kind}' renders tone '${state.renderTone}' — the tone law requires one of [${allowedTones.join(", ")}] (UNKNOWN is never styled as failure or success)`,
      ),
    );
  }
  return violations;
}

/**
 * The state-honesty gate (hard law 3): folds every declared
 * consequential state. Any violation is a HALT for the release.
 */
export function runStateHonestyGate(
  states: readonly ConsequentialStateDeclaration[],
): ClientGateResult {
  const violations: CertificationViolation[] = [];
  for (const state of states) {
    violations.push(...stateHonestyViolations(state));
  }
  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: states.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      checked: states.length,
      violations,
    }),
  });
}
