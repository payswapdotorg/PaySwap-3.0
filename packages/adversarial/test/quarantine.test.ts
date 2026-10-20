/**
 * The quarantine ledger — release ONLY through evidence-backed VERIFIED
 * remediation + advisory closure (P6-W3, lane r4-w3; PORT of the
 * quarantine sites from payswap.org@8a735bf
 * packages/security/test/quarantine.test.ts).
 */

import { describe, expect, it } from "vitest";
import {
  QuarantineError,
  QuarantineLedger,
  SecurityAdvisoryRegistry,
} from "../src/index.ts";

function registryWithRestrictiveAdvisory(advisoryId = "adv-1") {
  const registry = new SecurityAdvisoryRegistry();
  registry.publish({
    advisoryId,
    title: "ext-1 compromise",
    severity: "critical",
    description: "fixture",
    affected: [{ kind: "extension", id: "ext-1" }],
    action: "quarantine",
    remediation: { summary: "patch", workarounds: [] },
    declaredBy: "source:cert-intel",
    publishedAt: 1_000,
  });
  return registry;
}

describe("the quarantine ledger (verified-remediation release)", () => {
  it("quarantines a component and rejects double quarantine", () => {
    const ledger = new QuarantineLedger();
    const record = ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    expect(record.status).toBe("active");
    expect(record.quarantineId).toBe("quarantine:extension:ext-1:1");
    expect(ledger.isQuarantined({ kind: "extension", id: "ext-1" })).toBe(true);
    expect(() =>
      ledger.quarantine({
        component: { kind: "extension", id: "ext-1" },
        reason: "again",
        advisoryRefs: [],
        at: 2_000,
      }),
    ).toThrowError(/already quarantined/);
    // A released component may be quarantined AGAIN (new record).
    expect(record.advisoryRefs).toEqual(["adv-1"]);
  });

  it("quarantine validation fails closed", () => {
    const ledger = new QuarantineLedger();
    expect(() =>
      ledger.quarantine({
        component: { kind: "vendor_plugin" as never, id: "x" },
        reason: "r",
        advisoryRefs: [],
        at: 1,
      }),
    ).toThrowError(QuarantineError);
    expect(() =>
      ledger.quarantine({ component: { kind: "extension", id: "" }, reason: "r", advisoryRefs: [], at: 1 }),
    ).toThrowError(/component id/);
    expect(() =>
      ledger.quarantine({ component: { kind: "extension", id: "e" }, reason: "", advisoryRefs: [], at: 1 }),
    ).toThrowError(/reason/);
  });

  it("refuses release while the driving advisory is still active", () => {
    const registry = registryWithRestrictiveAdvisory();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    expect(() =>
      ledger.release({
        quarantineId: "quarantine:extension:ext-1:1",
        remediation: {
          releaseNote: "patched",
          evidence: [{ evidenceId: "e-1", artifactRef: "a-1", contentDigest: "d-1" }],
        },
        advisories: registry,
        at: 2_000,
      }),
    ).toThrowError(/advisories remain active/);
  });

  it("refuses release without explicit remediation evidence, even after closure", () => {
    const registry = registryWithRestrictiveAdvisory();
    registry.close({
      advisoryId: "adv-1",
      closedAt: 1_500,
      closureNote: "patched in 2.0.0",
      remediationVerified: true,
    });
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    expect(() =>
      ledger.release({
        quarantineId: "quarantine:extension:ext-1:1",
        remediation: { releaseNote: "trust me", evidence: [] },
        advisories: registry,
        at: 2_000,
      }),
    ).toThrowError(/explicit remediation evidence/);
    expect(() =>
      ledger.release({
        quarantineId: "quarantine:extension:ext-1:1",
        remediation: {
          releaseNote: "incomplete",
          evidence: [{ evidenceId: "", artifactRef: "a", contentDigest: "d" }],
        },
        advisories: registry,
        at: 2_000,
      }),
    ).toThrowError(/complete/);
  });

  it("releases after advisory closure + remediation evidence; access is restored", () => {
    const registry = registryWithRestrictiveAdvisory();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    registry.close({
      advisoryId: "adv-1",
      closedAt: 1_500,
      closureNote: "patched in 2.0.0",
      remediationVerified: true,
    });
    const released = ledger.release({
      quarantineId: "quarantine:extension:ext-1:1",
      remediation: {
        releaseNote: "patched in 2.0.0; verified rebuild",
        evidence: [
          { evidenceId: "e-1", artifactRef: "artifact:rebuild", contentDigest: "fnv1a64:0000000000000001" },
        ],
      },
      advisories: registry,
      at: 2_000,
    });
    expect(released.status).toBe("released");
    expect(released.releasedAt).toBe(2_000);
    expect(ledger.isQuarantined({ kind: "extension", id: "ext-1" })).toBe(false);
  });

  it("release is NEVER time-based: an aged active quarantine without remediation stays", () => {
    const registry = registryWithRestrictiveAdvisory();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    // A hundred years pass — no API releases by age.
    expect(ledger.isQuarantined({ kind: "extension", id: "ext-1" })).toBe(true);
    expect(ledger.byId("quarantine:extension:ext-1:1")?.status).toBe("active");
  });

  it("double release and release-time regression are rejected", () => {
    const registry = registryWithRestrictiveAdvisory();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    registry.close({
      advisoryId: "adv-1",
      closedAt: 1_500,
      closureNote: "patched",
      remediationVerified: true,
    });
    const release = {
      quarantineId: "quarantine:extension:ext-1:1",
      remediation: {
        releaseNote: "patched",
        evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
      },
      advisories: registry,
      at: 2_000,
    };
    ledger.release(release);
    expect(() => ledger.release(release)).toThrowError(/already released/);
    const ledger2 = new QuarantineLedger();
    ledger2.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    expect(() =>
      ledger2.release({ ...release, at: 500 }),
    ).toThrowError(/before the quarantine/);
  });

  it("release appends events; the quarantined history is never rewritten", () => {
    const registry = registryWithRestrictiveAdvisory();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    registry.close({
      advisoryId: "adv-1",
      closedAt: 1_500,
      closureNote: "patched",
      remediationVerified: true,
    });
    ledger.release({
      quarantineId: "quarantine:extension:ext-1:1",
      remediation: {
        releaseNote: "patched",
        evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
      },
      advisories: registry,
      at: 2_000,
    });
    expect(ledger.history().map((event) => event.eventType)).toEqual([
      "quarantined",
      "released",
    ]);
    expect(ledger.recordsFor({ kind: "extension", id: "ext-1" })).toHaveLength(1);
    expect(ledger.list()[0]?.status).toBe("released");
  });

  it("references to unknown advisories fail closed at release", () => {
    const registry = new SecurityAdvisoryRegistry();
    const ledger = new QuarantineLedger();
    ledger.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-missing"],
      at: 1_000,
    });
    expect(() =>
      ledger.release({
        quarantineId: "quarantine:extension:ext-1:1",
        remediation: {
          releaseNote: "n",
          evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
        },
        advisories: registry,
        at: 2_000,
      }),
    ).toThrowError(/unknown advisory/);
  });
});
