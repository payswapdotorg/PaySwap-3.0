/**
 * Lab Domain Packs and the searchable building-block index (P6-W1; the P6
 * rebuild of the old payswap.org@8a735bf packages/lab domain-packs.ts, W2-004). A Domain Pack declares ALL TEN LAB.md dimensions: domain, scenario
 * types, hard constraints, objectives, observables, action space, failure
 * taxonomy, policy set, evaluation suite and provenance requirements.
 *
 * THE ACCEPTED RENAME (P6-W1): the building-block kind the old repo
 * called SERVICE_ACCESS is DECLARED_CAPABILITY here — a declared
 * developer-service capability block pinned via
 * pins/certification.ts PinnedDeclaredCapability.
 *
 * The building-block index treats — as FIRST-CLASS SEARCHABLE BLOCKS —
 * certified smart-contract capabilities, DECLARED_CAPABILITY blocks, PSP
 * connector capabilities and participation mechanisms. Indexing is
 * DISCOVERY ONLY: a block in this index is a proposal ingredient, never
 * execution authority (INV-9/INV-10 discipline). Provider-backed executable
 * selection happens in search.ts, grounded in ConnectedCapabilityInstance +
 * CapabilityObservation — never in catalogue definitions alone (INV-13):
 * this module indexes the static vocabulary, search.ts the live truth.
 */

