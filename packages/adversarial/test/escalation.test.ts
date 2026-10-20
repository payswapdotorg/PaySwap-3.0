/**
 * The BLOCK escalation records (P6-W3, lane r4-w3; NET-NEW — the
 * harden-only escalation surface composing with the trust lane's
 * security-block registry through the PINNED record shapes; split from
 * ./onchain-bridge.test.ts for the <=400-line file law).
 */

import { describe, expect, it } from "vitest";
import {
  assertEscalationOnly,
  BlockEscalationError,
  BlockEscalationLedger,
  blockRegistrationInputFor,
  ImmuneGate,
  QuarantineLedger,
  SecurityAdvisoryRegistry,
  SecurityEpochAuthority,
  proposeBlockEscalation,
} from "../src/index.ts";

function gate(): ImmuneGate {
  return new ImmuneGate({
    advisories: new SecurityAdvisoryRegistry(),
    quarantine: new QuarantineLedger(),
    epochs: new SecurityEpochAuthority(),
  });
}

describe("the BLOCK escalation records (harden-only)", () => {
  it("BLOCK escalation is HARDEN-ONLY: BLOCK-grade intelligence proposes, nothing lesser", () => {
    const proposal = proposeBlockEscalation({
      subjectRef: "agent_key:key-rogue",
      reason: "malicious agent confirmed",
      issuedAtEpoch: 4n,
      evidenceRefs: ["evidence:signal:sig-1"],
      sourceRefs: ["sig-1"],
      proposedBy: "agent:provider-intel-1",
      proposedAt: 1_000,
      grade: { kind: "verdict", verdict: "BLOCK" },
    });
    expect(proposal.escalationId).toMatch(/^fnv1a64:/);
    const registration = blockRegistrationInputFor(proposal);
    expect(registration.id).toBe(`block:${proposal.escalationId}`);
    expect(registration.subjectRef).toBe("agent_key:key-rogue");
    expect(registration.evidenceRefs).toEqual(["evidence:signal:sig-1"]);
    expect(() =>
      proposeBlockEscalation({
        subjectRef: "x",
        reason: "r",
        issuedAtEpoch: 0n,
        evidenceRefs: ["e"],
        sourceRefs: [],
        proposedBy: "a",
        proposedAt: 1,
        grade: { kind: "verdict", verdict: "REQUIRE_CONFIRMATION" },
      }),
    ).toThrowError(BlockEscalationError);
    expect(() =>
      proposeBlockEscalation({
        subjectRef: "x",
        reason: "r",
        issuedAtEpoch: 0n,
        evidenceRefs: [],
        sourceRefs: [],
        proposedBy: "a",
        proposedAt: 1,
        grade: { kind: "severity", severity: "critical" },
      }),
    ).toThrowError(/evidence refs/);
    // Critical severity is also BLOCK-grade.
    expect(
      proposeBlockEscalation({
        subjectRef: "x",
        reason: "r",
        issuedAtEpoch: 0n,
        evidenceRefs: ["e"],
        sourceRefs: [],
        proposedBy: "a",
        proposedAt: 1,
        grade: { kind: "severity", severity: "critical" },
      }).subjectRef,
    ).toBe("x");
  });

  it("the escalation ledger is append-only; registration confirmations are recorded, never rewritten", () => {
    const ledger = new BlockEscalationLedger();
    const proposal = proposeBlockEscalation({
      subjectRef: "agent_package:pkg-bad",
      reason: "sealed release divergence",
      issuedAtEpoch: 4n,
      evidenceRefs: ["e-1"],
      sourceRefs: ["sig-1"],
      proposedBy: "agent:provider-intel-1",
      proposedAt: 1_000,
      grade: { kind: "severity", severity: "critical" },
    });
    ledger.record(proposal);
    expect(() => ledger.record(proposal)).toThrowError(/append-only/);
    ledger.recordRegistration({ escalationId: proposal.escalationId, registeredAtEpoch: 5n });
    expect(ledger.history().map((event) => event.eventType)).toEqual(["proposed", "registered"]);
    expect(ledger.list()).toHaveLength(1);
    expect(() =>
      ledger.recordRegistration({ escalationId: "missing", registeredAtEpoch: 5n }),
    ).toThrowError(/unknown/);
  });

  it("the escalation guard rejects any downgrade (assertEscalationOnly)", () => {
    expect(() => assertEscalationOnly("BLOCK", "ALLOW")).toThrowError(/CANNOT/i);
    expect(() => assertEscalationOnly("BLOCK", "UNKNOWN")).toThrowError(/CANNOT/i);
    expect(() => assertEscalationOnly("UNKNOWN", "ALLOW")).toThrowError(/CANNOT/i);
    expect(() => assertEscalationOnly("ALLOW", "BLOCK")).not.toThrow();
    expect(() => assertEscalationOnly("BLOCK", "BLOCK")).not.toThrow();
    expect(() => assertEscalationOnly("UNKNOWN", "BLOCK")).not.toThrow();
  });

  it("blocks survive epoch advancement (the sticky-BLOCK law at the escalation boundary)", () => {
    const immune = gate();
    // A BLOCK-grade detection escalates at epoch 0.
    const proposal = proposeBlockEscalation({
      subjectRef: "agent_key:key-rogue",
      reason: "malicious agent confirmed",
      issuedAtEpoch: immune.epochs.currentEpoch().value,
      evidenceRefs: ["e-1"],
      sourceRefs: ["sig-1"],
      proposedBy: "agent:provider-intel-1",
      proposedAt: 1_000,
      grade: { kind: "verdict", verdict: "BLOCK" },
    });
    // The wiring layer registers it into the TRUST registry (pinned
    // shape); here the escalation ledger records the confirmation.
    const ledger = new BlockEscalationLedger();
    ledger.record(proposal);
    // MANY epochs advance (authority dies; the block does not).
    for (let i = 0; i < 5; i += 1) {
      immune.epochs.advance({ reason: `incident ${i}`, at: 2_000 + i });
    }
    ledger.recordRegistration({
      escalationId: proposal.escalationId,
      registeredAtEpoch: immune.epochs.currentEpoch().value,
    });
    // The registration input STILL names the original evidence + epoch:
    // nothing in this package re-dates, downgrades or expires it.
    const registration = blockRegistrationInputFor(proposal);
    expect(registration.issuedAtEpoch).toBe(0n);
    expect(immune.epochs.currentEpoch().value).toBe(5n);
    expect(ledger.byId(proposal.escalationId)?.issuedAtEpoch).toBe(0n);
  });
});
