/**
 * @payswap/provider-runtime — connection lifecycle (P2-W2).
 *
 * Connection lifecycle states and the one lawful transition machine:
 *
 *   PROPOSED → PENDING_VERIFICATION → ACTIVE ⇄ DEGRADED
 *   ACTIVE/DEGRADED/SUSPENDED → EXPIRED | REVOKED | DISCONNECTED (terminal)
 *   PENDING_VERIFICATION → DISCONNECTED (abandoned before activation)
 *   SUSPENDED → ACTIVE (administrative resume)
 *
 * Laws:
 * - Terminal states are MONOTONIC (INV-03 discipline applied to the
 *   connection record): a disconnected/revoked/expired connection can
 *   never return to any live state.
 * - Only ACTIVE and DEGRADED connections admit EXECUTION; DEGRADED admits
 *   READ_PROVIDER_STATE/OBSERVE_EXTERNAL_FUNDS/MANAGE_CONNECTION only
 *   (degraded connections never carry new consequential effects);
 *   SUSPENDED admits nothing but lifecycle transitions.
 * - Every transition is recorded with a timestamp and an actor reference
 *   (opaque) — the transition history is append-only and immutable.
 */

import { TerminalConnectionError, ValidationError } from './errors.ts';
import type { TimestampMs } from './clock.ts';
import type { ConnectionScope, OperationClass } from './connection-scope.ts';
import { scopeAdmits } from './connection-scope.ts';
import type { ConnectionForm, CredentialKind } from './connection-forms.ts';
import { validateFormCredentialConsistency } from './connection-forms.ts';

/** Canonical connection lifecycle states. */
export const CONNECTION_LIFECYCLE_STATES = [
  'PROPOSED',
  'PENDING_VERIFICATION',
  'ACTIVE',
  'DEGRADED',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
  'DISCONNECTED',
] as const;

export type ConnectionLifecycleState = (typeof CONNECTION_LIFECYCLE_STATES)[number];

export function isConnectionLifecycleState(
  value: unknown,
): value is ConnectionLifecycleState {
  return (
    typeof value === 'string' &&
    (CONNECTION_LIFECYCLE_STATES as readonly unknown[]).includes(value)
  );
}

/** Terminal lifecycle states (monotonic — no exits). */
export const TERMINAL_CONNECTION_STATES: readonly ConnectionLifecycleState[] = Object.freeze([
  'EXPIRED',
  'REVOKED',
  'DISCONNECTED',
]);

export function isTerminalConnectionState(state: ConnectionLifecycleState): boolean {
  return TERMINAL_CONNECTION_STATES.includes(state);
}

/** Lifecycle transition causes (recorded with every transition). */
export const CONNECTION_TRANSITION_CAUSES = [
  'PRINCIPAL_REQUEST',
  'VERIFICATION_SUCCEEDED',
  'VERIFICATION_FAILED',
  'PROVIDER_SIGNAL',
  'POLICY_DECISION',
  'CREDENTIAL_EXPIRY',
  'OPERATOR_ACTION',
] as const;

export type ConnectionTransitionCause = (typeof CONNECTION_TRANSITION_CAUSES)[number];

/** One immutable lifecycle transition record (append-only history). */
export interface ConnectionTransitionRecord {
  readonly from: ConnectionLifecycleState;
  readonly to: ConnectionLifecycleState;
  readonly at: TimestampMs;
  readonly cause: ConnectionTransitionCause;
  /** Opaque actor reference (principal/operator) — never credential material. */
  readonly actorRef: string;
}

/** The lawful transition table (frozen data — diffable by certification). */
const LAWFUL_TRANSITIONS: ReadonlyMap<ConnectionLifecycleState, ReadonlySet<ConnectionLifecycleState>> =
  new Map<ConnectionLifecycleState, ReadonlySet<ConnectionLifecycleState>>([
    ['PROPOSED', new Set(['PENDING_VERIFICATION', 'DISCONNECTED'])],
    ['PENDING_VERIFICATION', new Set(['ACTIVE', 'DISCONNECTED'])],
    ['ACTIVE', new Set(['DEGRADED', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'DISCONNECTED'])],
    ['DEGRADED', new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'DISCONNECTED'])],
    ['SUSPENDED', new Set(['ACTIVE', 'EXPIRED', 'REVOKED', 'DISCONNECTED'])],
    ['EXPIRED', new Set()],
    ['REVOKED', new Set()],
    ['DISCONNECTED', new Set()],
  ]);

/** Is a transition lawful? (Terminal states have empty exit sets.) */
export function isLawfulTransition(
  from: ConnectionLifecycleState,
  to: ConnectionLifecycleState,
): boolean {
  const exits = LAWFUL_TRANSITIONS.get(from);
  return exits !== undefined && exits.has(to);
}

/** The mutable connection record: identity + form + scope + lifecycle + history. */
export interface ConnectionRecord {
  readonly connectionId: string;
  readonly providerName: string;
  readonly form: ConnectionForm;
  readonly credentialKind: CredentialKind;
  /** Opaque credential handle reference (broker-owned; NO material here — INV-19). */
  readonly credentialHandleRef: string;
  readonly scope: ConnectionScope;
  readonly state: ConnectionLifecycleState;
  readonly createdAt: TimestampMs;
  readonly lastTransitionAt: TimestampMs;
  readonly transitionHistory: readonly ConnectionTransitionRecord[];
}

