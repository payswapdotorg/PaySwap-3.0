/**
 * @payswap/onchain-domain — chain definitions, implementations and connected
 * instances (P4-W1, lane R2-W1; ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/chain.ts).
 *
 * A blockchain is a settlement-rail family member (INV-17), NOT the product
 * identity and never a parallel ledger. The three contract layers reuse the
 * canonical capability-hierarchy structure (spec/architecture/
 * CAPABILITY-MODEL.md) through LOCAL STRUCTURAL PINS (src/pins.ts — zero
 * sibling imports, the v1 rails-layer law):
 *
 * - ChainDefinition extends the pinned NON-EXECUTABLE definition arm — the
 *   DESCRIPTIVE catalogue of a chain: neutral identity, family, finality
 *   semantics, optional family-scoped extension. A catalogue entry CARRIES
 *   NO AUTHORIZATION SCOPE: no instanceId, no account/tenant, no
 *   authorization, no credential scope, no permission state. The catalogue
 *   never authorizes (INV-13). A chain is an OBSERVATION SURFACE:
 *   consequential writes are separate onchain execution capabilities
 *   (./onchain-capabilities.ts), never chain catalogue entries — carried by
 *   the fabric's own executable/non-executable discriminator
 *   (`executable: false`, the adaptation of the old `kind: "READ"` law).
 * - ChainImplementation extends the pinned ProviderImplementation subset
 *   (layer 2) plus the canonical chainKey.
 * - ConnectedChainInstance extends the pinned ConnectedInstancePin (layer
 *   3) — the only chain-shaped authorization scope: a real provider
 *   account/tenant, authorization, credential scope, geography, currencies,
 *   permission state, eligibility, plus the chain identity and the optional
 *   family-scoped instance extension.
 *
 * Deterministic identity: a ChainDefinition's id is `chain.${chainKey}`
 * (chainKey = `${namespace}:${network}`), enforced by the validator — chain
 * identity is canonical, never free-form.
 */

