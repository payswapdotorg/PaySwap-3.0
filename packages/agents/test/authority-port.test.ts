import { describe, expect, it } from "vitest";
import type * as Trust from "@payswap/trust";
import {
  executeOrganizationCommand,
  releaseOrganization,
} from "../src/index.ts";
import type {
  AuthorityEpochState,
  OrganizationAuthorityAdapter,
} from "../src/index.ts";
import type { Equal, Expect } from "./type-utils.ts";
import {
  epochState,
  fakeAuthorityAdapter,
  payerGrant,
  payerPrincipal,
  reviewerPrincipal,
} from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): the authority port. The organization-execution engine
 * resolves every acting node through the INJECTED OrganizationAuthorityAdapter.
 * These tests pin:
 * - the port is STRUCTURALLY COMPATIBLE with the real @payswap/trust
 *   functions (compile-time wiring proof — the composition root can wire
 *   principalRef/evaluate/attenuateGrant directly);
 * - the engine fails closed without an authority seam;
 * - the local AuthorityEpochState view accepts the real trust EpochState
 *   shape (structural supertype).
 */

// ---------------------------------------------------------------------------
// Compile-time wiring proof (enforced by `tsc --noEmit`).
// ---------------------------------------------------------------------------

// The real trust functions, as types, satisfy the port directly:
type Wired = {
  principalRef: typeof Trust.principalRef;
  evaluate: typeof Trust.evaluate;
  attenuateGrant: typeof Trust.attenuateGrant;
};
type _wired = Wired extends OrganizationAuthorityAdapter ? true : false;
type _assertWired = Expect<Equal<_wired, true>>;

// The real trust EpochState is assignable to the local structural view
// (the view is a structural supertype — no drift is possible without a
// typecheck failure):
type _epochStateView = Trust.EpochState extends AuthorityEpochState ? true : false;
type _assertEpochView = Expect<Equal<_epochStateView, true>>;

// And the view type still accepts the minimal shape the hermetic battery
// constructs (the fake ledger in fixtures.ts):
type _minimalView = { ledger: { currentEpoch(ref: string): { value: bigint } | undefined } } extends AuthorityEpochState
  ? true
  : false;
type _assertMinimalView = Expect<Equal<_minimalView, true>>;

