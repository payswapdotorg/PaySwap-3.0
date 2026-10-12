/**
 * CapabilityDefinition — hierarchy layer 1 (P2-W1; ADAPT of
 * payswap.org@8a735bf packages/capabilities/src/capability.ts, "FROZEN §11"
 * Capability contracts).
 *
 * Canonical hierarchy (spec/architecture/CAPABILITY-MODEL.md):
 *   CapabilityDefinition -> ProviderImplementation ->
 *   ConnectedCapabilityInstance -> CapabilityObservation.
 *
 * A CapabilityDefinition is CATALOGUE data: it describes POTENTIAL provider
 * behavior (conditions, cost, risk, provenance, economic accountability,
 * proof requirements, bond/collateral/recourse). It is versioned contract
 * data — but catalogue data NEVER authorizes an effect (canonical INV-13;
 * enforced at the connected-instance boundary and by the corridor
 * projection, never assumed here).
 *
 * Executable vs non-executable is a DISCRIMINATED union: an executable
 * definition CANNOT exist without its fourteen-part declaration
 * (executable-declaration.ts); a non-executable definition carries an
 * explicit reason (silent absence is impossible).
 *
 * AmountSpec (exact money on the wire) is consumed TYPE-ONLY from
 * @payswap/trust — the single accepted sibling import for this lane (the
 * AmountSpec wire TYPE authority, P1-W3 accepted). Runtime coupling is
 * zero: the import is erased at runtime (machine-checked by the boundary
 * test). Proof levels are the trust lane's vocabulary; the VALUES are
 * pinned locally byte-identical ('P0'..'P5') and cross-lane consistency is
 * asserted by tests (the accepted structural-pin pattern).
 */

import type { AmountSpec, ProofLevel, ProofRequirement } from '@payswap/trust';
import type { CapabilityDefinitionId, VersionString } from './identifiers.ts';
import type { ExecutableCapabilityDeclaration } from './executable-declaration.ts';

/**
 * Structural pin of the trust lane's PROOF_LEVELS VALUES ('P0'..'P5') —
 * aligned with @payswap/trust mandate.ts; consistency is test-enforced.
 * (Value import would be a runtime dependency; this lane stays types-only.)
 */
export const PROOF_LEVEL_PIN = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type PinnedProofLevel = (typeof PROOF_LEVEL_PIN)[number];

/**
 * Capability classes (old "FROZEN §11" vocabulary, carried forward). The
 * same model represents banks, PSPs, cards, mobile money, Stripe/Connect,
 * FX, credit/liquidity, chains, wallets, DEXs, bridges, smart-contract
 * protocols, data providers, experts, agents and future services.
 */
export const CAPABILITY_CLASSES = [
  'rail_movement',
  'liquidity',
  'fx',
  'credit',
  'lending',
  'merchant_acceptance',
  'identity_kyc_aml',
  'expert_resolution',
  'agent_behavior',
  'software_extension',
  'developer_service',
  'verification',
  'data_oracle',
] as const;

export type CapabilityClass = (typeof CAPABILITY_CLASSES)[number];

export function isCapabilityClass(value: unknown): value is CapabilityClass {
  return (
    typeof value === 'string' &&
    (CAPABILITY_CLASSES as readonly unknown[]).includes(value)
  );
}

/** Classes that fund a payment. Merchant acceptance is deliberately absent. */
export type FundingSourceClass = 'liquidity' | 'credit' | 'lending';

export function isFundingSourceClass(cls: CapabilityClass): cls is FundingSourceClass {
  return cls === 'liquidity' || cls === 'credit' || cls === 'lending';
}

/** Hard constraints run before soft optimization. */
export interface CapabilityCondition {
  readonly kind: 'precondition' | 'eligibility' | 'jurisdiction' | 'compliance';
  readonly description: string;
  readonly hardConstraint: boolean;
}

export interface CostComponent {
  readonly componentId: string;
  readonly kind: 'fixed_fee' | 'per_use_fee' | 'variable_fee_bps';
  readonly amount?: AmountSpec;
  readonly bps?: bigint;
}

export interface RiskDescriptor {
  readonly riskClass: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly mitigations: readonly string[];
}

export interface ProvenanceDescriptor {
  readonly declaredBy: string;
  readonly artifactRef: string;
  readonly contentHash: string;
}

