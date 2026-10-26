/**
 * @payswap/route-planning test fixtures — the REAL capability machinery
 * bound through the composition ports (P16-A).
 *
 * Every fixture here is a REAL four-layer chain (definition ->
 * implementation -> instance -> observation) validated by the REAL
 * @payswap/capability machinery: definitions pass validateCapabilityDefinition,
 * instances pass validateConnectedCapabilityInstance, observations are
 * built by the REAL observeCapability (two-axis availability derived,
 * never fabricated), and the corridor projection runs the REAL
 * projectCorridor + evaluateCorridorRoute through the port adapter.
 * Fixed constants only — every instant caller-supplied data.
 */

import { observeCapability } from "../../capability/src/observation.ts";
import { projectCorridor } from "../../capability/src/corridor.ts";
import { evaluateCorridorRoute } from "../../capability/src/corridor-evaluation.ts";
import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  CorridorQuery,
  CorridorRouteInput,
  CorridorView,
  ProviderImplementation,
} from "../../capability/src/index.ts";
import type { CorridorProjectionPort, CorridorSideEvaluationRequest } from "../src/ports.ts";
import type { PinnedCorridorSideEvaluation } from "../src/pins/capability.ts";
import type { MoneyMovementIntentPin, PaymentIntentPin } from "../src/pins/economic.ts";
import type { PinnedCorridorRouteChain } from "../src/pins/capability.ts";

export const CHAIN = "ethereum:mainnet";
export const NOW_ISO = "2026-10-05T00:00:00Z";
export const NOW = Date.parse(NOW_ISO);
export const SENDER_INSTANCE_ID = "inst:sender-psp-native";
export const RECIPIENT_INSTANCE_ID = "inst:recipient-psp-payouts";
export const PSP_PROVIDER = "psp-planning-fixture";
export const ORIGIN_WALLET = "0x1111111111111111111111111111111111111111";
export const DESTINATION_IBAN = "iban:FR7630006000011234567890189";

/** The movement corridor query (caller-supplied asOf DATA). */
export function movementCorridorQuery(): CorridorQuery {
  return {
    sourceCountry: "DE",
    destinationCountry: "FR",
    sourceCurrency: "ETH",
    destinationCurrency: "EUR",
    customerType: "PERSONAL",
    sendAmount: { currency: "ETH", minorUnits: "10000000000000000" },
    fundingMethod: "onchain_transfer",
    payoutMethod: "bank_transfer",
    recipientType: "individual",
    presentedFieldIds: ["recipient.iban"],
    asOf: NOW_ISO,
  };
}

/** A valid definition-level corridor restriction set (ETH/USC/EUR DE->FR). */
function planningRestrictionSet() {
  return {
    restrictionSetId: "rs:planning-de-fr",
    version: "1.0.0",
    sourceCountries: ["DE"],
    destinationCountries: ["FR"],
    currencies: ["ETH", "USC", "EUR"],
    customerTypes: ["PERSONAL", "BUSINESS"],
    amountLimits: {
      min: { currency: "ETH", minorUnits: "1" },
      max: { currency: "ETH", minorUnits: "999000000000000000000" },
    },
    requiredFields: [
      { fieldId: "recipient.iban", description: "Beneficiary IBAN", appliesTo: "RECIPIENT" as const },
    ],
    cutoffs: [
      {
        cutoffId: "cutoff:payout-eod",
        description: "Same-day payout cutoff",
        appliesTo: "PAYOUT" as const,
        cutoffTimeUtc: "14:00",
        processingDayRule: "BUSINESS_DAYS" as const,
      },
    ],
    terms: {
      termsRef: "terms:planning-psp",
      termsVersion: "1.0.0",
      deliveryEstimateLabel: "INDICATIVE" as const,
    },
    declaredBy: "payswap:planning-test-catalogue",
  };
}

