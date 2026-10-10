/**
 * Policy-configuration epochs and the security-epoch LINKAGE (P1-W3, net-new).
 *
 * The LINKAGE LAW (TB-5): the network SecurityEpoch axis is the single
 * monotonic invalidation axis for delegated authority —
 *
 *   - mandates and approval artifacts are STAMPED with the network epoch at
 *     issuance (`Mandate.issuedAtEpoch`, `ApprovalArtifact.securityEpoch`);
 *   - an epoch-scoped artifact is valid ONLY while the network epoch equals
 *     its stamp; any advancement invalidates everything stamped lower,
 *     deterministically, with no dependency on wall-clock time;
 *   - a stamp ABOVE the current epoch is structurally impossible through
 *     lawful issuance — it indicates a forged/future stamp and fails closed
 *     as "invalid" (never "valid ahead of time").
 *
 * Policy-configuration epochs: the constraint sets carried by mandates
 * (VelocityLimit, MandateLimits, CostCaps, ...) are the mandate-carried
 * policy surface of the Policy and Governance Authority. A constraint-set
 * CONFIGURATION is effective-dated ON the security-epoch axis: it carries
 * `effectiveFromEpoch` and (once superseded) `supersededAtEpoch`, and it is
 * valid only within that epoch window. Superseding a configuration is an
 * append-only, monotonic act recorded in a ledger; whether a policy change
 * also ADVANCES the network security epoch is a governance-runtime decision
 * (the caller calls SecurityEpochAuthority.advance explicitly) — this module
 * never advances epochs as a side effect.
 *
 * Adaptation provenance: epoch mechanics adapted from
 * payswap.org@8a735bf packages/security/src/epochs.ts (monotonic advance,
 * append-only history, staleness semantics), re-expressed as
 * status-returning linkage functions integrated with the canonical Mandate
 * and ApprovalArtifact types. The old EpochScopedAuthorization check
 * contract is retired in favor of epoch-stamped mandates/artifacts.
 */

import type { Mandate } from "./mandate.ts";
import type { SecurityEpochAuthority } from "./security-epoch.ts";
import { NonMonotonicEpochError } from "./security-epoch.ts";

/** Epoch validity of an epoch-stamped trust instrument, fail closed. */
export type EpochStampStatus = "current" | "stale" | "invalid_future_stamp";

/**
 * Epoch status of a mandate relative to the network authority.
 * `stale` — the network epoch advanced past the issuance stamp (dead).
 * `invalid_future_stamp` — the stamp exceeds the current epoch, which lawful
 * issuance cannot produce (fail closed).
 */
export function mandateEpochStatus(
  mandate: Mandate,
  authority: SecurityEpochAuthority,
): EpochStampStatus {
  return stampStatus(mandate.issuedAtEpoch, authority);
}

function stampStatus(stamp: bigint, authority: SecurityEpochAuthority): EpochStampStatus {
  const current = authority.currentEpoch().value;
  if (stamp > current) {
    return "invalid_future_stamp";
  }
  if (stamp < current) {
    return "stale";
  }
  return "current";
}

/**
 * Epoch status of an arbitrary issuance stamp (used for approval artifacts
 * and any future epoch-stamped instrument).
 */
export function epochStampStatus(
  issuedAtEpoch: bigint,
  authority: SecurityEpochAuthority,
): EpochStampStatus {
  return stampStatus(issuedAtEpoch, authority);
}

/**
 * Effective-dated policy configuration: a constraint-set configuration valid
 * only within its epoch window [effectiveFromEpoch, supersededAtEpoch).
 * `supersededAtEpoch` is undefined while the configuration is open-ended.
 * `constraintSetRef` is an opaque reference owned by the Policy and
 * Governance Authority — this package never interprets constraint contents.
 */
export interface PolicyConfigurationEpoch {
  readonly epochId: string;
  readonly constraintSetRef: string;
  readonly effectiveFromEpoch: bigint;
  readonly supersededAtEpoch?: bigint;
  /** Opaque reference to the governance act that created this configuration. */
  readonly decisionRef: string;
}

/** Raised on invalid policy-epoch ledger operations (fail closed). */
export class PolicyEpochError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyEpochError";
  }
}

/**
 * Is the configuration effective at the given network epoch value?
 * Window semantics: effectiveFromEpoch <= atEpoch AND (not yet superseded at
 * atEpoch). The boundary is half-open: superseding at epoch N closes the
 * window BEFORE N, so the superseding configuration owns epoch N.
 */
