import { describe, expect, it } from "vitest";
import { PINNED_PAYMENT_PROVIDER_REGISTRY } from "../../src/host/payswap/connections/provider-pins.js";
import { PAYMENT_PROVIDER_REGISTRY } from "../../../provider-runtime/src/adapters/payment-provider-registry.ts";

/**
 * P14-C mirror fidelity: the desktop's PINNED registry DATA must equal the
 * real @payswap/provider-runtime composed registry, field-for-field (the
 * pin law — the desktop mirrors, it never re-derives). Drift fails the
 * build rather than silently diverging from the canonical declarations.
 */

describe("the pinned payment-provider registry mirrors the real registry (P14-C)", () => {
  it("provider ids, display names, summaries and form catalogue match field-for-field", () => {
    expect(PINNED_PAYMENT_PROVIDER_REGISTRY.map((entry) => entry.providerId)).toEqual(
      PAYMENT_PROVIDER_REGISTRY.map((entry) => entry.providerId),
    );
    for (let index = 0; index < PAYMENT_PROVIDER_REGISTRY.length; index += 1) {
      const real = PAYMENT_PROVIDER_REGISTRY[index]!;
      const pinned = PINNED_PAYMENT_PROVIDER_REGISTRY[index]!;
      expect(pinned.displayName).toBe(real.displayName);
      expect(pinned.summary).toBe(real.summary);
      expect(pinned.forms.map((form) => form.useCaseRef)).toEqual(
        real.forms.map((form) => form.useCaseRef),
      );
      for (let formIndex = 0; formIndex < real.forms.length; formIndex += 1) {
        const realForm = real.forms[formIndex]!;
        const pinnedForm = pinned.forms[formIndex]!;
        expect(pinnedForm.form).toBe(realForm.form);
        expect(pinnedForm.status).toBe(realForm.status);
        expect(pinnedForm.credentialKind).toBe(realForm.credentialKind);
        expect(pinnedForm.executionModes).toEqual([...realForm.executionModes]);
        if (realForm.status === "UNCONFIGURED") {
          // The typed prerequisite mirrors VERBATIM (machine-checkable
          // honesty — never paraphrased).
          expect(pinnedForm.missingOperatorConfiguration).toEqual([
            ...realForm.missingOperatorConfiguration!,
          ]);
        }
      }
    }
  });

  it("the registry order is pinned: stripe, flutterwave, paystack, mtn-momo", () => {
    expect(PINNED_PAYMENT_PROVIDER_REGISTRY.map((entry) => entry.providerId)).toEqual([
      "stripe",
      "flutterwave",
      "paystack",
      "mtn-momo",
    ]);
  });
});
