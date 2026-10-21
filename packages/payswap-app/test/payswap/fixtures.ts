/**
 * @payswap/app — shared oracle fixtures (deterministic test data).
 *
 * The recorded-evidence fixture mirrors the SHAPE of the old repo's
 * recorded probe/rollout evidence (payswap.org@8a735bf
 * spec/development-state/provider-{probes,rollout}-20261002.json — read as
 * evidence, NOT carried as truth): it exists so the adapted oracle can
 * drive the coverage explorer with recorded-evidence-shaped INPUT the way
 * the old suite drove it with the old repo's committed records. It is
 * inert test data — the product itself has no committed provider evidence
 * in this repository phase.
 */
import type { CoverageSource } from "../../src/contracts/view-models.js";

export const RECORDED_COVERAGE_FIXTURE: CoverageSource = {
  probedAt: "2026-10-02T06:37:38Z",
  releaseId: "fixture-release-20261002",
  connected: [
    {
      providerName: "stripe",
      authorizationMode: "test-mode",
      configKey: "PROVIDER_STRIPE_CREDENTIAL_REF",
      probeEvidence: {
        probedAt: "2026-10-02T06:37:38Z",
        verdict: "VERIFIED",
        summary: "Stripe test-mode: capabilities and eligibility probes passed.",
      },
      certification: {
        certificationId: "P2-W2-003-cross-provider-conformance",
        executed: 13,
        passed: 13,
        failed: 0,
        notApplicable: 0,
        evidencePath: "evidence/stripe-conformance.md",
      },
      limitations: ["GHS not routable on this account", "no payout-execution family"],
    },
    {
      providerName: "paystack",
      authorizationMode: "test-mode",
      configKey: "PROVIDER_PAYSTACK_CREDENTIAL_REF",
      probeEvidence: {
        probedAt: "2026-10-02T06:37:38Z",
        verdict: "ELIGIBLE",
        summary: "Paystack test-mode: bank rails reachable.",
      },
      certification: {
        executed: 9,
        passed: 9,
        failed: 0,
        notApplicable: 0,
      },
      limitations: [],
    },
    {
      providerName: "flutterwave",
      authorizationMode: "test-mode",
      configKey: "PROVIDER_FLUTTERWAVE_CREDENTIAL_REF",
      probeEvidence: {
        probedAt: "2026-10-02T06:37:38Z",
        verdict: "ELIGIBLE",
        summary: "Flutterwave test-mode: fiat wallets listed.",
      },
      certification: {
        executed: 9,
        passed: 9,
        failed: 0,
        notApplicable: 0,
      },
      limitations: [],
    },
  ],
  nonConnections: [
    {
      providerName: "mtn_momo",
      status: "BLOCKED",
      reason: "subscription key rejected (HTTP 401)",
    },
    {
      providerName: "paypal-direct",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "rapyd",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "dlocal",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "thunes",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "adyen",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "airwallex",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "ebanx",
      status: "NO_CREDENTIAL_HELD",
      reason: "built and certified; no credential exists in the vault",
    },
    {
      providerName: "stellar",
      status: "NOT_ACTIVATED",
      reason: "local rail: runs through the user-authorized session path",
    },
  ],
  supportingServices: [
    {
      id: "whatsapp",
      mode: "platform service",
      authentication: "SANDBOX",
      verdict: "SANDBOX-GRADE VERIFIED",
      note: "Notification surface (sandbox-grade). Not a payment rail.",
    },
    {
      id: "resend",
      mode: "platform service",
      authentication: "UNVERIFIED",
      verdict: "UNVERIFIED-SEND",
      note: "Email surface — fail-closed until a verified sender domain is supplied. Not a payment rail.",
    },
    {
      id: "opensanctions",
      mode: "screening service",
      authentication: "VERIFIED",
      verdict: "VERIFIED for screening integration",
      note: "AML/sanctions screening. Not a payment rail.",
    },
  ],
} as const;