import { CatalogueNotAuthorityError, ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import {
  finalityReorgConsistency,
  isChainFamily,
  isValidChainKey,
} from "./family.ts";
import type { ChainFamily, ChainFinalityModel, ChainReorgRisk } from "./family.ts";
import {
  validateChainDescriptorFamilyExtension,
  validateChainInstanceFamilyExtension,
} from "./family-extensions.ts";
import type {
  ChainDescriptorFamilyExtension,
  ChainInstanceFamilyExtension,
} from "./family-extensions.ts";
import type { PinnedNonExecutableDefinition, ProviderImplementationPin } from "./pins.ts";
import type { ConnectedInstancePin } from "./pins.ts";
import {
  isProviderCatalogueEntryPin,
  validatePinnedConnectedInstance,
  validatePinnedDefinitionBase,
  validatePinnedProviderImplementation,
} from "./pins-validation.ts";

// ---------------------------------------------------------------------------
// Neutral chain descriptor
// ---------------------------------------------------------------------------

/** Finality semantics a chain declares — always declared, never assumed. */
export interface ChainFinalitySemantics {
  readonly finalityModel: ChainFinalityModel;
  readonly reorgRisk: ChainReorgRisk;
  /** Documented, provider-neutral confirmation guidance (descriptive). */
  readonly confirmationGuidance: string;
}

/**
 * The neutral, descriptive chain descriptor: canonical identity, family,
 * display name, native asset reference and declared finality semantics. The
 * optional familyExtension is the ONLY place family-specific shapes may
 * appear, and it is never required.
 */
export interface ChainDescriptor {
  /** Canonical neutral identity, e.g. `ethereum:mainnet`. */
  readonly chainKey: string;
  readonly family: ChainFamily;
  /** Required when family is `OTHER` (a declared label for the family). */
  readonly familyLabel?: string;
  readonly displayName: string;
  /** Canonical asset reference of the chain's native asset. */
  readonly nativeAssetRef?: string;
  readonly finality: ChainFinalitySemantics;
  /** Optional family-scoped extension — never required by core contracts. */
  readonly familyExtension?: ChainDescriptorFamilyExtension;
}

// ---------------------------------------------------------------------------
// Layer 1 — ChainDefinition (descriptive catalogue; never authority)
// ---------------------------------------------------------------------------

/**
 * A chain as a descriptive, NON-EXECUTABLE catalogue entry (the observation
 * surface of a settlement-rail family member). Deterministic identity:
 * id === `chain.${chainKey}`. Carries no authorization scope of any kind —
 * execution requires a ConnectedChainInstance (INV-13).
 */
export interface ChainDefinition extends PinnedNonExecutableDefinition {
  readonly chain: ChainDescriptor;
}

/** Deterministic chain capability id: `chain.${chainKey}`. */
export function chainCapabilityId(chainKey: string): string {
  return `chain.${chainKey}`;
}

// ---------------------------------------------------------------------------
// Layer 2 — ChainImplementation
// ---------------------------------------------------------------------------

/** A provider's concrete implementation of chain access (layer 2 pin + chainKey). */
export interface ChainImplementation extends ProviderImplementationPin {
  /** The chain this implementation accesses (canonical chainKey). */
  readonly chainKey: string;
}

// ---------------------------------------------------------------------------
// Layer 3 — ConnectedChainInstance (the ONLY chain-shaped authorization scope)
// ---------------------------------------------------------------------------

/**
 * A genuinely connected chain instance (layer 3 pin): the full
 * ConnectedInstancePin scope (real account/tenant, authorization, credential
 * scope, geography, currencies, permission state, eligibility,
 * configuration — INV-13) plus the chain identity and the optional
 * family-scoped instance extension. Execution against a chain requires THIS
 * shape; a ChainDefinition or provider catalogue entry never substitutes.
 */
export interface ConnectedChainInstance extends ConnectedInstancePin {
  readonly chainKey: string;
  readonly family: ChainFamily;
  /** Optional family-scoped instance extension — never required. */
  readonly familyExtension?: ChainInstanceFamilyExtension;
}

// ---------------------------------------------------------------------------
// Validators (implementation)
// ---------------------------------------------------------------------------

/**
 * Validates the neutral chain descriptor. Deterministic rules:
 * - chainKey matches the canonical `${namespace}:${network}` format;
 * - family is a declared family (a label is REQUIRED for `OTHER`);
 * - finality semantics are declared (never assumed) and satisfy the
 *   finality/reorg consistency coupling (probabilistic or hybrid finality
 *   implies reorg risk PRESENT);
 * - an optional family extension must match the descriptor family and be
 *   well-formed.
 */
export function validateChainDescriptor(candidate: unknown): ChainDescriptor {
  if (!isRecord(candidate)) {
    throw new ValidationError("chain descriptor must be an object");
  }
  const record = candidate;
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError(
      "chainKey must match /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/ (e.g. 'ethereum:mainnet')",
    );
  }
  if (!isChainFamily(record.family)) {
    throw new ValidationError(
      "family must be a declared chain family (see CHAIN_FAMILIES)",
    );
  }
  if (record.family === "OTHER" && !isNonEmptyString(record.familyLabel)) {
    throw new ValidationError(
      "familyLabel is required when family is 'OTHER' — an undeclared family is never assumed",
    );
  }
  if (record.familyLabel !== undefined && !isNonEmptyString(record.familyLabel)) {
    throw new ValidationError("familyLabel, when present, must be a non-empty string");
  }
  if (!isNonEmptyString(record.displayName)) {
    throw new ValidationError("displayName must be a non-empty string");
  }
  if (record.nativeAssetRef !== undefined && !isNonEmptyString(record.nativeAssetRef)) {
    throw new ValidationError("nativeAssetRef, when present, must be a non-empty string");
  }

  const finality = record.finality;
  if (finality === null || typeof finality !== "object") {
    throw new ValidationError(
      "finality semantics must be declared (finalityModel, reorgRisk, confirmationGuidance) — never assumed",
    );
  }
  const finalityRecord = finality as Readonly<Record<string, unknown>>;
  const finalityModel = finalityRecord.finalityModel;
  const reorgRisk = finalityRecord.reorgRisk;
  const validFinalityModels: readonly ChainFinalityModel[] = [
    "PROBABILISTIC",
    "DETERMINISTIC",
    "INSTANT",
    "HYBRID",
  ];
  const validReorgRisks: readonly ChainReorgRisk[] = ["NONE", "PRESENT"];
  if (!validFinalityModels.includes(finalityModel as ChainFinalityModel)) {
    throw new ValidationError(
      "finality.finalityModel must be PROBABILISTIC, DETERMINISTIC, INSTANT or HYBRID",
    );
  }
  if (!validReorgRisks.includes(reorgRisk as ChainReorgRisk)) {
    throw new ValidationError("finality.reorgRisk must be NONE or PRESENT");
  }
  if (!isNonEmptyString(finalityRecord.confirmationGuidance)) {
    throw new ValidationError(
      "finality.confirmationGuidance must be a non-empty string (declared guidance, never assumed)",
    );
  }
  if (
    !finalityReorgConsistency(finalityModel as ChainFinalityModel, reorgRisk as ChainReorgRisk)
  ) {
    throw new ValidationError(
      "finality semantics are inconsistent: probabilistic or hybrid finality implies reorgRisk PRESENT; deterministic or instant implies NONE (reorg risk is never assumed away)",
    );
  }

  const familyExtension = record.familyExtension;
  let validatedFamilyExtension: ChainDescriptorFamilyExtension | undefined;
  if (familyExtension !== undefined) {
    validatedFamilyExtension = validateChainDescriptorFamilyExtension(
      familyExtension,
      record.family,
    );
  }

  const descriptor: ChainDescriptor = {
    chainKey: record.chainKey,
    family: record.family,
    displayName: record.displayName,
    finality: Object.freeze({
      finalityModel: finalityModel as ChainFinalityModel,
      reorgRisk: reorgRisk as ChainReorgRisk,
      confirmationGuidance: finalityRecord.confirmationGuidance as string,
    }),
    ...(isNonEmptyString(record.familyLabel) ? { familyLabel: record.familyLabel } : {}),
    ...(isNonEmptyString(record.nativeAssetRef) ? { nativeAssetRef: record.nativeAssetRef } : {}),
    ...(validatedFamilyExtension !== undefined ? { familyExtension: validatedFamilyExtension } : {}),
  };
  return Object.freeze(descriptor);
}

