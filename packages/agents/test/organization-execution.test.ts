import { describe, expect, it } from "vitest";
import {
  OrganizationExecutionError,
  executeOrganizationCommand,
  releaseOrganization,
} from "../src/index.ts";
import type {
  AuthorityEpochState,
  OrganizationAuthorityAdapter,
  OrganizationCommandRequest,
  OrganizationDraft,
  OrganizationExecutionTrace,
  ReleasedOrganization,
} from "../src/index.ts";
import type { Mandate, PermissionGrant, Principal } from "@payswap/trust";
import {
  epochState,
  fakeAuthorityAdapter,
  makeOrgDraft,
  payerGrant,
  payerMandate,
  payerPrincipal,
  reviewerPrincipal,
} from "./fixtures.ts";

/**
 * Organization graph execution: deterministic scheduler over a RELEASED
 * version, every acting node resolved through the INJECTED authority
 * adapter (no bypass), delegation authority minted through the adapter's
 * attenuateGrant ONLY (INV-12), fail-closed rejections recorded as
 * evidence.
 *
 * ADAPTED from payswap.org@8a735bf
 * packages/agents/test/organization-execution.test.ts (11 tests): the old
 * test imported @payswap/trust VALUES (EpochLedger/issueGrant/evaluate) and
 * constructed runtime epoch ledgers. The 3.0 single-sibling law allows only
 * a TYPE-ONLY trust link, so the run wires the DETERMINISTIC FAKE AUTHORITY
 * ADAPTER (test/fixtures.ts) whose decision vocabulary and attenuation
 * semantics mirror the trust lane (stale_security_epoch, no_matching_grant,
 * `grant:<id>` ALLOW evidence, dimension-naming attenuation violations).
 * The assertions are unchanged.
 */

const NOW = 5_000_000;
const RELEASED_AT = 4_000_000;

function withEpoch(principal: Principal, securityEpoch: bigint): Principal {
  if (principal.kind === "agent" || principal.kind === "user") {
    return { ...principal, securityEpoch };
  }
  return principal;
}

function makeDraft(): OrganizationDraft {
  return makeOrgDraft();
}

function command(overrides: Partial<OrganizationCommandRequest> = {}): OrganizationCommandRequest {
  return {
    initiatingInstanceId: "instance-payer",
    action: "payments.initiate",
    resource: { type: "payment_intent", resourceId: "pi-1" },
    context: { amount: { currency: "EUR", minorUnits: "10000" } },
    requestHash: "reqhash-1",
    requestedAt: NOW,
    ...overrides,
  };
}

function principals(): Map<string, Principal> {
  return new Map<string, Principal>([
    ["instance-payer", payerPrincipal()],
    ["instance-reviewer", reviewerPrincipal()],
  ]);
}

function run(
  overrides: {
    organization?: OrganizationDraft | ReleasedOrganization;
    authority?: OrganizationAuthorityAdapter;
    grants?: readonly PermissionGrant[];
    epochState?: AuthorityEpochState;
    principals?: ReadonlyMap<string, Principal>;
    request?: Partial<OrganizationCommandRequest>;
  } = {},
): OrganizationExecutionTrace {
  return executeOrganizationCommand({
    organization: overrides.organization ?? releaseOrganization(makeDraft(), RELEASED_AT),
    request: command(overrides.request ?? {}),
    authority: overrides.authority ?? fakeAuthorityAdapter(),
    grants: overrides.grants ?? [payerGrant()],
    epochState: overrides.epochState ?? epochState(),
    principals: overrides.principals ?? principals(),
  });
}

describe("executeOrganizationCommand — fail-closed validation", () => {
  it("refuses to execute a DRAFT (unreleased) organization", () => {
    expect(() => run({ organization: makeDraft() })).toThrow(OrganizationExecutionError);
    expect(() => run({ organization: makeDraft() })).toThrow(/RELEASED/);
  });

  it("refuses unknown initiating instances and empty request fields", () => {
    expect(() => run({ request: { initiatingInstanceId: "instance-ghost" } })).toThrow(
      /not part of organization/,
    );
    expect(() => run({ request: { action: "" } })).toThrow(/action/);
    expect(() => run({ request: { requestHash: "" } })).toThrow(/requestHash/);
  });

  it("refuses unresolvable participant principals — never best-effort", () => {
    expect(() => run({ principals: new Map() })).toThrow(
      /no trust principal resolved for participating instance 'instance-payer'/,
    );
    const partial = new Map<string, Principal>([["instance-payer", payerPrincipal()]]);
    expect(() => run({ principals: partial })).toThrow(
      /no trust principal resolved for participating instance 'instance-reviewer'/,
    );
  });
});

