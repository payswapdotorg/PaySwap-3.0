/**
 * @payswap/adversarial — wire-contract version stamps (P6-W3, lane
 * r4-w3, commit 1: "pinned wire shapes").
 *
 * Every contract this package exports is a VERSIONED, CANONICAL wire
 * shape. The stamps below are the deterministic compatibility surface:
 * consumers may pin them in evidence records, and the package-local
 * suite asserts they match the contracts actually exported. A stamp
 * changes ONLY through an accepted Work Order + ADR (frozen-architecture
 * law, INV-29 discipline).
 *
 * - IMMUNE_WIRE_VERSION: the immune-system plane (component identity,
 *   threat signatures, advisories + the global restriction view, the
 *   security-epoch authority, the quarantine ledger, the capability
 *   access gate, the composed immune gate, capability cases + the
 *   learning feed, the expert bridge, the block-authority law — the
 *   root barrel, ".").
 * - PROVIDER_INTEL_WIRE_VERSION: the provider threat-intelligence
 *   vocabulary (families, observations, signals, detectors, the
 *   adversarial provider agent — "./provider-intel").
 * - INTEGRATION_WIRE_VERSION: the D-1 wiring contracts (the
 *   onchain-security seam bridges: advisory proposal projection, immune
 *   state projection, block-escalation records — re-exported from the
 *   root barrel; stamped separately because they compose with ANOTHER
 *   lane's wire, whose own version is the kernel's).
 */

/** Version of the immune-plane wire contracts exported from the root barrel. */
export const IMMUNE_WIRE_VERSION = "adversarial-immune/1" as const;

/** Version of the provider threat-intelligence contracts ("./provider-intel"). */
export const PROVIDER_INTEL_WIRE_VERSION = "adversarial-provider-intel/1" as const;

/** Version of the D-1 integration bridges (onchain-security seam composition). */
export const INTEGRATION_WIRE_VERSION = "adversarial-integration/1" as const;
