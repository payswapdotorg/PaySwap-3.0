/**
 * Corridor projection — the deterministic per-route evaluation engine
 * (P2-W1; NET-NEW, Wise §4.1 discipline).
 *
 * evaluateCorridorRoute is a PURE function: same (route input, query,
 * policy) -> same exclusions, always. It reads NO clock, NO network, NO
 * randomness: freshness and cutoffs are evaluated against the caller
 * supplied asOf timestamp (data), and all scope checks are set/interval
 * memberships over the versioned contracts.
 *
 * Check ORDER is fixed (documented, test-pinned) and ALL violated checks
 * are surfaced — an excluded route shows every reason, never just the
 * first. The engine never MUTATES inputs and never FABRICATES data: a
 * missing observation value (e.g. UNKNOWN eligibility) fail-closes the
 * route with an explicit code.
 */

import { resolveEffectiveAvailability } from './availability.ts';
import type { EffectiveAvailability } from './availability.ts';
import { parseIsoUtcTimestamp, secondsBetween } from './canonical.ts';
import type { ExecutionMode } from './execution-modes.ts';
import type { ConnectedCapabilityInstance } from './connected-instance.ts';
import type { CapabilityObservation } from './observation.ts';
import type { CapabilityDefinition, ExecutableCapabilityDefinition } from './capability-definition.ts';
import type { ProviderImplementation } from './provider-implementation.ts';
import type { CorridorRestrictionSet, CorridorTermsReference, RequiredFieldDeclaration } from './restrictions.ts';
import type { CorridorExclusion, CorridorQuery, ObservationFreshnessPolicy } from './corridor-types.ts';
import { collectRequiredFields, evaluateRestrictionSet } from './corridor-restriction-eval.ts';
import { isNonEmptyString } from './shared.ts';

function exclusion(
  code: CorridorExclusion['code'],
  cause: CorridorExclusion['cause'],
  layer: CorridorExclusion['layer'],
  message: string,
  detail?: Readonly<Record<string, unknown>>,
): CorridorExclusion {
  return { code, cause, layer, message, ...(detail !== undefined ? { detail } : {}) };
}

/** Fixed check order (documented; tests pin it). */
const CHECK_ORDER = [
  'authorization',
  'instanceEligibility',
  'permissions',
  'instanceGeography',
  'instanceCurrencies',
  'implementationScope',
  'availability',
  'observationEligibility',
  'freshness',
  'quota',
  'definitionRestrictions',
  'implementationRestrictions',
  'definitionExecutability',
] as const;

/** The deterministic per-route evaluation input. */
export interface CorridorRouteInput {
  readonly definition: CapabilityDefinition;
  readonly implementation: ProviderImplementation;
  readonly instance: ConnectedCapabilityInstance;
  readonly observation: CapabilityObservation;
  /** Caller-supplied certification going-forward flag (evidence, never authority). */
  readonly certified?: boolean;
}

export interface CorridorRouteEvaluationResult {
  readonly exclusions: readonly CorridorExclusion[];
  readonly degraded: boolean;
  readonly effectiveAvailability: EffectiveAvailability;
  readonly restrictionSets: readonly CorridorRestrictionSet[];
  readonly offeredExecutionModes: readonly ExecutionMode[];
  readonly termsRefs: readonly CorridorTermsReference[];
  readonly requiredFields: readonly RequiredFieldDeclaration[];
}

/**
 * Evaluate ONE route deterministically. Every violated check contributes an
 * exclusion; the route is eligible iff the exclusion list is empty.
 */
