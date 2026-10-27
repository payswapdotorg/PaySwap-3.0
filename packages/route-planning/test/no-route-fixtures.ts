/**
 * The P21-C NO-ROUTE world fixtures: a Flutterwave-only sender paying a
 * Stripe-only merchant (ADR-0014 D7/D9), built on the REAL capability
 * machinery exactly like ./fixtures.ts — the FLW rail is an honest
 * READ-ONLY connection (a non-executable definition: no send operation
 * exists in the capability model), and the Stripe receiving rail's
 * restriction sets do not serve the FLW wallet as a funding method
 * (FUNDING_METHOD_NOT_SERVED, the typed exclusion the conditional
 * derivation consumes). Nothing here claims a route exists.
 */

import { observeCapability } from "../../capability/src/observation.ts";
import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  CorridorQuery,
  CorridorRouteInput,
  ProviderImplementation,
} from "../../capability/src/index.ts";
import { discoverOpportunity } from "../../opportunities/src/discovery.ts";
import { publishConditionalOpportunity } from "../../opportunities/src/conditional-publication.ts";
import type { ConditionalPublicationInput, RequiredPartyChange, SupportingObservation } from "../../opportunities/src/index.ts";
import type { PinnedCorridorRouteChain } from "../src/pins/capability.ts";
import type {
  ConditionalConstructionRequest,
  ConditionalOpportunityConstructionPort,
} from "../src/conditional-stage.ts";
import type { PinnedConditionalOpportunity } from "../src/pins/opportunities.ts";
import type { MoneyMovementIntentPin } from "../src/pins/economic.ts";

export const FLW_PROVIDER = "flutterwave";
export const STRIPE_PROVIDER = "stripe";
export const NOW_ISO = "2026-10-05T00:00:00Z";
export const NOW = Date.parse(NOW_ISO);
export const FLW_SENDER_INSTANCE_ID = "inst:sender-flw-readonly";
export const STRIPE_RECIPIENT_INSTANCE_ID = "inst:recipient-stripe-test";
export const CORRIDOR_RAIL_KEY = "fiat:ngn-usd";

/** The operator's corridor query: an FLW wallet funding a Stripe receiving context. */
export function noRouteCorridorQuery(): CorridorQuery {
  return {
    sourceCountry: "NG",
    destinationCountry: "US",
    sourceCurrency: "NGN",
    destinationCurrency: "USD",
    customerType: "PERSONAL",
    sendAmount: { currency: "NGN", minorUnits: "50000000" },
    fundingMethod: "flutterwave_wallet",
    payoutMethod: "stripe_payment_intent",
    recipientType: "individual",
    presentedFieldIds: ["merchant.stripe_account"],
    asOf: NOW_ISO,
  };
}

/** The movement intent (an NGN wallet -> a USD merchant receiving context). */
export function noRouteIntentFixture(): MoneyMovementIntentPin {
  return {
    intentId: "intent:planning:no-route-001",
    principalRef: "principal:operator-1",
    origin: {
      locationRef: "fundsloc:flw-ngn-wallet",
      currency: "NGN",
      observationRef: "obs:flw-wallet-balance",
    },
    destination: {
      locationRef: "fundsloc:stripe-usd-merchant",
      currency: "USD",
      observationRef: "obs:stripe-merchant-receiving",
    },
    originAmount: { currency: "NGN", minorUnits: "50000000" },
    arrivalCurrency: "USD",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:no-route-1",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

/** The honest READ-ONLY FLW capability: no send operation exists (non-executable). */
function flwReadonlyDefinition(): CapabilityDefinition {
  return {
    id: "cap:flw-balance-observation",
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "NG-origin corridors only", hardConstraint: true },
    ],
    cost: [],
    risk: { riskClass: "observation", severity: "low", mitigations: ["read-only secret keys"] },
    provenance: {
      declaredBy: `provider:${FLW_PROVIDER}`,
      artifactRef: `provider:${FLW_PROVIDER}/balances@1`,
      contentHash: "fnv1a64:00fl",
    },
    economicAccountability: {
      accountablePartyRef: `provider:${FLW_PROVIDER}`,
      ledgerAccountRef: "ledger:obs/flw",
      recoursePolicyRef: "policy:recourse/observation",
    },
    proofRequirements: [{ proofLevel: "P1", scope: "observation" }],
    executable: false,
    nonExecutableReason:
      "flutterwave test-mode secret keys are read-only: no send operation exists in the capability model",
  } as unknown as CapabilityDefinition;
}

