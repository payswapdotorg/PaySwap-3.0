import { describe, expect, it } from "vitest";
import {
  PINNED_EXECUTION_MODES,
  PINNED_TRANSPORT_CLASSES,
  PINNED_CREDENTIAL_HANDLE_PATTERN,
  PINNED_EVENT_REGRESSION_FLAG,
  isPinnedExecutionMode,
  isPinnedTransportClass,
  type PinnedTimestampMs,
} from "../src/pins/provider-runtime.js";
import {
  PINNED_LAB_REPLAY_NAMESPACE,
  PINNED_REPLAY_DETERMINISM_LAW,
  PINNED_RECORDED_FACTS_LAW,
} from "../src/pins/lab.js";
import {
  PINNED_SURFACE_PROGRESS_STAGES,
  PINNED_STAGE_STATUSES,
  PINNED_OUTCOME_ACTIONS,
  PINNED_NO_FABRICATED_EFFECTS_LAW,
} from "../src/pins/surface.js";

describe("structural pins: @payswap/provider-runtime (PINS ARE NOT IMPORTS)", () => {
  it("execution modes are the byte-identical closed vocabulary", () => {
    expect([...PINNED_EXECUTION_MODES]).toEqual(["SANDBOX", "LIVE"]);
    expect(isPinnedExecutionMode("SANDBOX")).toBe(true);
    expect(isPinnedExecutionMode("sandbox")).toBe(false);
    expect(isPinnedExecutionMode("MAINNET")).toBe(false);
  });

  it("transport classes are the byte-identical closed vocabulary", () => {
    expect([...PINNED_TRANSPORT_CLASSES]).toEqual([
      "FAKE_DETERMINISTIC",
      "PRODUCTION_HTTP",
    ]);
    expect(isPinnedTransportClass("PRODUCTION_HTTP")).toBe(true);
    expect(isPinnedTransportClass("REST")).toBe(false);
  });

  it("credential handles are opaque (the INV-19 discipline)", () => {
    expect(PINNED_CREDENTIAL_HANDLE_PATTERN.test("cred:1")).toBe(true);
    expect(PINNED_CREDENTIAL_HANDLE_PATTERN.test("cred:42")).toBe(true);
    expect(PINNED_CREDENTIAL_HANDLE_PATTERN.test("sk_live_secret")).toBe(false);
    expect(PINNED_CREDENTIAL_HANDLE_PATTERN.test("cred:abc")).toBe(false);
  });

  it("the event-regression flag and the bigint timestamp shape", () => {
    expect(PINNED_EVENT_REGRESSION_FLAG).toBe(
      "SUPERSEDED_BY_NEWER_OBSERVATION",
    );
    const ts: PinnedTimestampMs = 1700000000000n;
    expect(typeof ts).toBe("bigint");
  });
});

describe("structural pins: @payswap/lab (advisory-evidence boundary)", () => {
  it("the replay namespace is byte-identical", () => {
    expect(PINNED_LAB_REPLAY_NAMESPACE).toBe("PAYSWAP_LAB_REPLAY");
  });

  it("the determinism + recorded-facts laws are pinned as constants", () => {
    expect(PINNED_REPLAY_DETERMINISM_LAW).toBe(
      "same-facts-same-program-same-seed-byte-identical-result",
    );
    expect(PINNED_RECORDED_FACTS_LAW).toBe(
      "recorded-facts-are-immutable-replay-references-by-id-and-digest",
    );
  });
});

describe("structural pins: @payswap/surface (honest-state anchors)", () => {
  it("the progress-stage vocabulary is byte-identical (16 stages)", () => {
    expect(PINNED_SURFACE_PROGRESS_STAGES.length).toBe(16);
    expect(PINNED_SURFACE_PROGRESS_STAGES[0]).toBe("INTENT_RECORDED");
    expect(PINNED_SURFACE_PROGRESS_STAGES[9]).toBe("BENEFICIARY_CREDITED");
    expect(PINNED_SURFACE_PROGRESS_STAGES[15]).toBe("CANCELLED");
  });

  it("stage statuses keep UNKNOWN first-class (never collapsed into FAILED)", () => {
    expect([...PINNED_STAGE_STATUSES]).toEqual([
      "ACHIEVED",
      "IN_PROGRESS",
      "PENDING",
      "UNKNOWN",
      "FAILED",
      "NOT_APPLICABLE",
    ]);
  });

  it("the five outcome actions + the no-fabricated-effects law", () => {
    expect([...PINNED_OUTCOME_ACTIONS]).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
    expect(PINNED_NO_FABRICATED_EFFECTS_LAW).toBe(
      "claimed-without-evidence-throws-no-fabricated-provider-effects",
    );
  });
});
