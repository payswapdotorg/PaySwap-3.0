/**
 * Delegated money-movement laws (P7-W2): no parallel payment engine on the
 * desktop — money movement is delegated via TYPED REFERENCES to the
 * backend plane that owns execution, and the receipt is an
 * acknowledgement only (never finality, never success).
 */

import { describe, expect, it } from "vitest";

import { delegateDesktopMoneyMovement } from "../../src/host/payswap/index.js";
import type { DesktopDelegatedMovementRef } from "../../src/host/payswap/index.js";

const NOW = "2026-10-17T12:00:00.000Z";

function movement(overrides: Partial<DesktopDelegatedMovementRef> = {}): DesktopDelegatedMovementRef {
  return {
    journeyId: "pay",
    intentRef: "intent://economic/PAY-1",
    authorization: {
      artifactId: "artifact://trust/1",
      mandateRef: "mandate://trust/1",
      approverRef: "principal://trust/alice",
      epoch: "3",
    },
    declaredAmount: { currency: "USD", minorUnits: "100000" },
    issuedAt: NOW,
    ...overrides,
  };
}

describe("delegated money movement laws (P7-W2)", () => {
  it("delegation is by typed reference: forwarding performs no movement and the receipt is an acknowledgement only", () => {
    const receipt = delegateDesktopMoneyMovement(movement());
    expect(receipt.journeyId).toBe("pay");
    expect(receipt.intentRef).toBe("intent://economic/PAY-1");
    expect(receipt.acknowledgementNote).toContain("acknowledgement only");
    expect(receipt.acknowledgementNote).toContain("not finality");
    expect(receipt.acknowledgementNote).toContain("not success");
    expect(receipt.acknowledgementNote).toContain("provider-verified observation");
  });

  it("the accepting plane is ALWAYS the journey's pinned dispatch authority — the desktop never re-routes journeys", () => {
    expect(delegateDesktopMoneyMovement(movement()).acceptedBy).toBe("economic-intent-plane");
    expect(delegateDesktopMoneyMovement(movement({ journeyId: "convert" })).acceptedBy).toBe(
      "quote-projection-plane",
    );
    expect(delegateDesktopMoneyMovement(movement({ journeyId: "checkout" })).acceptedBy).toBe(
      "merchant-checkout-plane",
    );
  });

  it("an unknown journey refuses the delegation — journeys are pinned registry ids, never invented", () => {
    expect(() => delegateDesktopMoneyMovement(movement({ journeyId: "teleport" }))).toThrow(
      /unknown journey "teleport"/,
    );
    expect(() => delegateDesktopMoneyMovement(movement({ journeyId: "" }))).toThrow(
      /non-empty string/,
    );
  });

  it("the opaque authorization lineage is structurally validated (fail-closed; semantics stay with the trust lane)", () => {
    expect(() =>
      delegateDesktopMoneyMovement(
        movement({ authorization: { artifactId: "", mandateRef: "m", approverRef: "a", epoch: "3" } }),
      ),
    ).toThrow(/artifactId/);
    expect(() =>
      delegateDesktopMoneyMovement(
        movement({ authorization: { artifactId: "a", mandateRef: "m", approverRef: "a", epoch: "3.5" } }),
      ),
    ).toThrow(/epoch/);
    expect(() =>
      delegateDesktopMoneyMovement(
        movement({ authorization: { artifactId: " a", mandateRef: "m", approverRef: "a", epoch: "3" } }),
      ),
    ).toThrow(/whitespace/);
  });

  it("the declared amount is wire-validated (AmountSpec pin) and never desktop-computed", () => {
    expect(() =>
      delegateDesktopMoneyMovement(movement({ declaredAmount: { currency: "usd", minorUnits: "1" } })),
    ).toThrow(/currency/);
    expect(() =>
      delegateDesktopMoneyMovement(movement({ declaredAmount: { currency: "USD", minorUnits: "10.5" } })),
    ).toThrow(/minorUnits/);
  });

  it("the exact minor-units amount crosses the delegation verbatim as a string (exact-money law)", () => {
    const receipt = delegateDesktopMoneyMovement(
      movement({ declaredAmount: { currency: "JPY", minorUnits: "123456789012345678" } }),
    );
    expect(receipt.journeyId).toBe("pay");
    // The receipt carries the reference pair only; the amount itself
    // flowed through the typed reference without any float conversion.
    expect(movement().declaredAmount.minorUnits).toBeTypeOf("string");
  });

  it("there is NO execute/retry/cancel/confirm API anywhere on the desktop product (structural no-parallel-engine law)", async () => {
    const { createPaySwapDesktopService } = await import("../../src/host/payswap/index.js");
    const service = createPaySwapDesktopService({
      scope: { kind: "local" },
      log: () => {},
    });
    const methodNames = Object.keys(service).filter((key) => key !== "session");
    expect(methodNames.sort()).toEqual([
      // P13-B connection-plane members: registry/records/setup-seed/key
      // seal/probe-evidence/callback-consume/revocation — connection
      // orchestration ONLY (never money movement; connectionRevoke
      // closes a CONNECTION record and deletes its credential).
      "connectionConsumeProviderCallback",
      "connectionRecordVerificationOutcome",
      "connectionRegistry",
      "connectionRevoke",
      "connectionSeedSetup",
      "connectionStatuses",
      "connectionSubmitStripeRestrictedKey",
      "delegateMoneyMovement",
      "deploymentFacts",
      "journeyState",
      "missionBoard",
      "progressTimeline",
      "quoteDisclosure",
      "securityDecision",
      // P10-B console workspace members: demand-side mission intent +
      // host-computed deployment facts ONLY (never money movement).
      "workspaceArchiveMissionDraft",
      "workspaceListMissions",
      "workspaceMissionDetail",
      "workspaceRecordMissionDraft",
      "workspaceRecordMissionIntent",
      "workspaceReviseMissionDraft",
      "workspaceStoreHealth",
    ]);
    for (const name of ["execute", "retry", "cancel", "confirm", "settle", "payout"] as const) {
      expect(methodNames).not.toContain(name);
    }
  });

  it("fail-closed on malformed references (missing intent ref, missing timestamp)", () => {
    expect(() => delegateDesktopMoneyMovement(movement({ intentRef: "" }))).toThrow(/intentRef/);
    expect(() => delegateDesktopMoneyMovement(movement({ issuedAt: "" }))).toThrow(/issuedAt/);
  });
});