export function evaluateCorridorRoute(
  route: CorridorRouteInput,
  query: CorridorQuery,
  policy: ObservationFreshnessPolicy,
): CorridorRouteEvaluationResult {
  const exclusions: CorridorExclusion[] = [];
  const { instance, implementation, definition, observation } = route;

  // 1. authorization (layer INSTANCE): only ACTIVE may serve an eligible route.
  if (instance.authorization.status !== 'ACTIVE') {
    exclusions.push(
      exclusion(
        'AUTHORIZATION_NOT_ACTIVE',
        'CAPABILITY',
        'INSTANCE',
        `connected instance authorization is '${instance.authorization.status}' (only ACTIVE can serve an eligible route)`,
        { instanceId: instance.instanceId, status: instance.authorization.status },
      ),
    );
  }

  // 2. instance eligibility (provider-declared account eligibility).
  if (instance.eligibility.eligible !== true) {
    exclusions.push(
      exclusion(
        'INSTANCE_INELIGIBLE',
        'REGULATORY',
        'INSTANCE',
        `the connected account is not eligible for this capability${instance.eligibility.reasons.length > 0 ? `: ${instance.eligibility.reasons.join('; ')}` : ''}`,
        { instanceId: instance.instanceId, reasons: [...instance.eligibility.reasons] },
      ),
    );
  }

  // 3. permissions: every scope the executable declaration requires is granted.
  const requiredScopes = executableDeclaration(definition)?.authorizationRequirements.requiredScopes ?? [];
  const granted = new Set(instance.permissionState.granted);
  const missingScopes = requiredScopes.filter((scope) => !granted.has(scope));
  if (missingScopes.length > 0) {
    exclusions.push(
      exclusion(
        'MISSING_PERMISSIONS',
        'CAPABILITY',
        'INSTANCE',
        `the connection lacks required permission scopes: ${missingScopes.join(', ')}`,
        { instanceId: instance.instanceId, missingScopes: [...missingScopes] },
      ),
    );
  }

  // 4. instance geography.
  if (!instance.geography.countries.includes(query.sourceCountry)) {
    exclusions.push(
      exclusion(
        'INSTANCE_GEOGRAPHY_NOT_SERVED',
        'CAPABILITY',
        'INSTANCE',
        `source country '${query.sourceCountry}' is outside the connected instance geography [${instance.geography.countries.join(', ')}]`,
        { instanceId: instance.instanceId, sourceCountry: query.sourceCountry },
      ),
    );
  }

  // 5. instance currencies (both source and target must be in scope).
  if (!instance.currencies.includes(query.sourceCurrency)) {
    exclusions.push(
      exclusion(
        'INSTANCE_CURRENCY_NOT_SUPPORTED',
        'CAPABILITY',
        'INSTANCE',
        `source currency '${query.sourceCurrency}' is not supported by the connected instance [${instance.currencies.join(', ')}]`,
        { instanceId: instance.instanceId, currency: query.sourceCurrency },
      ),
    );
  }
  if (!instance.currencies.includes(query.destinationCurrency)) {
    exclusions.push(
      exclusion(
        'INSTANCE_CURRENCY_NOT_SUPPORTED',
        'CAPABILITY',
        'INSTANCE',
        `destination currency '${query.destinationCurrency}' is not supported by the connected instance [${instance.currencies.join(', ')}]`,
        { instanceId: instance.instanceId, currency: query.destinationCurrency },
      ),
    );
  }

  // 6. implementation corridor scopes (advisory provider claims — evaluated
  //    only when the implementation declares at least one corridor scope;
  //    a claim can never make an unsupported route executable).
  if (implementation.corridors.length > 0) {
    const fromOk =
      implementation.corridors.some(
        (scope) =>
          scope.fromCountries === undefined ||
          scope.fromCountries.includes(query.sourceCountry),
      ) &&
      implementation.corridors.some(
        (scope) =>
          scope.toCountries === undefined ||
          scope.toCountries.includes(query.destinationCountry),
      );
    const currencyOk = implementation.corridors.some(
      (scope) =>
        scope.currencies === undefined ||
        (scope.currencies.includes(query.sourceCurrency) &&
          scope.currencies.includes(query.destinationCurrency)),
    );
    if (!fromOk || !currencyOk) {
      exclusions.push(
        exclusion(
          'IMPLEMENTATION_SCOPE_NOT_SERVED',
          'CAPABILITY',
          'IMPLEMENTATION',
          `the implementation's declared corridor scopes do not cover ${query.sourceCountry}->${query.destinationCountry} ${query.sourceCurrency}/${query.destinationCurrency}`,
          { implementationId: implementation.implementationId },
        ),
      );
    }
  }

  // 7. availability (two-axis, DERIVED — never caller-fabricated).
  const availability = resolveEffectiveAvailability(
    observation.capabilityState,
    observation.sourceAvailability,
  );
  if (availability === 'UNAVAILABLE') {
    exclusions.push(
      exclusion(
        'AVAILABILITY_UNAVAILABLE',
        'CAPACITY',
        'OBSERVATION',
        `the capability reports UNAVAILABLE (observation version ${observation.observationVersion})`,
        { instanceId: instance.instanceId, observationVersion: observation.observationVersion },
      ),
    );
  } else if (availability === 'UNKNOWN') {
    exclusions.push(
      exclusion(
        'AVAILABILITY_UNKNOWN',
        'RELIABILITY',
        'OBSERVATION',
        `the capability's current reachability cannot be established (source '${observation.sourceAvailability}') — never success, never failure; reconcile before use`,
        { instanceId: instance.instanceId, sourceAvailability: observation.sourceAvailability },
      ),
    );
  }

  // 8. observation eligibility (fail-closed on UNKNOWN).
  if (observation.eligibility === 'NOT_ELIGIBLE') {
    exclusions.push(
      exclusion(
        'OBSERVATION_NOT_ELIGIBLE',
        'REGULATORY',
        'OBSERVATION',
        'the fresh provider observation reports the route NOT_ELIGIBLE',
        { instanceId: instance.instanceId },
      ),
    );
  } else if (observation.eligibility === 'UNKNOWN') {
    exclusions.push(
      exclusion(
        'OBSERVATION_ELIGIBILITY_UNKNOWN',
        'RELIABILITY',
        'OBSERVATION',
        'the fresh provider observation could not determine eligibility (fail-closed)',
        { instanceId: instance.instanceId },
      ),
    );
  }

  // 9. freshness (asOf and observedAt are DATA; the engine reads no clock).
  const observedAt = parseIsoUtcTimestamp(observation.observedAt, 'observation.observedAt');
  const asOf = parseIsoUtcTimestamp(query.asOf, 'query.asOf');
  const ageSeconds = secondsBetween(asOf, observedAt);
  if (ageSeconds < 0) {
    exclusions.push(
      exclusion(
        'STALE_OBSERVATION',
        'FRESHNESS',
        'OBSERVATION',
        `observation is future-dated relative to asOf (observedAt ${observation.observedAt} > asOf ${query.asOf})`,
        { observedAt: observation.observedAt, asOf: query.asOf },
      ),
    );
  } else if (ageSeconds > policy.maxAgeSeconds) {
    exclusions.push(
      exclusion(
        'STALE_OBSERVATION',
        'FRESHNESS',
        'OBSERVATION',
        `observation age ${ageSeconds}s exceeds the freshness policy maxAgeSeconds=${policy.maxAgeSeconds}`,
        { observedAt: observation.observedAt, asOf: query.asOf, ageSeconds },
      ),
    );
  }

  // 10. quota (count-based; a count is not a balance and never custody).
  if (observation.quota !== undefined && observation.quota.remaining !== undefined) {
    if (observation.quota.remaining <= 0) {
      exclusions.push(
        exclusion(
          'QUOTA_EXHAUSTED',
          'CAPACITY',
          'OBSERVATION',
          `the provider reports no remaining quota (remaining=${observation.quota.remaining})`,
          { instanceId: instance.instanceId, remaining: observation.quota.remaining },
        ),
      );
    }
  }

  // 11-12. restriction sets (definition-level, then implementation-level).
  const restrictionSets: CorridorRestrictionSet[] = [];
  const declaration = executableDeclaration(definition);
  if (declaration?.jurisdictionEligibility.declaredVia === 'RESTRICTION_SET') {
    restrictionSets.push(declaration.jurisdictionEligibility.restrictionSet);
  }
  if (implementation.restrictionSet !== undefined) {
    restrictionSets.push(implementation.restrictionSet);
  }
  for (const set of restrictionSets) {
    evaluateRestrictionSet(set, query, exclusions);
  }

  // 13. executability: a corridor route is an EXECUTION surface; an
  //     informational/acceptance definition cannot be one.
  if (declaration === undefined) {
    exclusions.push(
      exclusion(
        'NOT_EXECUTABLE_CAPABILITY',
        'CAPABILITY',
        'DEFINITION',
        `the referenced capability definition is not executable${definition.executable === false ? ` (${definition.nonExecutableReason})` : ''}`,
        { definitionId: definition.id },
      ),
    );
  }

  const offeredExecutionModes: readonly ExecutionMode[] =
    declaration !== undefined ? [...declaration.executionModes] : [];
  const termsRefs: CorridorTermsReference[] = restrictionSets
    .map((set) => set.terms)
    .filter((terms): terms is CorridorTermsReference => terms !== undefined);
  const requiredFields = collectRequiredFields(restrictionSets);

  return {
    exclusions,
    degraded: availability === 'DEGRADED',
    effectiveAvailability: availability,
    restrictionSets,
    offeredExecutionModes,
    termsRefs,
    requiredFields,
  };
}

function executableDeclaration(
  definition: CapabilityDefinition,
): ExecutableCapabilityDefinition['execution'] | undefined {
  return definition.executable === true ? definition.execution : undefined;
}

// Exposed for test pinning of the documented check order.
export const CORRIDOR_CHECK_ORDER: readonly string[] = CHECK_ORDER;
