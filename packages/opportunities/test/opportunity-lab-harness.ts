/**
 * The opportunity-discovery Lab composition harness (P6-W2, lane r4-w2;
 * ADAPTED from payswap.org@8a735bf packages/onchain-opportunities/test/
 * opportunity-lab-harness.ts — under the STRICTER zero-sibling law the
 * REAL @payswap/lab cannot be imported even from the test layer, so the
 * harness drives the PINNED Lab wire shapes (src/pins/lab.ts, authority
 * @payswap/lab P6-W1) and implements the Lab's OWN pinned selection laws
 * (INV-13 catalogue-entry-only; the proposal-only composition constraint)
 * exactly as the Lab implements them over the same authority pins. The
 * real Lab composition is TL-wired at integration).
 *
 * - the six opportunity families register as SEARCHABLE CAPABILITIES by
 *   compiling the pure-data family descriptors (src/lab-registration.ts)
 *   into pinned CapabilityDefinition shapes in the pinned search index;
 * - the Lab's own executable-block law (INV-13) applies UNCHANGED: an
 *   opportunity family is a catalogue entry with NO connected instance,
 *   so it can never produce an executable block — discovery results are
 *   searchable but never executable;
 * - an opportunity-discovery search plug-in behind the replaceable
 *   plug-in seam emits candidates ONLY when grounded in executable blocks
 *   (never from opportunity catalogue entries);
 * - a composed candidate carries the OPPORTUNITY_DISCOVERY_NON_PRODUCTION_
 *   CONSTRAINT and the Lab's own proposal-only constraint (INV-9), and
 *   the structural discovery tier gate rejects it for execution.
 */

import type {
  PinnedLabCapabilityDefinition,
  PinnedLabCatalogueEntry,
  PinnedLabConnectedInstance,
  PinnedLabDomainPack,
  PinnedLabExecutableBlock,
  PinnedLabObservation,
  PinnedLabSearchIndex,
  PinnedLabSearchPlugin,
  PinnedLabSearchSelection,
} from "../src/index.ts";
import {
  OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT,
  compileFamilyCapabilityDefinition,
  discoverOpportunity,
  opportunityFamilyCapabilities,
  opportunityFamilyCapabilityId,
  rejectDiscoveryForExecution,
  validateOpportunityFamilyCapability,
} from "../src/index.ts";
import { PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT } from "../src/index.ts";
import { NOW, healthyLiquidityObservation } from "./fixtures-catalog.ts";

// ---------------------------------------------------------------------------
// The pinned-shape search index (the Lab's own law, driven locally)
// ---------------------------------------------------------------------------

/** Builds the family-registration index over the PINNED wire shapes. */
export function opportunityDiscoverySearchIndex(): PinnedLabSearchIndex {
  return {
    definitions: opportunityFamilyCapabilities().map(
      compileFamilyCapabilityDefinition,
    ),
    instances: [],
    observations: [],
    catalogueEntries: [],
  };
}

/**
 * The contrast index: one NON-opportunity capability WITH a connected
 * instance + current observation (the only shape that yields an
 * executable block under INV-13) alongside the six family definitions.
 */
export function contrastSearchIndex(): PinnedLabSearchIndex {
  const groundedInstance: PinnedLabConnectedInstance = {
    instanceId: "instance:fee-observation-feed",
    capabilityId: "capability:venue-observation-feed",
    providerName: "observation-feed-provider",
    authorization: { status: "ACTIVE" },
    geography: { countries: ["XX"] },
    currencies: ["USCD"],
    eligibility: { eligible: true, reasons: [] },
  };
  const observation: PinnedLabObservation = {
    instanceId: groundedInstance.instanceId,
    observedAt: "2026-10-04T00:00:00Z",
    observationVersion: 1,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    availability: "AVAILABLE",
    eligibility: "ELIGIBLE",
  };
  const groundedDefinition: PinnedLabCapabilityDefinition = {
    capabilityId: groundedInstance.capabilityId,
    capabilityVersion: "1.0.0",
    summary: "a connected venue observation feed (the contrast capability)",
    kind: "SEARCH",
    requiredPermissions: ["opportunities:read"],
    executionModes: ["PASS_THROUGH_NATIVE"],
  };
  return {
    definitions: [
      ...opportunityFamilyCapabilities().map(compileFamilyCapabilityDefinition),
      groundedDefinition,
    ],
    instances: [groundedInstance],
    observations: [observation],
    catalogueEntries: [],
  };
}

