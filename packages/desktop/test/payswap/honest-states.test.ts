/**
 * Honest-states composition laws (P7-W2) — THE desktop law: UI states
 * derive from provider-verified observations (CONFIRMED/UNKNOWN/FAILED),
 * never from submission.
 */

import { describe, expect, it } from "vitest";

import { deriveDesktopJourneyState } from "../../src/host/payswap/index.js";
import type { DesktopJourneyObservationInput } from "../../src/host/payswap/index.js";

const NOW = "2026-10-17T12:00:00.000Z";

function observation(
  overrides: Partial<DesktopJourneyObservationInput>,
): DesktopJourneyObservationInput {
  return {
    journeyRef: "journey-1",
    authorityRecordRef: "record://protocol/attempt-1",
    evidenceRefs: ["evidence://observation/1"],
    observedAt: NOW,
    ...overrides,
  };
}

describe("honest-states law: states derive from provider-verified observations (P7-W2)", () => {
  it("CONFIRMED observation renders CONFIRMED with the success tone", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "CONFIRMED" }));
    expect(view.state).toBe("CONFIRMED");
    expect(view.tone).toBe("success");
    expect(view.headline).toContain("Confirmed by provider observation");
  });

  it("UNKNOWN renders as reconciling with a warning tone and a reconciliation path (never failed)", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "UNKNOWN" }));
    expect(view.state).toBe("UNKNOWN_RECONCILING");
    expect(view.tone).toBe("warning");
    expect(view.headline).toContain("reconcil");
    // "never failed" is a STATEMENT about the derived state/tone, not about
    // the wording (the honest explanation legitimately says "neither
    // failure nor success").
    expect(view.state).not.toBe("FAILED");
    expect(view.tone).not.toBe("danger");
    expect(view.headline).toContain("no blind retry");
  });

  it("FAILED renders as failed with the danger tone; retry is a NEW intent, never a blind re-run", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "FAILED" }));
    expect(view.state).toBe("FAILED");
    expect(view.tone).toBe("danger");
    expect(view.headline).toContain("NEW intent");
  });

  it("submission is not finality: an in-flight attempt with no provider observation renders PENDING_OBSERVATION (in progress, never a success)", () => {
    const view = deriveDesktopJourneyState(
      observation({ outcome: undefined, attemptState: "IN_FLIGHT" }),
    );
    expect(view.state).toBe("PENDING_OBSERVATION");
    expect(view.tone).toBe("neutral");
    expect(view.headline).toContain("Submission is not finality");
    expect(view.state).not.toBe("CONFIRMED");
    expect(view.tone).not.toBe("success");
  });

  it("fail-closed: neither a provider observation nor an in-flight attempt refuses to render (no fabricated state)", () => {
    expect(() =>
      deriveDesktopJourneyState(observation({ outcome: undefined, attemptState: "PENDING" })),
    ).not.toThrow();
    expect(() =>
      deriveDesktopJourneyState(observation({ outcome: undefined, attemptState: "SUCCEEDED" })),
    ).toThrow(/nothing honest to render/);
    expect(() => deriveDesktopJourneyState(observation({ outcome: undefined }))).toThrow(
      /nothing honest to render/,
    );
  });

  it("the provider envelope outranks a lagging attempt record: CONFIRMED observation with an IN_FLIGHT attempt renders CONFIRMED", () => {
    const view = deriveDesktopJourneyState(
      observation({ outcome: "CONFIRMED", attemptState: "IN_FLIGHT" }),
    );
    expect(view.state).toBe("CONFIRMED");
  });

  it("the protocol authority's OUTCOME_UNKNOWN renders reconciling regardless of any envelope claim (reconciliation is authoritative)", () => {
    const claimedConfirmed = deriveDesktopJourneyState(
      observation({ outcome: "CONFIRMED", attemptState: "OUTCOME_UNKNOWN" }),
    );
    expect(claimedConfirmed.state).toBe("UNKNOWN_RECONCILING");
    expect(claimedConfirmed.headline).toContain("disputed");
    const alsoUnknown = deriveDesktopJourneyState(
      observation({ outcome: "UNKNOWN", attemptState: "OUTCOME_UNKNOWN" }),
    );
    expect(alsoUnknown.state).toBe("UNKNOWN_RECONCILING");
    expect(alsoUnknown.headline).not.toContain("disputed");
  });

  it("a terminal attempt contradicting the provider envelope renders as reconciliation-worthy ambiguity, never as a verdict", () => {
    const view = deriveDesktopJourneyState(
      observation({ outcome: "FAILED", attemptState: "SUCCEEDED" }),
    );
    expect(view.state).toBe("UNKNOWN_RECONCILING");
    expect(view.headline).toContain("disagree");
    expect(view.headline).toContain("reconciliation resolves it");
  });

  it("agreement between a terminal attempt and the envelope renders the agreed state", () => {
    const succeeded = deriveDesktopJourneyState(
      observation({ outcome: "CONFIRMED", attemptState: "SUCCEEDED" }),
    );
    expect(succeeded.state).toBe("CONFIRMED");
    const failed = deriveDesktopJourneyState(
      observation({ outcome: "FAILED", attemptState: "FAILED" }),
    );
    expect(failed.state).toBe("FAILED");
  });

  it("the view carries the authoritative record reference + evidence, never the record itself (INV-23)", () => {
    const view = deriveDesktopJourneyState(observation({ outcome: "UNKNOWN" }));
    expect(view.authorityRecordRef).toBe("record://protocol/attempt-1");
    expect(view.evidenceRefs).toEqual(["evidence://observation/1"]);
  });

  it("fail-closed on malformed inputs: unknown outcome token, empty record ref, missing timestamp", () => {
    expect(() =>
      deriveDesktopJourneyState(observation({ outcome: "MAYBE" as unknown as "UNKNOWN" })),
    ).toThrow(/CONFIRMED, UNKNOWN or FAILED/);
    expect(() =>
      deriveDesktopJourneyState(observation({ outcome: "UNKNOWN", authorityRecordRef: "" })),
    ).toThrow(/non-empty reference/);
    expect(() =>
      deriveDesktopJourneyState(observation({ outcome: "UNKNOWN", observedAt: "" })),
    ).toThrow(/ISO-8601/);
  });
});