function flwImplementation(): ProviderImplementation {
  return {
    implementationId: "impl:flw-readonly-1",
    providerName: FLW_PROVIDER,
    providerVersion: "2026-10",
    capabilityId: "cap:flw-balance-observation",
    capabilityVersion: "1.0.0",
    version: "1.0.0",
    adapterRef: `adapter:${FLW_PROVIDER}/balances@1`,
    corridors: [{ fromCountries: ["NG"], toCountries: ["US"], currencies: ["NGN", "USD"] }],
    knownDeviations: [],
  } as unknown as ProviderImplementation;
}

function flwInstance(): ConnectedCapabilityInstance {
  return {
    instanceId: FLW_SENDER_INSTANCE_ID,
    capabilityId: "cap:flw-balance-observation",
    implementationId: "impl:flw-readonly-1",
    providerName: FLW_PROVIDER,
    providerVersion: "2026-10",
    accountRef: "acct:flw-test-sender",
    tenantRef: "tenant:p21-no-route",
    authorization: { status: "ACTIVE", grantedAt: "2026-09-01T00:00:00Z", authorizationRef: "authz:flw-1" },
    credentialScope: { credentialRef: "cred:flw-1", credentialKind: "API_KEY" },
    geography: { countries: ["NG", "US"] },
    currencies: ["NGN", "USD"],
    permissionState: { granted: ["balances:read"], requested: ["balances:read"], missing: [] },
    eligibility: { eligible: true, reasons: [] },
    configuration: {},
  } as unknown as ConnectedCapabilityInstance;
}

function flwObservation(): CapabilityObservation {
  return observeCapability({
    instanceId: FLW_SENDER_INSTANCE_ID,
    observedAt: NOW_ISO,
    observationVersion: 3,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: NOW_ISO },
    quota: { limit: 100, remaining: 100, windowSeconds: 86400 },
    provenance: { providerName: FLW_PROVIDER, source: "PROVIDER_API", capturedAt: NOW_ISO },
  });
}

/** The sender chain: the honest read-only FLW rail (NOT_EXECUTABLE_CAPABILITY). */
export function flwSenderChain(): PinnedCorridorRouteChain {
  return {
    definition: flwReadonlyDefinition(),
    implementation: flwImplementation(),
    instance: flwInstance(),
    observation: flwObservation(),
  };
}

/** The Stripe merchant receiving rail: serves its own funding methods only. */
function stripeDefinition(): CapabilityDefinition {
  return {
    id: "cap:stripe-merchant-receiving",
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
      declaredBy: `provider:${STRIPE_PROVIDER}`,
      artifactRef: `provider:${STRIPE_PROVIDER}/payment-intent@1`,
      contentHash: "fnv1a64:00st",
    },
    economicAccountability: {
      accountablePartyRef: `provider:${STRIPE_PROVIDER}`,
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
          declaredBy: "payswap:planning-test-catalogue",
        },
      },
      executionModes: ["PASS_THROUGH_NATIVE"],
    },
  } as unknown as CapabilityDefinition;
}

function stripeImplementation(): ProviderImplementation {
  return {
    implementationId: "impl:stripe-receiving-1",
    providerName: STRIPE_PROVIDER,
    providerVersion: "2026-10",
    capabilityId: "cap:stripe-merchant-receiving",
    capabilityVersion: "1.0.0",
    version: "1.0.0",
    adapterRef: `adapter:${STRIPE_PROVIDER}/payment-intent@1`,
    corridors: [{ fromCountries: ["NG"], toCountries: ["US"], currencies: ["NGN", "USD"] }],
    knownDeviations: [],
  } as unknown as ProviderImplementation;
}

function stripeInstance(): ConnectedCapabilityInstance {
  return {
    instanceId: STRIPE_RECIPIENT_INSTANCE_ID,
    capabilityId: "cap:stripe-merchant-receiving",
    implementationId: "impl:stripe-receiving-1",
    providerName: STRIPE_PROVIDER,
    providerVersion: "2026-10",
    accountRef: "acct:stripe-test-merchant",
    tenantRef: "tenant:p21-no-route",
    authorization: { status: "ACTIVE", grantedAt: "2026-09-01T00:00:00Z", authorizationRef: "authz:stripe-1" },
    credentialScope: { credentialRef: "cred:stripe-1", credentialKind: "API_KEY" },
    geography: { countries: ["NG", "US"] },
    currencies: ["NGN", "USD"],
    permissionState: { granted: ["payments:write"], requested: ["payments:write"], missing: [] },
    eligibility: { eligible: true, reasons: [] },
    configuration: {},
  } as unknown as ConnectedCapabilityInstance;
}

