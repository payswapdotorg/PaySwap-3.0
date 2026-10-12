/**
 * Shared test fixtures: canonical four-layer hierarchy builders used across
 * the test suite. All builders produce objects that PASS their package
 * validators; individual tests then mutate specific fields to probe the
 * fail-closed laws.
 */

import {
  asCapabilityDefinitionId,
  asProviderImplementationId,
  asConnectedInstanceId,
} from '../src/index.ts';
import type {
  AcceptanceCapabilityDefinition,
  CapabilityDefinition,
  ExecutableCapabilityDeclaration,
  NonExecutableCapabilityDefinition,
  CorridorRestrictionSet,
  ProviderImplementation,
  ConnectedCapabilityInstance,
  CapabilityObservation,
} from '../src/index.ts';

/** Loose override bag: branded ids accept plain strings in TEST fixtures. */
type Loose<T> = { readonly [K in keyof T]?: T[K] extends string ? string : T[K] };

/** A valid definition-level corridor restriction set (EUR/GBP personal+business). */
export function eurGbpRestrictionSet(
  overrides: Loose<CorridorRestrictionSet> = {},
): CorridorRestrictionSet {
  return {
    restrictionSetId: 'rs:sepa-core',
    version: '1.0.0',
    sourceCountries: ['DE', 'FR', 'NL'],
    destinationCountries: ['DE', 'FR', 'NL', 'GB'],
    currencies: ['EUR', 'GBP'],
    customerTypes: ['PERSONAL', 'BUSINESS'],
    amountLimits: {
      min: { currency: 'EUR', minorUnits: '100' },
      max: { currency: 'EUR', minorUnits: '100000000' },
    },
    requiredFields: [
      { fieldId: 'recipient.iban', description: 'Beneficiary IBAN', appliesTo: 'RECIPIENT' },
    ],
    cutoffs: [
      {
        cutoffId: 'cutoff:payout-eod',
        description: 'Same-day payout cutoff',
        appliesTo: 'PAYOUT',
        cutoffTimeUtc: '14:00',
        processingDayRule: 'BUSINESS_DAYS',
      },
    ],
    terms: {
      termsRef: 'terms:sepa-core',
      termsVersion: '2026-01',
      deliveryEstimateLabel: 'INDICATIVE',
    },
    declaredBy: 'payswap:catalogue',
    ...overrides,
  } as unknown as CorridorRestrictionSet;
}

