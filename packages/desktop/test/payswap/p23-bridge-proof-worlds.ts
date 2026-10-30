/**
 * The P23 correctness-patch fixture worlds (2026-10-29): two REAL worlds
 * for the hypothesis-verification bridge proof —
 *
 *  - THE COUNTRY-BLOCKED WORLD (the POSITIVE CONTROL): an NG->US corridor
 *    whose ONLY blocking facts are the country codes (the sender rail does
 *    not serve the source country; the recipient rail does not serve the
 *    destination country; everything else — currencies, funding/payout
 *    methods, customer type, required fields — is served, and both rails
 *    are EXECUTABLE). This is exactly the world in which an assumed
 *    intermediary rail that spans the declared corridor pair REALLY
 *    bridges the relevant segments: every remaining blocker is answered
 *    by the element's augmentation kind, so the typed bridge proof holds
 *    and the hypothesis honestly earns PLANNER_VERIFIED.
 *
 *  - THE P16 REAL-ROUTE WORLD is imported from route-planning's own test
 *    fixtures (fixtures.ts + compiler-evidence.ts) for the REGRESSION:
 *    a corridor with a REAL rank-eligible route plus an UNRELATED assumed
 *    element must NEVER verify (the pre-patch law did — the compatibility
 *    defect this patch closes).
 *
 * Both worlds are built on the REAL capability machinery exactly like the
 * P21 no-route fixtures: real four-layer chains (definition ->
 * implementation -> instance -> observation), the REAL observeCapability,
 * and the REAL corridor projection port. Nothing here claims a route
 * exists or a proof holds — the batteries assert exactly what derives.
 */

import { observeCapability } from "../../../capability/src/observation.ts";
import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  CorridorQuery,
  ProviderImplementation,
} from "../../../capability/src/index.ts";
import type { PinnedCorridorRouteChain } from "../../../route-planning/src/pins/capability.ts";
import {
  NOW_ISO,
  noRouteCorridorQuery,
} from "../../../route-planning/test/no-route-fixtures.ts";

export const COUNTRY_BLOCKED_SENDER_INSTANCE_ID = "inst:sender-country-gap";
export const COUNTRY_BLOCKED_RECIPIENT_INSTANCE_ID = "inst:recipient-country-gap";

/** The shared executable-PSP execution block (the no-route Stripe pattern, verbatim in shape). */
function executableExecutionBlock(restrictionSet: unknown): Record<string, unknown> {
  return {
    contractVersion: "1.0.0",
    semantics: {
      summary: "Executable test-PSP rail movement",
      effectDescription: "Moves funds across the corridor leg",
    },
    stateMachine: {
      initial: "CREATED",
      states: [
        { name: "CREATED", isTerminal: false },
        { name: "SETTLED", isTerminal: true },
      ],
      transitions: [{ from: "CREATED", to: "SETTLED", trigger: "transfer-succeeded" }],
    },
    preconditions: [
      { preconditionId: "pre:country-served", description: "The corridor countries are served", confirmedBy: "PROVIDER" },
    ],
    authorizationRequirements: { requiredScopes: ["transfers:write"], requiresHumanApproval: false },
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
    partialExecution: { supported: false, semantics: "single atomic leg" },
    userActions: [],
    providerStateMapping: { preservedInEnvelope: true, consequentialFamilies: ["payout"] },
    externalReferences: { carriesExternalIds: true, revisionTracking: "PROVIDER_REVISIONS", correlationIdRequired: true },
    evidenceRequirements: [{ evidenceKind: "FUNDING", required: true }],
    economicTerms: { termsRef: "terms:country-gap-test", termsVersion: "1.0.0", pricingModel: "fixed" },
    jurisdictionEligibility: {
      declaredVia: "RESTRICTION_SET",
      restrictionSet,
    },
    executionModes: ["PASS_THROUGH_NATIVE"],
  };
}

/** The sender rail: serves everything EXCEPT the corridor's source country. */
function countryBlockedSenderDefinition(): CapabilityDefinition {
  return {
    id: "cap:sender-country-gap",
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "GH-origin corridors only (the corridor is NG)", hardConstraint: true },
    ],
    cost: [],
    risk: { riskClass: "settlement", severity: "low", mitigations: ["reconciliation"] },
    provenance: {
      declaredBy: "provider:country-gap-psp",
      artifactRef: "provider:country-gap-psp/send@1",
      contentHash: "fnv1a64:00cg1",
    },
    economicAccountability: {
      accountablePartyRef: "provider:country-gap-psp",
      ledgerAccountRef: "ledger:fees/country-gap",
      recoursePolicyRef: "policy:recourse/country-gap",
    },
    proofRequirements: [{ proofLevel: "P2", scope: "settlement" }],
    executable: true,
    execution: executableExecutionBlock({
      restrictionSetId: "rs:sender-country-gap",
      version: "1.0.0",
      sourceCountries: ["GH"],
      destinationCountries: ["US"],
      currencies: ["NGN", "USD"],
      customerTypes: ["PERSONAL"],
      fundingMethods: ["flutterwave_wallet"],
      payoutMethods: ["stripe_payment_intent"],
      requiredFields: [],
      cutoffs: [],
      terms: { termsRef: "terms:country-gap-test", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" },
      declaredBy: "payswap:planning-test-catalogue",
    }),
  } as unknown as CapabilityDefinition;
}

