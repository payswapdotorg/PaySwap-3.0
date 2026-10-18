import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.ts";
import {
  onchainRailId,
  mapObservationToRailOutcome,
  settlementAttemptEventCandidate,
  mapToRailOperation,
  validateOnchainSettlementLinkage,
  observationPermitsFinalityDeclaration,
  pinnedInFlightTransition,
  pinnedOutcomeUnknownExits,
} from "../src/settlement-mapping.ts";
import {
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_SETTLEMENT_ATTEMPT_STATES,
} from "../src/pins-settlement.ts";
import type {
  PinnedSettlementAttemptEvent,
  PinnedSettlementAttemptState,
} from "../src/pins-settlement.ts";
import {
  broadcastObservation,
  confirmedObservation,
  unknownObservation,
  failedObservation,
  ETHEREUM_CHAIN_KEY,
} from "./fixtures.ts";

describe("deterministic rail identity (onchain rails are rail-family members)", () => {
  it("derives the canonical onchain rail id", () => {
    expect(onchainRailId("ethereum:mainnet")).toBe("onchain.ethereum:mainnet");
    expect(onchainRailId("solana:mainnet-beta")).toBe("onchain.solana:mainnet-beta");
  });

  it("rejects non-canonical chain keys", () => {
    expect(() => onchainRailId("Ethereum")).toThrow(ValidationError);
  });
});

describe("observation → rail outcome mapping (deterministic, UNKNOWN-preserving)", () => {
  it("BROADCAST maps to a PENDING rail effect — submitted is not finality", () => {
    const outcome = mapObservationToRailOutcome(broadcastObservation());
    expect(outcome.kind).toBe("RAIL_EFFECT_PENDING");
    if (outcome.kind === "RAIL_EFFECT_PENDING") {
      expect(outcome.submittedNotFinal).toBe(true);
    }
    expect(outcome.evidenceRefs).toContain("evidence:broadcast:001");
  });

  it("CONFIRMED maps to an OBSERVED rail effect that is a finality CANDIDATE ONLY (INV-1)", () => {
    const outcome = mapObservationToRailOutcome(confirmedObservation());
    expect(outcome.kind).toBe("RAIL_EFFECT_OBSERVED");
    if (outcome.kind === "RAIL_EFFECT_OBSERVED") {
      expect(outcome.finalityCandidateOnly).toBe(true);
    }
  });

  it("FAILED maps to a FAILED rail effect carrying the failure descriptor", () => {
    const outcome = mapObservationToRailOutcome(failedObservation());
    expect(outcome.kind).toBe("RAIL_EFFECT_FAILED");
    if (outcome.kind === "RAIL_EFFECT_FAILED") {
      expect(outcome.failure.failureClass).toBe("REVERTED");
    }
  });

  it("OUTCOME_UNKNOWN maps to an UNKNOWN rail effect that REQUIRES reconciliation", () => {
    const outcome = mapObservationToRailOutcome(unknownObservation());
    expect(outcome.kind).toBe("RAIL_EFFECT_UNKNOWN");
    if (outcome.kind === "RAIL_EFFECT_UNKNOWN") {
      expect(outcome.requiresReconciliation).toBe(true);
      expect(outcome.reason).toMatch(/unknown whether the operation reached the chain/);
    }
  });

  it("the mapping never converts UNKNOWN into FAILED or success (INV-4)", () => {
    for (const observation of [
      broadcastObservation(),
      confirmedObservation(),
      unknownObservation(),
      failedObservation(),
    ]) {
      const outcome = mapObservationToRailOutcome(observation);
      if (observation.outcome === "OUTCOME_UNKNOWN") {
        expect(outcome.kind).toBe("RAIL_EFFECT_UNKNOWN");
      }
      if (observation.outcome === "FAILED") {
        expect(outcome.kind).toBe("RAIL_EFFECT_FAILED");
      }
    }
  });

  it("an invalid observation fails the mapping (fail closed)", () => {
    expect(() => mapObservationToRailOutcome({} as never)).toThrow(ValidationError);
  });
});

