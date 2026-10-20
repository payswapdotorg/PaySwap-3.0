/**
 * @payswap/adversarial — the immune-state projection onto the
 * onchain-security kernel's composed security state (P6-W3, lane r4-w3;
 * the D-1 wiring bridge — NET-NEW, composing with the pinned kernel
 * seam, never importing it).
 *
 * THE CONTRACT: the kernel's gates consume `OnchainSecurityState` as
 * PURE DATA produced by the wiring layer from the REAL immune
 * machinery (the kernel's own gates-policy.ts declaration). THIS
 * package OWNS that machinery — the advisory registry, the quarantine
 * ledger, the epoch authority — so this module is the projection:
 *
 *   projectOnchainSecurityState({advisories, quarantine, epochs, at})
 *     → OnchainSecurityState (the PINNED kernel shape)
 *
 * - networkEpoch: the current network security epoch value (an epoch
 *   advance VOIDS every epoch-scoped authorization issued under it);
 * - quarantinedComponents: every ACTIVE quarantine's component key
 *   (`kind:id`), deduplicated, sorted (deterministic);
 * - restrictedComponents: every active advisory restriction key
 *   (the registry's own deterministic label set);
 * - activeAdvisoryRefs: every ACTIVE advisory id, sorted.
 *
 * The projection is PURE: same machinery state + same instant → the
 * identical kernel state. The kernel's security_state guard then
 * treats these as authoritative immune-system observations (BLOCK on
 * quarantined/restricted targets — INV-21 discipline at the kernel).
 *
 * Deterministic only: pure functions.
 */

import type { OnchainSecurityState } from "../pins/index.ts";
import type { SecurityAdvisoryRegistry } from "../advisory-registry.ts";
import type { QuarantineLedger } from "../quarantine-ledger.ts";
import type { SecurityEpochAuthority } from "../epochs.ts";
import { componentKey } from "../component-identity.ts";

/** Everything the projection consumes (the REAL immune machinery). */
export interface ImmuneStateInput {
  readonly advisories: SecurityAdvisoryRegistry;
  readonly quarantine: QuarantineLedger;
  readonly epochs: SecurityEpochAuthority;
  /** Observation instant (ms) — deterministic, caller-supplied. */
  readonly observedAt: number;
}

/** Raised on a malformed projection input (fail closed). */
export class InvalidProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectionError";
  }
}

/**
 * Project the REAL immune machinery onto the kernel's composed
 * security state (the D-1 data surface). Deterministic total: the
 * component keys and advisory refs are deduplicated and SORTED, so
 * identical machinery state projects to the byte-identical kernel
 * state regardless of insertion order.
 */
export function projectOnchainSecurityState(
  input: ImmuneStateInput,
): OnchainSecurityState {
  if (!Number.isInteger(input.observedAt) || input.observedAt < 0) {
    throw new InvalidProjectionError(
      "observedAt must be a non-negative integer (ms)",
    );
  }
  const quarantined = new Set<string>();
  for (const record of input.quarantine.list()) {
    if (record.status === "active") {
      quarantined.add(componentKey(record.component));
    }
  }
  return Object.freeze({
    observedAt: input.observedAt,
    networkEpoch: input.epochs.currentEpoch().value,
    quarantinedComponents: Object.freeze([...quarantined].sort()),
    restrictedComponents: Object.freeze([...input.advisories.activeRestrictedKeys()]),
    activeAdvisoryRefs: Object.freeze(
      input.advisories.listActive().map((advisory) => advisory.advisoryId).sort(),
    ),
  });
}