/** Operation classes a DEGRADED connection still admits (read/management only). */
const DEGRADED_ADMITTED_CLASSES: ReadonlySet<OperationClass> = new Set<OperationClass>([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
]);

/** Lifecycle admission for execution: which states admit which operation classes. */
export function lifecycleAdmitsOperation(
  state: ConnectionLifecycleState,
  operationClass: OperationClass,
): boolean {
  if (state === 'ACTIVE') {
    return true;
  }
  if (state === 'DEGRADED') {
    return DEGRADED_ADMITTED_CLASSES.has(operationClass);
  }
  return false;
}

/**
 * The in-memory connection registry (deterministic reference store; durable
 * persistence is a separately-accepted Work Order — same deferral law as
 * the P1 lanes). Fail-closed: unknown ids throw; unlawful transitions
 * throw; terminal transitions are monotonic by construction.
 */
export class InMemoryConnectionRegistry {
  private readonly connections = new Map<string, ConnectionRecord>();

  /**
   * Register a proposed connection. Validates form/credential consistency
   * and freezes the scope. The credential handle is an OPAQUE REFERENCE —
   * material lives only inside the broker.
   */
  register(input: {
    readonly connectionId: string;
    readonly providerName: string;
    readonly form: ConnectionForm;
    readonly credentialKind: CredentialKind;
    readonly credentialHandleRef: string;
    readonly scope: ConnectionScope;
    readonly createdAt: TimestampMs;
  }): ConnectionRecord {
    if (typeof input.connectionId !== 'string' || input.connectionId.length === 0) {
      throw new ValidationError('connectionId must be a non-empty string');
    }
    if (typeof input.providerName !== 'string' || input.providerName.length === 0) {
      throw new ValidationError('providerName must be a non-empty string');
    }
    if (typeof input.credentialHandleRef !== 'string' || input.credentialHandleRef.length === 0) {
      throw new ValidationError('credentialHandleRef must be a non-empty opaque handle id');
    }
    validateFormCredentialConsistency(input.form, input.credentialKind);
    if (this.connections.has(input.connectionId)) {
      throw new ValidationError(`connection '${input.connectionId}' already registered`);
    }
    const record: ConnectionRecord = Object.freeze({
      connectionId: input.connectionId,
      providerName: input.providerName,
      form: input.form,
      credentialKind: input.credentialKind,
      credentialHandleRef: input.credentialHandleRef,
      scope: input.scope,
      state: 'PROPOSED',
      createdAt: input.createdAt,
      lastTransitionAt: input.createdAt,
      transitionHistory: Object.freeze([]),
    });
    this.connections.set(input.connectionId, record);
    return record;
  }

  get(connectionId: string): ConnectionRecord {
    const record = this.connections.get(connectionId);
    if (record === undefined) {
      throw new ValidationError(`unknown connection '${connectionId}'`);
    }
    return record;
  }

  has(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  list(): readonly ConnectionRecord[] {
    return [...this.connections.values()];
  }

  /** Apply a lifecycle transition (lawful table enforced, history append-only). */
  transition(
    connectionId: string,
    to: ConnectionLifecycleState,
    input: { readonly at: TimestampMs; readonly cause: ConnectionTransitionCause; readonly actorRef: string },
  ): ConnectionRecord {
    const record = this.get(connectionId);
    if (!isConnectionLifecycleState(to)) {
      throw new ValidationError('target state must be a canonical lifecycle state', { to });
    }
    if (typeof input.actorRef !== 'string' || input.actorRef.length === 0) {
      throw new ValidationError('transition requires a non-empty actor reference');
    }
    if (to === record.state) {
      throw new ValidationError(`connection is already in state '${to}'`);
    }
    if (!isLawfulTransition(record.state, to)) {
      if (isTerminalConnectionState(record.state)) {
        throw new TerminalConnectionError(
          `connection '${connectionId}' is terminal ('${record.state}') — no transitions out`,
          { connectionId, state: record.state, attempted: to },
        );
      }
      throw new ValidationError(
        `transition '${record.state}' → '${to}' is not lawful`,
        { from: record.state, to },
      );
    }
    if (input.at < record.lastTransitionAt) {
      throw new ValidationError('transition timestamps never regress', {
        from: String(record.lastTransitionAt),
        to: String(input.at),
      });
    }
    const transition: ConnectionTransitionRecord = Object.freeze({
      from: record.state,
      to,
      at: input.at,
      cause: input.cause,
      actorRef: input.actorRef,
    });
    const next: ConnectionRecord = Object.freeze({
      ...record,
      state: to,
      lastTransitionAt: input.at,
      transitionHistory: Object.freeze([...record.transitionHistory, transition]),
    });
    this.connections.set(connectionId, next);
    return next;
  }

  /**
   * Combined admission check (lifecycle + scope) used by the execution
   * bridge: the connection must be in a live state AND its scope must
   * admit the operation at `now`.
   */
  admitsOperation(
    connectionId: string,
    request: {
      readonly operationClass: OperationClass;
      readonly effectClass: import('./connection-scope.ts').EffectClass;
      readonly capability?: import('./refs.ts').CapabilityRef;
    },
    now: TimestampMs,
  ): boolean {
    const record = this.get(connectionId);
    if (!lifecycleAdmitsOperation(record.state, request.operationClass)) {
      return false;
    }
    return scopeAdmits(record.scope, request, now).kind === 'ADMITTED';
  }
}
