/**
 * @payswap/provider-runtime — connection scope (P2-W2).
 *
 * A connection scope is WHAT A CONNECTION IS ALLOWED TO DO: the operation
 * classes it may exercise, the effect classes those operations may carry,
 * and the OPAQUE capability references it was scoped to. This is the
 * admission surface the execution bridge consults BEFORE any dispatch
 * (fail-closed: an out-of-scope operation never reaches a transport).
 *
 * Scope law:
 * - `scopeAdmits` never invents permissions: every requested operation
 *   class must appear in `allowedOperations`, every requested effect class
 *   must be permitted by `allowedEffectClasses`, and every requested
 *   capability reference must match a scoped reference EXACTLY (ids +
 *   version — version drift is a different capability and is refused).
 * - An expired scope (`effectiveUntil` in the past) admits NOTHING.
 * - A scope with zero allowed operations admits nothing (explicit grant
 *   only, never implicit defaults).
 *
 * INV-13 adjacency: scope admission is over CONNECTED capability
 * references (opaque ids of connected instances), never catalogue entries —
 * a catalogue capability is not executable connected capability.
 */

import { ValidationError } from './errors.ts';
import type { TimestampMs } from './clock.ts';
import {
  sameCapabilityRef,
  validateCapabilityRef,
  type CapabilityRef,
} from './refs.ts';

/** The operation classes a connection may be scoped to perform. */
export const OPERATION_CLASSES = [
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
  'MANAGE_CONNECTION',
] as const;

export type OperationClass = (typeof OPERATION_CLASSES)[number];

export function isOperationClass(value: unknown): value is OperationClass {
  return (
    typeof value === 'string' && (OPERATION_CLASSES as readonly unknown[]).includes(value)
  );
}

/** The effect class an operation carries (state-changing vs observation-only vs none). */
export const EFFECT_CLASSES = ['NONE', 'OBSERVATION_ONLY', 'STATE_CHANGING'] as const;

export type EffectClass = (typeof EFFECT_CLASSES)[number];

export function isEffectClass(value: unknown): value is EffectClass {
  return typeof value === 'string' && (EFFECT_CLASSES as readonly unknown[]).includes(value);
}

/** Effect classes that can create or mutate EXTERNAL financial state. */
export const CONSEQUENTIAL_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'STATE_CHANGING',
]);

/** True when the effect class can change external state (consequential commands). */
export function isConsequentialEffectClass(effectClass: EffectClass): boolean {
  return CONSEQUENTIAL_EFFECT_CLASSES.includes(effectClass);
}

/** What a connection is allowed to do (its authorized operation surface). */
export interface ConnectionScope {
  /** Operation classes the connection may exercise (explicit grant only). */
  readonly allowedOperations: readonly OperationClass[];
  /** Effect classes the connection's operations may carry. */
  readonly allowedEffectClasses: readonly EffectClass[];
  /** Opaque capability references the connection is scoped to (exact-match admission). */
  readonly scopedCapabilities: readonly CapabilityRef[];
  /** Optional data classes (provider-neutral read grants, e.g. ACCOUNT_READ). */
  readonly allowedDataClasses?: readonly string[];
  /** Optional expiry: after this instant the scope admits nothing. */
  readonly effectiveUntil?: TimestampMs;
}

/** The operation a command wants to perform (the admission request). */
export interface ScopedOperationRequest {
  readonly operationClass: OperationClass;
  readonly effectClass: EffectClass;
  /** Capability reference the command exercises (optional for connection management). */
  readonly capability?: CapabilityRef;
}

/** Fail-closed admission decision with the exact refusal reason. */
export type ScopeAdmission =
  | { readonly kind: 'ADMITTED' }
  | {
      readonly kind: 'REFUSED';
      readonly reason:
        | 'OPERATION_CLASS_NOT_GRANTED'
        | 'EFFECT_CLASS_NOT_GRANTED'
        | 'CAPABILITY_NOT_IN_SCOPE'
        | 'CAPABILITY_VERSION_DRIFT'
        | 'SCOPE_EXPIRED'
        | 'EMPTY_SCOPE';
    };

function validateScopeShape(scope: ConnectionScope): void {
  if (scope === null || typeof scope !== 'object') {
    throw new ValidationError('connection scope must be a ConnectionScope object');
  }
  if (!Array.isArray(scope.allowedOperations) || scope.allowedOperations.length === 0) {
    // An empty scope is legal to DECLARE (a disabled connection), but it
    // admits nothing; we still require the array to be well-formed.
    if (!Array.isArray(scope.allowedOperations)) {
      throw new ValidationError('connection scope.allowedOperations must be an array');
    }
  }
  for (const operation of scope.allowedOperations) {
    if (!isOperationClass(operation)) {
      throw new ValidationError('scope.allowedOperations contains a non-canonical class', {
        operation,
      });
    }
  }
  if (!Array.isArray(scope.allowedEffectClasses)) {
    throw new ValidationError('connection scope.allowedEffectClasses must be an array');
  }
  for (const effect of scope.allowedEffectClasses) {
    if (!isEffectClass(effect)) {
      throw new ValidationError('scope.allowedEffectClasses contains a non-canonical class', {
        effect,
      });
    }
  }
  if (!Array.isArray(scope.scopedCapabilities)) {
    throw new ValidationError('connection scope.scopedCapabilities must be an array');
  }
  for (const ref of scope.scopedCapabilities) {
    validateCapabilityRef(ref);
  }
}

