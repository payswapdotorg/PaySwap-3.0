/**
 * Corridor-aware eligibility — the discovery projection (P2-W1; NET-NEW,
 * Wise §4.1 discipline; work-order scope item 6).
 *
 * projectCorridor(...) is a DETERMINISTIC, VERSIONED projection:
 * - ELIGIBILITY IS DERIVED, never asserted: the same routes + query +
 *   freshness policy always produce the identical view (pure function, no
 *   clock/network/randomness — asOf and observation stamps are DATA);
 * - EXCLUSION REASONS ARE SURFACED: every excluded route carries every
 *   violated check (code + cause + layer + detail), never just the first;
 * - NO AUTHORIZATION LEAKAGE: the view contains ONLY discovery lineage
 *   (ids/versions/observation refs) and terms references — no credentials,
 *   no authorization artifacts, no provider secrets; and the view is
 *   structurally NOT an execution request (validateExecutionRequest
 *   rejects it — a corridor can NEVER make an unsupported route
 *   executable);
 * - A CORRIDOR IS NOT A NEW AUTHORITY: eligibility output is EVIDENCE for
 *   discovery; execution still requires a ConnectedCapabilityInstance +
 *   explicit execution mode + protocol authorization (execution-modes.ts,
 *   INV-13/INV-15 laws).
 *
 * A corridor is NOT a currency pair alone: the query carries
 * country/currency, customer type, amount, methods, recipient type,
 * presented fields, and evaluation time; the projection evaluates the
 * versioned capability + restrictions + fresh observation conjunction.
 */

import { ValidationError } from './errors.ts';
import { validateExecutionRequest } from './execution-modes.ts';
import { validateCapabilityDefinition } from './definition-validation.ts';
import { validateProviderImplementation } from './provider-implementation.ts';
import { validateConnectedCapabilityInstance } from './connected-instance.ts';
import { validateCapabilityObservation } from './observation.ts';
import { evaluateCorridorRoute } from './corridor-evaluation.ts';
import type { CorridorRouteInput } from './corridor-evaluation.ts';
import type {
  CorridorQuery,
  CorridorRouteEvaluation,
  CorridorView,
  ObservationFreshnessPolicy,
} from './corridor-types.ts';
import { CORRIDOR_PROJECTION_VERSION } from './corridor-types.ts';
import { parseIsoUtcTimestamp } from './canonical.ts';
import { cloneAndFreeze } from './shared.ts';

/** The full projection input: routes + query + freshness policy. */
export interface CorridorProjectionInput {
  readonly routes: readonly CorridorRouteInput[];
  readonly query: CorridorQuery;
  readonly freshnessPolicy: ObservationFreshnessPolicy;
}

/**
 * Validate the projection input fail-closed: the query shape (countries,
 * currencies, customer type, send amount, strict ISO asOf), the freshness
 * policy, and every route's four-layer chain (definition ->
 * implementation -> instance -> observation must reference each other
 * consistently). Mismatched lineage is a ValidationError, never a silently
 * skipped route.
 */
export function validateCorridorProjectionInput(
  input: CorridorProjectionInput,
): void {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('corridor projection input must be an object');
  }
  const query = input.query;
  if (query === null || typeof query !== 'object') {
    throw new ValidationError('corridor projection requires a query');
  }
  if (typeof query.sourceCountry !== 'string' || query.sourceCountry.length !== 2) {
    throw new ValidationError('query.sourceCountry must be an ISO 3166-1 alpha-2 code');
  }
  if (typeof query.destinationCountry !== 'string' || query.destinationCountry.length !== 2) {
    throw new ValidationError('query.destinationCountry must be an ISO 3166-1 alpha-2 code');
  }
  if (typeof query.sourceCurrency !== 'string' || query.sourceCurrency.length !== 3) {
    throw new ValidationError('query.sourceCurrency must be a 3-letter currency code');
  }
  if (typeof query.destinationCurrency !== 'string' || query.destinationCurrency.length !== 3) {
    throw new ValidationError('query.destinationCurrency must be a 3-letter currency code');
  }
  if (query.customerType !== 'PERSONAL' && query.customerType !== 'BUSINESS') {
    throw new ValidationError('query.customerType must be PERSONAL or BUSINESS');
  }
  if (
    query.sendAmount === null ||
    typeof query.sendAmount !== 'object' ||
    typeof query.sendAmount.currency !== 'string' ||
    typeof query.sendAmount.minorUnits !== 'string'
  ) {
    throw new ValidationError('query.sendAmount must be an AmountSpec (pinned wire type)');
  }
  parseIsoUtcTimestamp(query.asOf, 'query.asOf');
  if (
    input.freshnessPolicy === null ||
    typeof input.freshnessPolicy !== 'object' ||
    typeof input.freshnessPolicy.maxAgeSeconds !== 'number' ||
    !Number.isInteger(input.freshnessPolicy.maxAgeSeconds) ||
    input.freshnessPolicy.maxAgeSeconds < 1
  ) {
    throw new ValidationError('freshnessPolicy.maxAgeSeconds must be a positive integer');
  }
  if (!Array.isArray(input.routes)) {
    throw new ValidationError('routes must be an array of CorridorRouteInput');
  }
  for (const [index, route] of input.routes.entries()) {
    const definition = validateCapabilityDefinition(route.definition);
    const implementation = validateProviderImplementation(route.implementation);
    const instance = validateConnectedCapabilityInstance(route.instance);
    const observation = validateCapabilityObservation(route.observation);
    if (observation.instanceId !== instance.instanceId) {
      throw new ValidationError(
        `routes[${index}]: observation instanceId '${observation.instanceId}' does not match the connected instance '${instance.instanceId}'`,
      );
    }
    if (instance.implementationId !== implementation.implementationId) {
      throw new ValidationError(
        `routes[${index}]: instance implementationId '${instance.implementationId}' does not match the route implementation '${implementation.implementationId}'`,
      );
    }
    if (instance.capabilityId !== definition.id) {
      throw new ValidationError(
        `routes[${index}]: instance capabilityId '${instance.capabilityId}' does not match the definition '${definition.id}'`,
      );
    }
    if (implementation.capabilityId !== definition.id) {
      throw new ValidationError(
        `routes[${index}]: implementation capabilityId '${implementation.capabilityId}' does not match the definition '${definition.id}'`,
      );
    }
    if (implementation.capabilityVersion !== definition.version) {
      throw new ValidationError(
        `routes[${index}]: implementation pins definition version '${implementation.capabilityVersion}' but the definition is '${definition.version}' (exact version pin law)`,
      );
    }
  }
}