function stripeObservation(): CapabilityObservation {
  return observeCapability({
    instanceId: STRIPE_RECIPIENT_INSTANCE_ID,
    observedAt: NOW_ISO,
    observationVersion: 5,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: NOW_ISO },
    quota: { limit: 100, remaining: 100, windowSeconds: 86400 },
    provenance: { providerName: STRIPE_PROVIDER, source: "PROVIDER_API", capturedAt: NOW_ISO },
  });
}

/** The recipient chain: the Stripe merchant receiving rail (FUNDING_METHOD_NOT_SERVED for the FLW wallet). */
export function stripeRecipientChain(): PinnedCorridorRouteChain {
  return {
    definition: stripeDefinition(),
    implementation: stripeImplementation(),
    instance: stripeInstance(),
    observation: stripeObservation(),
  };
}

/** The corridor route inputs for the REAL projection port (side-assembled in the test). */
export function noRouteCorridorRouteInputs(): readonly CorridorRouteInput[] {
  return [flwSenderChain(), stripeRecipientChain()] as unknown as readonly CorridorRouteInput[];
}

/**
 * The REAL conditional-opportunity construction port (the composition-root
 * adapter): maps one derivation request onto the REAL opportunities
 * machinery — `discoverOpportunity` (the honest UNKNOWN-heavy corridor
 * opportunity over the grounding observation) then
 * `publishConditionalOpportunity` (the Part-1 constructor). This is the
 * only place the REAL opportunities engines bind.
 */
export function realConditionalOpportunityPort(): ConditionalOpportunityConstructionPort {
  return {
    construct(request: ConditionalConstructionRequest): PinnedConditionalOpportunity {
      // The derivation always supplies a non-empty grounding chain (validated fail-closed before the port is called).
      const primary = request.groundingEvidence[0]!;
      const observation = {
        family: request.family,
        observationId: primary.observationId,
        observationVersion: primary.version,
        venueId: primary.venueId,
        railKind: request.railKind,
        railKey: request.railKey,
        adapterId: primary.adapterId,
        observerId: primary.observerId,
        freshness: primary.freshness,
        evidenceRefs: [...primary.evidenceRefs],
        title: request.title,
        description: request.description,
        exitPath: {
          status: "UNKNOWN" as const,
          description: "the exit path is not observed until the party change makes the corridor real",
          constraints: [],
        },
        lockUp: { locked: false, durationMs: null, unlockConditions: [] },
        smartContractRisk: {
          level: "UNKNOWN" as const,
          audited: null,
          summary: "no contract risk was observed for a corridor that does not yet compose",
        },
        oracleBridgeRisk: {
          level: "UNKNOWN" as const,
          audited: null,
          summary: "no oracle or bridge dependency was observed for a corridor that does not yet compose",
        },
        returnComponents: [
          {
            componentId: "p21:corridor:composition-gap",
            kind: "INCENTIVE_YIELD" as const,
            ratePerYear: { numerator: "0", denominator: "1" },
            evidenceVerified: false,
            description:
              "no return is observed for a corridor that does not compose — the zero-rate unverified component records the composition gap the conditional names (the estimate stays UNKNOWN)",
          },
        ],
      };
      const opportunity = discoverOpportunity(observation, request.at);
      const input: ConditionalPublicationInput = {
        optIn: request.optIn,
        expiresAt: request.expiresAt,
        requiredPartyChanges: request.requiredPartyChanges as readonly RequiredPartyChange[],
        assumptions: [...request.assumptions],
        platformPrerequisites: request.platformPrerequisites.map((prerequisite) => ({ ...prerequisite })),
        groundingEvidence: request.groundingEvidence as readonly SupportingObservation[],
        disclosureScope: { fields: [...request.disclosureScope.fields], purpose: request.disclosureScope.purpose },
      };
      return publishConditionalOpportunity(opportunity, input, request.at) as unknown as PinnedConditionalOpportunity;
    },
  };
}
