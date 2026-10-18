/**
 * @zcode/web/payswap — error-reason fold oracle (ADAPT of the P7-W1 share
 * of payswap.org@8a735bf packages/ux/test/error-reasons.test.ts, MMP-35
 * behavioral oracle).
 *
 * The old suite's law: every error category maps to a deterministic,
 * ACTIONABLE people-language treatment; EXTERNAL_AMBIGUITY is presented
 * as reconciling/outcome-unknown — never a red error — and links to
 * reconciliation; categories with no user-side fix carry no retry
 * affordance. Re-asserted over the canonical WebErrorFamily vocabulary.
 */
import { describe, expect, it } from "vitest";
import { foldErrorReason } from "../../src/payswap/lib/honest-states.js";
import { AMBIGUITY_REASONS_PIN } from "../../src/payswap/pins/provider-runtime-pins.js";

describe("foldErrorReason — deterministic, actionable, never a fake failure", () => {
  it("covers every error family without throwing", () => {
    for (const family of [
      { kind: "AMBIGUOUS_OUTCOME", reason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" },
      { kind: "PROVIDER_FAILURE", retryable: true },
      { kind: "PROVIDER_FAILURE", retryable: false },
      { kind: "NOT_CONFIGURED", missing: "VITE_PAYSWAP_API_URL" },
      { kind: "INVALID_INPUT", detail: "currency must be a 3-letter code" },
    ] as const) {
      expect(() => foldErrorReason(family)).not.toThrow();
    }
  });

  it("AMBIGUOUS_OUTCOME renders as UNKNOWN reconciliation — never a red error, never a blind retry", () => {
    for (const reason of AMBIGUITY_REASONS_PIN) {
      const view = foldErrorReason({ kind: "AMBIGUOUS_OUTCOME", reason });
      expect(view.rendersAsUnknown).toBe(true);
      expect(view.tone).toBe("unknown");
      expect(view.tone).not.toBe("negative");
      expect(view.headline).toContain("Outcome unknown");
      expect(view.headline).not.toContain("Fail");
      expect(view.guidance).toContain("may have landed");
      expect(view.guidance).toContain("Reconciliation");
      expect(view.guidance).toContain("before any consequential retry");
    }
  });

  it("a definitive PROVIDER_FAILURE is honest about retry not changing it", () => {
    const view = foldErrorReason({ kind: "PROVIDER_FAILURE", retryable: false });
    expect(view.tone).toBe("negative");
    expect(view.guidance).toContain("definitive failure");
    expect(view.guidance).toContain("retrying the same command will not change it");
    expect(view.rendersAsUnknown).toBe(false);
  });

  it("a retryable PROVIDER_FAILURE still retries as a NEW intent (fresh key)", () => {
    const view = foldErrorReason({ kind: "PROVIDER_FAILURE", retryable: true });
    expect(view.guidance).toContain("new intent");
    expect(view.guidance).toContain("fresh idempotency key");
  });

  it("NOT_CONFIGURED names what is missing and refuses to fabricate", () => {
    const view = foldErrorReason({ kind: "NOT_CONFIGURED", missing: "VITE_PAYSWAP_API_URL" });
    expect(view.tone).toBe("attention");
    expect(view.headline).toContain("Not configured — and shown as such");
    expect(view.guidance).toContain("VITE_PAYSWAP_API_URL");
    expect(view.guidance).toContain("refuses to fabricate");
  });

  it("INVALID_INPUT states nothing was dispatched (fail-closed before any effect)", () => {
    const view = foldErrorReason({
      kind: "INVALID_INPUT",
      detail: "currency must be a 3-letter code",
    });
    expect(view.tone).toBe("attention");
    expect(view.guidance).toContain("before any external effect");
    expect(view.guidance).toContain("Nothing was dispatched");
  });

  it("the fold is deterministic: same family, same view", () => {
    const family = { kind: "AMBIGUOUS_OUTCOME", reason: "MALFORMED_RESPONSE_AFTER_DISPATCH" } as const;
    expect(foldErrorReason(family)).toEqual(foldErrorReason(family));
  });
});