/**
 * THE PROJECTION. Deterministic and versioned: identical inputs produce a
 * structurally identical CorridorView (pinned by tests). Route order in the
 * view is the input order — the projection assigns NO ranking (ranking is
 * the route-compiler lane's concern, P5-W1).
 */
export function projectCorridor(input: CorridorProjectionInput): CorridorView {
  validateCorridorProjectionInput(input);
  const routeEvaluations: CorridorRouteEvaluation[] = input.routes.map((route) => {
    const result = evaluateCorridorRoute(route, input.query, input.freshnessPolicy);
    const evaluation: CorridorRouteEvaluation = Object.freeze({
      routeId: route.instance.instanceId,
      eligible: result.exclusions.length === 0,
      exclusionReasons: Object.freeze([...result.exclusions]),
      degraded: result.degraded,
      effectiveAvailability: result.effectiveAvailability,
      lineage: Object.freeze({
        capabilityDefinitionId: route.definition.id,
        capabilityDefinitionVersion: route.definition.version,
        providerImplementationId: route.implementation.implementationId,
        implementationVersion: route.implementation.version,
        connectedInstanceId: route.instance.instanceId,
        providerName: route.instance.providerName,
        providerVersion: route.instance.providerVersion,
        observationVersion: route.observation.observationVersion,
        observedAt: route.observation.observedAt,
        restrictionSetIds: Object.freeze(
          result.restrictionSets.map((set) => `${set.restrictionSetId}@${set.version}`),
        ),
      }),
      offeredExecutionModes: Object.freeze([...result.offeredExecutionModes]),
      termsRefs: Object.freeze([...result.termsRefs]),
      requiredFields: Object.freeze([...result.requiredFields]),
      certified: route.certified,
    });
    return evaluation;
  });
  const view: CorridorView = Object.freeze({
    projectionVersion: CORRIDOR_PROJECTION_VERSION,
    query: cloneAndFreeze(input.query),
    evaluatedAsOf: input.query.asOf,
    freshnessPolicy: Object.freeze({ ...input.freshnessPolicy }),
    routes: Object.freeze(routeEvaluations),
    eligibleRoutes: Object.freeze(routeEvaluations.filter((route) => route.eligible)),
  });
  return view;
}

// ---------------------------------------------------------------------------
// No-authorization-leakage laws (work-order scope item 6)
// ---------------------------------------------------------------------------

/**
 * Key denylist for the leakage scan: any object key matching one of these
 * patterns marks authorization/credential material that must NEVER appear
 * in a corridor view (INV-19 boundary + corridor evidence-not-authorization
 * law).
 */
const AUTHORIZATION_MATERIAL_KEY_PATTERN =
  /(credential|secret|password|token|apikey|api_key|privatekey|private_key|cookie|mnemonic|seedphrase|seed_phrase|sessionkey|session_key)/i;

/**
 * Deep structural scan: does the value carry any authorization/credential
 * material under a denylisted key? Recursive over JSON-ish structures.
 */
export function containsAuthorizationMaterial(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsAuthorizationMaterial(item));
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (AUTHORIZATION_MATERIAL_KEY_PATTERN.test(key)) {
        return true;
      }
      if (containsAuthorizationMaterial(child)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * LAW: a corridor view must carry NO authorization material. Throws
 * ValidationError naming the offender if the scan finds any. The view's
 * type surface already excludes authorization fields; this guard defends
 * untyped construction paths and gives tests a machine-checkable surface.
 */
export function assertCorridorViewCarriesNoAuthorization(view: CorridorView): void {
  if (containsAuthorizationMaterial(view)) {
    throw new ValidationError(
      'corridor view carries authorization/credential material — a corridor is a discovery projection, never an authority (no credentialRef, token, secret or authorization artifact may leak into the view)',
    );
  }
}

/**
 * LAW: a corridor view is NOT an execution request (an unsupported route
 * can never become executable through the projection). Returns true iff
 * the view would be REJECTED as an execution request — i.e. the fabric
 * holds. Exported so tests (and the runtime lane) can pin the law.
 */
export function corridorViewIsNotAnExecutionRequest(view: CorridorView): boolean {
  const asRequest: unknown = view;
  const validation = validateExecutionRequest(asRequest);
  return validation.ok === false;
}
