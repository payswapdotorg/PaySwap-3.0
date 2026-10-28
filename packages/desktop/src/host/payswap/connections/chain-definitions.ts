/**
 * PaySwap Desktop (P21-D Gap A, ADR-0014 D6/D8) — the PINNED
 * CONNECTION-CAPABILITY DEFINITION CATALOG: the layer-1 definitions the
 * chain-from-bridge derivation composes (split from ./chain-from-bridge.ts
 * at the ≤400-line file law — the provider-pins precedent).
 *
 * THE GRANT LAW (never widened — the bridge's own law, capability-bridge.ts
 * `operationClassesOf`): ONLY a FULL_TEST Stripe key derives the SANDBOX
 * execution grant. Every other (provider, keyClass) combination this
 * deployment's probes observe derives the honest READ-ONLY NON-executable
 * definition — executable: false with the explicit read-only reason (a
 * non-executable definition REQUIRES one; silent absence is impossible).
 *
 * PROVENANCE LAW: nothing is imported from the test fixtures (the route-
 * planning test tier is READ authority only). The definitions are PINNED
 * HERE in src, mirroring the P21-C no-route fixtures' semantics with the
 * fixture lines cited as authority in each comment:
 * - the read-only definition shape — packages/route-planning/test/
 *   no-route-fixtures.ts:82-107 (`flwReadonlyDefinition`) and its exact
 *   nonExecutableReason at :104-105;
 * - the sandbox-executable Stripe definition (the fourteen-part execution
 *   declaration + the rs:stripe-us-receiving restriction set) —
 *   no-route-fixtures.ts:167-255 (`stripeDefinition`);
 * - the adapter references — no-route-fixtures.ts:117 (Flutterwave
 *   balances) and :266 (Stripe payment-intent); the Paystack adapter is
 *   pinned from the probe's own operation vocabulary (probe-contracts.ts
 *   `paystack.transactions.read`).
 *
 * THE ID LAW: each definition's id IS the bridge instance's own
 * capabilityId (`capability:connected-account:${providerId}` —
 * capability-bridge.ts:234) — the chain lineage aligns BY CONSTRUCTION,
 * never by id surgery against the fixtures.
 */

import type { ConnectionProbeKeyClass, PaySwapProbeProviderId } from "./probe-contracts.js";

/**
 * The pinned definition layer's readable surface. The FULL
 * CapabilityDefinition shape is validated by the REAL capability
 * machinery at the corridor projection (the host layer law forbids
 * @payswap/* imports — the two-step mirror discipline: pin structurally
 * here, the binding batteries drive the REAL validators).
 */
export interface PinnedConnectionCapabilityDefinition extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly version: string;
  readonly executable: boolean;
  readonly nonExecutableReason?: string;
}

/** The pinned adapter reference per provider (opaque, provider-neutral — the fixture lines cited above). */
const PINNED_ADAPTER_REFS: Readonly<Record<PaySwapProbeProviderId, string>> = Object.freeze({
  stripe: "adapter:stripe/payment-intent@1",
  flutterwave: "adapter:flutterwave/balances@1",
  paystack: "adapter:paystack/transactions@1",
});

/** The exact read-only reason per provider (the fixture's own words — :104-105 for Flutterwave). */
const READ_ONLY_REASONS: Readonly<Record<PaySwapProbeProviderId, string>> = Object.freeze({
  flutterwave: "flutterwave test-mode secret keys are read-only: no send operation exists in the capability model",
  paystack: "paystack test-mode secret keys are read-only: no send operation exists in the capability model",
  // The RESTRICTED-TEST Stripe law (the bridge's own reason,
  // capability-bridge.ts eligibility text) merged with the fixture's
  // closing clause.
  stripe:
    "stripe test-mode restricted keys never derive an execution grant from the key alone: restricted-key grants derive only from their declared scopes — no send operation exists in the capability model",
});

/** The honest read-only NON-executable definition for one provider (the flwReadonlyDefinition semantics). */
function readOnlyDefinitionOf(providerId: PaySwapProbeProviderId): PinnedConnectionCapabilityDefinition {
  return Object.freeze({
    id: `capability:connected-account:${providerId}`,
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "the connected account's own corridors only (observed facts, never advertised scope)", hardConstraint: true },
    ],
    cost: [],
    risk: { riskClass: "observation", severity: "low", mitigations: ["read-only secret keys"] },
    provenance: {
      declaredBy: "payswap:desktop-connection-bridge",
      artifactRef: `provider:${providerId}/balances@1`,
      contentHash: `fnv1a64:p21d-conn-${providerId}-readonly@1`,
    },
    economicAccountability: {
      accountablePartyRef: `provider:${providerId}`,
      ledgerAccountRef: `ledger:obs/${providerId}`,
      recoursePolicyRef: "policy:recourse/observation",
    },
    proofRequirements: [{ proofLevel: "P1", scope: "observation" }],
    executable: false,
    nonExecutableReason: READ_ONLY_REASONS[providerId],
  });
}

/**
 * The SANDBOX-executable Stripe merchant-receiving definition (ONLY a
 * FULL_TEST key derives it — the grant law). Mirrors the P21-C
 * stripeDefinition semantics (no-route-fixtures.ts:167-255): the
 * fourteen-part execution declaration — CREATE_EXTERNAL_EFFECT, the
 * CREATED→SETTLED state machine, ENDPOINT_SPECIFIC idempotency carrying
 * the provider key with NEVER_RETRY_AFTER_AMBIGUITY + reconciliation,
 * provider-reversal compensation — and the rs:stripe-us-receiving
 * restriction set whose funding-method vocabulary names the corridor's
 * own typed exclusion (FUNDING_METHOD_NOT_SERVED for the FLW wallet).
 */
