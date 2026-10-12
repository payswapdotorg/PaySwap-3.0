import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  projectCorridor,
  validateCorridorProjectionInput,
  assertCorridorViewCarriesNoAuthorization,
  corridorViewIsNotAnExecutionRequest,
  containsAuthorizationMaterial,
  CORRIDOR_PROJECTION_VERSION,
  validateExecutionRequest,
} from '../src/index.ts';
import type { CorridorQuery, CorridorRouteInput, CorridorView } from '../src/index.ts';
import {
  executableDefinition,
  fullExecutionDeclaration,
  nonExecutableDefinition,
  providerImplementation,
  connectedInstance,
  healthyObservation,
  eurGbpRestrictionSet,
} from './fixtures.ts';

/**
 * The corridor-aware eligibility discovery projection (NET-NEW — Wise §4.1
 * discipline; work-order scope item 6). Laws pinned here:
 * - DETERMINISTIC: identical inputs -> identical view (pure function);
 * - VERSIONED: the view cites every underlying version and carries its own
 *   projection version;
 * - EXCLUSION-REASONED: every excluded route shows EVERY violated check;
 * - NO AUTHORIZATION LEAKAGE: no credential/authorization material in the
 *   view, and the view is structurally NOT an execution request — a
 *   corridor can NEVER make an unsupported route executable.
 */

const QUERY: CorridorQuery = {
  sourceCountry: 'DE',
  destinationCountry: 'FR',
  sourceCurrency: 'EUR',
  destinationCurrency: 'EUR',
  customerType: 'PERSONAL',
  sendAmount: { currency: 'EUR', minorUnits: '50000' },
  fundingMethod: 'bank_transfer',
  payoutMethod: 'instant_payment',
  recipientType: 'individual',
  presentedFieldIds: ['recipient.iban'],
  asOf: '2026-10-01T12:30:00Z',
};

const FRESHNESS = { maxAgeSeconds: 3600 };

function route(overrides: Partial<CorridorRouteInput> = {}): CorridorRouteInput {
  return {
    definition: executableDefinition(),
    implementation: providerImplementation(),
    instance: connectedInstance(),
    observation: healthyObservation(),
    ...overrides,
  };
}

describe('the happy path: an eligible route with full lineage', () => {
  it('projects an eligible route citing every underlying version', () => {
    const view = projectCorridor({ routes: [route()], query: QUERY, freshnessPolicy: FRESHNESS });
    expect(view.projectionVersion).toBe(CORRIDOR_PROJECTION_VERSION);
    expect(view.routes).toHaveLength(1);
    const evaluated = view.routes[0];
    expect(evaluated?.eligible).toBe(true);
    expect(evaluated?.exclusionReasons).toEqual([]);
    expect(evaluated?.degraded).toBe(false);
    expect(evaluated?.lineage.capabilityDefinitionId).toBe('cap:sepa-credit-transfer');
    expect(evaluated?.lineage.capabilityDefinitionVersion).toBe('1.4.0');
    expect(evaluated?.lineage.providerImplementationId).toBe('impl:psp-a-sepa-1');
    expect(evaluated?.lineage.implementationVersion).toBe('1.2.0');
    expect(evaluated?.lineage.connectedInstanceId).toBe('inst:acct-1-payments');
    expect(evaluated?.lineage.observationVersion).toBe(1);
    expect(evaluated?.offeredExecutionModes).toEqual(['PASS_THROUGH_NATIVE', 'COMPOSED_PAYSWAP']);
    expect(evaluated?.termsRefs[0]?.termsRef).toBe('terms:sepa-core');
    expect(evaluated?.requiredFields.map((field) => field.fieldId)).toEqual(['recipient.iban']);
    expect(view.eligibleRoutes).toHaveLength(1);
  });
});

