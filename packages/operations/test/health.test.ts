import { describe, expect, it } from "vitest";
import {
  COUNTER_ARITY,
  EVIDENCE_COUNTER_KINDS,
  HealthContractError,
  checkCounterMonotonicity,
  checkHealthContracts,
  recordEvidenceCounters,
} from "../src/health.js";

describe("evidence counters (monotonic, digest-anchored)", () => {
  it("a snapshot carries every counter kind, digest-anchored", () => {
    const snapshot = recordEvidenceCounters("deploy-1", {
      eventsPublished: 12,
      outboxDepth: 3,
    });
    for (const kind of EVIDENCE_COUNTER_KINDS) {
      expect(snapshot.counters[kind]).toBeDefined();
    }
    expect(snapshot.snapshotDigest).toMatch(/^fnv1a64:/);
    expect(snapshot.counters.eventsPublished).toBe(12);
    expect(snapshot.counters.outboxPublished).toBe(0);
  });

  it("snapshot assembly fails closed on negative or fractional counters", () => {
    expect(() => recordEvidenceCounters("deploy-1", { outboxDepth: -1 })).toThrow(
      HealthContractError,
    );
    expect(() => recordEvidenceCounters("deploy-1", { outboxDepth: 1.5 })).toThrow(
      HealthContractError,
    );
    expect(() => recordEvidenceCounters("", {})).toThrow(HealthContractError);
  });

  it("cumulative counters are monotonic — a decrease fails the law", () => {
    const earlier = recordEvidenceCounters("deploy-1", {
      eventsPublished: 10,
      reconciliationCasesOpened: 4,
      outboxDepth: 5,
      unknownOutcomesOpen: 2,
    });
    const later = recordEvidenceCounters("deploy-1", {
      eventsPublished: 12,
      reconciliationCasesOpened: 4,
      outboxDepth: 1,
      unknownOutcomesOpen: 7,
    });
    const report = checkCounterMonotonicity(earlier, later);
    expect(report.passed).toBe(true);

    const regressed = recordEvidenceCounters("deploy-1", {
      eventsPublished: 11,
    });
    const bad = checkCounterMonotonicity(later, regressed);
    expect(bad.passed).toBe(false);
    expect(bad.violations.join("\n")).toContain("'eventsPublished' decreased");
  });

  it("GAUGE counters may move both ways (outbox depth drains)", () => {
    expect(COUNTER_ARITY.outboxDepth).toBe("GAUGE");
    expect(COUNTER_ARITY.unknownOutcomesOpen).toBe("GAUGE");
    expect(COUNTER_ARITY.rollbacksExecuted).toBe("CUMULATIVE");
  });

  it("snapshots are byte-deterministic for the same inputs", () => {
    const a = recordEvidenceCounters("deploy-1", { eventsPublished: 3 });
    const b = recordEvidenceCounters("deploy-1", { eventsPublished: 3 });
    expect(a.snapshotDigest).toBe(b.snapshotDigest);
  });
});

describe("the liveness/readiness law (no health claim without a source)", () => {
  const sources = [
    { sourceId: "src-sor-reachable", kind: "DEPENDENCY_PROBE" as const, observes: "system-of-record reachable" },
    { sourceId: "src-outbox-drained", kind: "COUNTER_THRESHOLD" as const, observes: "outbox depth below SLA" },
    { sourceId: "src-parity", kind: "CONTRACT_CHECK" as const, observes: "environment parity holds" },
  ];

  it("a healthy plane declares liveness + readiness with cited sources", () => {
    const report = checkHealthContracts({
      sources,
      readiness: [
        { planeId: "payswap-operations", sourceIds: ["src-sor-reachable", "src-parity"] },
      ],
      liveness: [{ planeId: "payswap-operations" }],
    });
    expect(report.passed).toBe(true);
  });

  it("readiness with ZERO sources fails (no unbacked health claims)", () => {
    const report = checkHealthContracts({
      sources,
      readiness: [{ planeId: "payswap-operations", sourceIds: [] }],
      liveness: [{ planeId: "payswap-operations" }],
    });
    expect(report.passed).toBe(false);
    expect(report.violations.join("\n")).toContain("ZERO sources");
  });

  it("citing an undeclared source fails (no phantom sources)", () => {
    const report = checkHealthContracts({
      sources,
      readiness: [
        { planeId: "payswap-operations", sourceIds: ["src-does-not-exist"] },
      ],
      liveness: [{ planeId: "payswap-operations" }],
    });
    expect(report.passed).toBe(false);
    expect(report.violations.join("\n")).toContain("undeclared readiness source");
  });

  it("liveness without readiness (and vice versa) is incomplete", () => {
    const readinessOnly = checkHealthContracts({
      sources,
      readiness: [{ planeId: "payswap-operations", sourceIds: ["src-parity"] }],
      liveness: [],
    });
    expect(readinessOnly.passed).toBe(false);
    expect(readinessOnly.violations.join("\n")).toContain("declares readiness but not liveness");

    const livenessOnly = checkHealthContracts({
      sources,
      readiness: [],
      liveness: [{ planeId: "payswap-operations" }],
    });
    expect(livenessOnly.passed).toBe(false);
    expect(livenessOnly.violations.join("\n")).toContain("declares liveness but not readiness");
  });

  it("duplicate source ids and unknown kinds fail", () => {
    const report = checkHealthContracts({
      sources: [
        { sourceId: "dup", kind: "DEPENDENCY_PROBE", observes: "x" },
        { sourceId: "dup", kind: "CONTRACT_CHECK", observes: "y" },
        { sourceId: "weird", kind: "VIBES" as never, observes: "z" },
      ],
      readiness: [{ planeId: "p", sourceIds: ["dup"] }],
      liveness: [{ planeId: "p" }],
    });
    expect(report.passed).toBe(false);
    expect(report.violations.join("\n")).toContain("duplicate readiness source");
    expect(report.violations.join("\n")).toContain("unknown kind");
  });
});
