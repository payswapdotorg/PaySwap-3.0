/**
 * Shared deterministic fixtures for @payswap/execution-graph tests.
 *
 * The battery is HERMETIC: no sibling package is installed at test time
 * (devDependencies are exactly typescript + vitest), so every wire shape
 * consumed from @payswap/capability / @payswap/protocol /
 * @payswap/economic is constructed STRUCTURALLY here — the type-only pins
 * in src keep the shapes honest at compile time.
 */

import type {
  CapabilityObservation,
  CompensationPolicy,
  ConnectedCapabilityInstance,
  PartialExecutionPolicy,
  ProviderCatalogueEntry,
  ProviderFailureMetadata,
  ProviderStateEnvelope,
  ProviderStateFamily,
  ProviderActionRequired,
} from '@payswap/capability';
import type { AuthorizationRef, Money, PrincipalRef, TimestampMs } from '@payswap/protocol';
import type { VersionedEconomicInput } from '@payswap/economic';
import type { MaterialExecutionTerms } from '../src/material-terms-contract.ts';
import type { ObservationVersionPin } from '../src/observation-version-contract.ts';
import type { StrategyProgram } from '../src/strategy-contract.ts';
import type { SimulatedWorld } from '../src/simulation-contract.ts';
import { pinObservation } from '../src/observation-versions.ts';

export const PRINCIPAL: PrincipalRef = Object.freeze({
  principalType: 'user',
  principalId: 'user_1',
});

export const AGENT: PrincipalRef = Object.freeze({
  principalType: 'agent',
  principalId: 'agent_1',
});

export const NOW: TimestampMs = 1_700_000_000_000n;

/** Exact money (structural construction; the protocol lane owns Money). */
export function money(currency: string, minor: bigint): Money {
  return { currency, value: minor } as unknown as Money;
}

export const USD_100 = money('USD', 10_000n);
export const USD_1 = money('USD', 100n);