function stripeSandboxExecutableDefinition(): PinnedConnectionCapabilityDefinition {
  return Object.freeze({
    id: "capability:connected-account:stripe",
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "US-destination corridors only", hardConstraint: true },
    ],
    cost: [
      { componentId: "fixed", kind: "fixed_fee", amount: { currency: "USD", minorUnits: "30" } },
      { componentId: "variable", kind: "variable_fee_bps", bps: 29n },
    ],
    risk: { riskClass: "settlement", severity: "low", mitigations: ["reconciliation"] },
    provenance: {
      declaredBy: "payswap:desktop-connection-bridge",
      artifactRef: "provider:stripe/payment-intent@1",
      contentHash: "fnv1a64:p21d-conn-stripe-full-test@1",
    },
    economicAccountability: {
      accountablePartyRef: "provider:stripe",
      ledgerAccountRef: "ledger:fees/stripe",
      recoursePolicyRef: "policy:recourse/stripe",
    },
    proofRequirements: [{ proofLevel: "P2", scope: "settlement" }],
    bondCollateralRecourse: {
      bondAmount: { currency: "USD", minorUnits: "1000000" },
      collateralType: "cash-bond",
      recourseMechanism: "dispute/claim",
    },
    executable: true,
    execution: {
      contractVersion: "1.0.0",
      semantics: {
        summary: "Stripe PaymentIntent merchant receiving",
        effectDescription: "Accepts a payment into the merchant's Stripe balance",
      },
      stateMachine: {
        initial: "CREATED",
        states: [
          { name: "CREATED", isTerminal: false },
          { name: "SETTLED", isTerminal: true },
        ],
        transitions: [{ from: "CREATED", to: "SETTLED", trigger: "payment-intent-succeeded" }],
      },
      preconditions: [
        { preconditionId: "pre:funding-method-served", description: "The funding method is served", confirmedBy: "PROVIDER" },
      ],
      authorizationRequirements: { requiredScopes: ["payments:write"], requiresHumanApproval: false },
      financialEffectClass: "CONSEQUENTIAL_EXTERNAL_EFFECT",
      idempotency: {
        keyScope: "ENDPOINT_SPECIFIC",
        carriesProviderKey: true,
        retryPolicy: "NEVER_RETRY_AFTER_AMBIGUITY",
        reconciliationRequired: true,
      },
      compensation: {
        cancellable: true,
        refundable: true,
        compensationMechanism: "provider reversal",
        lateReturnRepresentable: true,
      },
      partialExecution: { supported: false, semantics: "single atomic acceptance leg" },
      userActions: [],
      providerStateMapping: { preservedInEnvelope: true, consequentialFamilies: ["capture"] },
      externalReferences: { carriesExternalIds: true, revisionTracking: "PROVIDER_REVISIONS", correlationIdRequired: true },
      evidenceRequirements: [{ evidenceKind: "FUNDING", required: true }],
      economicTerms: { termsRef: "terms:stripe-test", termsVersion: "1.0.0", pricingModel: "fixed + bps" },
      jurisdictionEligibility: {
        declaredVia: "RESTRICTION_SET",
        restrictionSet: {
          restrictionSetId: "rs:stripe-us-receiving",
          version: "1.0.0",
          sourceCountries: ["NG"],
          destinationCountries: ["US"],
          currencies: ["NGN", "USD"],
          customerTypes: ["PERSONAL", "BUSINESS"],
          fundingMethods: ["stripe_card", "stripe_bank_debit", "stripe_test_payment_method"],
          payoutMethods: ["stripe_payment_intent"],
          requiredFields: [
            { fieldId: "merchant.stripe_account", description: "The merchant's Stripe account", appliesTo: "RECIPIENT" },
          ],
          cutoffs: [],
          terms: { termsRef: "terms:stripe-test", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" },
          declaredBy: "payswap:desktop-connection-bridge",
        },
      },
      executionModes: ["PASS_THROUGH_NATIVE"],
    },
  });
}

/* The catalog is EXPLICIT — an unknown (provider, keyClass) combination
 * derives NO definition (fail-closed, never a guessed default). */
const DEFINITION_CATALOG: Readonly<Record<string, PinnedConnectionCapabilityDefinition>> = Object.freeze({
  "flutterwave/READ_ONLY_TEST": readOnlyDefinitionOf("flutterwave"),
  "paystack/READ_ONLY_TEST": readOnlyDefinitionOf("paystack"),
  "stripe/RESTRICTED_TEST": readOnlyDefinitionOf("stripe"),
  "stripe/FULL_TEST": stripeSandboxExecutableDefinition(),
});

/** The pinned adapter reference per provider (the implementation layer's own pin). */
export function pinnedConnectionAdapterRef(providerId: PaySwapProbeProviderId): string {
  return PINNED_ADAPTER_REFS[providerId];
}

/**
 * The pinned definition for one (providerId, keyClass) — undefined when
 * the combination is outside the catalog (the caller derives NO chain).
 */
export function connectionCapabilityDefinitionOf(
  providerId: PaySwapProbeProviderId,
  keyClass: ConnectionProbeKeyClass,
): PinnedConnectionCapabilityDefinition | undefined {
  return DEFINITION_CATALOG[`${providerId}/${keyClass}`];
}