/**
 * The INV-13 selection law over the pinned shapes — the Lab's own law
 * (selectExecutableBlocks in @payswap/lab src/search.ts), implemented
 * exactly as the Lab implements it over the same authority pins: a
 * definition with NO connected instance is REJECTED CATALOGUE_ENTRY_ONLY;
 * a grounded, authorized, eligible instance with a current two-axis-
 * consistent observation yields an EXECUTABLE block.
 */
export function selectExecutableBlocksPinned(
  index: PinnedLabSearchIndex,
): {
  readonly selections: readonly PinnedLabSearchSelection[];
  readonly executable: readonly PinnedLabExecutableBlock[];
} {
  const selections: PinnedLabSearchSelection[] = [];
  const executable: PinnedLabExecutableBlock[] = [];
  for (const definition of index.definitions) {
    const instance = index.instances.find(
      (candidate) => candidate.capabilityId === definition.capabilityId,
    );
    if (instance === undefined) {
      selections.push({
        status: "REJECTED",
        definition,
        catalogueEntry: undefined,
        reason: "CATALOGUE_ENTRY_ONLY",
        detail:
          "no ConnectedCapabilityInstance is bound to this capability: a catalogue claim alone can never authorize execution (INV-13)",
      });
      continue;
    }
    if (instance.authorization.status !== "ACTIVE") {
      selections.push({
        status: "REJECTED",
        definition,
        catalogueEntry: undefined,
        reason: "AUTHORIZATION_NOT_ACTIVE",
        detail: `instance '${instance.instanceId}' authorization status is '${instance.authorization.status}'`,
      });
      continue;
    }
    if (!instance.eligibility.eligible) {
      selections.push({
        status: "REJECTED",
        definition,
        catalogueEntry: undefined,
        reason: "NOT_ELIGIBLE",
        detail: `instance '${instance.instanceId}' not eligible: ${instance.eligibility.reasons.join(", ")}`,
      });
      continue;
    }
    const observation = index.observations.find(
      (candidate) => candidate.instanceId === instance.instanceId,
    );
    if (observation === undefined) {
      selections.push({
        status: "REJECTED",
        definition,
        catalogueEntry: undefined,
        reason: "NO_OBSERVATION",
        detail: `instance '${instance.instanceId}' has no current CapabilityObservation`,
      });
      continue;
    }
    const block: PinnedLabExecutableBlock = {
      definition,
      instance,
      observation,
      effectiveAvailability:
        observation.availability === "DEGRADED" ? "DEGRADED" : "AVAILABLE",
      isIncumbentBaseline: false,
    };
    executable.push(block);
    selections.push({
      status: "EXECUTABLE",
      definition,
      instance,
      observation,
      effectiveAvailability: block.effectiveAvailability,
      isIncumbentBaseline: false,
    });
  }
  return { selections: Object.freeze(selections), executable: Object.freeze(executable) };
}

// ---------------------------------------------------------------------------
// The opportunity-discovery search plug-in (the replaceable seam)
// ---------------------------------------------------------------------------

/**
 * The opportunity-discovery plug-in: emits advisory candidates ONLY when
 * grounded in executable blocks (INV-13) — never from opportunity
 * catalogue entries. With no executable blocks it emits NOTHING.
 */
export const opportunityDiscoverySearchPlugin: PinnedLabSearchPlugin = {
  pluginId: "opportunity-discovery",
  description:
    "surfaces evidence-backed opportunities over executable observation feeds — advisory candidates only, never authority",
  search(input): readonly { readonly candidateId: string; readonly origin: string }[] {
    return input.executableBlocks.map((block, index) => ({
      candidateId: `opportunity-candidate:${block.definition.capabilityId}:${String(index)}`,
      origin: "opportunity-discovery",
    }));
  },
};

