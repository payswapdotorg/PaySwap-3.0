/**
 * PaySwap Desktop (P7-W2) — the structural pin registry.
 *
 * packages/desktop is a ZCode-substrate `platform` package
 * (spec/architecture/MODULE-OWNERSHIP.yaml). SUBSTRATE LAW (Work Order
 * P7-W2, hard constraint 5): this package NEVER imports @payswap/* —
 * the accepted shared contracts are pinned STRUCTURALLY here, exactly as
 * in-flight lanes pinned cross-lane shapes before this base
 * (packages/provider-runtime/src/refs.ts pins the protocol lane's
 * AuthorizationRef the same way; packages/agents/src/pins.ts is the
 * accepted pattern on later bases). The Tech Lead wires real imports at
 * integration if/when the substrate dependency law changes.
 *
 * Each pin records WHAT it mirrors (package, contract version, source
 * commit) so drift is detectable: the pinned vocabulary is compared
 * against recorded fixtures in the deterministic battery
 * (test/payswap/pin-fidelity.test.ts), and a mismatch fails the build
 * rather than silently widening a contract.
 *
 * Pin law (canonical):
 * - Pins are VERSIONED: the pin set carries a pin-set version; every pin
 *   records the mirrored package's own contract version.
 * - Pins are CANONICAL: the mirrored source is the accepted contract at
 *   the exact base SHA recorded below — never a paraphrase.
 * - Pins are CLOSED: vocabularies are frozen arrays; guards reject
 *   unknown members.
 * - Pins are OPAQUE where the mirrored contract is opaque (AuthorizationRef
 *   lineage, capability refs): structural completeness only, semantics stay
 *   with the owning lane.
 * - Pins carry NO financial authority: mirroring a shape never moves money.
 */

/** The pin-set version for the PaySwap Desktop product (bumps on any pin change). */
export const PAYSWAP_DESKTOP_PIN_SET_VERSION = "1.0.0" as const;

/** The PaySwap 3.0 base commit whose accepted contracts this pin set mirrors. */
export const PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT =
  "2999bbb1658443b72ce9644f32cabbebdbecaa37" as const;

/** One structural pin's provenance record. */
export interface PaySwapContractPin {
  /** Stable pin id (dots separate module groups). */
  readonly pinId: string;
  /** The @payswap package whose accepted contract this pin mirrors. */
  readonly mirroredPackage: string;
  /** The mirrored package's own contract version at the source commit. */
  readonly mirroredVersion: string;
  /** The exact repository commit the mirrored shapes were read from. */
  readonly sourceCommit: string;
  /** The work order that accepted the mirrored contract. */
  readonly workOrder: string;
  /** What the pin covers (auditable scope statement). */
  readonly mirrors: string;
}

/** The canonical pin registry — one entry per mirrored contract surface. */
export const PAYSWAP_DESKTOP_PINS: readonly PaySwapContractPin[] = Object.freeze([
  {
    pinId: "surface.versioning",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "SURFACE_API_VERSION + SurfaceContractProvenance (the surface stability boundary the desktop renders against)",
  },
  {
    pinId: "surface.outcomes",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "the five outcome actions (pay/receive/move/convert/checkout) with dispatch authority, deployment context and honest capability fold shapes",
  },
  {
    pinId: "surface.areas",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors: "the eleven-area navigation IA (UniversalAreaId) and empty-state contract shape",
  },
  {
    pinId: "surface.money-view",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors: "exact integer minor-unit money display inputs (locale data always an explicit input)",
  },
  {
    pinId: "surface.quote-terms",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "quote terms disclosure shapes: fee lines, rate provenance, expiry, funding/recipient assumptions, estimate-vs-guarantee delivery labels, freshness",
  },
  {
    pinId: "surface.progress-states",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "the sixteen-stage lifecycle vocabulary, six observation statuses, stage observation/tone/view and progress facts (submission is not finality; payout sent is not beneficiary credit)",
  },
  {
    pinId: "surface.security-vocabulary",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "BLOCK/ALLOW/UNKNOWN security gate decision source + people-language fold shapes (BLOCK non-overridable at the display boundary)",
  },
  {
    pinId: "surface.authorization-changes",
    mirroredPackage: "@payswap/surface",
    mirroredVersion: "1.0.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W3",
    mirrors:
      "the closed material-change vocabulary (quote expiry/terms, recipient/amount/funding changes, observation changes, epoch/mandate changes) that links progress to revalidation",
  },
  {
    pinId: "protocol.lifecycle",
    mirroredPackage: "@payswap/protocol",
    mirroredVersion: "0.1.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P1-W2",
    mirrors:
      "settlement attempt states/events (OUTCOME_UNKNOWN exits only via reconciliation), the seven distinct evidence node kinds, and the opaque AuthorizationRef lineage shape",
  },
  {
    pinId: "provider-runtime.bridge-law",
    mirroredPackage: "@payswap/provider-runtime",
    mirroredVersion: "0.1.0",
    sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
    workOrder: "P2-W2",
    mirrors:
      "the execution result envelope (CONFIRMED/UNKNOWN/FAILED with ambiguity reasons), AuthorizedCommand (opaque authorization in) and the SANDBOX/LIVE execution-mode law",
  },
] as const);

/** The pin-set provenance carried by every desktop product view. */
export interface DesktopPinProvenance {
  readonly pinSetVersion: typeof PAYSWAP_DESKTOP_PIN_SET_VERSION;
  readonly sourceCommit: typeof PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT;
  readonly workOrder: "P7-W2";
}

/** The provenance stamped on every PaySwap Desktop product view. */
export const DESKTOP_PIN_PROVENANCE: DesktopPinProvenance = Object.freeze({
  pinSetVersion: PAYSWAP_DESKTOP_PIN_SET_VERSION,
  sourceCommit: PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
  workOrder: "P7-W2",
});

/** Look up one pin record by id (fail-closed on unknown ids). */
export function pinById(pinId: string): PaySwapContractPin {
  const found = PAYSWAP_DESKTOP_PINS.find((pin) => pin.pinId === pinId);
  if (found === undefined) {
    throw new Error(`pinById: unknown pin id ${JSON.stringify(pinId)} — the pin set is closed`);
  }
  return found;
}

/** Every pin mirroring one mirrored package (auditable pin coverage). */
export function pinsForPackage(mirroredPackage: string): readonly PaySwapContractPin[] {
  return PAYSWAP_DESKTOP_PINS.filter((pin) => pin.mirroredPackage === mirroredPackage);
}
