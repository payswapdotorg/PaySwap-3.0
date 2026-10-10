import { describe, expect, it } from "vitest";
import {
  EpochLedger,
  ScopedGrantRegistry,
  evaluate,
  issueGrant,
} from "../src/index.ts";
import type { AuthorizationRequest, Mandate, UsageRecord } from "../src/index.ts";

/**
 * The scoped-execution gate inside evaluate(): when a permission grant's
 * mandate has derived scoped execution grants COVERING the request, at least
 * one covering scoped grant must be ACTIVE at requestedAt, else the decision
 * fails closed (fail closed, evidence lineage).
 *
 * Ported from payswap.org@8a735bf packages/trust/test/grants.test.ts
 * ("evaluate — scoped-execution gate" block; file split for the <=400-line
 * law). Policy references adapted to canonical ids.
 */

const NOW = 2_000_000;
const EXPIRY = NOW + 10 * 86_400_000;

const principal = {
  kind: "agent",
  agentKeyFingerprint: "agent-key-1",
  ownerRef: "user:owner-1",
  bodyRef: "body:payer@1",
  packageVersionRef: "pkg:payer@1",
  authorityEnvelope: [{ mandateId: "mandate-1", version: 1 }],
  securityEpoch: 0n,
} as const;

function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate-1",
    version: 1,
    grantor: "user:owner-1",
    grantee: "agent:agent-key-1",
    actions: ["payments.*"],
    resources: [{ type: "payment_intent" }],
    expiresAt: EXPIRY,
    proofRequirements: [],
    issuedAtEpoch: 0n,
    ...overrides,
  };
}

function grant(m: Mandate = mandate()) {
  return issueGrant(m, { grantId: "grant-1", issuedAt: NOW - 1000 });
}

function request(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    principal,
    action: "payments.initiate",
    resource: { type: "payment_intent", resourceId: "pi-1" },
    context: { amount: { currency: "EUR", minorUnits: "10000" } },
    requestHash: "reqhash-1",
    requestedAt: NOW,
    ...overrides,
  };
}

function state(overrides: { scopedGrants?: ScopedGrantRegistry; usage?: readonly UsageRecord[] } = {}) {
  return { ledger: new EpochLedger(), ...overrides };
}

describe("evaluate — scoped-execution gate (fail closed, INV-05)", () => {
  function registryWith(scope: { actions?: readonly string[]; expiresAt?: number }): {
    registry: ScopedGrantRegistry;
    scopedId: string;
  } {
    const registry = new ScopedGrantRegistry();
    const scopedId = scope.actions?.join(",") === "payments.refund" ? "sg-other" : "sg-path";
    registry.issue({
      grantId: scopedId,
      mandateRef: { mandateId: "mandate-1", version: 1 },
      ...(scope.actions !== undefined ? { scope: { actions: scope.actions } } : {}),
      grantedAt: NOW - 10,
      expiresAt: scope.expiresAt ?? NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    return { registry, scopedId };
  }

  it("DENIES with scoped_grant_revoked once the covering scoped grant is revoked", () => {
    const { registry } = registryWith({});
    registry.revoke("sg-path", NOW, "user revoked the session grant");
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(decision).toEqual({
      decision: "DENY",
      reason: "scoped_grant_revoked",
      policyRefs: ["mandate:mandate-1@1", "TB-2", "INV-05"],
    });
  });

  it("DENIES with scoped_grant_expired when the covering scoped grant expired", () => {
    const { registry } = registryWith({ expiresAt: NOW });
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(decision.decision).toBe("DENY");
    if (decision.decision === "DENY") {
      expect(decision.reason).toBe("scoped_grant_expired");
    }
  });

  it("ALLOWs and cites the vouching scoped grant as authorization evidence", () => {
    const { registry, scopedId } = registryWith({ actions: ["payments.initiate"] });
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision === "ALLOW") {
      expect(decision.evidenceRefs).toContain(`scopedGrant:${scopedId}`);
    }
  });

  it("an ACTIVE scoped grant vouches even when a sibling covering grant is revoked", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-a",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      scope: { actions: ["payments.initiate"] },
      grantedAt: NOW - 10,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    registry.issue({
      grantId: "sg-b",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      scope: { actions: ["payments.*"] },
      grantedAt: NOW - 10,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-2",
    });
    registry.revoke("sg-b", NOW, "killed");
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision === "ALLOW") {
      expect(decision.evidenceRefs).toContain("scopedGrant:sg-a");
    }
  });

  it("scoped grants that do not cover the request never gate it", () => {
    // sg-other narrows a DIFFERENT action; the request is not its execution path
    const { registry } = registryWith({ actions: ["payments.refund"] });
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision === "ALLOW") {
      expect(decision.evidenceRefs).not.toContain("scopedGrant:sg-other");
    }
  });

  it("no registry supplied ⇒ Stage-0 semantics unchanged", () => {
    const decision = evaluate(request(), [grant()], state());
    expect(decision.decision).toBe("ALLOW");
  });

  it("a dead scoped path cannot be rescued by a second dead scoped grant (rank stability)", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-x",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      scope: { actions: ["payments.initiate"] },
      grantedAt: NOW - 20,
      expiresAt: NOW - 1,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    registry.issue({
      grantId: "sg-y",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      scope: { actions: ["payments.*"] },
      grantedAt: NOW - 20,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-2",
    });
    registry.revoke("sg-y", NOW, "killed");
    // REVOKED is the stronger death: reported even though a sibling is expired
    const decision = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    if (decision.decision === "DENY") {
      expect(decision.reason).toBe("scoped_grant_revoked");
    } else {
      expect.unreachable("expected a deny");
    }
  });

  it("deterministic: identical inputs yield the identical decision", () => {
    const { registry } = registryWith({});
    registry.revoke("sg-path", NOW, "user revoked the session grant");
    const one = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    const two = evaluate(request(), [grant()], state({ scopedGrants: registry }));
    expect(one).toEqual(two);
  });
});