import type {
  PinnedCapabilityClass,
  PinnedCapabilityDefinition,
} from "./pins/capability.ts";
import type {
  PinnedCertificationRecord,
  PinnedDeclaredCapability,
  PinnedSmartContractExtension,
} from "./pins/certification.ts";
import { pinnedIsSearchableByLab } from "./pins/certification.ts";
import type { HardConstraintId, ObjectiveId } from "./evaluation-spec.ts";
import { isHardConstraintId, isObjectiveId } from "./evaluation-spec.ts";
import { DomainPackValidationError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Domain Pack (all ten LAB.md declaration dimensions)
// ---------------------------------------------------------------------------

export const LAB_SCENARIO_TYPE_IDS = [
  "NORMAL_DEMAND",
  "LIQUIDITY_SHORTAGE",
  "PROVIDER_OUTAGE",
  "FX_VOLATILITY",
  "DELAYED_WRITE",
  "APPROVAL_DELAY",
  "STALE_OBSERVATION",
  "FRAUD",
  "COLLUSION",
  "MALICIOUS_AGENT",
  "INCENTIVE_GAMING",
  "PARTIAL_PAYMENT",
  "CONGESTION",
  "ADVERSARIAL_MODEL_BEHAVIOR",
] as const;
export type LabScenarioTypeId = (typeof LAB_SCENARIO_TYPE_IDS)[number];

/** Total predicate over the Lab scenario-type vocabulary. */
export function isLabScenarioTypeId(value: unknown): value is LabScenarioTypeId {
  return typeof value === "string" && (LAB_SCENARIO_TYPE_IDS as readonly unknown[]).includes(value);
}

/** One dimension of the pack's action space. */
export interface ActionDimension {
  readonly dimensionId: string;
  readonly description: string;
  readonly domain: readonly string[];
}

/** Reference to an evaluation suite (the baseline suite lives in scenarios.ts). */
export interface EvaluationSuiteRef {
  readonly suiteId: string;
  readonly version: string;
}

/** Provenance requirement for evidence used inside this domain. */
export interface ProvenanceRequirement {
  readonly requirementId: string;
  readonly description: string;
  /** Canonical evidence kinds consolidated by the capability lane. */
  readonly acceptedEvidenceKinds: readonly string[];
}

export interface DomainPack {
  readonly packId: string;
  readonly version: string;
  readonly domain: string;
  readonly scenarioTypes: readonly LabScenarioTypeId[];
  readonly hardConstraints: readonly HardConstraintId[];
  readonly objectives: readonly ObjectiveId[];
  readonly observables: readonly string[];
  readonly actionSpace: readonly ActionDimension[];
  readonly failureTaxonomy: readonly string[];
  readonly policySet: readonly string[];
  readonly evaluationSuite: EvaluationSuiteRef;
  readonly provenanceRequirements: readonly ProvenanceRequirement[];
}

/** Fail-closed validation of a Domain Pack declaration. */
export function validateDomainPack(candidate: DomainPack): readonly string[] {
  const errors: string[] = [];
  if (candidate.packId.length === 0) errors.push("packId must not be empty");
  if (!/^\d+\.\d+\.\d+$/.test(candidate.version)) errors.push(`version '${candidate.version}' must be semver-like`);
  if (candidate.domain.length === 0) errors.push("domain must not be empty");
  if (candidate.scenarioTypes.length === 0) errors.push("scenarioTypes must not be empty");
  for (const t of candidate.scenarioTypes) {
    if (!isLabScenarioTypeId(t)) errors.push(`unknown scenario type '${String(t)}'`);
  }
  if (candidate.hardConstraints.length === 0) errors.push("a domain pack must declare at least one hard constraint");
  for (const c of candidate.hardConstraints) {
    if (!isHardConstraintId(c)) errors.push(`unknown hard constraint '${String(c)}'`);
  }
  for (const o of candidate.objectives) {
    if (!isObjectiveId(o)) errors.push(`unknown objective '${String(o)}'`);
  }
  if (candidate.evaluationSuite.suiteId.length === 0) errors.push("evaluationSuite.suiteId must not be empty");
  return errors;
}

/** In-memory Domain Pack registry (deterministic registration order). */
export class DomainPackRegistry {
  private readonly packs = new Map<string, DomainPack>();

  register(pack: DomainPack): DomainPack {
    const errors = validateDomainPack(pack);
    if (errors.length > 0) throw new DomainPackValidationError(errors);
    if (this.packs.has(pack.packId)) {
      throw new DomainPackValidationError([`pack '${pack.packId}' is already registered`]);
    }
    this.packs.set(pack.packId, pack);
    return pack;
  }

  get(packId: string): DomainPack | undefined {
    return this.packs.get(packId);
  }

  /** Deterministic listing: registration order. */
  list(): readonly DomainPack[] {
    return [...this.packs.values()];
  }
}

// ---------------------------------------------------------------------------
// Searchable building blocks (LAB.md Lab responsibilities)
// ---------------------------------------------------------------------------

/**
 * The building-block kind vocabulary. NOTE THE ACCEPTED RENAME: the old
 * SERVICE_ACCESS kind is DECLARED_CAPABILITY here (a declared
 * developer-service capability block — pins/certification.ts shape).
 */
export const LAB_BUILDING_BLOCK_KINDS = [
  "CERTIFIED_SMART_CONTRACT",
  "DECLARED_CAPABILITY",
  "CONNECTOR_CAPABILITY",
  "PARTICIPATION_MECHANISM",
] as const;
export type LabBuildingBlockKind = (typeof LAB_BUILDING_BLOCK_KINDS)[number];

/** Total predicate over the building-block kind vocabulary. */
export function isLabBuildingBlockKind(value: unknown): value is LabBuildingBlockKind {
  return typeof value === "string" && (LAB_BUILDING_BLOCK_KINDS as readonly unknown[]).includes(value);
}

/** A certified smart-contract capability as a searchable block. */
export interface CertifiedSmartContractBlock {
  readonly blockKind: "CERTIFIED_SMART_CONTRACT";
  readonly blockId: string;
  readonly version: string;
  readonly capabilityClass: PinnedCapabilityClass;
  /** The declared smart-contract extension (pinned shape). */
  readonly extension: PinnedSmartContractExtension;
  /** The certification record that made this block searchable. */
  readonly certification: PinnedCertificationRecord;
}

/** A DECLARED_CAPABILITY block (the accepted P6-W1 rename of the old
 * ServiceAccessBlock): a declared developer-service capability block. */
export interface DeclaredCapabilityBlock {
  readonly blockKind: "DECLARED_CAPABILITY";
  readonly blockId: string;
  readonly version: string;
  readonly capability: PinnedDeclaredCapability;
}

/** A PSP connector capability DEFINITION as a searchable block (the static
 * vocabulary; executable selection additionally requires a
 * ConnectedCapabilityInstance + CapabilityObservation, INV-13 — search.ts). */
export interface ConnectorCapabilityBlock {
  readonly blockKind: "CONNECTOR_CAPABILITY";
  readonly blockId: string;
  readonly version: string;
  readonly definition: PinnedCapabilityDefinition;
  readonly certification: PinnedCertificationRecord;
}

/** A participation mechanism (incentive design) as a searchable block;
 * participation programs are versioned artifacts for mechanism search. */
export interface ParticipationMechanismBlock {
  readonly blockKind: "PARTICIPATION_MECHANISM";
  readonly blockId: string;
  readonly version: string;
  readonly description: string;
  /** e.g. 'rewards', 'reputation-projection', 'expert-matching'. */
  readonly incentiveKinds: readonly string[];
  /** Versioned reward-model reference (reproducibility discipline). */
  readonly rewardModelRef: string;
}

export type LabBuildingBlock =
  | CertifiedSmartContractBlock
  | DeclaredCapabilityBlock
  | ConnectorCapabilityBlock
  | ParticipationMechanismBlock;

/** Why a block registration was refused. */
export type BlockRegistrationRejection =
  | "SMART_CONTRACT_NOT_SEARCHABLE"
  | "CERTIFICATION_NOT_ACTIVE"
  | "CERTIFICATION_SUBJECT_MISMATCH"
  | "DECLARED_CAPABILITY_ID_MISMATCH"
  | "DUPLICATE_BLOCK_ID";

export type BlockRegistrationResult =
  | { readonly status: "REGISTERED"; readonly block: LabBuildingBlock }
  | {
      readonly status: "REJECTED";
      readonly reason: BlockRegistrationRejection;
      readonly detail: string;
    };

/** Shared duplicate-refusal helper (registration order preserved). */
function refused(
  reason: BlockRegistrationRejection,
  detail: string,
): BlockRegistrationResult {
  return { status: "REJECTED", reason, detail };
}

/**
 * The Lab's searchable building-block index. Deterministic: registration
 * order is preserved; queries return blocks in registration order.
 */
export class LabBuildingBlockIndex {
  private readonly blocks = new Map<string, LabBuildingBlock>();

  /**
   * Registers a certified smart-contract block. Searchability is gated by
   * the CERTIFIED status AND the extension's DECLARED flag
   * (pinnedIsSearchableByLab — "becomes searchable by the Lab after
   * certification"). A searchability flag is discovery, never authority.
   */
  registerCertifiedSmartContract(input: {
    blockId: string;
    version: string;
    capabilityClass: PinnedCapabilityClass;
    extension: PinnedSmartContractExtension;
    certification: PinnedCertificationRecord;
  }): BlockRegistrationResult {
    if (this.blocks.has(input.blockId)) {
      return refused("DUPLICATE_BLOCK_ID", `block '${input.blockId}' already registered`);
    }
    if (input.certification.subject.subjectId !== input.blockId) {
      return refused("CERTIFICATION_SUBJECT_MISMATCH", `certification subject '${input.certification.subject.subjectId}' does not match block '${input.blockId}'`);
    }
    if (input.certification.status !== "CERTIFIED") {
      return refused("CERTIFICATION_NOT_ACTIVE", `certification status is '${input.certification.status}', not CERTIFIED`);
    }
    if (!pinnedIsSearchableByLab(input.extension, input.certification.status)) {
      return refused("SMART_CONTRACT_NOT_SEARCHABLE", "extension did not declare searchableByLabAfterCertification (or is not CERTIFIED)");
    }
    const block: CertifiedSmartContractBlock = {
      blockKind: "CERTIFIED_SMART_CONTRACT",
      blockId: input.blockId,
      version: input.version,
      capabilityClass: input.capabilityClass,
      extension: input.extension,
      certification: input.certification,
    };
    this.blocks.set(input.blockId, block);
    return { status: "REGISTERED", block };
  }

  /** Registers a DECLARED_CAPABILITY block (the accepted P6-W1 rename). */
  registerDeclaredCapability(input: {
    blockId: string;
    version: string;
    capability: PinnedDeclaredCapability;
  }): BlockRegistrationResult {
    if (this.blocks.has(input.blockId)) {
      return refused("DUPLICATE_BLOCK_ID", `block '${input.blockId}' already registered`);
    }
    if (input.capability.id !== input.blockId) {
      return refused("DECLARED_CAPABILITY_ID_MISMATCH", `capability id '${input.capability.id}' does not match block '${input.blockId}'`);
    }
    const block: DeclaredCapabilityBlock = {
      blockKind: "DECLARED_CAPABILITY",
      blockId: input.blockId,
      version: input.version,
      capability: input.capability,
    };
    this.blocks.set(input.blockId, block);
    return { status: "REGISTERED", block };
  }

  /**
   * Registers a connector capability DEFINITION block (static vocabulary;
   * executable grounding is enforced by search.ts).
   */
  registerConnectorCapability(input: {
    definition: PinnedCapabilityDefinition;
    certification: PinnedCertificationRecord;
  }): BlockRegistrationResult {
    const blockId = input.definition.capabilityId;
    if (this.blocks.has(blockId)) {
      return refused("DUPLICATE_BLOCK_ID", `block '${blockId}' already registered`);
    }
    if (input.certification.status !== "CERTIFIED") {
      return refused("CERTIFICATION_NOT_ACTIVE", `certification status is '${input.certification.status}', not CERTIFIED`);
    }
    if (
      input.certification.subject.subjectId !== blockId ||
      input.certification.subject.version !== input.definition.capabilityVersion
    ) {
      return refused("CERTIFICATION_SUBJECT_MISMATCH", `certification subject '${input.certification.subject.subjectId}@${input.certification.subject.version}' does not match definition '${blockId}@${input.definition.capabilityVersion}'`);
    }
    const block: ConnectorCapabilityBlock = {
      blockKind: "CONNECTOR_CAPABILITY",
      blockId,
      version: input.definition.capabilityVersion,
      definition: input.definition,
      certification: input.certification,
    };
    this.blocks.set(blockId, block);
    return { status: "REGISTERED", block };
  }

  /** Registers a participation mechanism block. */
  registerParticipationMechanism(input: {
    blockId: string;
    version: string;
    description: string;
    incentiveKinds: readonly string[];
    rewardModelRef: string;
  }): BlockRegistrationResult {
    if (this.blocks.has(input.blockId)) {
      return refused("DUPLICATE_BLOCK_ID", `block '${input.blockId}' already registered`);
    }
    const block: ParticipationMechanismBlock = {
      blockKind: "PARTICIPATION_MECHANISM",
      blockId: input.blockId,
      version: input.version,
      description: input.description,
      incentiveKinds: [...input.incentiveKinds],
      rewardModelRef: input.rewardModelRef,
    };
    this.blocks.set(input.blockId, block);
    return { status: "REGISTERED", block };
  }

  get(blockId: string): LabBuildingBlock | undefined {
    return this.blocks.get(blockId);
  }

  /** Deterministic listing (registration order), optionally filtered. */
  query(filter?: {
    blockKind?: LabBuildingBlockKind;
    capabilityClass?: PinnedCapabilityClass;
  }): readonly LabBuildingBlock[] {
    return [...this.blocks.values()].filter((block) => {
      if (filter?.blockKind !== undefined && block.blockKind !== filter.blockKind) return false;
      if (filter?.capabilityClass !== undefined) {
        if (block.blockKind === "CERTIFIED_SMART_CONTRACT" && block.capabilityClass !== filter.capabilityClass) return false;
        if (block.blockKind === "DECLARED_CAPABILITY" && block.capability.capabilityClass !== filter.capabilityClass) return false;
      }
      return true;
    });
  }
}
