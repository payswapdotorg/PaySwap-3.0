/**
 * @payswap/adversarial — the capability access gate (P6-W3, lane r4-w3;
 * PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/quarantine.ts, split for the ≤400-line file
 * law; the `EffectiveAvailability` import from @payswap/capabilities
 * becomes a LOCAL structural view — the availability vocabulary is
 * pinned verbatim, zero-sibling law).
 *
 * THE LAW (old INV-S03 — the cached-state bypass rejection): a
 * quarantined component can NEVER regain access through cached
 * capability state. Capability state (an availability resolved earlier,
 * any two-axis view, any cache) is an OBSERVATION OF THE PAST.
 * `authorizeCapabilityUse` consults the quarantine ledger and the
 * advisory registry FIRST and treats the cached availability as
 * evidence-free noise: a cached AVAILABLE can never bypass an active
 * quarantine.
 *
 * Evaluation order is the whole point:
 * 1. quarantine ledger (for the capability AND every provider);
 * 2. active-advisory restriction view (for the capability AND every
 *    provider; retire > quarantine > restrict);
 * 3. ONLY THEN would the cached availability matter — and by then it
 *    cannot change the outcome. The cached `effectiveAvailability`
 *    field is deliberately NEVER READ in the decision path.
 *
 * Deterministic: a pure function of (view, enforcement state).
 */

import type { ComponentIdentity, ComponentRef } from "./component-identity.ts";
import { componentKey } from "./component-identity.ts";
import type { ComponentRestriction } from "./advisories.ts";
import type { SecurityAdvisoryRegistry } from "./advisory-registry.ts";
import type { QuarantineLedger } from "./quarantine-ledger.ts";

// ---------------------------------------------------------------------------
// The pinned availability vocabulary (structural view)
// ---------------------------------------------------------------------------

/**
 * The effective availability of a capability — pinned structural view
 * of the capability lane's vocabulary, verbatim: there is deliberately
 * NO 'FAILED' member (external ambiguity can never be converted into
 * failure or success — INV-4 discipline). This gate never reads the
 * VALUE; the union exists so the cached view is well-typed evidence of
 * the past.
 */
export type CachedEffectiveAvailability =
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "UNKNOWN";

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * A CACHED view of a capability: what some earlier observation resolved
 * (two-axis effective availability, or any other cached state). This is
 * the input the immune system must NOT trust.
 */
export interface CachedCapabilityView {
  readonly capabilityId: string;
  readonly sourceId: string;
  readonly effectiveAvailability: CachedEffectiveAvailability;
  /**
   * Components that provide/back the capability (extension, package,
   * agent key). A quarantine on any provider blocks the capability too.
   */
  readonly providedBy?: readonly ComponentRef[];
}

export type CapabilityAccessRejectReason =
  | "quarantined"
  | "quarantined_provider"
  | "restricted"
  | "restricted_provider"
  | "retired"
  | "retired_provider";

export type CapabilityAccessDecision =
  | { readonly decision: "ALLOW" }
  | {
      readonly decision: "REJECT";
      readonly reason: CapabilityAccessRejectReason;
      readonly componentKey: string;
      readonly advisoryRefs: readonly string[];
      readonly quarantineIds: readonly string[];
    };

/** The immune-system state consulted by the access gate. */
export interface SecurityEnforcementState {
  readonly advisories: SecurityAdvisoryRegistry;
  readonly quarantine: QuarantineLedger;
}

function decisionFor(
  reason: CapabilityAccessRejectReason,
  component: ComponentRef,
  driving: ComponentRestriction,
  quarantineIds: readonly string[],
): CapabilityAccessDecision {
  return {
    decision: "REJECT",
    reason,
    componentKey: componentKey(component),
    advisoryRefs: driving.advisoryRefs,
    quarantineIds,
  };
}

/**
 * The cached-state-bypass rejection gate. Evaluation order: quarantine
 * ledger first (capability AND providers), then the active-advisory
 * restriction view (retire > quarantine > restrict), and the cached
 * availability is never read in the decision path — a cached AVAILABLE
 * is an observation of the PAST and never an authority.
 *
 * Deterministic: a pure function of (view, enforcement state).
 */
export function authorizeCapabilityUse(
  view: CachedCapabilityView,
  security: SecurityEnforcementState,
): CapabilityAccessDecision {
  if (view.capabilityId.length === 0) {
    throw new Error("capability view requires a capabilityId");
  }
  const capability: ComponentRef = {
    kind: "capability",
    id: view.capabilityId,
  };
  const related: readonly ComponentRef[] = [
    capability,
    ...(view.providedBy ?? []),
  ];

  for (const component of related) {
    const activeQuarantines =
      security.quarantine.activeQuarantinesFor(component);
    if (activeQuarantines.length > 0) {
      const identity: ComponentIdentity = {
        kind: component.kind,
        id: component.id,
      };
      return decisionFor(
        component.kind === "capability" ? "quarantined" : "quarantined_provider",
        component,
        security.advisories.restrictionFor(identity),
        activeQuarantines.map((record) => record.quarantineId),
      );
    }
  }
  for (const component of related) {
    const restriction = security.advisories.restrictionFor({
      kind: component.kind,
      id: component.id,
    });
    if (restriction.retired) {
      return decisionFor(
        component.kind === "capability" ? "retired" : "retired_provider",
        component,
        restriction,
        [],
      );
    }
    if (restriction.quarantined) {
      return decisionFor(
        component.kind === "capability" ? "quarantined" : "quarantined_provider",
        component,
        restriction,
        security.quarantine
          .activeQuarantinesFor(component)
          .map((record) => record.quarantineId),
      );
    }
    if (restriction.restricted) {
      return decisionFor(
        component.kind === "capability" ? "restricted" : "restricted_provider",
        component,
        restriction,
        [],
      );
    }
  }
  return { decision: "ALLOW" };
}