export function isPolicyConfigurationEffective(
  configuration: PolicyConfigurationEpoch,
  atEpoch: bigint,
): boolean {
  if (atEpoch < configuration.effectiveFromEpoch) {
    return false;
  }
  if (configuration.supersededAtEpoch === undefined) {
    return true;
  }
  return atEpoch < configuration.supersededAtEpoch;
}

/**
 * Append-only ledger of policy-configuration epochs. Configurations are
 * recorded with their effective epoch window; supersession is monotonic
 * (a window can never close before it opens, and once closed it stays
 * closed). The ledger never advances the network security epoch — that is
 * the SecurityEpochAuthority's exclusive power, exercised by the governance
 * runtime.
 */
export class PolicyEpochLedger {
  readonly #configurations = new Map<string, PolicyConfigurationEpoch>();
  readonly #recordOrder: string[] = [];
  readonly #history: PolicyConfigurationEpoch[] = [];

  /**
   * Record a new policy configuration effective from `effectiveFromEpoch`.
   * Fails closed unless the effective epoch is at least the genesis epoch
   * (0) and the id is unique.
   */
  record(input: {
    epochId: string;
    constraintSetRef: string;
    effectiveFromEpoch: bigint;
    decisionRef: string;
  }): PolicyConfigurationEpoch {
    if (input.epochId.length === 0) {
      throw new PolicyEpochError("epochId must not be empty");
    }
    if (this.#configurations.has(input.epochId)) {
      throw new PolicyEpochError(`policy configuration '${input.epochId}' already exists`);
    }
    if (input.constraintSetRef.length === 0) {
      throw new PolicyEpochError("constraintSetRef must not be empty");
    }
    if (input.decisionRef.length === 0) {
      throw new PolicyEpochError("decisionRef must not be empty");
    }
    if (input.effectiveFromEpoch < 0n) {
      throw new PolicyEpochError("effectiveFromEpoch must be >= 0 (genesis epoch)");
    }
    const configuration: PolicyConfigurationEpoch = Object.freeze({
      epochId: input.epochId,
      constraintSetRef: input.constraintSetRef,
      effectiveFromEpoch: input.effectiveFromEpoch,
      decisionRef: input.decisionRef,
    });
    this.#configurations.set(configuration.epochId, configuration);
    this.#recordOrder.push(configuration.epochId);
    this.#history.push(configuration);
    return configuration;
  }

  /**
   * Supersede a configuration: its window closes before `atEpoch` (the
   * boundary is owned by whatever configuration follows). Monotonic and
   * append-only: a configuration can only be superseded once, and only at an
   * epoch at or after its own effective epoch.
   */
  supersede(epochId: string, atEpoch: bigint): PolicyConfigurationEpoch {
    const configuration = this.#configurations.get(epochId);
    if (configuration === undefined) {
      throw new PolicyEpochError(`policy configuration '${epochId}' is unknown`);
    }
    if (configuration.supersededAtEpoch !== undefined) {
      throw new PolicyEpochError(
        `policy configuration '${epochId}' is already superseded at epoch ${configuration.supersededAtEpoch}: supersession is monotonic`,
      );
    }
    if (atEpoch < configuration.effectiveFromEpoch) {
      throw new NonMonotonicEpochError(
        `cannot supersede '${epochId}' at epoch ${atEpoch} before it becomes effective at epoch ${configuration.effectiveFromEpoch}`,
      );
    }
    const superseded: PolicyConfigurationEpoch = Object.freeze({
      ...configuration,
      supersededAtEpoch: atEpoch,
    });
    this.#configurations.set(epochId, superseded);
    this.#history.push(superseded);
    return superseded;
  }

  /** A recorded configuration by id, in its latest recorded state. */
  lookup(epochId: string): PolicyConfigurationEpoch | undefined {
    return this.#configurations.get(epochId);
  }

  /** All configurations effective at the given epoch value, in record order. */
  effectiveConfigurations(atEpoch: bigint): readonly PolicyConfigurationEpoch[] {
    return this.#recordOrder
      .map((epochId) => this.#configurations.get(epochId))
      .filter((configuration): configuration is PolicyConfigurationEpoch => configuration !== undefined)
      .filter((configuration) => isPolicyConfigurationEffective(configuration, atEpoch));
  }

  /** Append-only ledger history (record + supersede events), in order. */
  history(): readonly PolicyConfigurationEpoch[] {
    return [...this.#history];
  }
}
