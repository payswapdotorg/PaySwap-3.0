import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  projectCorridor,
  validateCorridorProjectionInput,
  assertCorridorViewCarriesNoAuthorization,
  corridorViewIsNotAnExecutionRequest,
  containsAuthorizationMaterial,
  validateExecutionRequest,
} from '../src/index.ts';
import type { CorridorQuery, CorridorRouteInput, CorridorView } from '../src/index.ts';
import {
  executableDefinition,
  nonExecutableDefinition,
  providerImplementation,
  connectedInstance,
  healthyObservation,
} from './fixtures.ts';

/**
 * Corridor projection LAWS (continuation of corridor.test.ts): fail-closed
 * input validation (mismatched lineage is never silently skipped) and the
 * NO-AUTHORIZATION-LEAKAGE family (a corridor view is evidence, never
 * authority, and can never make an unsupported route executable).
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

describe('DETERMINISM: identical inputs produce the identical view', () => {
  const input = {
    routes: [
      route(),
      route({
        instance: connectedInstance({ instanceId: 'inst:acct-2' }),
        observation: healthyObservation({ instanceId: 'inst:acct-2' }),
      }),
    ],
    query: QUERY,
    freshnessPolicy: FRESHNESS,
  };

  it('repeated projection is structurally identical (deep equality, same order)', () => {
    const first: CorridorView = projectCorridor(input);
    const second: CorridorView = projectCorridor(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    // route order is the input order — the projection assigns NO ranking
    expect(first.routes.map((r) => r.routeId)).toEqual([
      'inst:acct-1-payments',
      'inst:acct-2',
    ]);
  });

  it('a changed input changes the output (no hidden memoization)', () => {
    const first = projectCorridor(input);
    const changed = projectCorridor({
      ...input,
      query: { ...QUERY, sendAmount: { currency: 'EUR', minorUnits: '999999999' } },
    });
    expect(changed.routes[0]?.eligible).toBe(false);
    expect(first.routes[0]?.eligible).toBe(true);
  });
});

describe('input validation is fail-closed (mismatched lineage is never silently skipped)', () => {
  it('rejects an observation for a different instance', () => {
    expect(() =>
      validateCorridorProjectionInput({
        routes: [route({ observation: healthyObservation({ instanceId: 'inst:other' }) })],
        query: QUERY,
        freshnessPolicy: FRESHNESS,
      }),
    ).toThrow(/observation instanceId/);
  });

  it('rejects an instance pointing at a different implementation', () => {
    expect(() =>
      validateCorridorProjectionInput({
        routes: [
          route({ instance: connectedInstance({ implementationId: 'impl:other' }) }),
        ],
        query: QUERY,
        freshnessPolicy: FRESHNESS,
      }),
    ).toThrow(/instance implementationId/);
  });

  it('rejects definition/implementation version drift (exact pin law)', () => {
    expect(() =>
      validateCorridorProjectionInput({
        routes: [
          route({
            implementation: providerImplementation({ capabilityVersion: '1.4.1' }),
          }),
        ],
        query: QUERY,
        freshnessPolicy: FRESHNESS,
      }),
    ).toThrow(/exact version pin law/);
  });

  it('rejects a malformed query and freshness policy', () => {
    expect(() =>
      validateCorridorProjectionInput({
        routes: [],
        query: { ...QUERY, sourceCountry: 'DEU' },
        freshnessPolicy: FRESHNESS,
      }),
    ).toThrow(/sourceCountry/);
    expect(() =>
      validateCorridorProjectionInput({
        routes: [],
        query: { ...QUERY, asOf: '2026-10-01 12:00:00' },
        freshnessPolicy: FRESHNESS,
      }),
    ).toThrow(/ISO-8601/);
    expect(() =>
      validateCorridorProjectionInput({
        routes: [],
        query: QUERY,
        freshnessPolicy: { maxAgeSeconds: 0 },
      }),
    ).toThrow(/maxAgeSeconds/);
  });
});

describe('NO AUTHORIZATION LEAKAGE (the view is evidence, never authority)', () => {
  it('the view carries no authorization/credential material (deep scan)', () => {
    const view = projectCorridor({
      routes: [route()],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    expect(containsAuthorizationMaterial(view)).toBe(false);
    expect(() => assertCorridorViewCarriesNoAuthorization(view)).not.toThrow();
    expect(JSON.stringify(view)).not.toMatch(/credential|secret|password|token|apikey/i);
  });

  it('the guard rejects a view carrying injected credential material', () => {
    const view = projectCorridor({
      routes: [route()],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const polluted = {
      ...view,
      routes: [...view.routes, { routeId: 'x', credentialRef: 'cred:leak' }],
    } as CorridorView;
    expect(containsAuthorizationMaterial(polluted)).toBe(true);
    expect(() => assertCorridorViewCarriesNoAuthorization(polluted)).toThrow(
      /discovery projection, never an authority/,
    );
  });

  it('a CorridorView is NOT an execution request — it can NEVER make a route executable', () => {
    const view = projectCorridor({
      routes: [route()],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    expect(corridorViewIsNotAnExecutionRequest(view)).toBe(true);
    // directly: validateExecutionRequest rejects the view
    const validation = validateExecutionRequest(view as unknown);
    expect(validation.ok).toBe(false);
    // and an eligible route evaluation object is equally NOT an execution request
    const eligible = view.eligibleRoutes[0] as unknown;
    expect(validateExecutionRequest(eligible).ok).toBe(false);
  });

  it('an ELIGIBLE corridor route grants no execution authority — authorization still required', () => {
    const view = projectCorridor({
      routes: [route()],
      query: QUERY,
      freshnessPolicy: FRESHNESS,
    });
    const eligible = view.eligibleRoutes[0];
    expect(eligible?.eligible).toBe(true);
    // Attempting to convert the evaluation into an execution request fails:
    // no idempotency key, no provider request, no protocol authorization.
    const forged = {
      executionMode: 'PASS_THROUGH_NATIVE',
      modeVocabularyVersion: '1.0.0',
      capabilityInstanceId: eligible?.lineage.connectedInstanceId,
      ...(eligible as unknown as Record<string, unknown>),
    };
    const validation = validateExecutionRequest(forged);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.violations.join(' ')).toMatch(/protocolAuthorization is required/);
    }
  });
});