describe("executeOrganizationCommand — no node bypasses authority", () => {
  it("every participant passes through the authority evaluate(); an unauthorized node is DENIED and recorded", () => {
    const trace = run({ grants: [] });
    expect(trace.relayOrder).toEqual(["instance-payer", "instance-reviewer"]);
    expect(trace.steps).toHaveLength(2);
    for (const step of trace.steps) {
      expect(step.decision.decision).toBe("DENY");
      if (step.decision.decision === "DENY") {
        expect(step.decision.reason).toBe("no_matching_grant");
      }
    }
    expect(trace.delegations).toHaveLength(0);
  });

  it("an initiator with a live grant acts (ALLOW); a stale epoch denies it", () => {
    const allowed = run();
    const initiator = allowed.steps.find((step) => step.instanceId === "instance-payer");
    expect(initiator?.decision.decision).toBe("ALLOW");

    // ADAPTATION: the epoch ledger is a raised-epoch map (the local
    // AuthorityEpochState view) instead of the trust EpochLedger class.
    const ledger = new Map<string, bigint>([["agent:agent-key-1", 1n]]);
    const raisedReviewer: Principal = withEpoch(reviewerPrincipal(), 1n);
    const stale = run({
      epochState: epochState(ledger),
      principals: new Map<string, Principal>([
        ["instance-payer", payerPrincipal()], // stale credential (epoch 0 < 1)
        ["instance-reviewer", raisedReviewer],
      ]),
    });
    const staleStep = stale.steps.find((step) => step.instanceId === "instance-payer");
    expect(staleStep?.decision.decision).toBe("DENY");
    if (staleStep?.decision.decision === "DENY") {
      expect(staleStep.decision.reason).toBe("stale_security_epoch");
    }
    // the raised-credential run still allows the initiator
    const raisedPayer: Principal = withEpoch(payerPrincipal(), 1n);
    const fresh = run({
      epochState: epochState(ledger),
      principals: new Map<string, Principal>([
        ["instance-payer", raisedPayer],
        ["instance-reviewer", raisedReviewer],
      ]),
    });
    const freshStep = fresh.steps.find((step) => step.instanceId === "instance-payer");
    expect(freshStep?.decision.decision).toBe("ALLOW");
  });
});

