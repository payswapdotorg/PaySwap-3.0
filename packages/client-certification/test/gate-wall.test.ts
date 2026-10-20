import { describe, expect, it } from "vitest";
import {
  CLIENT_CERTIFICATION_LAWS,
  CERTIFIED_SURFACE_KINDS,
  gateWallReceipt,
  haltedGateIsTerminal,
  remediateHalt,
  requestGateDowngrade,
  requestGateWaiver,
  runClientCertification,
} from "../src/index.ts";
import type { RemediationEvidence } from "../src/index.ts";
import { honestSubjectFixture } from "./fixtures.ts";

/**
 * Hard law 10 — the escalate-only gate wall: failed client gates halt
 * the release and cannot be downgraded or waived; only a NEW
 * certification run carrying verified remediation evidence clears a
 * halt. Plus the composed run over all nine content gates.
 */
describe("the composed client certification run (all nine content gates)", () => {
  it("a fully honest subject PASSES with nine gate results and a stable digest", () => {
    const report = runClientCertification(honestSubjectFixture());
    expect(report.verdict).toBe("PASS");
    expect(report.violationCount).toBe(0);
    expect(report.gates).toHaveLength(9);
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
    expect(report.surfaceKind).toBe("web");
    expect(report.digest).toBe(runClientCertification(honestSubjectFixture()).digest);
    expect([...CERTIFIED_SURFACE_KINDS]).toEqual([
      "web",
      "desktop",
      "extension",
      "command",
    ]);
  });

  it("the ten-law registry is exactly the ten hard laws of the packet", () => {
    expect([...CLIENT_CERTIFICATION_LAWS]).toEqual([
      "secret-boundary",
      "dead-action-audit",
      "truthful-states",
      "recipient-authorization",
      "fresh-conditions",
      "sandbox-live-separation",
      "accessibility-contract",
      "responsive-device-contract",
      "browser-verification-contract",
      "gate-wall",
    ]);
  });

  it("a single violation on ANY gate HALTs the whole release", () => {
    const halted = runClientCertification({
      ...honestSubjectFixture(),
      consequentialStates: [
        ...honestSubjectFixture().consequentialStates,
        {
          stateId: "payment.synthetic",
          label: "Settled",
          kind: "known-success",
          renderTone: "ok",
          dataPath: "live",
        },
      ],
    });
    expect(halted.verdict).toBe("HALT");
    expect(halted.violationCount).toBeGreaterThan(0);
    expect(haltedGateIsTerminal(halted)).toBe(true);
    expect(haltedGateIsTerminal(runClientCertification(honestSubjectFixture()))).toBe(false);
  });

  it("every gate result is severity cannot_downgrade_block with a digest", () => {
    const report = runClientCertification(honestSubjectFixture());
    for (const gate of report.gates) {
      expect(gate.severity).toBe("cannot_downgrade_block");
      expect(gate.digest).toMatch(/^ccert:[0-9a-f]{16}$/);
    }
  });
});

describe("hard law 10: the escalate-only gate wall", () => {
  const halted = runClientCertification({
    ...honestSubjectFixture(),
    sandboxLive: {
      ...honestSubjectFixture().sandboxLive,
      ambientModeInheritance: true,
    },
  });

  it("a waiver request is ALWAYS refused and escalated — for every failing law", () => {
    expect(halted.verdict).toBe("HALT");
    for (const law of ["sandbox-live-separation", "secret-boundary", "gate-wall"] as const) {
      const decision = requestGateWaiver(halted, {
        requestedBy: "release-manager",
        justification: "schedule pressure",
        targetLaw: law,
      });
      expect(decision.accepted).toBe(false);
      expect(decision.escalated).toBe(true);
      expect(decision.note).toContain("WAIVER REFUSED");
    }
  });

  it("a downgrade request is ALWAYS refused and escalated", () => {
    const decision = requestGateDowngrade(halted, {
      requestedBy: "release-manager",
      justification: "treat as advisory",
      targetLaw: "sandbox-live-separation",
    });
    expect(decision.accepted).toBe(false);
    expect(decision.escalated).toBe(true);
    expect(decision.note).toContain("DOWNGRADE REFUSED");
  });

  it("the wall receipt holds for an untampered report and catches tampering", () => {
    const receipt = gateWallReceipt(runClientCertification(honestSubjectFixture()));
    expect(receipt.passed).toBe(true);
    expect(receipt.law).toBe("gate-wall");

    const tampered = {
      ...runClientCertification(honestSubjectFixture()),
      gates: [
        ...runClientCertification(honestSubjectFixture()).gates.slice(0, 8),
      ],
    };
    const tamperedReceipt = gateWallReceipt(tampered);
    expect(tamperedReceipt.passed).toBe(false);
    expect(
      tamperedReceipt.violations.some((v) => v.code === "gate_count_drift"),
    ).toBe(true);
  });

  it("remediation: empty evidence is refused; evidence addressing a non-failing law is refused (fail closed)", () => {
    const empty = remediateHalt(halted, []);
    expect(empty.accepted).toBe(false);
    expect(empty.requiresNewRun).toBe(true);
    expect(empty.violations.length).toBeGreaterThan(0);

    const wrongLaw = remediateHalt(halted, [
      {
        evidenceId: "ev-1",
        artifactRef: "artifacts/patch-report",
        contentDigest: "digest-1",
        addressesLaw: "accessibility-contract",
      },
    ]);
    expect(wrongLaw.accepted).toBe(false);
    expect(
      wrongLaw.violations.some((v) => v.includes("did not fail")),
    ).toBe(true);
  });

  it("complete remediation is accepted but STILL requires a NEW run — and the new honest run passes", () => {
    const evidence: readonly RemediationEvidence[] = [
      {
        evidenceId: "ev-remediation-1",
        artifactRef: "artifacts/sandbox-separation-fix",
        contentDigest: "digest-remediation-1",
        addressesLaw: "sandbox-live-separation",
      },
    ];
    const decision = remediateHalt(halted, evidence);
    expect(decision.accepted).toBe(true);
    expect(decision.requiresNewRun).toBe(true);
    expect(decision.violations).toEqual([]);
    // The halted report is never mutated by remediation.
    expect(halted.verdict).toBe("HALT");
    // The NEW run — the remediated subject — passes.
    expect(runClientCertification(honestSubjectFixture()).verdict).toBe("PASS");
  });
});
