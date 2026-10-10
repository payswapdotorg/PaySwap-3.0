import { describe, expect, it } from "vitest";
import {
  ApprovalArtifactError,
  SecurityEpochAuthority,
  approvalArtifactDigest,
  approvalSigningPayload,
  issueApprovalArtifact,
  verifyApprovalArtifact,
} from "../src/index.ts";
import type { ApprovalArtifact } from "../src/index.ts";

/**
 * Approval artifacts (TB-4): a signed artifact is the only approval
 * authority; immutable once issued; typed evidence of what was approved, by
 * whom, under which mandate, at which epoch, with which proof level.
 *
 * The binding-check suite is ported from payswap.org@8a735bf
 * packages/trust/test/authorization.test.ts (verifyApprovalArtifact block),
 * adapted to the extended artifact shape and verification context. The
 * issue/immutability/identity suite is net-new (P1-W3).
 */

const NOW = 2_000_000;

function baseArtifactInput(): Parameters<typeof issueApprovalArtifact>[0] {
  return {
    id: "approval-1",
    approvedBy: "user:owner-1",
    onBehalfOfAgent: "agent:agent-key-1",
    mandateRef: { mandateId: "mandate-1", version: 1 },
    securityEpoch: 0n,
    proofLevel: "P2",
    scope: {
      actions: ["payments.initiate"],
      resources: [{ type: "payment_intent", resourceId: "pi-1" }],
      maxAmount: { currency: "EUR", minorUnits: "10000" },
    },
    requestHash: "reqhash-1",
    signature: "sig-opaque-1",
    effectRefs: ["effect:pending-external-1"],
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
  };
}

function binding(overrides: Partial<Parameters<typeof verifyApprovalArtifact>[2]> = {}) {
  return {
    action: "payments.initiate",
    resource: { type: "payment_intent", resourceId: "pi-1" },
    amount: { currency: "EUR", minorUnits: "10000" },
    actingPrincipalRef: "agent:agent-key-1",
    ...overrides,
  };
}

describe("issueApprovalArtifact — typed, immutable evidence records (net-new)", () => {
  it("issues a deep-frozen artifact with all TB-4 fields", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    expect(artifact.id).toBe("approval-1");
    expect(artifact.approvedBy).toBe("user:owner-1");
    expect(artifact.mandateRef).toEqual({ mandateId: "mandate-1", version: 1 });
    expect(artifact.securityEpoch).toBe(0n);
    expect(artifact.proofLevel).toBe("P2");
    expect(artifact.effectRefs).toEqual(["effect:pending-external-1"]);
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.scope)).toBe(true);
    expect(Object.isFrozen(artifact.effectRefs)).toBe(true);
  });

  it("is immutable once issued: mutation throws in strict mode (every level)", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    expect(() => {
      (artifact as { id?: string }).id = "approval-forged";
    }).toThrow(TypeError);
    expect(() => {
      (artifact.scope as unknown as { actions?: string[] }).actions = ["payouts.initiate"];
    }).toThrow(TypeError);
    expect(() => {
      (artifact.scope as unknown as { maxAmount?: { currency: string; minorUnits: string } }).maxAmount = {
        currency: "EUR",
        minorUnits: "999999999999",
      };
    }).toThrow(TypeError);
    expect(() => {
      (artifact.effectRefs as string[]).push("effect:injected");
    }).toThrow(TypeError);
    expect(artifact.id).toBe("approval-1");
    expect(artifact.scope.actions).toEqual(["payments.initiate"]);
  });

  it("rejects structurally invalid artifacts fail-closed", () => {
    expect(() =>
      issueApprovalArtifact({ ...baseArtifactInput(), id: "" }),
    ).toThrow(ApprovalArtifactError);
    expect(() =>
      issueApprovalArtifact({ ...baseArtifactInput(), signature: "" }),
    ).toThrow(ApprovalArtifactError);
    expect(() =>
      issueApprovalArtifact({ ...baseArtifactInput(), proofLevel: "P9" as never }),
    ).toThrow(ApprovalArtifactError);
    expect(() =>
      issueApprovalArtifact({
        ...baseArtifactInput(),
        scope: { ...baseArtifactInput().scope, actions: [] },
      }),
    ).toThrow(ApprovalArtifactError);
    expect(() =>
      issueApprovalArtifact({
        ...baseArtifactInput(),
        scope: {
          ...baseArtifactInput().scope,
          maxAmount: { currency: "EUR", minorUnits: "-5" },
        },
      }),
    ).toThrow(/minorUnits/);
    expect(() =>
      issueApprovalArtifact({ ...baseArtifactInput(), expiresAt: NOW - 1_000 }),
    ).toThrow(/strictly after/);
  });

  it("identity: digest is deterministic, total, and discriminates every field", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    expect(approvalArtifactDigest(artifact)).toBe(approvalArtifactDigest(artifact));
    expect(approvalSigningPayload(artifact)).toBe(approvalSigningPayload(artifact));

    const tamperedSignature = issueApprovalArtifact({ ...baseArtifactInput(), signature: "sig-other" });
    expect(approvalArtifactDigest(tamperedSignature)).not.toBe(approvalArtifactDigest(artifact));

    const otherEpoch = issueApprovalArtifact({ ...baseArtifactInput(), securityEpoch: 1n });
    expect(approvalArtifactDigest(otherEpoch)).not.toBe(approvalArtifactDigest(artifact));

    const otherMandate = issueApprovalArtifact({
      ...baseArtifactInput(),
      mandateRef: { mandateId: "mandate-2", version: 1 },
    });
    expect(approvalArtifactDigest(otherMandate)).not.toBe(approvalArtifactDigest(artifact));
  });
});