/** A fully valid fourteen-part executable declaration. */
export function fullExecutionDeclaration(
  overrides: Loose<ExecutableCapabilityDeclaration> = {},
): ExecutableCapabilityDeclaration {
  return {
    contractVersion: '1.0.0',
    semantics: {
      summary: 'SEPA credit transfer payout',
      effectDescription: 'Moves the settled amount to a beneficiary bank account',
    },
    stateMachine: {
      initial: 'CREATED',
      states: [
        { name: 'CREATED', isTerminal: false },
        { name: 'SUBMITTED', isTerminal: false },
        { name: 'SETTLED', isTerminal: true },
        { name: 'RETURNED', isTerminal: true },
      ],
      transitions: [
        { from: 'CREATED', to: 'SUBMITTED', trigger: 'submit' },
        { from: 'SUBMITTED', to: 'SETTLED', trigger: 'rail-finality' },
        { from: 'SUBMITTED', to: 'RETURNED', trigger: 'late-return' },
      ],
    },
    preconditions: [
      {
        preconditionId: 'pre:beneficiary-verified',
        description: 'Beneficiary account fields verified',
        confirmedBy: 'PROVIDER',
      },
    ],
    authorizationRequirements: {
      requiredScopes: ['payments:write'],
      requiresHumanApproval: false,
    },
    financialEffectClass: 'CONSEQUENTIAL_EXTERNAL_EFFECT',
    idempotency: {
      keyScope: 'ENDPOINT_SPECIFIC',
      carriesProviderKey: true,
      retryPolicy: 'NEVER_RETRY_AFTER_AMBIGUITY',
      reconciliationRequired: true,
    },
    compensation: {
      cancellable: true,
      refundable: true,
      compensationMechanism: 'provider reversal + reconciliation path',
      lateReturnRepresentable: true,
    },
    partialExecution: { supported: false, semantics: 'single atomic payout leg' },
    userActions: [
      {
        actionKind: 'confirm_beneficiary',
        description: 'Confirm the beneficiary before first payout',
        required: true,
      },
    ],
    providerStateMapping: {
      preservedInEnvelope: true,
      consequentialFamilies: ['payout', 'customer_action_required'],
    },
    externalReferences: {
      carriesExternalIds: true,
      revisionTracking: 'PROVIDER_REVISIONS',
      correlationIdRequired: true,
    },
    evidenceRequirements: [
      { evidenceKind: 'PAYOUT', required: true },
      { evidenceKind: 'FINALITY', required: true },
    ],
    economicTerms: {
      termsRef: 'terms:sepa-core',
      termsVersion: '2026-01',
      pricingModel: 'fixed + bps',
    },
    jurisdictionEligibility: {
      declaredVia: 'RESTRICTION_SET',
      restrictionSet: eurGbpRestrictionSet(),
    },
    executionModes: ['PASS_THROUGH_NATIVE', 'COMPOSED_PAYSWAP'],
    ...overrides,
  } as unknown as ExecutableCapabilityDeclaration;
}

/** Base metadata shared by all definition fixtures. */
const DEFINITION_BASE = {
  id: asCapabilityDefinitionId('cap:sepa-credit-transfer'),
  version: '1.4.0',
  capabilityClass: 'rail_movement' as const,
  conditions: [
    { kind: 'jurisdiction' as const, description: 'SEPA zone only', hardConstraint: true },
    { kind: 'eligibility' as const, description: 'Account verified', hardConstraint: true },
  ],
  cost: [
    {
      componentId: 'fixed',
      kind: 'fixed_fee' as const,
      amount: { currency: 'EUR', minorUnits: '5' },
    },
    { componentId: 'variable', kind: 'variable_fee_bps' as const, bps: 8n },
  ],
  risk: { riskClass: 'settlement', severity: 'low' as const, mitigations: ['reconciliation'] },
  provenance: {
    declaredBy: 'provider:bank-a',
    artifactRef: 'provider:bank-a/sepa@2',
    contentHash: 'fnv1a64:00ff',
  },
  economicAccountability: {
    accountablePartyRef: 'provider:bank-a',
    ledgerAccountRef: 'ledger:fees/bank-a',
    recoursePolicyRef: 'policy:recourse/sepa',
  },
  proofRequirements: [{ proofLevel: 'P2' as const, scope: 'settlement' }],
  bondCollateralRecourse: {
    bondAmount: { currency: 'EUR', minorUnits: '1000000' },
    collateralType: 'cash-bond',
    recourseMechanism: 'dispute/claim',
  },
};

/** A valid EXECUTABLE CapabilityDefinition (layer 1). */
export function executableDefinition(
  overrides: Loose<CapabilityDefinition> = {},
): CapabilityDefinition {
  return {
    ...DEFINITION_BASE,
    executable: true,
    execution: fullExecutionDeclaration(),
    ...overrides,
  } as unknown as CapabilityDefinition;
}

/** A valid NON-executable CapabilityDefinition with an explicit reason. */
export function nonExecutableDefinition(): NonExecutableCapabilityDefinition {
  return {
    ...DEFINITION_BASE,
    id: asCapabilityDefinitionId('cap:sepa-scheme-info'),
    executable: false,
    nonExecutableReason: 'informational scheme reference — no executable effect',
  };
}