/** A valid EXECUTABLE CapabilityDefinition (layer 1) for a PSP rail. */
export function planningDefinition(capabilityId: string): CapabilityDefinition {
  return {
    id: capabilityId,
    version: "1.0.0",
    capabilityClass: "rail_movement",
    conditions: [
      { kind: "jurisdiction", description: "DE->FR corridor only", hardConstraint: true },
      { kind: "eligibility", description: "Account verified", hardConstraint: true },
    ],
    cost: [
      { componentId: "fixed", kind: "fixed_fee", amount: { currency: "EUR", minorUnits: "5" } },
      { componentId: "variable", kind: "variable_fee_bps", bps: 8n },
    ],
    risk: { riskClass: "settlement", severity: "low", mitigations: ["reconciliation"] },
    provenance: {
      declaredBy: `provider:${PSP_PROVIDER}`,
      artifactRef: `provider:${PSP_PROVIDER}/rail@1`,
      contentHash: "fnv1a64:00ff",
    },
    economicAccountability: {
      accountablePartyRef: `provider:${PSP_PROVIDER}`,
      ledgerAccountRef: "ledger:fees/psp",
      recoursePolicyRef: "policy:recourse/planning",
    },
    proofRequirements: [{ proofLevel: "P2", scope: "settlement" }],
    bondCollateralRecourse: {
      bondAmount: { currency: "EUR", minorUnits: "1000000" },
      collateralType: "cash-bond",
      recourseMechanism: "dispute/claim",
    },
    executable: true,
    execution: {
      contractVersion: "1.0.0",
      semantics: {
        summary: "PSP rail movement",
        effectDescription: "Moves the settled amount across the corridor",
      },
      stateMachine: {
        initial: "CREATED",
        states: [
          { name: "CREATED", isTerminal: false },
          { name: "SETTLED", isTerminal: true },
        ],
        transitions: [{ from: "CREATED", to: "SETTLED", trigger: "rail-finality" }],
      },
      preconditions: [
        {
          preconditionId: "pre:beneficiary-verified",
          description: "Beneficiary fields verified",
          confirmedBy: "PROVIDER",
        },
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
      partialExecution: { supported: false, semantics: "single atomic payout leg" },
      userActions: [],
      providerStateMapping: {
        preservedInEnvelope: true,
        consequentialFamilies: ["payout"],
      },
      externalReferences: {
        carriesExternalIds: true,
        revisionTracking: "PROVIDER_REVISIONS",
        correlationIdRequired: true,
      },
      evidenceRequirements: [{ evidenceKind: "PAYOUT", required: true }],
      economicTerms: {
        termsRef: "terms:planning-psp",
        termsVersion: "1.0.0",
        pricingModel: "fixed + bps",
      },
      jurisdictionEligibility: {
        declaredVia: "RESTRICTION_SET",
        restrictionSet: planningRestrictionSet(),
      },
      executionModes: ["PASS_THROUGH_NATIVE", "COMPOSED_PAYSWAP", "OPTIMIZED_MULTI_PROVIDER"],
    },
  } as unknown as CapabilityDefinition;
}

/** A valid ProviderImplementation (layer 2) for a PSP rail. */
export function planningImplementation(
  implementationId: string,
  capabilityId: string,
): ProviderImplementation {
  return {
    implementationId,
    providerName: PSP_PROVIDER,
    providerVersion: "2026-10",
    capabilityId,
    capabilityVersion: "1.0.0",
    version: "1.0.0",
    adapterRef: `adapter:${PSP_PROVIDER}/rail@1`,
    corridors: [
      { fromCountries: ["DE"], toCountries: ["FR"], currencies: ["ETH", "USC", "EUR"] },
    ],
    knownDeviations: [],
  } as unknown as ProviderImplementation;
}

/** A valid ConnectedCapabilityInstance (layer 3) scoped to one account. */
export function planningInstance(
  instanceId: string,
  implementationId: string,
  capabilityId: string,
  accountRef: string,
): ConnectedCapabilityInstance {
  return {
    instanceId,
    capabilityId,
    implementationId,
    providerName: PSP_PROVIDER,
    providerVersion: "2026-10",
    accountRef,
    tenantRef: "tenant:planning-fixture",
    authorization: {
      status: "ACTIVE",
      grantedAt: "2026-09-01T00:00:00Z",
      authorizationRef: "authz:planning-1",
    },
    credentialScope: {
      credentialRef: "cred:planning-1",
      credentialKind: "OAUTH",
    },
    geography: { countries: ["DE", "FR"] },
    currencies: ["ETH", "USC", "EUR"],
    permissionState: {
      granted: ["payments:write"],
      requested: ["payments:write"],
      missing: [],
    },
    eligibility: { eligible: true, reasons: [] },
    configuration: { captureMode: "automatic" },
  } as unknown as ConnectedCapabilityInstance;
}

/** A REAL observation built by the REAL observeCapability (layer 4). */
export function planningObservation(
  instanceId: string,
  observationVersion: number,
  options?: { observedAt?: string; sourceAvailability?: "REACHABLE" | "UNREACHABLE" | "UNKNOWN"; eligibility?: "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN" },
): CapabilityObservation {
  return observeCapability({
    instanceId,
    observedAt: options?.observedAt ?? NOW_ISO,
    observationVersion,
    capabilityState: "AVAILABLE",
    sourceAvailability: options?.sourceAvailability ?? "REACHABLE",
    eligibility: options?.eligibility ?? "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: NOW_ISO },
    quota: { limit: 100, remaining: 100, windowSeconds: 86400 },
    provenance: {
      providerName: PSP_PROVIDER,
      source: "PROVIDER_API",
      capturedAt: NOW_ISO,
    },
  });
}

/** The sender chain as a REAL typed CorridorRouteInput (the single source). */
export function senderCorridorRouteInput(options?: {
  observation?: CapabilityObservation;
}): CorridorRouteInput {
  return {
    definition: planningDefinition("cap:psp-native-routing"),
    implementation: planningImplementation("impl:psp-native-1", "cap:psp-native-routing"),
    instance: planningInstance(
      SENDER_INSTANCE_ID,
      "impl:psp-native-1",
      "cap:psp-native-routing",
      `acct:${SENDER_INSTANCE_ID}`,
    ),
    observation: options?.observation ?? planningObservation(SENDER_INSTANCE_ID, 1),
  };
}

/** The recipient chain as a REAL typed CorridorRouteInput (the single source). */
export function recipientCorridorRouteInput(options?: {
  observation?: CapabilityObservation;
}): CorridorRouteInput {
  return {
    definition: planningDefinition("cap:psp-payouts"),
    implementation: planningImplementation("impl:psp-payouts-1", "cap:psp-payouts"),
    instance: planningInstance(
      RECIPIENT_INSTANCE_ID,
      "impl:psp-payouts-1",
      "cap:psp-payouts",
      `acct:${RECIPIENT_INSTANCE_ID}`,
    ),
    observation: options?.observation ?? planningObservation(RECIPIENT_INSTANCE_ID, 2),
  };
}

/** The sender chain: the incumbent native rail on the SENDER's account. */
export function senderChain(options?: {
  observation?: CapabilityObservation;
}): PinnedCorridorRouteChain {
  return senderCorridorRouteInput(options);
}

/** The recipient chain: the payout rail on the RECIPIENT's account. */
export function recipientChain(options?: {
  observation?: CapabilityObservation;
}): PinnedCorridorRouteChain {
  return recipientCorridorRouteInput(options);
}

/**
 * The REAL corridor projection port: runs the REAL projectCorridor per
 * side plus the REAL per-route evaluation for the restriction sets (the
 * composition-root adapter — the only place real engines are bound).
 */
export function realCorridorProjectionPort(): CorridorProjectionPort {
  return {
    evaluateSide(input: CorridorSideEvaluationRequest): PinnedCorridorSideEvaluation {
      const routes = input.chains.map((chain) => ({
        definition: chain.definition as CapabilityDefinition,
        implementation: chain.implementation as ProviderImplementation,
        instance: chain.instance as unknown as ConnectedCapabilityInstance,
        observation: chain.observation as unknown as CapabilityObservation,
      })) as CorridorRouteInput[];
      const query = input.query as unknown as CorridorQuery;
      const view: CorridorView = projectCorridor({
        routes,
        query,
        freshnessPolicy: input.freshnessPolicy,
      });
      const routeRestrictionSets = routes.map((route) =>
        evaluateCorridorRoute(route, query, input.freshnessPolicy).restrictionSets,
      );
      return { view, routeRestrictionSets };
    },
  };
}

/** The movement intent fixture (ETH wallet -> EUR bank). */
export function movementIntentFixture(): MoneyMovementIntentPin {
  return {
    intentId: "intent:planning:001",
    principalRef: "principal:planning-1",
    origin: {
      locationRef: "fundsloc:planning-origin-wallet",
      currency: "ETH",
      observationRef: "obs:planning-origin",
    },
    destination: {
      locationRef: "fundsloc:planning-destination-bank",
      currency: "EUR",
      observationRef: "obs:planning-destination",
    },
    originAmount: { currency: "ETH", minorUnits: "10000000000000000" },
    arrivalCurrency: "EUR",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:planning-1",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

/** The payment intent fixture (the 11-key commerce specialization). */
export function paymentIntentFixture(): PaymentIntentPin {
  return { ...movementIntentFixture(), commerceRef: "checkout:planning-order-1" };
}

/** A provider catalogue entry (an advertisement — never authority, INV-13). */
export function catalogueEntryFixture() {
  return {
    catalogueEntryId: "cat:psp-advertisement-1",
    providerName: PSP_PROVIDER,
    providerVersion: "2026-10",
    capabilityId: "cap:psp-payouts",
    summary: "platform-wide advertisement — never a connected rail",
    advertisedScope: {
      platformWide: true,
      advertisedGeographies: ["DE", "FR"],
      advertisedCurrencies: ["ETH", "EUR"],
    },
  };
}