describe("OrganizationAuthorityAdapter — port laws", () => {
  it("the fake adapter satisfies the port (and is deterministic)", () => {
    const adapter = fakeAuthorityAdapter();
    const decisionOne = adapter.evaluate(
      {
        principal: payerPrincipal(),
        action: "payments.initiate",
        resource: { type: "payment_intent", resourceId: "pi-1" },
        context: { amount: { currency: "EUR", minorUnits: "10000" } },
        requestHash: "reqhash-1",
        requestedAt: 5_000_000,
      },
      [payerGrant()],
      epochState(),
    );
    const decisionTwo = adapter.evaluate(
      {
        principal: payerPrincipal(),
        action: "payments.initiate",
        resource: { type: "payment_intent", resourceId: "pi-1" },
        context: { amount: { currency: "EUR", minorUnits: "10000" } },
        requestHash: "reqhash-1",
        requestedAt: 5_000_000,
      },
      [payerGrant()],
      epochState(),
    );
    expect(decisionOne).toEqual(decisionTwo);
    expect(decisionOne.decision).toBe("ALLOW");
    if (decisionOne.decision === "ALLOW") {
      expect(decisionOne.evidenceRefs).toContain("grant:grant-payer");
    }
  });

  it("principalRef mirrors the trust reference vocabulary", () => {
    const adapter = fakeAuthorityAdapter();
    expect(adapter.principalRef(payerPrincipal())).toBe("agent:agent-key-1");
    expect(adapter.principalRef(reviewerPrincipal())).toBe("agent:agent-key-2");
    expect(adapter.principalRef({ kind: "user", id: "owner-1", securityEpoch: 0n })).toBe(
      "user:owner-1",
    );
    expect(adapter.principalRef({ kind: "service", id: "svc-1", scope: "s" })).toBe(
      "service:svc-1",
    );
  });

  it("attenuateGrant mints strictly-narrower children and rejects widening (INV-12)", () => {
    const adapter = fakeAuthorityAdapter();
    const child = adapter.attenuateGrant(
      payerGrant(),
      {
        mandateId: "mandate-1:child",
        version: 1,
        grantee: "agent:agent-key-2",
        actions: ["payments.initiate"],
        resources: [{ type: "payment_intent", resourceId: "pi-1" }],
      },
      { grantId: "grant-child", issuedAt: 5_000_000 },
    );
    expect(child.mandate.actions).toEqual(["payments.initiate"]);
    expect(child.granteeRef).toBe("agent:agent-key-2");
    expect(child.mandate.parentMandate).toEqual({ mandateId: "mandate-1", version: 1 });
    expect(child.lineage).toEqual({ rootGrantId: "grant-payer", chain: ["grant-payer"] });
    // widening: an action the parent does not carry
    expect(() =>
      adapter.attenuateGrant(
        payerGrant(),
        {
          mandateId: "mandate-1:evil",
          version: 1,
          grantee: "agent:agent-key-2",
          actions: ["trading.*"],
        },
        { grantId: "grant-evil", issuedAt: 5_000_000 },
      ),
    ).toThrow(/actions/);
    // widening: outliving the parent
    expect(() =>
      adapter.attenuateGrant(
        payerGrant(),
        {
          mandateId: "mandate-1:evil2",
          version: 1,
          grantee: "agent:agent-key-2",
          expiresAt: payerGrant().mandate.expiresAt + 1,
        },
        { grantId: "grant-evil2", issuedAt: 5_000_000 },
      ),
    ).toThrow(/expiry/);
  });

  it("execution fails closed without an authority seam (untyped callers cannot bypass)", () => {
    const org = releaseOrganization(
      {
        id: "org:payops-1",
        version: 1,
        bodies: [{ id: "body:payer", version: 2 }],
        instances: [],
        communicationEdges: [],
        delegationEdges: [],
        memory: { scope: "shared", retention: "session" },
        budgets: [],
        evaluators: [],
        termination: { conditions: [], requiresHumanApproval: false },
        safetyPolicy: { hardConstraints: [], escalationSurfaceRef: "surface:x" },
      },
      4_000_000,
    );
    expect(() =>
      executeOrganizationCommand({
        organization: org,
        request: {
          initiatingInstanceId: "i",
          action: "a",
          resource: { type: "t" },
          context: {},
          requestHash: "h",
          requestedAt: 1,
        },
        authority: undefined as unknown as OrganizationAuthorityAdapter,
        grants: [],
        epochState: { ledger: { currentEpoch: () => undefined } },
        principals: new Map(),
      }),
    ).toThrow(/OrganizationAuthorityAdapter/);
  });

  it("an adapter that always denies leaves every step denied (authority is never bypassed)", () => {
    const org = releaseOrganization(
      {
        id: "org:deny-all",
        version: 1,
        bodies: [{ id: "body:payer", version: 2 }],
        instances: [
          {
            id: "instance-payer",
            bodyRef: { id: "body:payer", version: 2 },
            principal: { agentKeyFingerprint: "agent-key-1", ownerRef: "user:owner-1" },
            runtimeState: { status: "IDLE" },
          },
        ],
        communicationEdges: [],
        delegationEdges: [],
        memory: { scope: "shared", retention: "session" },
        budgets: [],
        evaluators: [],
        termination: { conditions: [], requiresHumanApproval: false },
        safetyPolicy: { hardConstraints: [], escalationSurfaceRef: "surface:x" },
      },
      4_000_000,
    );
    const denyAll: OrganizationAuthorityAdapter = {
      principalRef: () => "agent:x",
      evaluate: () => ({
        decision: "DENY",
        reason: "no_matching_grant",
        policyRefs: [],
      }),
      attenuateGrant: () => {
        throw new Error("no delegation is ever minted under a denying authority");
      },
    };
    const trace = executeOrganizationCommand({
      organization: org,
      request: {
        initiatingInstanceId: "instance-payer",
        action: "payments.initiate",
        resource: { type: "payment_intent" },
        context: {},
        requestHash: "reqhash-1",
        requestedAt: 5_000_000,
      },
      authority: denyAll,
      grants: [payerGrant()],
      epochState: epochState(),
      principals: new Map([["instance-payer", payerPrincipal()]]),
    });
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]?.decision.decision).toBe("DENY");
    expect(trace.delegations).toHaveLength(0);
  });
});