describe("observation → settlement attempt event candidates (canonical machine compatibility)", () => {
  it("the suggested events are events of the PINNED canonical settlement attempt vocabulary", () => {
    for (const observation of [
      confirmedObservation(),
      failedObservation(),
      unknownObservation(),
    ]) {
      const candidate = settlementAttemptEventCandidate(observation);
      if (candidate.kind === "EVENT_CANDIDATE") {
        expect(PINNED_SETTLEMENT_ATTEMPT_EVENTS).toContain(candidate.event);
      }
    }
  });

  it("BROADCAST suggests NO event: the attempt stays in flight (submitted is not finality)", () => {
    const candidate = settlementAttemptEventCandidate(broadcastObservation());
    expect(candidate).toEqual({ kind: "NO_EVENT", reason: "SUBMITTED_NOT_FINAL" });
  });

  it("CONFIRMED suggests CONFIRM_SUCCEEDED; FAILED suggests CONFIRM_FAILED; UNKNOWN suggests OUTCOME_UNKNOWN", () => {
    expect(settlementAttemptEventCandidate(confirmedObservation())).toEqual({
      kind: "EVENT_CANDIDATE",
      event: "CONFIRM_SUCCEEDED",
    });
    expect(settlementAttemptEventCandidate(failedObservation())).toEqual({
      kind: "EVENT_CANDIDATE",
      event: "CONFIRM_FAILED",
    });
    expect(settlementAttemptEventCandidate(unknownObservation())).toEqual({
      kind: "EVENT_CANDIDATE",
      event: "OUTCOME_UNKNOWN",
    });
  });

  it("the pinned canonical machine transitions the suggested events from IN_FLIGHT (the structural-pin reconciliation with @payswap/protocol)", () => {
    // The mapping is only meaningful if the canonical settlement attempt
    // machine can actually consume the suggested events from the in-flight
    // state — asserted against the PINNED transition table (authority:
    // @payswap/protocol settlementAttemptStateMachine; byte-identical values,
    // zero sibling imports).
    expect(
      pinnedInFlightTransition("CONFIRM_SUCCEEDED"),
    ).toBe("SUCCEEDED" satisfies PinnedSettlementAttemptState);
    expect(
      pinnedInFlightTransition("CONFIRM_FAILED"),
    ).toBe("FAILED" satisfies PinnedSettlementAttemptState);
    expect(
      pinnedInFlightTransition("OUTCOME_UNKNOWN"),
    ).toBe("OUTCOME_UNKNOWN" satisfies PinnedSettlementAttemptState);
    // And OUTCOME_UNKNOWN only exits via reconciliation resolution events
    // (INV-4) — the onchain mapping never suggests a blind retry event.
    const ordinaryEvents = PINNED_SETTLEMENT_ATTEMPT_EVENTS.filter(
      (event) => !pinnedOutcomeUnknownExits().includes(event as never),
    ) as readonly PinnedSettlementAttemptEvent[];
    expect(pinnedOutcomeUnknownExits()).toEqual([
      "RECONCILE_RESOLVED_SUCCEEDED",
      "RECONCILE_RESOLVED_FAILED",
    ]);
    for (const ordinary of ordinaryEvents) {
      expect(pinnedOutcomeUnknownExits()).not.toContain(ordinary);
    }
    expect(PINNED_SETTLEMENT_ATTEMPT_STATES).toContain("OUTCOME_UNKNOWN");
  });
});

describe("observation → RailOperation mapping records (canonical linkage)", () => {
  it("constructs a canonical mapping record referencing the settlement machinery", () => {
    const mapping = mapToRailOperation({
      observation: unknownObservation(),
      settlementInstructionId: "settle:instruction:001",
      settlementAttemptId: "settle:attempt:001",
    });
    expect(mapping.mappingKind).toBe("OBSERVATION_TO_RAIL_OPERATION");
    expect(mapping.railId).toBe(`onchain.${ETHEREUM_CHAIN_KEY}`);
    expect(mapping.settlementInstructionId).toBe("settle:instruction:001");
    expect(mapping.settlementAttemptId).toBe("settle:attempt:001");
    expect(mapping.outcome.kind).toBe("RAIL_EFFECT_UNKNOWN");
  });

  it("requires canonical settlement references (no orphan rail operations)", () => {
    expect(() =>
      mapToRailOperation({
        observation: broadcastObservation(),
        settlementInstructionId: "",
        settlementAttemptId: "settle:attempt:001",
      }),
    ).toThrow(/settlementInstructionId is required/);
    expect(() =>
      mapToRailOperation({
        observation: broadcastObservation(),
        settlementInstructionId: "settle:instruction:001",
        settlementAttemptId: "",
      }),
    ).toThrow(/settlementAttemptId is required/);
  });
});

describe("settlement linkage validation (finality referenced, never declared)", () => {
  it("validates a canonical linkage", () => {
    const linkage = validateOnchainSettlementLinkage(
      {
        settlementInstructionId: "settle:instruction:001",
        settlementAttemptId: "settle:attempt:001",
        railId: onchainRailId(ETHEREUM_CHAIN_KEY),
      },
      ETHEREUM_CHAIN_KEY,
    );
    expect(linkage.railId).toBe("onchain.ethereum:mainnet");
  });

  it("enforces the deterministic rail id for the known chain", () => {
    expect(() =>
      validateOnchainSettlementLinkage(
        {
          settlementInstructionId: "settle:instruction:001",
          settlementAttemptId: "settle:attempt:001",
          railId: "some:other:rail",
        },
        ETHEREUM_CHAIN_KEY,
      ),
    ).toThrow(/deterministic/);
  });

  it("an observation NEVER permits finality declaration on its own (INV-1)", () => {
    expect(observationPermitsFinalityDeclaration(confirmedObservation())).toBe(false);
    expect(observationPermitsFinalityDeclaration(broadcastObservation())).toBe(false);
  });

  it("a finality record reference is an id reference minted by the settlement authority", () => {
    const linkage = validateOnchainSettlementLinkage(
      {
        settlementInstructionId: "settle:instruction:001",
        settlementAttemptId: "settle:attempt:001",
        railId: onchainRailId(ETHEREUM_CHAIN_KEY),
        finalityRecordId: "finality:001",
      },
      ETHEREUM_CHAIN_KEY,
    );
    expect(linkage.finalityRecordId).toBe("finality:001");
    // The linkage carries NO finality state — only the optional reference.
    expect(Object.keys(linkage).sort()).toEqual(
      ["finalityRecordId", "railId", "settlementAttemptId", "settlementInstructionId"].sort(),
    );
  });
});
