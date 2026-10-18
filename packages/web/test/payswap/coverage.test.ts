/**
 * @zcode/web/payswap — the honest coverage fold oracle (ADAPT of
 * payswap.org@8a735bf packages/web/test/coverage.test.ts, MMP-36
 * behavioral oracle).
 *
 * The fold laws: statuses partition VERBATIM (never upgraded); the
 * no-evidence state surfaces as an honest fact; an unknown status fails
 * CLOSED (the old module's "fail the build loudly instead of silently
 * rendering wrong truth" law); timestamps format deterministically with no
 * locale; unknown provider ids render verbatim.
 */
import { describe, expect, it } from "vitest";
import {
  BLOCKED_STATUS,
  foldCoverage,
  formatUtcTimestamp,
  InvalidCoverageSourceError,
  NO_CREDENTIAL_STATUS,
  NOT_ACTIVATED_STATUS,
  providerLabel,
} from "../../src/payswap/lib/coverage.js";
import { NO_EVIDENCE_COVERAGE } from "../../src/payswap/contracts/harness.js";
import { RECORDED_COVERAGE_FIXTURE } from "./fixtures.js";

describe("coverage fold", () => {
  it("partitions recorded statuses verbatim — never upgrades a status", () => {
    const view = foldCoverage(RECORDED_COVERAGE_FIXTURE);
    expect(view.connected.map((entry) => entry.providerName)).toEqual([
      "stripe",
      "paystack",
      "flutterwave",
    ]);
    expect(view.blocked).toHaveLength(1);
    expect(view.blocked[0]?.providerName).toBe("mtn_momo");
    expect(view.blocked[0]?.status).toBe(BLOCKED_STATUS);
    expect(view.awaitingCredentials).toHaveLength(7);
    expect(view.awaitingCredentials.every(
      (entry) => entry.status === NO_CREDENTIAL_STATUS,
    )).toBe(true);
    expect(view.localRail).toHaveLength(1);
    expect(view.localRail[0]?.status).toBe(NOT_ACTIVATED_STATUS);
    expect(view.noEvidenceRecorded).toBe(false);
  });

  it("MTN MoMo stays BLOCKED — the fold never moves a blocked record", () => {
    const view = foldCoverage(RECORDED_COVERAGE_FIXTURE);
    const blockedNames = view.blocked.map((entry) => entry.providerName);
    expect(blockedNames).toContain("mtn_momo");
    const connectedNames = view.connected.map((entry) => entry.providerName);
    expect(connectedNames).not.toContain("mtn_momo");
  });

  it("the no-evidence state surfaces as an honest fact", () => {
    const view = foldCoverage(NO_EVIDENCE_COVERAGE);
    expect(view.noEvidenceRecorded).toBe(true);
    expect(view.connected).toEqual([]);
    expect(view.blocked).toEqual([]);
    expect(view.awaitingCredentials).toEqual([]);
    expect(view.localRail).toEqual([]);
  });

  it("an unrecognized non-connection status fails closed", () => {
    expect(() =>
      foldCoverage({
        ...NO_EVIDENCE_COVERAGE,
        nonConnections: [{ providerName: "mystery", status: "SOMEHOW", reason: "drifted" }],
      }),
    ).toThrow(InvalidCoverageSourceError);
  });

  it("probedAt === \"\" alone is NOT the no-evidence state when records exist", () => {
    const view = foldCoverage({
      ...NO_EVIDENCE_COVERAGE,
      connected: [RECORDED_COVERAGE_FIXTURE.connected[0]!],
    });
    expect(view.noEvidenceRecorded).toBe(false);
  });

  it("formats UTC timestamps deterministically (no locale)", () => {
    expect(formatUtcTimestamp("2026-10-02T06:37:38Z")).toBe("2026-10-02 06:37 UTC");
    expect(formatUtcTimestamp("2026-10-02T06:37:38+00:00")).toBe("2026-10-02 06:37 UTC");
    expect(formatUtcTimestamp("2026-10-02")).toBe("2026-10-02");
    expect(formatUtcTimestamp("")).toBe("");
  });

  it("renders known provider labels and passes unknown ids through verbatim", () => {
    expect(providerLabel("stripe")).toBe("Stripe");
    expect(providerLabel("mtn_momo")).toBe("MTN MoMo");
    expect(providerLabel("stellar")).toBe("Stellar (local rail)");
    expect(providerLabel("brand-new-provider")).toBe("brand-new-provider");
  });

  it("the fold is deterministic: same source, same view", () => {
    expect(foldCoverage(RECORDED_COVERAGE_FIXTURE)).toEqual(
      foldCoverage(RECORDED_COVERAGE_FIXTURE),
    );
  });
});