/**
 * The admission decision. Deterministic, pure, fail-closed: unknown or
 * expired scopes admit nothing, and capability references must match
 * exactly (a same-id/different-version reference is VERSION DRIFT — the
 * connection was scoped to a different revision of the capability).
 */
export function scopeAdmits(
  scope: ConnectionScope,
  request: ScopedOperationRequest,
  now: TimestampMs,
): ScopeAdmission {
  validateScopeShape(scope);
  if (request === null || typeof request !== 'object') {
    throw new ValidationError('scope admission requires a ScopedOperationRequest');
  }
  if (!isOperationClass(request.operationClass)) {
    throw new ValidationError('request.operationClass must be canonical', {
      operationClass: request.operationClass,
    });
  }
  if (!isEffectClass(request.effectClass)) {
    throw new ValidationError('request.effectClass must be canonical', {
      effectClass: request.effectClass,
    });
  }
  if (request.capability !== undefined) {
    validateCapabilityRef(request.capability);
  }

  if (scope.effectiveUntil !== undefined && now >= scope.effectiveUntil) {
    return { kind: 'REFUSED', reason: 'SCOPE_EXPIRED' };
  }
  if (scope.allowedOperations.length === 0) {
    return { kind: 'REFUSED', reason: 'EMPTY_SCOPE' };
  }
  if (!scope.allowedOperations.includes(request.operationClass)) {
    return { kind: 'REFUSED', reason: 'OPERATION_CLASS_NOT_GRANTED' };
  }
  if (!scope.allowedEffectClasses.includes(request.effectClass)) {
    return { kind: 'REFUSED', reason: 'EFFECT_CLASS_NOT_GRANTED' };
  }
  if (request.capability !== undefined) {
    const exact = scope.scopedCapabilities.find((ref) =>
      sameCapabilityRef(ref, request.capability as CapabilityRef),
    );
    if (exact === undefined) {
      const sameDefinition = scope.scopedCapabilities.some(
        (ref) =>
          ref.definitionId === (request.capability as CapabilityRef).definitionId &&
          ref.implementationId === (request.capability as CapabilityRef).implementationId,
      );
      return {
        kind: 'REFUSED',
        reason: sameDefinition ? 'CAPABILITY_VERSION_DRIFT' : 'CAPABILITY_NOT_IN_SCOPE',
      };
    }
  }
  return { kind: 'ADMITTED' };
}

/** Convenience predicate form. */
export function isAdmitted(
  scope: ConnectionScope,
  request: ScopedOperationRequest,
  now: TimestampMs,
): boolean {
  return scopeAdmits(scope, request, now).kind === 'ADMITTED';
}

/** Freeze a validated scope (immutable admission material). */
export function freezeConnectionScope(scope: ConnectionScope): ConnectionScope {
  validateScopeShape(scope);
  const frozen: { -readonly [K in keyof ConnectionScope]: ConnectionScope[K] } = {
    allowedOperations: Object.freeze([...scope.allowedOperations]),
    allowedEffectClasses: Object.freeze([...scope.allowedEffectClasses]),
    scopedCapabilities: Object.freeze(
      scope.scopedCapabilities.map((ref) => Object.freeze({ ...ref })),
    ),
  };
  if (scope.allowedDataClasses !== undefined) {
    frozen.allowedDataClasses = Object.freeze([...scope.allowedDataClasses]);
  }
  if (scope.effectiveUntil !== undefined) {
    frozen.effectiveUntil = scope.effectiveUntil;
  }
  return Object.freeze(frozen);
}

/** Structural scope comparison (used by connection update conflict checks). */
export function sameConnectionScope(a: ConnectionScope, b: ConnectionScope): boolean {
  const keyOf = (scope: ConnectionScope): string =>
    JSON.stringify([
      [...scope.allowedOperations].sort(),
      [...scope.allowedEffectClasses].sort(),
      scope.scopedCapabilities.map((ref) => `${ref.definitionId}|${ref.implementationId}|${ref.version}`).sort(),
      [...(scope.allowedDataClasses ?? [])].sort(),
      String(scope.effectiveUntil ?? null),
    ]);
  return keyOf(a) === keyOf(b);
}