describe("executeOrganizationCommand — delegation via attenuate() ONLY (INV-12)", () => {
  it("mints a strictly-narrower child grant and the delegate acts under it", () => {
    const trace = run();
    expect(trace.delegations).toHaveLength(1);
    const delegation = trace.delegations[0];
    if (delegation === undefined) {
      throw new Error("fixture setup: expected one delegation record");
    }
    expect(delegation.fromInstanceId).toBe("instance-payer");
    expect(delegation.toInstanceId).toBe("instance-reviewer");
    const result = delegation.result;
    if (result.outcome === "DELEGATED") {
      expect(result.childGrantId).toBe("delegated:org:payops-1@1:2");
      const child = trace.grantPool.find((g) => g.grantId === result.childGrantId);
      expect(child).toBeDefined();
      if (child !== undefined) {
        // child authority is attenuated: exactly this action/resource, never wider
        expect(child.mandate.actions).toEqual(["payments.initiate"]);
        expect(child.mandate.resources).toEqual([{ type: "payment_intent", resourceId: "pi-1" }]);
        expect(child.mandate.grantee).toBe("agent:agent-key-2");
        expect(child.mandate.parentMandate).toEqual({ mandateId: "mandate-1", version: 1 });
        // full grant lineage back to the root
        expect(child.lineage).toEqual({ rootGrantId: "grant-payer", chain: ["grant-payer"] });
      }
    } else {
      expect.unreachable("expected the delegation to be minted");
    }
    const delegateStep = trace.steps.find((step) => step.instanceId === "instance-reviewer");
    expect(delegateStep?.decision.decision).toBe("ALLOW");
    expect(delegateStep?.actingUnderDelegationFrom).toBe("instance-payer");
  });

  it("rejects a delegation edge whose mandate no grant in the pool carries", () => {
    const draft: OrganizationDraft = {
      ...makeDraft(),
      delegationEdges: [
        {
          fromInstanceId: "instance-payer",
          toInstanceId: "instance-reviewer",
          mandateRef: { mandateId: "mandate-ghost", version: 1 },
        },
      ],
    };
    const trace = run({
      organization: releaseOrganization(draft, RELEASED_AT),
      grants: [payerGrant()],
    });
    const delegation = trace.delegations[0];
    expect(delegation?.result.outcome).toBe("REJECTED");
    if (delegation?.result.outcome === "REJECTED") {
      expect(delegation.result.reason).toMatch(/no grant in the pool carries mandate mandate-ghost/);
    }
    // the delegate never received authority: its step is denied
    const delegateStep = trace.steps.find((step) => step.instanceId === "instance-reviewer");
    expect(delegateStep?.decision.decision).toBe("DENY");
    expect(trace.grantPool).toHaveLength(1);
  });

  it("rejects a delegation whose mandate is held by someone other than the source", () => {
    // ADAPTATION: the "other" grant is a literal (the old test used the
    // trust issueGrant value import); the shape is identical.
    const heldByOther: Mandate = payerMandate({
      id: "mandate-other",
      grantee: "agent:agent-key-9",
    });
    const otherGrant: PermissionGrant = {
      grantId: "grant-other",
      mandate: heldByOther,
      grantorRef: heldByOther.grantor,
      granteeRef: heldByOther.grantee,
      issuedAt: NOW - 1,
      lineage: { rootGrantId: "grant-other", chain: [] },
    };
    const draft: OrganizationDraft = {
      ...makeDraft(),
      delegationEdges: [
        {
          fromInstanceId: "instance-payer",
          toInstanceId: "instance-reviewer",
          mandateRef: { mandateId: "mandate-other", version: 1 },
        },
      ],
    };
    const trace = run({
      organization: releaseOrganization(draft, RELEASED_AT),
      grants: [payerGrant(), otherGrant],
    });
    const delegation = trace.delegations[0];
    expect(delegation?.result.outcome).toBe("REJECTED");
    if (delegation?.result.outcome === "REJECTED") {
      expect(delegation.result.reason).toMatch(/cannot delegate authority it does not hold/);
    }
  });

  it("a delegation edge whose source was never authorized never fires", () => {
    // no grants at all: the payer cannot act, so its delegation edge cannot fire
    const trace = run({ grants: [] });
    expect(trace.delegations).toHaveLength(0);
    expect(trace.steps.every((step) => step.decision.decision === "DENY")).toBe(true);
  });

  it("authority never flows to instances unreachable over communication edges", () => {
    const draft: OrganizationDraft = { ...makeDraft(), communicationEdges: [] };
    const trace = run({ organization: releaseOrganization(draft, RELEASED_AT) });
    expect(trace.relayOrder).toEqual(["instance-payer"]);
    expect(trace.steps).toHaveLength(1);
    expect(trace.delegations).toHaveLength(0);
  });
});

describe("executeOrganizationCommand — determinism", () => {
  it("identical inputs produce byte-identical traces", () => {
    const one = run();
    const two = run();
    // ADAPTATION: 3.0 mandates carry issuedAtEpoch (bigint, TB-5 linkage
    // stamp) inside the traced grant pool, so JSON.stringify needs a
    // BigInt-aware replacer; the byte-identical assertion is unchanged.
    const stable = (trace: OrganizationExecutionTrace): string =>
      JSON.stringify(trace, (_key, value: unknown) =>
        typeof value === "bigint" ? `${value.toString()}n` : value,
      );
    expect(stable(one)).toBe(stable(two));
    expect(one.contentHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(one.organizationId).toBe("org:payops-1");
    expect(one.organizationVersion).toBe(1);
  });
});
