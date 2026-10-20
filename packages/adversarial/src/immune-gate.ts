/**
 * @payswap/adversarial — the composed immune gate (P6-W3, lane r4-w3;
 * PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/quarantine.ts [SecurityGate class], split for
 * the ≤400-line file law).
 *
 * THE COMPOSITION (the D-1 wiring contract's enforcement surface):
 * advisory registry + quarantine ledger + network security epoch
 * authority, with one deterministic enforcement and check surface. This
 * is the object a runtime holds to consult the immune system:
 *
 * - `enforceAdvisory` implements "an advisory maps to quarantine /
 *   restrict / retire":
 *   - `restrict`/`retire`: the restriction is computed live from the
 *     active advisory set (nothing extra to build);
 *   - `quarantine`: creates a quarantine record for every affected
 *     component (kind + id), referencing the advisory (idempotent);
 *   - `advanceEpoch: true`: advances the network security epoch with
 *     the advisory as provenance, VOIDING every epoch-scoped
 *     authorization issued at a lower epoch (the caller controls when).
 * - `authorizeCapabilityUse` is the cached-state-bypass rejection
 *   (./capability-gate.ts).
 * - `checkSensitiveAction` is the full sensitive delegated-action gate:
 *   epoch + expiry first, then the acting agent and every component the
 *   action is routed through must be unrestricted. Fail-closed on every
 *   axis.
 *
 * Deterministic only: pure state machines over the composed registries;
 * callers pass every instant.
 */

import type { ComponentRef } from "./component-identity.ts";
import { componentKey } from "./component-identity.ts";
import type { SecurityAdvisory } from "./advisories.ts";
import type { SecurityEpochAuthority, EpochScopedAuthorization } from "./epochs.ts";
import { checkSensitiveActionAuthorization } from "./epochs.ts";
import type { SecurityEnforcementState } from "./capability-gate.ts";
import { authorizeCapabilityUse } from "./capability-gate.ts";
import type { CachedCapabilityView, CapabilityAccessDecision } from "./capability-gate.ts";

/**
 * Raised when a delegated action is attempted by/through a restricted
 * or quarantined component — the enforcement side of "advisory
 * outcomes map to restrict / quarantine / retire".
 */
export class RestrictedComponentError extends Error {
  readonly componentKey: string;
  readonly advisoryRefs: readonly string[];

  constructor(
    componentKey: string,
    advisoryRefs: readonly string[],
    action: string,
  ) {
    super(
      `Component '${componentKey}' is restricted (${advisoryRefs.join(", ")}) and cannot perform sensitive action '${action}'`,
    );
    this.name = "RestrictedComponentError";
    this.componentKey = componentKey;
    this.advisoryRefs = advisoryRefs;
  }
}

/** What enforcing one advisory did (deterministic record). */
export interface EnforcementRecord {
  readonly advisoryId: string;
  readonly action: SecurityAdvisory["action"];
  readonly quarantinedComponents: readonly ComponentRef[];
  readonly epochAdvanced: boolean;
  readonly enforcedAt: number;
}

/**
 * The composed immune-system gate: advisory registry + quarantine
 * ledger + network security epoch authority, with one deterministic
 * enforcement and check surface.
 */
export class ImmuneGate {
  readonly advisories: SecurityEnforcementState["advisories"];
  readonly quarantine: SecurityEnforcementState["quarantine"];
  readonly epochs: SecurityEpochAuthority;

  constructor(input: SecurityEnforcementState & {
    readonly epochs: SecurityEpochAuthority;
  }) {
    this.advisories = input.advisories;
    this.quarantine = input.quarantine;
    this.epochs = input.epochs;
  }

  /**
   * Enforces a PUBLISHED advisory (the D-1 advisory-outcome mapping):
   * - `restrict`/`retire`: the restriction is computed live from the
   *   active advisory set (nothing extra to build);
   * - `quarantine`: creates a quarantine record for every affected
   *   component (kind + id), referencing the advisory;
   * - `advanceEpoch: true`: advances the network security epoch with
   *   the advisory as provenance, invalidating every epoch-scoped
   *   authorization issued at a lower epoch.
   */
  enforceAdvisory(
    advisory: SecurityAdvisory,
    options?: { advanceEpoch?: boolean },
  ): EnforcementRecord {
    const quarantinedComponents: ComponentRef[] = [];
    if (advisory.action === "quarantine") {
      for (const affected of advisory.affected) {
        const component: ComponentRef = {
          kind: affected.kind,
          id: affected.id,
        };
        // Idempotent: an already-quarantined component is not re-quarantined.
        if (!this.quarantine.isQuarantined(component)) {
          this.quarantine.quarantine({
            component,
            reason: advisory.title,
            advisoryRefs: [advisory.advisoryId],
            at: advisory.provenance.publishedAt,
          });
          quarantinedComponents.push(component);
        }
      }
    }
    let epochAdvanced = false;
    if (options?.advanceEpoch === true) {
      this.epochs.advance({
        reason: `advisory ${advisory.advisoryId}: ${advisory.title}`,
        at: advisory.provenance.publishedAt,
        advisoryRef: advisory.advisoryId,
      });
      epochAdvanced = true;
    }
    return {
      advisoryId: advisory.advisoryId,
      action: advisory.action,
      quarantinedComponents: Object.freeze(quarantinedComponents),
      epochAdvanced,
      enforcedAt: advisory.provenance.publishedAt,
    };
  }

  /** The cached-state-bypass rejection gate (see ./capability-gate.ts). */
  authorizeCapabilityUse(view: CachedCapabilityView): CapabilityAccessDecision {
    return authorizeCapabilityUse(view, {
      advisories: this.advisories,
      quarantine: this.quarantine,
    });
  }

  /**
   * The full sensitive delegated-action gate:
   * 1. epoch + expiry check through ./epochs.ts (void-on-advance);
   * 2. the acting agent (authorization.agentRef) must not be
   *    restricted/quarantined/retired (advisory view, computed
   *    globally);
   * 3. any components the action is routed THROUGH must not be either.
   *
   * Throws StaleAuthorizationEpochError / AuthorizationExpiredError /
   * RestrictedComponentError. Fail-closed on every axis.
   */
  checkSensitiveAction(input: {
    authorization: EpochScopedAuthorization;
    at: number;
    /** Additional components the action is routed through (e.g. package, extension). */
    viaComponents?: readonly ComponentRef[];
  }): void {
    checkSensitiveActionAuthorization(
      input.authorization,
      this.epochs,
      input.at,
    );
    const related: ComponentRef[] = [];
    if (input.authorization.agentRef !== undefined) {
      related.push({ kind: "agent_key", id: input.authorization.agentRef });
    }
    related.push(...(input.viaComponents ?? []));
    for (const component of related) {
      const restriction = this.advisories.restrictionFor({
        kind: component.kind,
        id: component.id,
      });
      if (restriction.restricted) {
        throw new RestrictedComponentError(
          componentKey(component),
          restriction.advisoryRefs,
          input.authorization.actionClass,
        );
      }
    }
  }
}
