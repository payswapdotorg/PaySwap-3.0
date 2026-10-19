import { describe, expect, it } from "vitest";
import {
  NOW,
  discoveryCatalog,
  healthyLiquidityObservation,
  staleQuoteObservation,
} from "./fixtures-catalog.ts";
import {
  PINNED_PROPOSAL_SCHEMA_VERSION,
  ProposalSeamError,
  SEAM_FORBIDDEN_FIELDS,
  assertOpportunityProjectionIsAdvisory,
  discoverOpportunity,
  opportunityProposalDraft,
} from "../src/index.ts";

/**
 * The opportunity -> proposal -> decision seam (P6-W2; NET-NEW — the hard
 * law 2 surface: opportunities are inputs to decisions, never financial
 * authority; the projection is typed against the pinned agents proposal
 * wire and gated by the pinned protocol-command marker scan).
 */
describe("the opportunity -> proposal -> decision seam", () => {
  it("projects a CURRENT opportunity into an advisory strategy proposal draft (the pinned wire)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const draft = opportunityProposalDraft(
      opportunity,
      {
        proposalId: "proposal:liq:001",
        proposingInstance: "instance:discovery-1",
        expiresAt: NOW + 60_000,
      },
      NOW,
    );
    expect(draft.schemaVersion).toBe(PINNED_PROPOSAL_SCHEMA_VERSION);
    expect(draft.proposalId).toBe("proposal:liq:001");
    expect(draft.proposingInstance).toBe("instance:discovery-1");
    expect(draft.proposalType).toBe("strategy");
    expect(draft.expiresAt).toBe(NOW + 60_000);
    // The payload carries the deterministic identity, the seam name and
    // the downstream decision authority — nothing execution-shaped.
    expect(draft.payload.opportunityId).toBe(opportunity.opportunityId);
    expect(draft.payload.seam).toBe("opportunity->proposal->decision");
    expect(draft.payload.decisionAuthority).toBe("downstream-authorization-lanes");
  });

  it("the draft carries the FULL evidence-lineage refs (the observation law rides the seam)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const draft = opportunityProposalDraft(
      opportunity,
      {
        proposalId: "proposal:liq:002",
        proposingInstance: "instance:discovery-1",
        expiresAt: NOW + 60_000,
      },
      NOW,
    );
    expect(draft.evidenceRefs).toEqual([
      "evidence:pool-state:001",
      "evidence:fee-tier:001",
    ]);
  });

  it("a STALE opportunity is NEVER proposed as if current (fail closed, re-discover instead)", () => {
    const opportunity = discoverOpportunity(staleQuoteObservation(), NOW);
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        {
          proposalId: "proposal:stale:001",
          proposingInstance: "instance:discovery-1",
          expiresAt: NOW + 60_000,
        },
        NOW,
      ),
    ).toThrow(ProposalSeamError);
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        {
          proposalId: "proposal:stale:001",
          proposingInstance: "instance:discovery-1",
          expiresAt: NOW + 60_000,
        },
        NOW,
      ),
    ).toThrow(/STALE/);
  });

  it("the projection instant and expiry are caller-supplied and ordered (fail closed)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        { proposalId: "", proposingInstance: "i", expiresAt: NOW + 1 },
        NOW,
      ),
    ).toThrow(ProposalSeamError);
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        { proposalId: "p", proposingInstance: "", expiresAt: NOW + 1 },
        NOW,
      ),
    ).toThrow(ProposalSeamError);
    // An expiry AT or BEFORE the projection instant is malformed.
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        { proposalId: "p", proposingInstance: "i", expiresAt: NOW },
        NOW,
      ),
    ).toThrow(ProposalSeamError);
    expect(() =>
      opportunityProposalDraft(
        opportunity,
        { proposalId: "p", proposingInstance: "i", expiresAt: NOW - 1 },
        NOW,
      ),
    ).toThrow(ProposalSeamError);
  });

  it("the draft passes the marker scan; a smuggled command field fails closed (the pinned law)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const draft = opportunityProposalDraft(
      opportunity,
      {
        proposalId: "proposal:liq:003",
        proposingInstance: "instance:discovery-1",
        expiresAt: NOW + 60_000,
      },
      NOW,
    );
    expect(() => assertOpportunityProjectionIsAdvisory(draft)).not.toThrow();
    // Smuggled command shape at depth is detected by the seam's own gate.
    const smuggled = {
      ...JSON.parse(JSON.stringify(draft)),
      payload: {
        ...JSON.parse(JSON.stringify(draft.payload)),
        nested: { settlementInstructionId: "instr:smuggled" },
      },
    };
    expect(() => assertOpportunityProjectionIsAdvisory(smuggled)).toThrow(
      /protocol command field/,
    );
  });

  it("the seam exposes the frozen marker-field list (the audit surface)", () => {
    expect(SEAM_FORBIDDEN_FIELDS).toHaveLength(18);
    expect([...SEAM_FORBIDDEN_FIELDS]).toContain("settlementInstructionId");
    expect([...SEAM_FORBIDDEN_FIELDS]).toContain("authorization");
  });

  it("every healthy catalog opportunity projects; every stale one fails closed", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      const isStaleAtNow =
        entry.label.includes("stale") || entry.label === "liquidity:lineage-extended";
      if (isStaleAtNow) {
        expect(
          () =>
            opportunityProposalDraft(
              opportunity,
              {
                proposalId: `proposal:${entry.label}`,
                proposingInstance: "instance:discovery-1",
                expiresAt: NOW + 60_000,
              },
              NOW,
            ),
          entry.label,
        ).toThrow(ProposalSeamError);
      } else {
        const draft = opportunityProposalDraft(
          opportunity,
          {
            proposalId: `proposal:${entry.label}`,
            proposingInstance: "instance:discovery-1",
            expiresAt: NOW + 60_000,
          },
          NOW,
        );
        expect(draft.proposalType, entry.label).toBe("strategy");
        expect(draft.evidenceRefs.length, entry.label).toBeGreaterThan(0);
      }
    }
  });

  it("the estimate summary is honest: UNKNOWN estimates say so, bounds are named", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const draft = opportunityProposalDraft(
      opportunity,
      {
        proposalId: "proposal:liq:004",
        proposingInstance: "instance:discovery-1",
        expiresAt: NOW + 60_000,
      },
      NOW,
    );
    expect(draft.rationale).toMatch(/estimate with uncertainty bounds, not a claim/);
    expect(draft.payload.estimate).toMatch(/431\/10000/);
  });

  it("the draft is deterministic: same opportunity, same input, same instant -> identical draft", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const input = {
      proposalId: "proposal:determinism",
      proposingInstance: "instance:discovery-1",
      expiresAt: NOW + 60_000,
    };
    const first = opportunityProposalDraft(opportunity, input, NOW);
    const second = opportunityProposalDraft(opportunity, input, NOW);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