/** A valid acceptance definition (non-executable by construction). */
export function acceptanceDefinition(): AcceptanceCapabilityDefinition {
  return {
    ...DEFINITION_BASE,
    id: asCapabilityDefinitionId('cap:merchant-123-acceptance'),
    capabilityClass: 'merchant_acceptance',
    executable: false,
    nonExecutableReason: 'acceptance is an advertisement surface, never an execution surface',
    acceptedPaymentMethods: ['bank_transfer', 'instant_payment'],
    acceptedCurrencies: ['EUR'],
    acceptedCountries: ['DE', 'FR'],
    terms: {
      supportsRecurring: true,
      supportsPartialPayments: false,
      supportsRefunds: true,
      recoursePolicyRef: 'policy:recourse/merchant-123',
    },
    settlementDestinationRef: 'destination:merchant-123/iban',
  };
}

/** A valid ProviderImplementation (layer 2) implementing the SEPA fixture. */
export function providerImplementation(
  overrides: Loose<ProviderImplementation> = {},
): ProviderImplementation {
  return {
    implementationId: asProviderImplementationId('impl:psp-a-sepa-1'),
    providerName: 'psp-a',
    providerVersion: '2026-01',
    capabilityId: asCapabilityDefinitionId('cap:sepa-credit-transfer'),
    capabilityVersion: '1.4.0',
    version: '1.2.0',
    adapterRef: 'adapter:psp-a/sepa@1',
    corridors: [
      {
        fromCountries: ['DE', 'FR', 'NL'],
        toCountries: ['DE', 'FR', 'NL', 'GB'],
        currencies: ['EUR', 'GBP'],
      },
    ],
    knownDeviations: [],
    ...overrides,
  } as unknown as ProviderImplementation;
}

/** A valid ConnectedCapabilityInstance (layer 3). */
export function connectedInstance(
  overrides: Loose<ConnectedCapabilityInstance> = {},
): ConnectedCapabilityInstance {
  return {
    instanceId: asConnectedInstanceId('inst:acct-1-payments'),
    capabilityId: asCapabilityDefinitionId('cap:sepa-credit-transfer'),
    implementationId: asProviderImplementationId('impl:psp-a-sepa-1'),
    providerName: 'psp-a',
    providerVersion: '2026-01',
    accountRef: 'acct:merchant-1',
    tenantRef: 'tenant:merchant-1',
    authorization: {
      status: 'ACTIVE',
      grantedAt: '2026-09-01T00:00:00Z',
      authorizationRef: 'authz:oauth-1',
    },
    credentialScope: {
      credentialRef: 'cred:oauth-merchant-1',
      credentialKind: 'OAUTH',
      delegationRef: 'deleg:merchant-1',
    },
    geography: { countries: ['DE', 'FR', 'NL'] },
    currencies: ['EUR', 'GBP'],
    permissionState: {
      granted: ['payments:write'],
      requested: ['payments:write'],
      missing: [],
    },
    eligibility: { eligible: true, reasons: [] },
    configuration: { captureMode: 'automatic', statementDescriptor: 'MERCHANT 1' },
    ...overrides,
  } as unknown as ConnectedCapabilityInstance;
}

/** A fresh, healthy CapabilityObservation (layer 4). */
export function healthyObservation(
  overrides: Loose<CapabilityObservation> = {},
): CapabilityObservation {
  return {
    instanceId: asConnectedInstanceId('inst:acct-1-payments'),
    observedAt: '2026-10-01T12:00:05Z',
    observationVersion: 1,
    capabilityState: 'AVAILABLE',
    sourceAvailability: 'REACHABLE',
    availability: 'AVAILABLE',
    eligibility: 'ELIGIBLE',
    health: { status: 'HEALTHY', lastCheckedAt: '2026-10-01T12:00:04Z' },
    provenance: {
      providerName: 'psp-a',
      source: 'PROVIDER_API',
      capturedAt: '2026-10-01T12:00:00Z',
    },
    ...overrides,
  } as unknown as CapabilityObservation;
}
