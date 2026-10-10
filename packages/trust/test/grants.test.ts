import { describe, expect, it } from "vitest";
import {
  EpochLedger,
  ScopedGrantRegistry,
  checkScopedGrant,
  issueGrant,
} from "../src/index.ts";
import type { Mandate, ScopedExecutionGrant } from "../src/index.ts";

/**
 * Scoped execution grants: narrow, expiring, revocable instruments derived
 * from mandates. Revocation is immediate and monotonic; revoked, expired and
 * unknown grants fail closed in checkScopedGrant (the evaluate-gate suite
 * lives in scoped-execution.test.ts — split from the old single file to
 * respect the <=400-line file law).
 *
 * Ported from payswap.org@8a735bf packages/trust/test/grants.test.ts
 * (issue/revoke/checkScopedGrant blocks); fixtures carry issuedAtEpoch.
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

describe("ScopedGrantRegistry — issue", () => {
  it("issues a frozen, narrow, expiring instrument with decision provenance", () => {
    const registry = new ScopedGrantRegistry();
    const scoped = registry.issue({
      grantId: "sg-1",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      scope: { actions: ["payments.initiate"] },
      grantedAt: NOW,
      expiresAt: NOW + 1000,
      conditions: ["session-bound"],
      decisionRef: "decision:allow-1",
    });
    expect(scoped.id).toBe("sg-1");
    expect(scoped.decisionRef).toBe("decision:allow-1");
    expect(scoped.conditions).toEqual(["session-bound"]);
    expect(Object.isFrozen(scoped)).toBe(true);
    expect(registry.lookup("sg-1")).toBe(scoped);
    expect(registry.status("sg-1", NOW)).toBe("ACTIVE");
  });

  it("rejects duplicate ids, non-expiring instruments and empty decision refs", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-1",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 1,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    expect(() =>
      registry.issue({
        grantId: "sg-1",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        grantedAt: NOW,
        expiresAt: NOW + 1,
        conditions: [],
        decisionRef: "decision:allow-2",
      }),
    ).toThrow(/already exists/);
    expect(() =>
      registry.issue({
        grantId: "sg-2",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        grantedAt: NOW,
        expiresAt: NOW,
        conditions: [],
        decisionRef: "decision:allow-2",
      }),
    ).toThrow(/strictly after/);
    expect(() =>
      registry.issue({
        grantId: "sg-3",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        grantedAt: NOW,
        expiresAt: NOW + 1,
        conditions: [],
        decisionRef: "",
      }),
    ).toThrow(/decisionRef/);
  });

  it("validates narrowing against the supplied parent mandate (fail closed)", () => {
    const registry = new ScopedGrantRegistry();
    // widening action scope beyond the parent mandate
    expect(() =>
      registry.issue({
        grantId: "sg-wide",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        scope: { actions: ["transfers.*"] },
        grantedAt: NOW,
        expiresAt: NOW + 1,
        conditions: [],
        decisionRef: "decision:allow-1",
        parentMandate: mandate(),
      }),
    ).toThrow(/not covered by the parent mandate/);
    // outliving the parent mandate
    expect(() =>
      registry.issue({
        grantId: "sg-late",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        grantedAt: NOW,
        expiresAt: EXPIRY + 1,
        conditions: [],
        decisionRef: "decision:allow-1",
        parentMandate: mandate(),
      }),
    ).toThrow(/outlives the parent mandate/);
    // parent mandate does not match the mandateRef
    expect(() =>
      registry.issue({
        grantId: "sg-mismatch",
        mandateRef: { mandateId: "mandate-9", version: 1 },
        grantedAt: NOW,
        expiresAt: NOW + 1,
        conditions: [],
        decisionRef: "decision:allow-1",
        parentMandate: mandate(),
      }),
    ).toThrow(/does not match mandateRef/);
  });

  it("net-new: a per-transaction cap beyond the parent mandate cap fails closed", () => {
    const registry = new ScopedGrantRegistry();
    expect(() =>
      registry.issue({
        grantId: "sg-capped",
        mandateRef: { mandateId: "mandate-1", version: 1 },
        scope: { maxPerTransactionAmount: { currency: "EUR", minorUnits: "500001" } },
        grantedAt: NOW,
        expiresAt: NOW + 1,
        conditions: [],
        decisionRef: "decision:allow-1",
        parentMandate: mandate({
          limits: { perTransactionAmount: { currency: "EUR", minorUnits: "500000" } },
        }),
      }),
    ).toThrow(/exceeds the parent mandate cap/);
  });
});

describe("ScopedGrantRegistry — revoke is immediate and monotonic", () => {
  it("revokes from revokedAt onward and never again authorizes", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-1",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    const revocation = registry.revoke("sg-1", NOW + 100, "user-requested");
    expect(revocation).toEqual({
      grantId: "sg-1",
      revokedAt: NOW + 100,
      reason: "user-requested",
    });
    // immediate: at and after revokedAt the grant is REVOKED
    expect(registry.status("sg-1", NOW + 99)).toBe("ACTIVE");
    expect(registry.status("sg-1", NOW + 100)).toBe("REVOKED");
    expect(registry.status("sg-1", NOW + 500)).toBe("REVOKED");
    expect(registry.revocations()).toHaveLength(1);
  });

  it("rejects double revocation, unknown ids and backdated revocations", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-1",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    registry.revoke("sg-1", NOW + 100, "first");
    expect(() => registry.revoke("sg-1", NOW + 200, "second")).toThrow(
      /monotonic and cannot be reversed or repeated/,
    );
    expect(() => registry.revoke("sg-unknown", NOW, "ghost")).toThrow(/unknown/);
    const other = new ScopedGrantRegistry();
    other.issue({
      grantId: "sg-2",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    expect(() => other.revoke("sg-2", NOW - 1, "backdated")).toThrow(/cannot be backdated/);
  });

  it("status precedence: REVOKED beats EXPIRED; unknown ids are UNKNOWN", () => {
    const registry = new ScopedGrantRegistry();
    registry.issue({
      grantId: "sg-dead",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    registry.revoke("sg-dead", NOW + 5, "before expiry");
    expect(registry.status("sg-dead", NOW + 20)).toBe("REVOKED");
    expect(registry.status("sg-never-issued", NOW)).toBe("UNKNOWN");
  });
});

describe("checkScopedGrant — fail-closed sensitive-action guard (TB-2)", () => {
  function activeGrant(registry: ScopedGrantRegistry): ScopedExecutionGrant {
    return registry.issue({
      grantId: "sg-live",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
  }

  it("vouches only for issued, ACTIVE grants", () => {
    const registry = new ScopedGrantRegistry();
    const live = activeGrant(registry);
    const check = checkScopedGrant("sg-live", registry, NOW + 1);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.grant).toBe(live);
    }
  });

  it("refuses UNKNOWN, REVOKED and EXPIRED grants — never best-effort", () => {
    const registry = new ScopedGrantRegistry();
    const unknown = checkScopedGrant("sg-ghost", registry, NOW);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.status).toBe("UNKNOWN");
      expect(unknown.reason).toMatch(/never issued/);
    }
    registry.issue({
      grantId: "sg-revoked",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10_000,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    registry.revoke("sg-revoked", NOW + 1, "revoked");
    const revoked = checkScopedGrant("sg-revoked", registry, NOW + 2);
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) {
      expect(revoked.status).toBe("REVOKED");
    }
    registry.issue({
      grantId: "sg-expired",
      mandateRef: { mandateId: "mandate-1", version: 1 },
      grantedAt: NOW,
      expiresAt: NOW + 10,
      conditions: [],
      decisionRef: "decision:allow-1",
    });
    const expired = checkScopedGrant("sg-expired", registry, NOW + 11);
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.status).toBe("EXPIRED");
    }
  });

  it("refuses on a stale security epoch when principal and ledger are supplied", () => {
    const registry = new ScopedGrantRegistry();
    activeGrant(registry);
    const ledger = new EpochLedger();
    ledger.raiseEpoch("agent:agent-key-1", "key rotated", NOW + 1);
    const check = checkScopedGrant("sg-live", registry, NOW + 2, principal, ledger);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe("STALE_SECURITY_EPOCH");
    }
  });

  it("requires principal and ledger together (never half the inputs)", () => {
    const registry = new ScopedGrantRegistry();
    activeGrant(registry);
    expect(() => checkScopedGrant("sg-live", registry, NOW, principal, undefined)).toThrow(
      /principal and ledger together/,
    );
  });
});

describe("grants keep their lineage purpose (net-new sanity)", () => {
  it("issueGrant still binds grantor/grantee from the mandate", () => {
    const grant = issueGrant(mandate(), { grantId: "grant-1", issuedAt: NOW });
    expect(grant.grantorRef).toBe("user:owner-1");
    expect(grant.granteeRef).toBe("agent:agent-key-1");
    expect(grant.mandate.issuedAtEpoch).toBe(0n);
  });
});