describe("verifyApprovalArtifact — signed approval is the authority, not a chat message", () => {
  it("accepts a matching, unexpired, signed artifact (ported)", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    const decision = verifyApprovalArtifact(artifact, "reqhash-1", binding(), { now: NOW });
    expect(decision).toEqual({ valid: true });
    expect(artifact.requestHash).toBe("reqhash-1");
    expect(artifact.approvedBy).toBe("user:owner-1");
    expect(artifact.onBehalfOfAgent).toBe("agent:agent-key-1");
    expect(artifact.expiresAt).toBeGreaterThan(NOW);
  });

  it("rejects a missing signature, expiry and request-hash mismatch (ported)", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    // issuance itself refuses an unsigned artifact; verify must ALSO refuse a
    // hand-constructed unsigned record (verify never assumes the issue path)
    expect(() => issueApprovalArtifact({ ...baseArtifactInput(), signature: "" })).toThrow(
      ApprovalArtifactError,
    );
    const unsigned = { ...baseArtifactInput(), signature: "" } as ApprovalArtifact;
    expect(verifyApprovalArtifact(unsigned, "reqhash-1", binding(), { now: NOW })).toEqual(
      { valid: false, reason: "missing_signature" },
    );
    expect(verifyApprovalArtifact(artifact, "reqhash-1", binding(), { now: NOW + 61_000 })).toEqual(
      { valid: false, reason: "expired" },
    );
    expect(
      verifyApprovalArtifact(artifact, "reqhash-other", binding(), { now: NOW }),
    ).toEqual({ valid: false, reason: "request_hash_mismatch" });
  });

  it("rejects an artifact bound to a different supervised agent (ported)", () => {
    const artifact = issueApprovalArtifact({
      ...baseArtifactInput(),
      onBehalfOfAgent: "agent:someone-else",
    });
    const decision = verifyApprovalArtifact(artifact, "reqhash-1", binding(), { now: NOW });
    expect(decision).toEqual({ valid: false, reason: "principal_mismatch" });
  });

  it("rejects actions, resources and amounts outside the approval scope (ported)", () => {
    const artifact = issueApprovalArtifact(baseArtifactInput());
    expect(
      verifyApprovalArtifact(artifact, "reqhash-1", binding({ action: "payouts.initiate" }), { now: NOW }),
    ).toEqual({ valid: false, reason: "action_out_of_scope" });
    expect(
      verifyApprovalArtifact(
        artifact,
        "reqhash-1",
        binding({ resource: { type: "payment_intent", resourceId: "pi-2" } }),
        { now: NOW },
      ),
    ).toEqual({ valid: false, reason: "resource_out_of_scope" });
    expect(
      verifyApprovalArtifact(
        artifact,
        "reqhash-1",
        binding({ amount: { currency: "EUR", minorUnits: "10001" } }),
        { now: NOW },
      ),
    ).toEqual({ valid: false, reason: "amount_exceeds_approval" });
    expect(
      verifyApprovalArtifact(
        artifact,
        "reqhash-1",
        binding({ amount: { currency: "USD", minorUnits: "1" } }),
        { now: NOW },
      ),
    ).toEqual({ valid: false, reason: "amount_currency_mismatch" });
  });
});

describe("verifyApprovalArtifact — epoch linkage (TB-5, net-new)", () => {
  it("epoch advancement deterministically invalidates the artifact", () => {
    const networkEpoch = new SecurityEpochAuthority(); // genesis 0; artifact stamped 0
    const artifact = issueApprovalArtifact(baseArtifactInput());
    const before = verifyApprovalArtifact(artifact, "reqhash-1", binding(), {
      now: NOW,
      networkEpoch,
    });
    expect(before).toEqual({ valid: true });

    networkEpoch.advance({ reason: "security event", at: NOW + 1 });
    const after = verifyApprovalArtifact(artifact, "reqhash-1", binding(), {
      now: NOW + 2,
      networkEpoch,
    });
    expect(after).toEqual({ valid: false, reason: "stale_security_epoch" });
  });

  it("an artifact stamped above the current epoch fails closed (impossible through lawful issuance)", () => {
    const networkEpoch = new SecurityEpochAuthority();
    const forged = issueApprovalArtifact({ ...baseArtifactInput(), securityEpoch: 3n });
    const decision = verifyApprovalArtifact(forged, "reqhash-1", binding(), {
      now: NOW,
      networkEpoch,
    });
    expect(decision).toEqual({ valid: false, reason: "invalid_future_epoch_stamp" });
  });

  it("a freshly issued artifact at the new epoch is valid after advancement", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "security event", at: NOW + 1 });
    const fresh = issueApprovalArtifact({ ...baseArtifactInput(), securityEpoch: 1n });
    const decision = verifyApprovalArtifact(fresh, "reqhash-1", binding(), {
      now: NOW + 2,
      networkEpoch,
    });
    expect(decision).toEqual({ valid: true });
  });

  it("deterministic: same inputs, same verdict, any number of repetitions", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "security event", at: NOW + 1 });
    const artifact = issueApprovalArtifact(baseArtifactInput());
    for (let index = 0; index < 5; index += 1) {
      expect(
        verifyApprovalArtifact(artifact, "reqhash-1", binding(), { now: NOW + 2, networkEpoch }),
      ).toEqual({ valid: false, reason: "stale_security_epoch" });
    }
  });
});
