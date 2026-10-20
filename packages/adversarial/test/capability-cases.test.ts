/**
 * Capability cases + the immutable security learning feed (P6-W3, lane
 * r4-w3; PORT of payswap.org@8a735bf
 * packages/security/test/capability-cases.test.ts — the old INV-S04
 * law).
 */

import { describe, expect, it } from "vitest";
import {
  CapabilityCaseError,
  CapabilityCaseLedger,
  type EvidenceRef,
} from "../src/index.ts";

const evidence: readonly EvidenceRef[] = [
  { evidenceId: "e-1", artifactRef: "artifact:telemetry-1", contentDigest: "fnv1a64:0000000000000001" },
];

function openInput(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "case-1",
    kind: "incident" as const,
    title: "suspicious beneficiary change",
    component: { kind: "agent_key" as const, id: "key-1" },
    signal: {
      signalKind: "beneficiary_change" as const,
      observedAt: 1_000,
      detail: "beneficiary changed then reverted",
      sourceRef: "observer:risk-engine",
    },
    evidence,
    openedAt: 1_000,
    ...overrides,
  };
}

describe("capability cases + the learning feed", () => {
  it("opens a case with mandatory evidence and signal provenance", () => {
    const ledger = new CapabilityCaseLedger();
    const record = ledger.open(openInput());
    expect(record.status).toBe("open");
    expect(record.signal.signalKind).toBe("beneficiary_change");
    expect(record.evidence).toHaveLength(1);
    expect(ledger.learningFeed()).toHaveLength(1);
  });

  it("refuses cases without evidence (an incident with no evidence feeds nothing)", () => {
    const ledger = new CapabilityCaseLedger();
    expect(() => ledger.open(openInput({ evidence: [] }))).toThrowError(
      /at least one evidence ref/,
    );
    expect(() =>
      ledger.open(openInput({ signal: { signalKind: "beneficiary_change", observedAt: 1, detail: "d", sourceRef: "" } })),
    ).toThrowError(/sourceRef/);
    expect(() =>
      ledger.open(openInput({ component: { kind: "vendor_plugin" as never, id: "x" } })),
    ).toThrowError(/component kind/);
    expect(() =>
      ledger.open(openInput({ signal: { signalKind: "telepathy" as never, observedAt: 1, detail: "d", sourceRef: "s" } })),
    ).toThrowError(/signal kind/);
    expect(() => ledger.open(openInput({ caseId: "" }))).toThrowError(/caseId/);
  });

  it("escalates and resolves with append-only events", () => {
    const ledger = new CapabilityCaseLedger();
    ledger.open(openInput());
    const escalated = ledger.escalate({ caseId: "case-1", at: 2_000 });
    expect(escalated.status).toBe("escalated");
    expect(() => ledger.escalate({ caseId: "case-1", at: 2_500 })).toThrowError(
      /already escalated/,
    );
    const resolved = ledger.resolve({ caseId: "case-1", at: 3_000, resolutionNote: "confirmed takeover attempt" });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBe(3_000);
    expect(() =>
      ledger.resolve({ caseId: "case-1", at: 3_500, resolutionNote: "again" }),
    ).toThrowError(/already resolved/);
    expect(() =>
      ledger.attachEvidence({ caseId: "case-1", evidence, at: 4_000 }),
    ).toThrowError(/resolved/);
    expect(ledger.history().map((event) => event.eventType)).toEqual([
      "opened",
      "escalated",
      "resolved",
    ]);
  });

  it("every lifecycle event appends an immutable, content-addressed learning record", () => {
    const ledger = new CapabilityCaseLedger();
    ledger.open(openInput());
    ledger.attachEvidence({
      caseId: "case-1",
      evidence: [{ evidenceId: "e-2", artifactRef: "a-2", contentDigest: "d-2" }],
      at: 2_000,
    });
    ledger.escalate({ caseId: "case-1", at: 3_000 });
    ledger.resolve({ caseId: "case-1", at: 4_000, resolutionNote: "done" });
    const feed = ledger.learningFeed();
    expect(feed).toHaveLength(4);
    expect(feed.map((record) => record.sequence)).toEqual([1, 2, 3, 4]);
    for (const record of feed) {
      expect(record.namespace).toBe("PAYSWAP_SECURITY_LEARNING");
      expect(record.contentDigest).toMatch(/^fnv1a64:/);
      expect(record.caseStatus).toBeDefined();
      expect(Object.isFrozen(record)).toBe(true);
    }
    expect(feed[3]?.caseStatus).toBe("resolved");
  });

  it("resolving a case never removes its historical learning records", () => {
    const ledger = new CapabilityCaseLedger();
    ledger.open(openInput());
    ledger.resolve({ caseId: "case-1", at: 2_000, resolutionNote: "benign" });
    expect(ledger.learningRecordsFor("case-1")).toHaveLength(2);
    expect(ledger.learningRecordsFor("case-1")[0]?.caseStatus).toBe("open");
  });

  it("case snapshots preserve evidence in every emitted record; per-component queries work", () => {
    const ledger = new CapabilityCaseLedger();
    ledger.open(openInput());
    ledger.open(openInput({ caseId: "case-2", component: { kind: "agent_key", id: "key-2" } }));
    expect(ledger.casesForComponent({ kind: "agent_key", id: "key-1" })).toHaveLength(1);
    expect(ledger.casesForComponent({ kind: "agent_key", id: "key-2" })[0]?.caseId).toBe("case-2");
    const record = ledger.byId("case-2");
    expect(record?.evidence).toEqual(evidence);
    expect(() => ledger.open(openInput())).toThrowError(CapabilityCaseError);
  });
});