/**
 * Runtime validation for a chain definition: the pinned catalogue base
 * (id/version/class/provenance + the explicit non-executable declaration)
 * is validated first, then the chain descriptor rules and the deterministic
 * identity rule (`id === chain.${chainKey}`). A chain catalogue entry
 * declared EXECUTABLE is rejected — a chain is an observation surface;
 * consequential writes are onchain execution capabilities, never chain
 * catalogue entries.
 */
export function validateChainDefinition(candidate: unknown): ChainDefinition {
  const base = validatePinnedDefinitionBase(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (base.executable !== false) {
    throw new ValidationError(
      "a ChainDefinition is a descriptive, non-executable catalogue entry (a chain is an observation surface; consequential writes are onchain execution capabilities, never chain definitions)",
    );
  }
  const descriptor = validateChainDescriptor(record.chain);
  if (base.id !== chainCapabilityId(descriptor.chainKey)) {
    throw new ValidationError(
      `chain definition identity is deterministic: id must be '${chainCapabilityId(descriptor.chainKey)}' for chainKey '${descriptor.chainKey}'`,
    );
  }
  const definition: ChainDefinition = Object.freeze({
    ...base,
    executable: false,
    chain: descriptor,
  });
  return definition;
}

/** Runtime validation for a chain implementation (the pinned layer-2 subset + chainKey). */
export function validateChainImplementation(candidate: unknown): ChainImplementation {
  const base = validatePinnedProviderImplementation(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError(
      "chainKey must be a canonical `${namespace}:${network}` chain key",
    );
  }
  return Object.freeze({ ...base, chainKey: record.chainKey }) as ChainImplementation;
}

/**
 * Runtime validation for a connected chain instance: the full pinned
 * INV-13 scope, the canonical chainKey/family, the optional family-scoped
 * instance extension, and the deterministic chain capability id linkage.
 */
export function validateConnectedChainInstance(
  candidate: unknown,
): ConnectedChainInstance {
  const base = validatePinnedConnectedInstance(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError(
      "chainKey must be a canonical `${namespace}:${network}` chain key",
    );
  }
  if (!isChainFamily(record.family)) {
    throw new ValidationError(
      "family must be a declared chain family (see CHAIN_FAMILIES)",
    );
  }
  if (base.capabilityId !== chainCapabilityId(record.chainKey as string)) {
    throw new ValidationError(
      `connected chain instance must reference the deterministic chain capability id '${chainCapabilityId(record.chainKey as string)}' for chainKey '${String(record.chainKey)}'`,
    );
  }
  const familyExtension = record.familyExtension;
  if (familyExtension !== undefined) {
    // The extension validator enforces the family discriminant; the instance
    // family must match it.
    const extension = validateChainInstanceFamilyExtension(familyExtension);
    return Object.freeze({
      ...base,
      chainKey: record.chainKey,
      family: record.family,
      familyExtension: extension,
    });
  }
  return Object.freeze({
    ...base,
    chainKey: record.chainKey,
    family: record.family as ChainFamily,
  });
}

// ---------------------------------------------------------------------------
// Catalogue-never-authorizes guards (INV-13 discipline)
// ---------------------------------------------------------------------------

/**
 * Structural discrimination: is this value a chain catalogue shape (a chain
 * definition, or a bare chain descriptor) rather than a connected instance?
 * Deterministic rules: either it carries a chain descriptor, or it IS one
 * (canonical chainKey + family + declared finality semantics); and it
 * carries NO instanceId.
 */
export function isChainCatalogueShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as
    & Partial<ChainDefinition>
    & Partial<ConnectedChainInstance>
    & { chain?: unknown; chainKey?: unknown; family?: unknown; finality?: unknown };
  const carriesChainDescriptor =
    typeof candidate.chain === "object" && candidate.chain !== null;
  const isBareChainDescriptor =
    typeof candidate.chainKey === "string" &&
    isValidChainKey(candidate.chainKey) &&
    typeof candidate.family === "string" &&
    isChainFamily(candidate.family) &&
    typeof candidate.finality === "object" &&
    candidate.finality !== null;
  const lacksInstanceId =
    candidate.instanceId === undefined || candidate.instanceId === "";
  return (carriesChainDescriptor || isBareChainDescriptor) && lacksInstanceId;
}

/**
 * Runtime assertion for onchain execution paths: the value MUST be a
 * ConnectedChainInstance. Chain catalogue shapes (ChainDefinition, bare
 * descriptors) and provider catalogue entries (the pinned advertisement
 * shape) are rejected with the explicit catalogue-never-authorizes error
 * (INV-13); anything else fails the connected-instance validation.
 */
export function assertConnectedChainInstance(
  value: unknown,
): asserts value is ConnectedChainInstance {
  if (isChainCatalogueShape(value)) {
    throw new CatalogueNotAuthorityError(
      "INV-13: a ChainDefinition is a descriptive catalogue entry and can never authorize onchain execution — execution requires a ConnectedChainInstance scoped to a real account/tenant, authorization, credential scope, geography/currency and permission state",
    );
  }
  if (isProviderCatalogueEntryPin(value)) {
    throw new CatalogueNotAuthorityError(
      "INV-13: a provider catalogue entry is an advertisement and can never authorize execution — execution requires a ConnectedCapabilityInstance scoped to a real account/tenant, authorization, geography/currency and permission state",
      { catalogueEntryId: value.catalogueEntryId, providerName: value.providerName },
    );
  }
  validateConnectedChainInstance(value);
}
