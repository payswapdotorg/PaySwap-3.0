/**
 * Principal contracts for the PaySwap 3.0 Trust and Authorization Authority
 * (spec/architecture/AUTHORITY-MODEL.md, PaySwap authority 2).
 *
 * A Principal is the actor reference presented to authorization evaluation.
 * It is not the identity record itself and it is not authority: authority
 * travels exclusively through mandates referenced by an AgentPrincipal's
 * authority envelope — never inline on a principal.
 *
 * PaySwap 3.0 boundary (P1-W3): this module owns the identity/authority
 * MODEL only. Authentication and credential VERIFICATION (proof-of-identity,
 * signature checking, credential storage) are platform/capability-lane
 * concerns and are deliberately absent; the `signature` fields that appear
 * elsewhere in this package are opaque evidence strings, never verified here.
 *
 * Ported from payswap.org@8a735bf packages/trust/src/principal.ts with
 * net-new Identity (stable capability identity vs runtime instance, per
 * spec/architecture/PAYSWAP-3.0.md Agent model) and principal lifecycle
 * states.
 */

/** Reference to a mandate, carried inside an AgentPrincipal authority envelope. */
export interface MandateRef {
  readonly mandateId: string;
  readonly version: number;
}

/**
 * Human principal. `securityEpoch` is the per-principal credential epoch at
 * which this credential was issued; it is compared against the current
 * credential epoch on every sensitive delegated action (see security-epoch.ts).
 */
export interface UserPrincipal {
  readonly kind: "user";
  readonly id: string;
  readonly securityEpoch: bigint;
}

/**
 * Agent principal: binds agent key, owner reference, Body/package version,
 * authority envelope and credential epoch. The authority envelope references
 * mandates; it never carries inline authority.
 *
 * Stable capability identity vs instance: `agentKeyFingerprint` identifies the
 * runtime credential/instance key, while `bodyRef` identifies the stable
 * Agent Body (the durable capability identity). An agent's instances may come
 * and go (new keys, new runtimes); the Body is what its mandates conceptually
 * attach to. Both are recorded so delegation lineage can name each precisely.
 */
export interface AgentPrincipal {
  readonly kind: "agent";
  readonly agentKeyFingerprint: string;
  readonly ownerRef: string;
  readonly bodyRef: string;
  readonly packageVersionRef: string;
  readonly authorityEnvelope: readonly MandateRef[];
  readonly securityEpoch: bigint;
}

/** Service principal with an explicit, non-delegable scope descriptor. */
export interface ServicePrincipal {
  readonly kind: "service";
  readonly id: string;
  readonly scope: string;
}

export type Principal = UserPrincipal | AgentPrincipal | ServicePrincipal;

/**
 * The stable identity of a principal as a capability holder — distinct from
 * any single runtime instance or credential. For agents this separates the
 * durable Body identity (what holds long-lived authority) from the ephemeral
 * instance key (what authenticates a particular runtime).
 */
export interface Identity {
  /** Canonical stable principal reference (same string as principalRef). */
  readonly ref: string;
  readonly kind: Principal["kind"];
  /** Stable Agent Body identity; present for agents only. */
  readonly bodyRef?: string;
}

/** Deterministic canonical principal reference used across trust records. */
export function principalRef(principal: Principal): string {
  switch (principal.kind) {
    case "user":
      return `user:${principal.id}`;
    case "agent":
      return `agent:${principal.agentKeyFingerprint}`;
    case "service":
      return `service:${principal.id}`;
  }
}

/** Project a principal onto its stable capability identity. */
export function identityOf(principal: Principal): Identity {
  const base: Identity = { ref: principalRef(principal), kind: principal.kind };
  if (principal.kind === "agent") {
    return { ...base, bodyRef: principal.bodyRef };
  }
  return base;
}

/**
 * Principal lifecycle states (net-new, P1-W3).
 *
 * `active`   — the principal may hold and exercise delegated authority.
 * `suspended`— authority is paused pending security review; never authorizes.
 * `retired`  — terminal; the identity never authorizes again.
 *
 * This is the lifecycle MODEL owned by the trust plane. Binding a principal's
 * current lifecycle state at evaluation time is a consuming-runtime concern
 * (the state is ledger-side, never carried inline on the presented principal,
 * so callers cannot forge it); `canAuthorizeState` is the fail-closed
 * predicate every consumer must apply.
 */
export type PrincipalLifecycleState = "active" | "suspended" | "retired";

export type PrincipalLifecycleEvent = "suspend" | "resume" | "retire";

/** Lawful lifecycle transitions. `retired` is terminal — no event revives it. */
export const PRINCIPAL_LIFECYCLE_TRANSITIONS: Readonly<
  Record<PrincipalLifecycleState, ReadonlyArray<PrincipalLifecycleEvent>>
> = Object.freeze({
  active: Object.freeze(["suspend", "retire"] as const),
  suspended: Object.freeze(["resume", "retire"] as const),
  retired: Object.freeze([] as const),
});

/** Only active principals can exercise delegated authority (fail closed). */
export function canAuthorizeState(state: PrincipalLifecycleState): boolean {
  return state === "active";
}

/**
 * Deterministically apply a lifecycle event. Unknown/unlawful transitions
 * throw (fail closed) — a suspended principal cannot be retired twice via
 * `resume`, and nothing ever leaves `retired`.
 */
export function transitionPrincipalState(
  state: PrincipalLifecycleState,
  event: PrincipalLifecycleEvent,
): PrincipalLifecycleState {
  const lawful = PRINCIPAL_LIFECYCLE_TRANSITIONS[state];
  if (!lawful.includes(event)) {
    throw new Error(
      `unlawful principal lifecycle transition: '${state}' does not admit '${event}' (retired is terminal)`,
    );
  }
  switch (event) {
    case "suspend":
      return "suspended";
    case "resume":
      return "active";
    case "retire":
      return "retired";
  }
}
