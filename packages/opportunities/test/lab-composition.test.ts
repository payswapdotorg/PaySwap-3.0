import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT,
  DiscoveryExecutionRejectedError,
  opportunityFamilyCapabilities,
  opportunityFamilyCapabilityId,
  rejectDiscoveryForExecution,
  validateOpportunityFamilyCapability,
} from "../src/index.ts";
import { PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT } from "../src/index.ts";
import {
  OPPORTUNITY_DISCOVERY_DOMAIN_PACK,
  composeDiscoveryCandidate,
  contrastSearchIndex,
  opportunityDiscoverySearchIndex,
  opportunityDiscoverySearchPlugin,
  selectExecutableBlocksPinned,
  oneDiscoveredOpportunity,
} from "./opportunity-lab-harness.ts";

/**
 * The Lab composition (P6-W2; ADAPTED from the old lab-composition.test.ts
 * 13 titled sites — opportunities are searchable by the Lab and the Lab's
 * never-production-execution law extends to discovery results; the proofs
 * drive the PINNED Lab wire shapes through the test-layer harness, never
 * an import).
 */
describe("the Lab composition (searchable, never executable)", () => {
  it("the six families register as searchable capabilities with deterministic capability ids", () => {
    const capabilities = opportunityFamilyCapabilities();
    expect(capabilities).toHaveLength(6);
    for (const capability of capabilities) {
      expect(capability.capabilityId).toBe(
        opportunityFamilyCapabilityId(capability.family),
      );
      expect(capability.discoveryAuthority).toBe("NONE");
      expect(() => validateOpportunityFamilyCapability(capability)).not.toThrow();
    }
    expect(capabilities.map((capability) => capability.family)).toEqual([
      "liquidity",
      "lending",
      "staking",
      "incentives",
      "arbitrage",
      "other",
    ]);
  });

  it("the family descriptors are searchable text surfaces free of guarantee vocabulary", () => {
    for (const capability of opportunityFamilyCapabilities()) {
      expect(capability.summary.length).toBeGreaterThan(0);
      expect(capability.summary).not.toMatch(/guarantee/i);
      expect(capability.summary).not.toMatch(/risk[-\s]?free/i);
      expect(capability.summary).not.toMatch(/assured/i);
      for (const term of capability.searchableTerms) {
        expect(term.length).toBeGreaterThan(0);
      }
    }
  });

  it("the capability validator fails closed on a forged authority claim", () => {
    const [first] = opportunityFamilyCapabilities();
    if (first === undefined) {
      throw new Error("fixture family capability missing");
    }
    const forged = { ...first, discoveryAuthority: "EXECUTE" };
    expect(() => validateOpportunityFamilyCapability(forged)).toThrow(/discoveryAuthority/);
    const nonDeterministicId = {
      ...first,
      capabilityId: "opportunity-capability:some-other-family",
    };
    expect(() => validateOpportunityFamilyCapability(nonDeterministicId)).toThrow(
      /deterministic/,
    );
  });

  it("the pinned search index registers all six family definitions (searchable by domain query)", () => {
    const index = opportunityDiscoverySearchIndex();
    expect(index.definitions).toHaveLength(6);
    expect(index.instances).toEqual([]);
    expect(index.observations).toEqual([]);
    const { selections, executable } = selectExecutableBlocksPinned(index);
    expect(executable).toEqual([]);
    expect(selections).toHaveLength(6);
  });

  it("INV-13: every opportunity family is REJECTED CATALOGUE_ENTRY_ONLY — never an executable block", () => {
    const index = opportunityDiscoverySearchIndex();
    const { selections } = selectExecutableBlocksPinned(index);
    for (const selection of selections) {
      expect(selection.status).toBe("REJECTED");
      if (selection.status === "REJECTED") {
        expect(selection.reason).toBe("CATALOGUE_ENTRY_ONLY");
        expect(selection.detail).toMatch(/INV-13/);
      }
    }
  });

  it("the contrast index: ONLY the grounded non-opportunity capability yields an executable block", () => {
    const index = contrastSearchIndex();
    const { selections, executable } = selectExecutableBlocksPinned(index);
    expect(executable).toHaveLength(1);
    expect(executable[0]?.definition.capabilityId).toBe(
      "capability:venue-observation-feed",
    );
    const rejected = selections.filter((selection) => selection.status === "REJECTED");
    expect(rejected).toHaveLength(6);
    for (const selection of rejected) {
      if (selection.status === "REJECTED") {
        expect(selection.reason).toBe("CATALOGUE_ENTRY_ONLY");
      }
    }
  });

  it("an inactive authorization or missing observation rejects the grounded contrast instance (the law is total)", () => {
    const base = contrastSearchIndex();
    const inactive: typeof base = {
      ...base,
      instances: [
        {
          ...(base.instances[0] as NonNullable<typeof base.instances[0]>),
          authorization: { status: "REVOKED" },
        },
      ],
    };
    const revoked = selectExecutableBlocksPinned(inactive);
    expect(revoked.executable).toEqual([]);
    const reason = revoked.selections
      .filter((selection) => selection.status === "REJECTED")
      .map((selection) =>
        selection.status === "REJECTED" ? selection.reason : undefined,
      );
    expect(reason).toContain("AUTHORIZATION_NOT_ACTIVE");

    const unobserved: typeof base = { ...base, observations: [] };
    const noObservation = selectExecutableBlocksPinned(unobserved);
    expect(noObservation.executable).toEqual([]);
  });

  it("the opportunity-discovery plug-in emits NOTHING without executable blocks (grounded only)", () => {
    const { executable } = selectExecutableBlocksPinned(opportunityDiscoverySearchIndex());
    const candidates = opportunityDiscoverySearchPlugin.search({
      executableBlocks: executable,
      query: { domain: "opportunity-discovery" },
    });
    expect(candidates).toEqual([]);
  });

  it("the plug-in emits advisory candidates ONLY over executable blocks (never catalogue entries)", () => {
    const { executable } = selectExecutableBlocksPinned(contrastSearchIndex());
    const candidates = opportunityDiscoverySearchPlugin.search({
      executableBlocks: executable,
      query: { domain: "opportunity-discovery" },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.origin).toBe("opportunity-discovery");
    expect(candidates[0]?.candidateId).toContain("capability:venue-observation-feed");
  });

  it("a Lab candidate composed over discovery results carries the non-production + proposal-only constraints (INV-9)", () => {
    const { executable } = selectExecutableBlocksPinned(contrastSearchIndex());
    const candidates = opportunityDiscoverySearchPlugin.search({
      executableBlocks: executable,
      query: { domain: "opportunity-discovery" },
    });
    const composed = composeDiscoveryCandidate(candidates);
    expect(composed.domainHardConstraints).toContain(
      OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT,
    );
    expect(composed.domainHardConstraints).toContain(
      PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT,
    );
    // The DRAFT is authority-free: no budgets, no delegation edges.
    expect(composed.budgets).toEqual([]);
    expect(composed.delegationEdges).toEqual([]);
  });

  it("the composed candidate is REJECTED by the discovery execution gate (never authorization)", () => {
    const composed = composeDiscoveryCandidate([]);
    expect(() => rejectDiscoveryForExecution(composed)).toThrow(
      DiscoveryExecutionRejectedError,
    );
    // And the discovered opportunity itself fails the same gate.
    expect(() => rejectDiscoveryForExecution(oneDiscoveredOpportunity())).toThrow(
      DiscoveryExecutionRejectedError,
    );
  });

  it("the opportunity-discovery domain pack declares the observation-law provenance requirements", () => {
    const pack = OPPORTUNITY_DISCOVERY_DOMAIN_PACK;
    expect(pack.domain).toBe("opportunity-discovery");
    expect(pack.provenanceRequirements).toHaveLength(2);
    expect(pack.provenanceRequirements[0]?.requirementId).toBe(
      "opportunity-observation-law",
    );
    expect(pack.failureTaxonomy).toContain("STALE_OBSERVATION");
    expect(pack.failureTaxonomy).toContain("SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND");
    expect(pack.actionSpace[0]?.domain).toEqual([
      "liquidity",
      "lending",
      "staking",
      "incentives",
      "arbitrage",
      "other",
    ]);
  });

  it("the non-production constraint is the frozen never-production-execution law", () => {
    expect(OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT).toBe(
      "OPPORTUNITY_DISCOVERY_IS_NOT_PRODUCTION_EXECUTION",
    );
    expect(PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT).toBe(
      "LAB_COMPOSITION_IS_A_PROPOSAL_NOT_A_GRANT",
    );
  });
});