describe('EXCLUSION REASONS are surfaced (never just the first)', () => {
  it('an inactive authorization excludes with code+cause+layer', () => {
    const view = projectCorridor({
      routes: [
        route({
          instance: connectedInstance({
            authorization: { ...connectedInstance().authorization, status: 'REVOKED' },
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const evaluated = view.routes[0];
    expect(evaluated?.eligible).toBe(false);
    const exclusion = evaluated?.exclusionReasons.find(
      (reason) => reason.code === 'AUTHORIZATION_NOT_ACTIVE',
    );
    expect(exclusion).toBeDefined();
    expect(exclusion?.cause).toBe('CAPABILITY');
    expect(exclusion?.layer).toBe('INSTANCE');
  });

  it('multiple violations surface TOGETHER with detail', () => {
    const view = projectCorridor({
      routes: [
        route({
          instance: connectedInstance({
            authorization: { ...connectedInstance().authorization, status: 'EXPIRED' },
            eligibility: { eligible: false, reasons: ['kyc-tier-2-required'] },
            geography: { countries: ['FR'] },
            permissionState: {
              granted: [],
              requested: ['payments:write'],
              missing: ['payments:write'],
            },
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const codes = view.routes[0]?.exclusionReasons.map((reason) => reason.code) ?? [];
    expect(codes).toContain('AUTHORIZATION_NOT_ACTIVE');
    expect(codes).toContain('INSTANCE_INELIGIBLE');
    expect(codes).toContain('MISSING_PERMISSIONS');
    expect(codes).toContain('INSTANCE_GEOGRAPHY_NOT_SERVED');
    const ineligible = view.routes[0]?.exclusionReasons.find(
      (reason) => reason.code === 'INSTANCE_INELIGIBLE',
    );
    expect(ineligible?.detail).toMatchObject({ reasons: ['kyc-tier-2-required'] });
  });

  it('UNKNOWN availability/eligibility fail-closes with RELIABILITY cause (never success)', () => {
    const view = projectCorridor({
      routes: [
        route({
          observation: healthyObservation({
            capabilityState: 'AVAILABLE',
            sourceAvailability: 'UNREACHABLE',
            availability: 'UNKNOWN',
            eligibility: 'UNKNOWN',
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const codes = view.routes[0]?.exclusionReasons.map((reason) => reason.code) ?? [];
    expect(codes).toContain('AVAILABILITY_UNKNOWN');
    expect(codes).toContain('OBSERVATION_ELIGIBILITY_UNKNOWN');
    expect(view.routes[0]?.eligible).toBe(false);
  });

  it('STALE_OBSERVATION excludes by freshness policy (age vs maxAgeSeconds, data-only)', () => {
    const view = projectCorridor({
      routes: [route({ observation: healthyObservation({ observedAt: '2026-10-01T10:00:05Z' }) })],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const stale = view.routes[0]?.exclusionReasons.find(
      (reason) => reason.code === 'STALE_OBSERVATION',
    );
    expect(stale?.cause).toBe('FRESHNESS');
    expect(stale?.detail).toMatchObject({ ageSeconds: 8995 });
    expect(view.routes[0]?.eligible).toBe(false);
  });

  it('a future-dated observation is stale (never accepted)', () => {
    const view = projectCorridor({
      routes: [route({ observation: healthyObservation({ observedAt: '2026-10-02T12:00:05Z' }) })],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    expect(
      view.routes[0]?.exclusionReasons.some((reason) => reason.code === 'STALE_OBSERVATION'),
    ).toBe(true);
  });

  it('restriction exclusions: country/currency/customer/amount/methods/fields', () => {
    const restricted = eurGbpRestrictionSet({
      restrictionSetId: 'rs:strict',
      sourceCountries: ['FR'],
      customerTypes: ['BUSINESS'],
      fundingMethods: ['card'],
      amountLimits: { min: { currency: 'EUR', minorUnits: '1000000' } },
      requiredFields: [
        { fieldId: 'recipient.iban', description: 'IBAN', appliesTo: 'RECIPIENT' },
        { fieldId: 'recipient.bic', description: 'BIC', appliesTo: 'RECIPIENT' },
      ],
    });
    const definitionWithRestrictions = executableDefinition({
      execution: fullExecutionDeclaration({
        jurisdictionEligibility: {
          declaredVia: 'RESTRICTION_SET',
          restrictionSet: restricted,
        },
      }),
    });
    const view = projectCorridor({
      routes: [route({ definition: definitionWithRestrictions })],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const codes = view.routes[0]?.exclusionReasons.map((reason) => reason.code) ?? [];
    expect(codes).toContain('SOURCE_COUNTRY_NOT_SERVED');
    expect(codes).toContain('CUSTOMER_TYPE_NOT_SERVED');
    expect(codes).toContain('FUNDING_METHOD_NOT_SERVED');
    expect(codes).toContain('AMOUNT_BELOW_MINIMUM');
    expect(codes).toContain('MISSING_REQUIRED_FIELDS');
    const missing = view.routes[0]?.exclusionReasons.find(
      (reason) => reason.code === 'MISSING_REQUIRED_FIELDS',
    );
    expect(missing?.detail).toMatchObject({ missingFields: ['recipient.bic'] });
    expect(view.routes[0]?.eligible).toBe(false);
  });

  it('cutoffs exclude after the cutoff time on applicable days (CALENDAR + BUSINESS rules)', () => {
    const withCutoffs = eurGbpRestrictionSet({
      restrictionSetId: 'rs:cutoffs',
      cutoffs: [
        {
          cutoffId: 'cutoff:payout-eod',
          description: 'EOD',
          appliesTo: 'PAYOUT',
          cutoffTimeUtc: '12:00',
          processingDayRule: 'CALENDAR_DAYS',
        },
      ],
    });
    const definitionWithCutoffs = executableDefinition({
      execution: fullExecutionDeclaration({
        jurisdictionEligibility: {
          declaredVia: 'RESTRICTION_SET',
          restrictionSet: withCutoffs,
        },
      }),
    });
    // asOf 12:30 is after the 12:00 cutoff
    const late = projectCorridor({
      routes: [route({ definition: definitionWithCutoffs })],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    expect(
      late.routes[0]?.exclusionReasons.some((reason) => reason.code === 'CUTOFF_PASSED'),
    ).toBe(true);
    // asOf 11:30 is before it (observation re-stamped to stay fresh)
    const early = projectCorridor({
      routes: [
        route({
          definition: definitionWithCutoffs,
          observation: healthyObservation({ observedAt: '2026-10-01T11:25:00Z' }),
        }),
      ],
      query: { ...QUERY, asOf: '2026-10-01T11:30:00Z' },
      freshnessPolicy: FRESHNESS,
    });
    expect(early.routes[0]?.eligible).toBe(true);
  });

  it('a weekend asOf never trips a BUSINESS_DAYS cutoff (delivery-estimate concern)', () => {
    // 2026-10-03 is a Saturday
    const businessCutoff = eurGbpRestrictionSet({
      restrictionSetId: 'rs:business',
      cutoffs: [
        {
          cutoffId: 'cutoff:weekday',
          description: 'weekday cutoff',
          appliesTo: 'PAYOUT',
          cutoffTimeUtc: '00:00',
          processingDayRule: 'BUSINESS_DAYS',
        },
      ],
    });
    const definitionWithCutoff = executableDefinition({
      execution: fullExecutionDeclaration({
        jurisdictionEligibility: {
          declaredVia: 'RESTRICTION_SET',
          restrictionSet: businessCutoff,
        },
      }),
    });
    const view = projectCorridor({
      routes: [
        route({
          definition: definitionWithCutoff,
          observation: healthyObservation({ observedAt: '2026-10-03T08:00:05Z' }),
        }),
      ],
      query: { ...QUERY, asOf: '2026-10-03T09:00:00Z' },
      freshnessPolicy: { maxAgeSeconds: 86400 },
    });
    expect(view.routes[0]?.exclusionReasons).toEqual([]);
  });

  it('quota exhaustion and unavailability exclude with CAPACITY cause', () => {
    const view = projectCorridor({
      routes: [
        route({
          observation: healthyObservation({
            capabilityState: 'UNAVAILABLE',
            availability: 'UNAVAILABLE',
            quota: { limit: 100, remaining: 0 },
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const codes = view.routes[0]?.exclusionReasons.map((reason) => reason.code) ?? [];
    expect(codes).toContain('AVAILABILITY_UNAVAILABLE');
    expect(codes).toContain('QUOTA_EXHAUSTED');
    for (const reason of view.routes[0]?.exclusionReasons ?? []) {
      if (reason.code === 'AVAILABILITY_UNAVAILABLE' || reason.code === 'QUOTA_EXHAUSTED') {
        expect(reason.cause).toBe('CAPACITY');
      }
    }
  });

  it('a DEGRADED route stays ELIGIBLE but flagged degraded', () => {
    const view = projectCorridor({
      routes: [
        route({
          observation: healthyObservation({
            capabilityState: 'DEGRADED',
            availability: 'DEGRADED',
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    expect(view.routes[0]?.eligible).toBe(true);
    expect(view.routes[0]?.degraded).toBe(true);
    expect(view.eligibleRoutes).toHaveLength(1);
  });

  it('a non-executable definition cannot be an eligible route', () => {
    const view = projectCorridor({
      routes: [
        route({
          definition: nonExecutableDefinition(),
          instance: connectedInstance({ capabilityId: 'cap:sepa-scheme-info' }),
          implementation: providerImplementation({
            capabilityId: 'cap:sepa-scheme-info',
          }),
        }),
      ],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const notExecutable = view.routes[0]?.exclusionReasons.find(
      (reason) => reason.code === 'NOT_EXECUTABLE_CAPABILITY',
    );
    expect(notExecutable?.layer).toBe('DEFINITION');
    expect(view.routes[0]?.eligible).toBe(false);
  });

  it('implementation-level restrictions also gate the route (conjunction of layers)', () => {
    const view = projectCorridor({
      routes: [
        route({
          implementation: providerImplementation({
            restrictionSet: eurGbpRestrictionSet({
              restrictionSetId: 'rs:psp-a-narrow',
              destinationCountries: ['DE', 'FR', 'NL'],
            }),
          }),
        }),
      ],
      query: { ...QUERY, destinationCountry: 'GB' },
      freshnessPolicy: FRESHNESS,
    });
    expect(
      view.routes[0]?.exclusionReasons.some(
        (reason) => reason.code === 'DESTINATION_COUNTRY_NOT_SERVED',
      ),
    ).toBe(true);
  });
});
