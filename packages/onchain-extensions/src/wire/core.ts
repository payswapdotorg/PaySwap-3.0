/**
 * @payswap/onchain-extensions — the pack CORE wire shapes (Work Order
 * P5-W2, lane R3-W2; ADAPT+PORT of payswap.org@8a735bf
 * packages/onchain-venues/src/index.ts — the VenueExtensionPack contract,
 * made DECLARATIVE: the old pack carried an ExecutionVenue PORT with
 * executable methods (quote/planWrite/simulate); execution belongs to the
 * best-execution (P5-W1) and adapters (P4-W3) lanes, so this rebuild pins
 * the pack as versioned descriptor DATA + validation + addressing only).
 *
 * The declarative law, encoded in the shapes themselves:
 * - constraints carry `authorityCarrier: false` as a LITERAL type — a pack
 *   may express constraints/assumptions but can never authorize;
 * - the certification declaration carries `certificationRequired: true` and
 *   `statusCarried: false` as LITERAL types — every pack requires
 *   capability-fabric certification before any effect, and a pack can never
 *   carry its own certification status (the append-only certification
 *   ledger in the capability fabric owns status);
 * - provenance carries a content digest over the canonical pack projection
 *   (binding-never-security tamper evidence, re-derived at validation).
 */

import type { ProtocolDescriptor } from '../pins/smart-contract.ts';
import type { PackFamily, PackFamilyExtension } from './families.ts';

// ---------------------------------------------------------------------------
// The pack key law (canonical identity)
// ---------------------------------------------------------------------------

/** Canonical pack key (the venue identity, one per pack). */
export const PACK_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

/** Canonical semantic version (the accepted three-part exact form). */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Canonical pack id: `onchain-pack/${family}/${packKey}@${version}` (the
 * old `venue-pack/${venueId}@${version}` law, extended with the family
 * segment — deterministic derivation and parsing live in addressing.ts).
 */
export const PACK_ID_PATTERN =
  /^onchain-pack\/(dex|bridge|off-ramp|liquidity|lending-staking|intent-protocol)\/[a-z0-9][a-z0-9._:-]{0,63}@\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// The venue surface descriptor (old VenueDescriptor, made pure data)
// ---------------------------------------------------------------------------

/**
 * The venue's declared provider-native optimization — the incumbent
 * baseline (INV-C08 / rule 20): when present, benchmarkBaseline is ALWAYS
 * true (a venue declaring an optimization declares it AS the baseline its
 * compositions are compared against).
 */
export interface PackNativeOptimizationDeclaration {
  /** The optimization's own kind, e.g. 'ROUTER_NATIVE_PATH_SELECTION'. */
  readonly optimizationKind: string;
  readonly benchmarkBaseline: true;
  readonly description: string;
}

/**
 * The venue-neutral capability surface: what the venue IS (identity, chains,
 * simulation support, native optimization) — pure data. Quote-surface
 * semantics (swap kinds, quote semantics, slippage protection) are
 * family-specific and live in the family extensions, never here.
 */
export interface VenueSurfaceDescriptor {
  /** The venue identity; MUST equal the pack id's packKey segment. */
  readonly venueKey: string;
  readonly displayName: string;
  /** Every chain the venue touches (≥1, canonical keys, includes the
   * protocol's chainKey). */
  readonly chains: readonly string[];
  readonly supportsSimulation: boolean;
  /** Optional provider-native optimization declaration (the baseline). */
  readonly nativeOptimization?: PackNativeOptimizationDeclaration;
}

// ---------------------------------------------------------------------------
// Constraints (declared, never authority)
// ---------------------------------------------------------------------------

export const PACK_CONSTRAINT_KINDS = Object.freeze([
  'PRECONDITION',
  'ASSUMPTION',
  'LIMITATION',
  'OPERATIONAL_REQUIREMENT',
] as const);
export type PackConstraintKind = (typeof PACK_CONSTRAINT_KINDS)[number];

/**
 * A declared constraint/assumption. A pack MAY express constraints; it can
 * NEVER authorize — `authorityCarrier: false` is a literal type and the
 * validator rejects any other value (the declarative law, type-visible).
 */
export interface PackConstraint {
  readonly constraintId: string;
  readonly kind: PackConstraintKind;
  readonly description: string;
  /** LITERAL: a constraint is data, never an authorization carrier. */
  readonly authorityCarrier: false;
}

// ---------------------------------------------------------------------------
// Certification (required, status never carried)
// ---------------------------------------------------------------------------

