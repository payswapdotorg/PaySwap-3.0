import { describe, expect, it } from "vitest";
import {
  CORE_PROTOCOL_ID_KINDS,
  OBSERVABLE_TERMINAL_STAGES,
  OBSERVABILITY_EVENT_CATEGORIES,
  OBSERVABILITY_EVENT_TAXONOMY,
  PROTOCOL_CORRELATION_KEY_KINDS,
  checkEventTaxonomyCorrelation,
} from "../src/observability.js";

describe("the correlated event taxonomy (hard law 3)", () => {
  it("every declared event correlates to >= 1 declared protocol-ID kind", () => {
    const report = checkEventTaxonomyCorrelation();
    expect(report.passed).toBe(true);
    expect(report.eventCount).toBe(OBSERVABILITY_EVENT_TAXONOMY.length);
    expect(report.eventCount).toBeGreaterThanOrEqual(18);
  });

  it("the observable terminal stages are the pinned surface vocabulary", () => {
    expect([...OBSERVABLE_TERMINAL_STAGES]).toEqual([
      "FINALITY_RECORDED",
      "RECONCILED",
      "RETURNED",
      "REFUNDED",
      "CHARGED_BACK",
      "CANCELLED",
    ]);
    for (const stage of OBSERVABLE_TERMINAL_STAGES) {
      expect(
        OBSERVABILITY_EVENT_TAXONOMY.some(
          (d) => d.eventName === `journey.terminal-transition.${stage.toLowerCase()}`,
        ),
      ).toBe(true);
    }
  });

  it("UNKNOWN outcomes keep their own events (never collapsed into failure)", () => {
    const unknown = OBSERVABILITY_EVENT_TAXONOMY.find(
      (d) => d.eventName === "execution.attempt.outcome-unknown",
    );
    expect(unknown?.category).toBe("unknown-outcome");
    expect(unknown?.requiredCorrelationKeys).toContain("attemptId");
  });

  it("economic-state events carry a core protocol ID (the correlation floor)", () => {
    expect([...CORE_PROTOCOL_ID_KINDS]).toEqual([
      "commandId",
      "eventId",
      "obligationId",
      "attemptId",
      "settlementId",
      "evidenceId",
    ]);
    for (const declaration of OBSERVABILITY_EVENT_TAXONOMY) {
      if (
        declaration.category === "terminal-transition" ||
        declaration.category === "unknown-outcome" ||
        declaration.category === "reconciliation" ||
        declaration.category === "outbox"
      ) {
        expect(
          declaration.requiredCorrelationKeys.some((key) =>
            CORE_PROTOCOL_ID_KINDS.includes(key),
          ),
        ).toBe(true);
      }
    }
  });

  it("the checker fails closed on duplicate names, missing keys and unknown kinds", () => {
    const [first] = OBSERVABILITY_EVENT_TAXONOMY;
    if (first === undefined) throw new Error("taxonomy is non-empty");
    const duplicated = checkEventTaxonomyCorrelation([
      first,
      { ...first },
    ]);
    expect(duplicated.passed).toBe(false);
    expect(duplicated.violations.map((v) => v.detail)).toContain(
      "duplicate event name in taxonomy",
    );

    const keyless = checkEventTaxonomyCorrelation([
      { eventName: "x.y", category: "deployment", description: "", requiredCorrelationKeys: [] },
    ]);
    expect(keyless.passed).toBe(false);

    const unknownKind = checkEventTaxonomyCorrelation([
      {
        eventName: "x.y",
        category: "deployment",
        description: "",
        requiredCorrelationKeys: ["notAKeyKind" as never],
      },
    ]);
    expect(unknownKind.passed).toBe(false);
  });

  it("the closed vocabularies are exactly as declared", () => {
    expect(PROTOCOL_CORRELATION_KEY_KINDS).toContain("releaseId");
    expect(PROTOCOL_CORRELATION_KEY_KINDS).toContain("providerName");
    expect([...OBSERVABILITY_EVENT_CATEGORIES]).toContain("browser-verification");
    expect([...OBSERVABILITY_EVENT_CATEGORIES]).toContain("provider-rollout");
  });
});