/** The recipient rail: serves everything EXCEPT the corridor's destination country. */
function countryBlockedRecipientDefinition(): CapabilityDefinition {
  return {
    id: "cap:recipient-country-gap",
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "GB-destination corridors only (the corridor is US)", hardConstraint: true },
    ],
    cost: [],
    risk: { riskClass: "settlement", severity: "low", mitigations: ["reconciliation"] },
    provenance: {
      declaredBy: "provider:country-gap-psp",
      artifactRef: "provider:country-gap-psp/receive@1",
      contentHash: "fnv1a64:00cg2",
    },
    economicAccountability: {
      accountablePartyRef: "provider:country-gap-psp",
      ledgerAccountRef: "ledger:fees/country-gap",
      recoursePolicyRef: "policy:recourse/country-gap",
    },
    proofRequirements: [{ proofLevel: "P2", scope: "settlement" }],
    executable: true,
    execution: executableExecutionBlock({
      restrictionSetId: "rs:recipient-country-gap",
      version: "1.0.0",
      sourceCountries: ["NG"],
      destinationCountries: ["GB"],
      currencies: ["NGN", "USD"],
      customerTypes: ["PERSONAL"],
      fundingMethods: ["flutterwave_wallet"],
      payoutMethods: ["stripe_payment_intent"],
      requiredFields: [
        { fieldId: "merchant.stripe_account", description: "The merchant's account", appliesTo: "RECIPIENT" },
      ],
      cutoffs: [],
      terms: { termsRef: "terms:country-gap-test", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" },
      declaredBy: "payswap:planning-test-catalogue",
    }),
  } as unknown as CapabilityDefinition;
}

function countryGapImplementation(implementationId: string, capabilityId: string): ProviderImplementation {
  return {
    implementationId,
    providerName: "country-gap-psp",
    providerVersion: "2026-10",
    capabilityId,
    capabilityVersion: "1.0.0",
    version: "1.0.0",
    adapterRef: `adapter:country-gap-psp/${capabilityId}@1`,
    corridors: [{ fromCountries: ["NG"], toCountries: ["US"], currencies: ["NGN", "USD"] }],
    knownDeviations: [],
  } as unknown as ProviderImplementation;
}

function countryGapInstance(instanceId: string, capabilityId: string, implementationId: string): ConnectedCapabilityInstance {
  return {
    instanceId,
    capabilityId,
    implementationId,
    providerName: "country-gap-psp",
    providerVersion: "2026-10",
    accountRef: `acct:${instanceId}`,
    tenantRef: "tenant:p23-bridge-proof",
    authorization: { status: "ACTIVE", grantedAt: "2026-09-01T00:00:00Z", authorizationRef: "authz:country-gap-1" },
    credentialScope: { credentialRef: "cred:country-gap-1", credentialKind: "API_KEY" },
    geography: { countries: ["NG", "US"] },
    currencies: ["NGN", "USD"],
    permissionState: { granted: ["transfers:write"], requested: ["transfers:write"], missing: [] },
    eligibility: { eligible: true, reasons: [] },
    configuration: {},
  } as unknown as ConnectedCapabilityInstance;
}

function countryGapObservation(instanceId: string): CapabilityObservation {
  return observeCapability({
    instanceId,
    observedAt: NOW_ISO,
    observationVersion: 2,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: NOW_ISO },
    quota: { limit: 100, remaining: 100, windowSeconds: 86400 },
    provenance: { providerName: "country-gap-psp", source: "PROVIDER_API", capturedAt: NOW_ISO },
  });
}

/** The country-blocked sender chain (SOURCE_COUNTRY_NOT_SERVED only). */
export function countryBlockedSenderChain(): PinnedCorridorRouteChain {
  return {
    definition: countryBlockedSenderDefinition(),
    implementation: countryGapImplementation("impl:sender-country-gap-1", "cap:sender-country-gap"),
    instance: countryGapInstance(COUNTRY_BLOCKED_SENDER_INSTANCE_ID, "cap:sender-country-gap", "impl:sender-country-gap-1"),
    observation: countryGapObservation(COUNTRY_BLOCKED_SENDER_INSTANCE_ID),
  };
}

/** The country-blocked recipient chain (DESTINATION_COUNTRY_NOT_SERVED only). */
export function countryBlockedRecipientChain(): PinnedCorridorRouteChain {
  return {
    definition: countryBlockedRecipientDefinition(),
    implementation: countryGapImplementation("impl:recipient-country-gap-1", "cap:recipient-country-gap"),
    instance: countryGapInstance(COUNTRY_BLOCKED_RECIPIENT_INSTANCE_ID, "cap:recipient-country-gap", "impl:recipient-country-gap-1"),
    observation: countryGapObservation(COUNTRY_BLOCKED_RECIPIENT_INSTANCE_ID),
  };
}

/** The country-blocked world's corridor query (the same NG->US shape as the no-route world). */
export function countryBlockedCorridorQuery(): CorridorQuery {
  return noRouteCorridorQuery();
}