/**
 * The pack's certification declaration. Every pack requires certification
 * in the capability fabric before any effect (the INV-13 catalogue law),
 * and a pack descriptor NEVER carries certification status — the
 * append-only certification ledger (capability lane) owns status.
 */
export interface PackCertificationDeclaration {
  /** LITERAL: certification is always required before any effect. */
  readonly certificationRequired: true;
  /** LITERAL: a pack can never carry its own certification status. */
  readonly statusCarried: false;
}

// ---------------------------------------------------------------------------
// Provenance (versioned + canonical)
// ---------------------------------------------------------------------------

/**
 * The pack's provenance: who declared it, where the artifact lives, and the
 * content digest of the canonical pack projection (everything except this
 * digest field) — re-derived at validation so any silent mutation of pack
 * data is detectable (binding-never-security).
 */
export interface PackProvenance {
  readonly declaredBy: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

// ---------------------------------------------------------------------------
// Sub-pack references (family composition, resolved by the registry)
// ---------------------------------------------------------------------------

/**
 * A reference to a composed sub-pack. References (not embedded objects) so
 * the registry can enforce: every referenced pack is registered BEFORE the
 * composer (fail closed, never fabricates) and the composition respects the
 * family-compatibility law (PACK_FAMILY_COMPOSITION).
 */
export interface PackSubPackRef {
  /** Exact versioned pack id of the composed pack. */
  readonly packId: string;
  /** The sub-pack's declared role in the composition, e.g. 'source-venue'. */
  readonly role: string;
  /** Declared assumptions the composer makes about the sub-pack. */
  readonly assumptions: readonly string[];
}

// ---------------------------------------------------------------------------
// The implementation descriptor (old ProtocolImplementation, pure data)
// ---------------------------------------------------------------------------

/**
 * The provider implementation descriptor of the pack's protocol surface:
 * who implements it and through which adapter. The capabilityId is
 * re-derived at validation from the protocol descriptor (a pack's venue
 * surface, protocol declarations and implementation are ONE venue — never
 * two, the old coupling law).
 */
export interface PackImplementationDescriptor {
  /** Deterministic: `impl:${protocolKey}:${providerKey}`. */
  readonly implementationId: string;
  /** MUST equal protocolCapabilityId(protocolKey, chainKey) — re-derived. */
  readonly capabilityId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  /** The adapter that executes this surface (wired at integration). */
  readonly adapterRef: string;
  readonly implementationNotes: string;
  readonly knownDeviations: readonly string[];
  /**
   * The provider-native optimization is representable as a capability
   * (INV-C08): benchmarked as the incumbent baseline, never structurally
   * disadvantaged.
   */
  readonly nativeOptimization: {
    readonly representableAsCapability: true;
    readonly capabilityId: string;
  };
  readonly protocolKey: string;
  readonly chainKey: string;
}

// ---------------------------------------------------------------------------
// The onchain extension pack (the core wire shape)
// ---------------------------------------------------------------------------

/**
 * A declarative onchain extension pack: a versioned descriptor of a venue
 * family's capability surface — what the venue offers, how it is addressed,
 * which contracts comprise it, which constraints it declares. NEVER
 * execution, NEVER I/O, NEVER financial authority. The family-specific
 * surface lives in `familyExtension` (see wire/families.ts).
 */
export interface OnchainExtensionPack {
  /** Canonical identity: `onchain-pack/${family}/${packKey}@${version}`. */
  readonly packId: string;
  readonly family: PackFamily;
  /** Semantic version; MUST equal the pack id's version segment. */
  readonly version: string;
  /** The venue-neutral capability surface (identity + chains + optimization). */
  readonly venueSurface: VenueSurfaceDescriptor;
  /** The canonical protocol catalogue entry (INV-SC01 declarations). */
  readonly protocol: ProtocolDescriptor;
  /** The provider implementation descriptor of this pack's protocol. */
  readonly implementation: PackImplementationDescriptor;
  /** The family-specific capability surface (discriminated on `family`). */
  readonly familyExtension: PackFamilyExtension;
  /** Composed sub-packs (references, resolved by the registry). */
  readonly subPacks: readonly PackSubPackRef[];
  /** Declared constraints/assumptions — data, never authority. */
  readonly constraints: readonly PackConstraint[];
  /** Certification: always required, status never carried. */
  readonly certification: PackCertificationDeclaration;
  /** Provenance + canonical content digest (tamper evidence). */
  readonly provenance: PackProvenance;
}