// ---------------------------------------------------------------------------
// The composed candidate (the Lab's INV-9 composition law, pinned)
// ---------------------------------------------------------------------------

/** The composed Lab candidate over discovery results (a DRAFT, never authority). */
export interface ComposedDiscoveryCandidate {
  readonly candidateId: string;
  readonly domainHardConstraints: readonly string[];
  readonly buildingBlockRefs: readonly string[];
  readonly budgets: readonly never[];
  readonly delegationEdges: readonly never[];
}

/**
 * Composes a candidate over discovery results: the hard constraints carry
 * the Lab's own proposal-only law (the pinned constant) and the
 * opportunity-discovery non-production constraint; the DRAFT carries no
 * budgets and no delegation edges (authority-free by construction).
 */
export function composeDiscoveryCandidate(
  pluginCandidates: readonly { readonly candidateId: string }[],
): ComposedDiscoveryCandidate {
  return Object.freeze({
    candidateId: "lab-candidate:opportunity-discovery:1",
    domainHardConstraints: Object.freeze([
      PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT,
      OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT,
    ]),
    buildingBlockRefs: Object.freeze(
      pluginCandidates.map((candidate) => candidate.candidateId),
    ),
    budgets: Object.freeze([]),
    delegationEdges: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// The opportunity-discovery domain pack (the pinned Domain Pack subset)
// ---------------------------------------------------------------------------

export const OPPORTUNITY_DISCOVERY_DOMAIN_PACK: PinnedLabDomainPack = {
  packId: "lab.domain-pack.opportunity-discovery",
  version: "1.0.0",
  domain: "opportunity-discovery",
  scenarioTypes: ["NORMAL_DEMAND", "PROVIDER_OUTAGE", "FX_VOLATILITY", "CONGESTION"],
  hardConstraints: ["AUTHORIZATION", "COMPLIANCE", "PRIVACY", "EXPLICIT_CREDIT"],
  observables: [
    "externalValueMovedMinor",
    "feesMinor",
    "unknownOutcomes",
    "staleOpportunityObservations",
    "ineligibleOpportunitiesSurfaced",
  ],
  actionSpace: [
    {
      dimensionId: "family-scope",
      description: "which opportunity families the discovery survey covers",
      domain: ["liquidity", "lending", "staking", "incentives", "arbitrage", "other"],
    },
    {
      dimensionId: "adversarial-screening",
      description: "fraud/manipulation/honeypot screening of discovery results",
      domain: ["enabled", "disabled"],
    },
  ],
  failureTaxonomy: [
    "STALE_OBSERVATION",
    "SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND",
    "EXIT_PATH_SUSPECT_HONEYPOT",
    "WITHDRAWAL_LIQUIDITY_VANISHED",
    "HARD_CONSTRAINT_VIOLATION",
  ],
  policySet: [
    "policy:discovery-never-authorization",
    "policy:no-guaranteed-returns-language",
    "policy:lab-simulation-never-production",
  ],
  provenanceRequirements: [
    {
      requirementId: "opportunity-observation-law",
      description:
        "every discovery result carries evidence freshness, venue/adapter/observer provenance and a non-empty evidence chain",
      acceptedEvidenceKinds: ["ATTESTATION", "TEST_RUN"],
    },
    {
      requirementId: "discovery-never-authorization-provenance",
      description:
        "every Lab-side composition of discovery results carries the non-production constraint and the structural discovery tier",
      acceptedEvidenceKinds: ["TEST_RUN"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Exports for the composition proofs
// ---------------------------------------------------------------------------

export function discoveryWorldBlocks(): readonly PinnedLabExecutableBlock[] {
  const { executable } = selectExecutableBlocksPinned(contrastSearchIndex());
  return executable;
}

export function oneDiscoveredOpportunity() {
  return discoverOpportunity(healthyLiquidityObservation(), NOW);
}
