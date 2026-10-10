/**
 * Scoped-grant gates (P1-W3; split from grants.ts to respect the <=400-line
 * file law — registry in grants.ts, guards/gates here).
 *
 * - checkScopedGrant: the fail-closed sensitive-action guard.
 * - scopeCoversAction / scopeCoversResource: structural narrowing predicates.
 * - scopedExecutionGate: the dead-path gate used by authorization evaluate().
 */

import type { Principal } from "./principal.ts";
import type { Mandate, ResourceRef } from "./mandate.ts";
import { matchesActionPattern, matchesResourcePattern } from "./mandate.ts";
import type { EpochLedger } from "./security-epoch.ts";
import { StaleEpochError, checkEpoch } from "./security-epoch.ts";
import type { ScopedGrantRegistry, ScopedGrantScope, ScopedExecutionGrant } from "./grants.ts";
import { ScopedGrantError } from "./grants.ts";

/** Result of the fail-closed sensitive-action guard. */
export type ScopedGrantCheck =
  | { readonly ok: true; readonly grant: ScopedExecutionGrant }
  | {
      readonly ok: false;
      readonly status: "ACTIVE" | "REVOKED" | "EXPIRED" | "UNKNOWN" | "STALE_SECURITY_EPOCH";
      readonly reason: string;
    };

/**
 * Fail-closed sensitive-action guard for scoped execution grants (TB-2: the
 * credential epoch is checked on every sensitive delegated action;
 * revoked/expired/unknown grants never vouch for one).
 *
 * Returns `{ ok: true }` ONLY when the grant is issued by the registry and
 * ACTIVE at `at`, and — when `principal` and `ledger` are supplied — the
 * principal's credential epoch is current. Any other combination returns a
 * refusal carrying the exact status; nothing is best-effort.
 */
export function checkScopedGrant(
  grantId: string,
  registry: ScopedGrantRegistry,
  at: number,
  principal?: Principal | undefined,
  ledger?: EpochLedger | undefined,
): ScopedGrantCheck {
  const status = registry.status(grantId, at);
  if (status === "UNKNOWN") {
    return {
      ok: false,
      status,
      reason: `scoped grant '${grantId}' was never issued: unresolvable references never vouch for authority`,
    };
  }
  if (status === "REVOKED") {
    return {
      ok: false,
      status,
      reason: `scoped grant '${grantId}' is revoked: revoked grants fail closed everywhere`,
    };
  }
  if (status === "EXPIRED") {
    return {
      ok: false,
      status,
      reason: `scoped grant '${grantId}' expired at ${registry.lookup(grantId)?.expiresAt ?? "?"}: expired grants fail closed everywhere`,
    };
  }
  if (principal !== undefined || ledger !== undefined) {
    if (principal === undefined || ledger === undefined) {
      throw new ScopedGrantError(
        "checkScopedGrant requires principal and ledger together: the epoch cannot be verified from half the inputs (fail closed)",
      );
    }
    try {
      checkEpoch(principal, ledger);
    } catch (error) {
      if (error instanceof StaleEpochError) {
        return {
          ok: false,
          status: "STALE_SECURITY_EPOCH",
          reason: `principal credential epoch is stale for scoped grant '${grantId}' (TB-2)`,
        };
      }
      throw error;
    }
  }
  const grant = registry.lookup(grantId);
  if (grant === undefined) {
    // Unreachable (status was ACTIVE), but fail closed rather than assume.
    return {
      ok: false,
      status: "UNKNOWN",
      reason: `scoped grant '${grantId}' disappeared from the registry`,
    };
  }
  return { ok: true, grant };
}

/** Structural predicate: does this action lie inside a scope's action narrowing? */
export function scopeCoversAction(scope: ScopedGrantScope, action: string): boolean {
  if (scope.actions === undefined) {
    return true;
  }
  return scope.actions.some((pattern) => matchesActionPattern(pattern, action));
}

/** Structural predicate: does this resource lie inside a scope's resource narrowing? */
export function scopeCoversResource(scope: ScopedGrantScope, resource: ResourceRef): boolean {
  if (scope.resources === undefined) {
    return true;
  }
  return scope.resources.some((pattern) => matchesResourcePattern(pattern, resource));
}

/** Result of the scoped-execution gate: pass (with optional vouching grant) or fail-closed deny reason. */
export type ScopedGateOutcome =
  | { readonly pass: true; readonly vouchingGrant?: ScopedExecutionGrant }
  | { readonly pass: false; readonly reason: "scoped_grant_revoked" | "scoped_grant_expired" };

/**
 * The scoped-execution gate for one action/resource pair at one instant
 * (fail closed, INV-05 evidence lineage). A mandate with derived scoped
 * execution grants COVERING this action+resource can only pass when at
 * least one covering scoped grant is ACTIVE at `requestedAt`. When every
 * covering scoped grant is dead, the mandate's scoped execution path is
 * dead: REVOKED is the strongest death (immediate, monotonic), reported
 * over EXPIRED. Scoped grants that do NOT cover this action+resource never
 * gate it — a narrowing instrument that names other actions/resources is
 * not this request's execution path. Returns the vouching ACTIVE grant so
 * ALLOW decisions can cite it as authorization evidence.
 */
export function scopedExecutionGate(
  action: string,
  resource: ResourceRef,
  requestedAt: number,
  registry: ScopedGrantRegistry,
  mandate: Mandate,
): ScopedGateOutcome {
  const derived = registry.listForMandate({
    mandateId: mandate.id,
    version: mandate.version,
  });
  const covering = derived.filter(
    (candidate) =>
      scopeCoversAction(candidate.scope, action) &&
      scopeCoversResource(candidate.scope, resource),
  );
  if (covering.length === 0) {
    return { pass: true }; // no scoped instrument narrows this request; mandate governs
  }
  const vouching = covering.find(
    (candidate) => registry.status(candidate.id, requestedAt) === "ACTIVE",
  );
  if (vouching !== undefined) {
    return { pass: true, vouchingGrant: vouching };
  }
  const revoked = covering.some(
    (candidate) => registry.status(candidate.id, requestedAt) === "REVOKED",
  );
  return { pass: false, reason: revoked ? "scoped_grant_revoked" : "scoped_grant_expired" };
}