/** Loose override surface for instance fixtures (branded ids stay strings here). */
export interface InstanceOverrides {
  instanceId?: string;
  capabilityId?: string;
  implementationId?: string;
  providerName?: string;
  providerVersion?: string;
  authorization?: { status: 'ACTIVE' | 'PENDING' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN' };
  eligibility?: { eligible: boolean; reasons: readonly string[] };
  permissionState?: {
    granted: readonly string[];
    requested: readonly string[];
    missing: readonly string[];
  };
  currencies?: readonly string[];
  geography?: { countries: readonly string[] };
  configuration?: Readonly<Record<string, string | number | boolean>>;
}

/** A genuinely connected capability instance (INV-13 shape). */
export function makeInstance(overrides?: InstanceOverrides): ConnectedCapabilityInstance {
  return Object.freeze({
    instanceId: 'inst-mm-1',
    capabilityId: 'cap.mobile_money.collect',
    implementationId: 'impl-1',
    providerName: 'test-psp',
    providerVersion: '1.0.0',
    accountRef: 'acct_merchant_1',
    tenantRef: 'tenant_1',
    authorization: { status: 'ACTIVE' },
    credentialScope: { credentialRef: 'cred-1', credentialKind: 'API_KEY' },
    geography: { countries: ['US'] },
    currencies: ['USD'],
    permissionState: { granted: ['payments:write'], requested: ['payments:write'], missing: [] },
    eligibility: { eligible: true, reasons: [] },
    configuration: {},
    ...overrides,
  } as unknown as ConnectedCapabilityInstance);
}

/** A second instance (second rail for multi-provider plans). */
export function makeSecondInstance(overrides?: InstanceOverrides): ConnectedCapabilityInstance {
  return makeInstance({
    instanceId: 'inst-usdc-1',
    capabilityId: 'cap.stablecoin.transfer',
    implementationId: 'impl-2',
    providerName: 'test-psp-2',
    ...overrides,
  });
}

/** A provider catalogue entry — an advertisement, NEVER authority (INV-13). */
export function makeCatalogueEntry(
  overrides?: Partial<ProviderCatalogueEntry>,
): ProviderCatalogueEntry {
  return Object.freeze({
    catalogueEntryId: 'cat-1',
    providerName: 'test-psp',
    providerVersion: '1.0.0',
    capabilityId: 'cap.mobile_money.collect',
    summary: 'Advertised platform-wide',
    advertisedScope: {
      platformWide: true as const,
      advertisedGeographies: ['US'],
      advertisedCurrencies: ['USD'],
    },
    ...overrides,
  } as unknown as ProviderCatalogueEntry);
}

/** A capability observation (two-axis availability, freshness-stamped). */
export function makeObservation(overrides?: {
  instanceId?: string;
  observationVersion?: number;
  observedAt?: string;
  capabilityState?: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
  sourceAvailability?: 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN';
  eligibility?: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';
}): CapabilityObservation {
  const state = overrides?.capabilityState ?? 'AVAILABLE';
  const source = overrides?.sourceAvailability ?? 'REACHABLE';
  const availability =
    source === 'REACHABLE' ? state : 'UNKNOWN';
  return Object.freeze({
    instanceId: overrides?.instanceId ?? 'inst-mm-1',
    observedAt: overrides?.observedAt ?? '2026-01-01T00:00:00.000Z',
    observationVersion: overrides?.observationVersion ?? 1,
    capabilityState: state,
    sourceAvailability: source,
    availability,
    eligibility: overrides?.eligibility ?? 'ELIGIBLE',
    health: { status: 'HEALTHY' as const, lastCheckedAt: '2026-01-01T00:00:00.000Z' },
    provenance: {
      providerName: 'test-psp',
      source: 'PROVIDER_API' as const,
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
  } as unknown as CapabilityObservation);
}

/** A lossless provider state envelope (INV-14). */
export function makeEnvelope(overrides?: {
  family?: ProviderStateFamily;
  lifecycleStep?: string;
  isTerminal?: boolean;
  requiresCustomerAction?: boolean;
  state?: unknown;
  failure?: ProviderFailureMetadata;
  actionRequired?: ProviderActionRequired;
  externalId?: string;
  revision?: string;
}): ProviderStateEnvelope {
  const input = overrides ?? {};
  return Object.freeze({
    schemaVersion: 1,
    provider: { name: 'test-psp', version: '1.0.0' },
    object: { objectType: 'payment', externalId: input.externalId ?? 'pay_ext_1' },
    revision: input.revision ?? 'rev_1',
    state: input.state ?? { providerNativeStatus: 'processing', nested: { detail: true } },
    classification: {
      family: input.family ?? 'capture',
      lifecycleStep: input.lifecycleStep ?? 'pending_capture',
      isTerminal: input.isTerminal ?? false,
      requiresCustomerAction: input.requiresCustomerAction ?? false,
    },
    history: [],
    ...(input.actionRequired !== undefined ? { actionRequired: input.actionRequired } : {}),
    ...(input.failure !== undefined ? { failure: input.failure } : {}),
    privacy: {
      dataClassification: 'PARTNER' as const,
      constraints: [],
      shareableFields: ['state'],
    },
    timestamps: { observedAt: '2026-01-01T00:00:00.000Z' },
    provenance: { source: 'PROVIDER_API' as const, fetchId: 'fetch_1' },
  } as unknown as ProviderStateEnvelope);
}

/** A compensation policy view (capability lane shapes). */
export function makeCompensationPolicy(
  overrides?: Partial<CompensationPolicy>,
): CompensationPolicy {
  return Object.freeze({
    cancellable: false,
    refundable: false,
    compensationMechanism: 'provider payout reversal flow',
    lateReturnRepresentable: true,
    ...overrides,
  });
}

export function makePartialExecutionPolicy(
  overrides?: Partial<PartialExecutionPolicy>,
): PartialExecutionPolicy {
  return Object.freeze({
    supported: true,
    semantics: 'provider executes a fraction (partialBps) and reports it',
    ...overrides,
  });
}

/** A protocol-lane authorization ref (opaque wire shape, INV-05 lineage). */
export const AUTHORIZATION_REF: AuthorizationRef = Object.freeze({
  artifactId: 'auth-artifact-1',
  mandateRef: 'mandate-1',
  approverRef: 'user_1',
  epoch: 1n,
  artifactHash: 'sha256:abcdef',
});

/** A versioned quote economic input (canonical JSON content). */
export const QUOTE_INPUT: VersionedEconomicInput = Object.freeze({
  kind: 'QUOTE',
  version: 3,
  sourceRef: 'quote:provider-1:rate-card',
  content: '{"amountMinor":10000,"currency":"USD","feeMinor":100,"rate":"1.00"}',
});

/** A material execution terms fixture covering several axes. */
export type MaterialTermsOverrides = {
  [K in keyof MaterialExecutionTerms]?: MaterialExecutionTerms[K] | undefined;
};

export function makeMaterialTerms(overrides?: MaterialTermsOverrides): MaterialExecutionTerms {
  const base: MaterialExecutionTerms = Object.freeze({
    route: ['cap.mobile_money.collect', 'payswap.fx.convert'],
    destinationId: 'dest_bank_1',
    asset: 'USD',
    amountMinor: 10_000n,
    riskEpochRef: 'epoch:security:42',
    observationPins: [PIN_V1],
    quoteRefs: ['QUOTE@3:quote:provider-1:rate-card'],
  });
  if (overrides === undefined) {
    return base;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return Object.freeze(merged) as MaterialExecutionTerms;
}

/** The observation pin of `makeObservation()` at version 1 (LAW 1 fixture). */
export const PIN_V1: ObservationVersionPin = pinObservation(makeObservation());
export const PIN_V1_ALT_INSTANCE: ObservationVersionPin = pinObservation(
  makeObservation({ instanceId: 'inst-usdc-1' }),
);

/** A valid strategy program (the WHAT-dimensions of a settlement policy). */
export const STRATEGY_PROGRAM: StrategyProgram = Object.freeze({
  programId: 'test.program',
  programVersion: '1.0.0',
  routePreference: ['rail-eur', 'rail-usd'],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: 'PROTOCOL_AUTHORIZED',
});

/** The canonical simulated world used by simulation/evaluator tests. */
export const WORLD: SimulatedWorld = Object.freeze({
  worldId: 'test-world',
  baseCurrency: 'EUR',
  stepLatencyMs: 100,
  rails: [
    {
      railId: 'rail-eur',
      currency: 'EUR',
      latencyMs: 300,
      fixedFeeMinor: 10n,
      variableFeeBps: 5n,
    },
    {
      railId: 'rail-usd',
      currency: 'USD',
      latencyMs: 500,
      fixedFeeMinor: 20n,
      variableFeeBps: 8n,
      fxSpreadBps: 25n,
    },
  ],
  pools: [
    { poolId: 'pool-eur', railId: 'rail-eur', availableMinor: 1_000_000n },
    { poolId: 'pool-usd', railId: 'rail-usd', availableMinor: 500_000n },
  ],
});
