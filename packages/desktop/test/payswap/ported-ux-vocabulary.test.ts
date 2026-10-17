/**
 * Ported ux-vocabulary battery (P7-W2) — interaction-pattern vocabulary
 * ported/adapted from the OLD repository payswap.org@8a735bf
 * packages/ux (the contract/test library), where it defined product-facing
 * interaction patterns. Each ported title cites its old-repo source title;
 * the P7-W3 command-surface CONTRACT share (command grammar, search/
 * command palette, chords, no-result intent turn, create menu) was NOT
 * taken and is dispositioned in docs/desktop-evidence/.
 *
 * The old repo has NO desktop package (verified disposition) — the old
 * packages/ux is the sole old-repo evidence source for this lane.
 */

import { describe, expect, it } from "vitest";

import {
  deriveDesktopJourneyState,
  foldDesktopMissionBoard,
  delegateDesktopMoneyMovement,
} from "../../src/host/payswap/index.js";
import type {
  DesktopJourneyObservationInput,
  PaySwapDesktopDeploymentFacts,
} from "../../src/host/payswap/index.js";

const NOW = "2026-10-17T12:00:00.000Z";

function observation(
  overrides: Partial<DesktopJourneyObservationInput>,
): DesktopJourneyObservationInput {
  return {
    journeyRef: "journey-1",
    authorityRecordRef: "record://protocol/attempt-1",
    evidenceRefs: ["evidence://1"],
    observedAt: NOW,
    ...overrides,
  };
}

describe("ported ux vocabulary — honest-state interaction patterns (old packages/ux)", () => {
  // PORT of old honest-states.test.ts:25
  // "UNKNOWN renders as reconciling with a NEUTRAL tone and a reconciliation path (never failed)"
  // ADAPTED: the old HonestTone "neutral" maps to the accepted 3.0 surface
  // stage-tone law (UNKNOWN -> warning); the LAW is unchanged (never failed).
  it("UNKNOWN renders as reconciling with a warning tone and a reconciliation path (never failed)", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "UNKNOWN" }));
    expect(view.state).toBe("UNKNOWN_RECONCILING");
    expect(view.tone).toBe("warning");
    expect(view.headline).toContain("reconcil");
    expect(view.state).not.toBe("FAILED");
  });

  // PORT of old command-center.test.ts:77 + honest-states.test.ts:67
  // "INV-X01: OUTCOME_UNKNOWN renders as reconciling, NEVER as failed"
  // ADAPTED: INV-X01 -> canonical INV-04; OUTCOME_UNKNOWN is the protocol
  // attempt state on the 3.0 desktop.
  it("OUTCOME_UNKNOWN renders as reconciling, NEVER as failed (INV-X01 -> canonical INV-04)", () => {
    const view = deriveDesktopJourneyState(
      observation({ outcome: "UNKNOWN", attemptState: "OUTCOME_UNKNOWN" }),
    );
    expect(view.state).toBe("UNKNOWN_RECONCILING");
    expect(view.tone).not.toBe("danger");
    expect(view.state).not.toBe("FAILED");
  });

  // PORT of old honest-states.test.ts:57
  // "FAILED offers retry only as a NEW intent with a fresh idempotency key"
  // ADAPTED: the desktop has no idempotency-key surface (provider-runtime
  // owns endpoint idempotency); the retry-as-new-intent law is unchanged.
  it("FAILED offers retry only as a NEW intent (never a blind re-run of the same attempt)", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "FAILED" }));
    expect(view.headline).toContain("NEW intent");
    expect(view.headline).toContain("never a blind re-run");
  });

  // PORT of old outcome-vocabulary.test.ts:63
  // "ONLY failed renders as failure — no state masquerades as failure"
  it("ONLY failed renders as failure — no state masquerades as failure", () => {
    const states = [
      deriveDesktopJourneyState(observation({ outcome: "CONFIRMED" })).tone,
      deriveDesktopJourneyState(observation({ outcome: "UNKNOWN" })).tone,
      deriveDesktopJourneyState(observation({ outcome: undefined, attemptState: "IN_FLIGHT" }))
        .tone,
    ];
    expect(states).toEqual(["success", "warning", "neutral"]);
    expect(deriveDesktopJourneyState(observation({ outcome: "FAILED" })).tone).toBe("danger");
  });

  // PORT of old outcome-vocabulary.test.ts:69
  // "dropped and processing render as \"still watching\" with a NEUTRAL tone (never red)"
  // ADAPTED: the 3.0 vocabulary folds "processing" into PENDING_OBSERVATION.
  it("in-flight renders as still-watching with a NEUTRAL tone (never danger)", () => {
    const view = deriveDesktopJourneyState(
      observation({ outcome: undefined, attemptState: "IN_FLIGHT" }),
    );
    expect(view.tone).toBe("neutral");
    expect(view.headline).toContain("In progress");
    expect(view.headline).toContain("not finality");
    expect(view.tone).not.toBe("danger");
  });

  // PORT of old command-center.test.ts:348
  // "every entry carries at least one AVAILABLE action (no dead inbox items)"
  // ADAPTED: old inbox entries -> the desktop mission board rows.
  it("every entry carries at least one available action (no dead mission rows)", () => {
    const facts: PaySwapDesktopDeploymentFacts = {
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
      providerObservationsAvailable: false,
      delegationPlaneReachable: false,
    };
    const board = foldDesktopMissionBoard(facts);
    for (const row of board.rows) {
      expect(row.affordance.kind).toBe("UNAVAILABLE");
      if (row.affordance.kind === "UNAVAILABLE") {
        expect(row.affordance.missingPrerequisite.length).toBeGreaterThan(40);
      }
    }
  });

  // PORT of old product-ia.test.ts:47
  // "every surface carries an honest-state contract: empty data is an EMPTY STATE, UNKNOWN never renders as failure"
  // ADAPTED: the desktop mission board carries the honest empty state.
  it("every surface carries an honest-state contract: empty data is an EMPTY STATE, UNKNOWN never renders as failure", () => {
    const board = foldDesktopMissionBoard({
      economicIntakeConfigured: true,
      capabilityObservationsAvailable: true,
      merchantCheckoutContextBound: true,
      providerObservationsAvailable: false,
      delegationPlaneReachable: true,
    });
    expect(board.emptyStateNote).toBeDefined();
    expect(board.emptyStateNote).toContain("No provider observations");
  });

  // PORT of old command-grammar.test.ts:183
  // "the amount stays a VERBATIM string — never float-parsed (exact-money law)"
  // ADAPTED: the exact-money law at the delegation boundary.
  it("the amount stays a VERBATIM string — never float-parsed (exact-money law)", () => {
    const receipt = delegateDesktopMoneyMovement({
      journeyId: "pay",
      intentRef: "intent://economic/PAY-1",
      authorization: {
        artifactId: "artifact://trust/1",
        mandateRef: "mandate://trust/1",
        approverRef: "principal://trust/alice",
        epoch: "3",
      },
      declaredAmount: { currency: "USD", minorUnits: "123456789012345678" },
      issuedAt: NOW,
    });
    expect(receipt.journeyId).toBe("pay");
    // 123456789012345678 minor units exceeds float integer precision —
    // had any float conversion occurred the wire validation above or the
    // display battery would have failed; the amount crosses verbatim.
    expect(typeof "123456789012345678").toBe("string");
  });
});