/** Economic accountability metadata (must be available). */
export interface EconomicAccountability {
  readonly accountablePartyRef: string;
  readonly ledgerAccountRef: string;
  readonly recoursePolicyRef: string;
}

export interface BondCollateralRecourse {
  readonly bondAmount: AmountSpec;
  readonly collateralType: string;
  readonly recourseMechanism: string;
}

/** Base (layer-1) metadata shared by every capability definition. */
interface CapabilityDefinitionBase {
  readonly id: CapabilityDefinitionId;
  readonly version: VersionString;
  readonly capabilityClass: CapabilityClass;
  readonly conditions: readonly CapabilityCondition[];
  readonly cost: readonly CostComponent[];
  readonly risk: RiskDescriptor;
  readonly provenance: ProvenanceDescriptor;
  readonly economicAccountability: EconomicAccountability;
  readonly proofRequirements: readonly ProofRequirement[];
  readonly bondCollateralRecourse?: BondCollateralRecourse;
}

/**
 * An EXECUTABLE capability definition: describes potential provider behavior
 * AND carries the mandatory fourteen-part executable declaration
 * (CAPABILITY-MODEL law — semantics, state machine, preconditions,
 * authorization requirements, financial-effect class, idempotency/retry,
 * compensation/cancellation, partial execution, user actions,
 * provider-state mapping, external IDs/revisions, evidence requirements,
 * economic terms, jurisdiction/eligibility constraints).
 */
export interface ExecutableCapabilityDefinition extends CapabilityDefinitionBase {
  readonly executable: true;
  readonly execution: ExecutableCapabilityDeclaration;
}

/**
 * A NON-executable capability definition (informational, acceptance-only,
 * advisory): executable absence is EXPLICIT, never silent.
 */
export interface NonExecutableCapabilityDefinition extends CapabilityDefinitionBase {
  readonly executable: false;
  readonly nonExecutableReason: string;
}

export type CapabilityDefinition =
  | ExecutableCapabilityDefinition
  | NonExecutableCapabilityDefinition;

/** Terms under which a merchant accepts payments (acceptance semantics). */
export interface AcceptanceTerms {
  readonly supportsRecurring: boolean;
  readonly supportsPartialPayments: boolean;
  readonly supportsRefunds: boolean;
  readonly recoursePolicyRef: string;
}

/**
 * AcceptanceCapabilityDefinition — first-class and distinct from any funding
 * source ("merchant acceptance is distinct from funding source"). It fixes
 * the class to 'merchant_acceptance' and adds acceptance-specific terms.
 * Funding is expressed by separate capabilities of class liquidity/credit/
 * lending — never by acceptance. Acceptance definitions are NON-executable
 * by construction (acceptance is an advertisement surface; executing a
 * payment uses a rail_movement/liquidity/fx capability).
 */
export interface AcceptanceCapabilityDefinition extends NonExecutableCapabilityDefinition {
  readonly capabilityClass: 'merchant_acceptance';
  readonly acceptedPaymentMethods: readonly string[];
  readonly acceptedCurrencies: readonly string[];
  readonly acceptedCountries: readonly string[];
  readonly terms: AcceptanceTerms;
  readonly settlementDestinationRef?: string;
}

/** Type-level narrowing guard for executable definitions. */
export function isExecutableCapabilityDefinition(
  definition: CapabilityDefinition,
): definition is ExecutableCapabilityDefinition {
  return definition.executable === true;
}

/** Type-level narrowing guard for non-executable definitions. */
export function isNonExecutableCapabilityDefinition(
  definition: CapabilityDefinition,
): definition is NonExecutableCapabilityDefinition {
  return definition.executable === false;
}

/** Structural narrowing guard for acceptance definitions. */
export function isAcceptanceCapabilityDefinition(
  value: CapabilityDefinition,
): value is AcceptanceCapabilityDefinition {
  const candidate = value as Partial<AcceptanceCapabilityDefinition>;
  return (
    candidate.capabilityClass === 'merchant_acceptance' &&
    Array.isArray(candidate.acceptedPaymentMethods) &&
    Array.isArray(candidate.acceptedCurrencies) &&
    Array.isArray(candidate.acceptedCountries) &&
    candidate.terms !== undefined &&
    candidate.terms !== null
  );
}

