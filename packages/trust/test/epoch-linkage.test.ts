import { describe, expect, it } from "vitest";
import {
  EpochLedger,
  NonMonotonicEpochError,
  PolicyEpochError,
  PolicyEpochLedger,
  SecurityEpochAuthority,
  attenuate,
  epochStampStatus,
  evaluate,
  isPolicyConfigurationEffective,
  issueGrant,
  mandateEpochStatus,
} from "../src/index.ts";
import type { Mandate, PolicyConfigurationEpoch } from "../src/index.ts";

/**
 * Net-new (P1-W3): the policy and security-epoch LINKAGE laws.
 *
 * TB-5: mandates (and approval artifacts) are stamped with the network
 * security epoch at issuance; epoch advancement invalidates everything
 * stamped lower, deterministically. Policy configurations are effective-
 * dated windows on the same axis. (Artifact-side linkage coverage lives in
 * approval-artifacts.test.ts and authorization.test.ts.)
 */

const T0 = 1_000_000;

function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate-1",
    version: 1,
    grantor: "user:owner-1",
    grantee: "agent:agent-1",
    actions: ["payments.initiate"],
    resources: [{ type: "payment_intent" }],
    expiresAt: T0 + 86_400_000,
    proofRequirements: [],
    issuedAtEpoch: 0n,
    ...overrides,
  };
}

describe("SecurityEpochAuthority — network epoch mechanics", () => {
  it("starts at genesis epoch 0 with an append-only history", () => {
    const authority = new SecurityEpochAuthority();
    expect(authority.currentEpoch()).toEqual({
      value: 0n,
      advancedAt: 0,
      reason: "genesis: implicit epoch 0",
    });
    expect(authority.history()).toHaveLength(1);
  });

  it("advances strictly monotonically and records the security-relevant event", () => {
    const authority = new SecurityEpochAuthority();
    const first = authority.advance({ reason: "credential rotation event", at: T0, eventRef: "event:rot-1" });
    expect(first.value).toBe(1n);
    expect(first.eventRef).toBe("event:rot-1");
    const second = authority.advance({ reason: "advisory response", at: T0 + 100 });
    expect(second.value).toBe(2n);
    expect(second.eventRef).toBeUndefined();
    expect(authority.history().map((epoch) => epoch.value)).toEqual([0n, 1n, 2n]);
  });

  it("rejects non-monotonic advances (backdated or empty reason)", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "first", at: T0 + 2000 });
    expect(() => authority.advance({ reason: "clock skew", at: T0 + 1000 })).toThrow(
      NonMonotonicEpochError,
    );
    expect(() => authority.advance({ reason: "", at: T0 + 3000 })).toThrow(
      NonMonotonicEpochError,
    );
    expect(authority.currentEpoch().value).toBe(1n); // failed advances changed nothing
  });
});

describe("TB-5 — epoch advancement deterministically invalidates stamped mandates", () => {
  it("a mandate is current only in its issuance epoch", () => {
    const authority = new SecurityEpochAuthority();
    expect(mandateEpochStatus(mandate(), authority)).toBe("current");
    authority.advance({ reason: "security event", at: T0 });
    expect(mandateEpochStatus(mandate(), authority)).toBe("stale");
  });

  it("the whole delegation chain dies together (children inherit the stamp)", () => {
    const authority = new SecurityEpochAuthority();
    const parent = mandate({ id: "mandate-root", grantee: "agent:agent-1" });
    const child = attenuate(parent, {
      mandateId: "mandate-child",
      version: 1,
      grantee: "agent:agent-2",
      actions: ["payments.initiate"],
    });
    expect(child.issuedAtEpoch).toBe(0n);
    authority.advance({ reason: "security event", at: T0 });
    expect(mandateEpochStatus(parent, authority)).toBe("stale");
    expect(mandateEpochStatus(child, authority)).toBe("stale");
  });

  it("a stamp above the current epoch is invalid (forged/future, fail closed)", () => {
    const authority = new SecurityEpochAuthority();
    expect(mandateEpochStatus(mandate({ issuedAtEpoch: 2n }), authority)).toBe(
      "invalid_future_stamp",
    );
    authority.advance({ reason: "one", at: T0 });
    expect(mandateEpochStatus(mandate({ issuedAtEpoch: 2n }), authority)).toBe(
      "invalid_future_stamp",
    );
    authority.advance({ reason: "two", at: T0 + 1 });
    expect(mandateEpochStatus(mandate({ issuedAtEpoch: 2n }), authority)).toBe("current");
  });

  it("epochStampStatus is a pure total function of (stamp, authority)", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "one", at: T0 });
    for (let repetition = 0; repetition < 5; repetition += 1) {
      expect(epochStampStatus(0n, authority)).toBe("stale");
      expect(epochStampStatus(1n, authority)).toBe("current");
      expect(epochStampStatus(9n, authority)).toBe("invalid_future_stamp");
    }
  });
});

describe("policy-configuration epochs — effective-dated constraint sets", () => {
  function configuration(overrides: Partial<PolicyConfigurationEpoch> = {}): PolicyConfigurationEpoch {
    return {
      epochId: "policy-1",
      constraintSetRef: "constraints:velocity-defaults@1",
      effectiveFromEpoch: 0n,
      decisionRef: "governance:act-1",
      ...overrides,
    };
  }

  it("a configuration is effective within its epoch window [from, superseded)", () => {
    const open = configuration();
    expect(isPolicyConfigurationEffective(open, 0n)).toBe(true);
    expect(isPolicyConfigurationEffective(open, 5n)).toBe(true);

    const closed = configuration({ supersededAtEpoch: 3n });
    expect(isPolicyConfigurationEffective(closed, 2n)).toBe(true);
    expect(isPolicyConfigurationEffective(closed, 3n)).toBe(false); // boundary owned by the successor
    expect(isPolicyConfigurationEffective(closed, 9n)).toBe(false);

    const future = configuration({ effectiveFromEpoch: 4n });
    expect(isPolicyConfigurationEffective(future, 3n)).toBe(false);
    expect(isPolicyConfigurationEffective(future, 4n)).toBe(true);
  });

  it("the ledger records and supersedes configurations append-only", () => {
    const ledger = new PolicyEpochLedger();
    ledger.record({
      epochId: "policy-1",
      constraintSetRef: "constraints:a@1",
      effectiveFromEpoch: 0n,
      decisionRef: "governance:act-1",
    });
    ledger.record({
      epochId: "policy-2",
      constraintSetRef: "constraints:b@1",
      effectiveFromEpoch: 2n,
      decisionRef: "governance:act-2",
    });
    expect(ledger.effectiveConfigurations(0n).map((config) => config.epochId)).toEqual(["policy-1"]);
    expect(ledger.effectiveConfigurations(2n).map((config) => config.epochId)).toEqual(["policy-1", "policy-2"]);

    ledger.supersede("policy-1", 2n);
    expect(ledger.effectiveConfigurations(2n).map((config) => config.epochId)).toEqual(["policy-2"]);
    expect(ledger.effectiveConfigurations(1n).map((config) => config.epochId)).toEqual(["policy-1"]);
    // append-only: both the original record and the supersede remain in history
    expect(ledger.history()).toHaveLength(3);
  });

  it("supersession is monotonic: once closed, a window stays closed", () => {
    const ledger = new PolicyEpochLedger();
    ledger.record({
      epochId: "policy-1",
      constraintSetRef: "constraints:a@1",
      effectiveFromEpoch: 0n,
      decisionRef: "governance:act-1",
    });
    ledger.supersede("policy-1", 1n);
    expect(() => ledger.supersede("policy-1", 2n)).toThrow(PolicyEpochError);
    expect(() => ledger.supersede("policy-unknown", 2n)).toThrow(PolicyEpochError);
  });

  it("rejects structurally invalid records (fail closed)", () => {
    const ledger = new PolicyEpochLedger();
    expect(() =>
      ledger.record({ epochId: "", constraintSetRef: "c@1", effectiveFromEpoch: 0n, decisionRef: "d" }),
    ).toThrow(PolicyEpochError);
    expect(() =>
      ledger.record({ epochId: "p", constraintSetRef: "", effectiveFromEpoch: 0n, decisionRef: "d" }),
    ).toThrow(PolicyEpochError);
    expect(() =>
      ledger.record({ epochId: "p", constraintSetRef: "c@1", effectiveFromEpoch: -1n, decisionRef: "d" }),
    ).toThrow(PolicyEpochError);
  });

  it("a policy epoch change does NOT advance the network epoch by itself (separation of powers)", () => {
    const authority = new SecurityEpochAuthority();
    const ledger = new PolicyEpochLedger();
    ledger.record({
      epochId: "policy-1",
      constraintSetRef: "constraints:a@1",
      effectiveFromEpoch: authority.currentEpoch().value,
      decisionRef: "governance:act-1",
    });
    ledger.supersede("policy-1", authority.currentEpoch().value);
    expect(authority.currentEpoch().value).toBe(0n); // untouched: only advance() advances
  });
});

describe("TB-5 end-to-end — authority dies, evidence remains", () => {
  it("advancement invalidates mandates while the append-only history preserves the trail", () => {
    const authority = new SecurityEpochAuthority();
    const ledger = new EpochLedgerLike();
    const m = mandate();
    ledger.recordIssuance(m.id, m.issuedAtEpoch);
    authority.advance({ reason: "security event", at: T0 });
    expect(mandateEpochStatus(m, authority)).toBe("stale");
    // the issuance trail is still queryable evidence (immutable history)
    expect(ledger.issuances()).toEqual([{ mandateId: m.id, issuedAtEpoch: 0n }]);
  });
});

/** Minimal external issuance-trail stub proving the linkage composes (net-new). */
class EpochLedgerLike {
  readonly #issuances: { mandateId: string; issuedAtEpoch: bigint }[] = [];
  recordIssuance(mandateId: string, issuedAtEpoch: bigint): void {
    this.#issuances.push({ mandateId, issuedAtEpoch });
  }
  issuances(): readonly { mandateId: string; issuedAtEpoch: bigint }[] {
    return [...this.#issuances];
  }
}

describe("evaluate — network epoch linkage inside the decision engine (TB-5, net-new)", () => {
  const NOW = 2_000_000;
  // fingerprint "agent-1" matches this file's mandate() grantee ("agent:agent-1")
  const principal = {
    kind: "agent",
    agentKeyFingerprint: "agent-1",
    ownerRef: "user:owner-1",
    bodyRef: "body:payer@1",
    packageVersionRef: "pkg:payer@1",
    authorityEnvelope: [{ mandateId: "mandate-1", version: 1 }],
    securityEpoch: 0n,
  } as const;

  function linkageRequest() {
    return {
      principal,
      action: "payments.initiate",
      resource: { type: "payment_intent", resourceId: "pi-1" },
      context: { amount: { currency: "EUR", minorUnits: "10000" } },
      requestHash: "reqhash-1",
      requestedAt: NOW,
    };
  }

  it("ALLOWs a current-epoch mandate and cites the epoch as evidence", () => {
    const networkEpoch = new SecurityEpochAuthority();
    const grant = issueGrant(mandate(), { grantId: "grant-1", issuedAt: NOW - 1000 });
    const decision = evaluate(linkageRequest(), [grant], { ledger: new EpochLedger(), networkEpoch });
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision === "ALLOW") {
      expect(decision.evidenceRefs).toContain("epoch:0");
    }
  });

  it("epoch advancement deterministically kills mandates stamped at a lower epoch", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "credential rotation event", at: NOW - 5 });
    const grant = issueGrant(mandate(), { grantId: "grant-1", issuedAt: NOW - 1000 });
    const decision = evaluate(linkageRequest(), [grant], { ledger: new EpochLedger(), networkEpoch });
    expect(decision.decision).toBe("DENY");
    if (decision.decision === "DENY") {
      expect(decision.reason).toBe("stale_security_epoch");
      expect(decision.policyRefs).toContain("TB-5");
      expect(decision.policyRefs).toContain("mandate:mandate-1@1");
    }
  });

  it("a mandate stamped above the current epoch fails closed as invalid (forged stamp)", () => {
    const networkEpoch = new SecurityEpochAuthority();
    const forged = issueGrant(mandate({ issuedAtEpoch: 5n }), { grantId: "grant-1", issuedAt: NOW - 1000 });
    const decision = evaluate(linkageRequest(), [forged], { ledger: new EpochLedger(), networkEpoch });
    expect(decision.decision).toBe("DENY");
    if (decision.decision === "DENY") {
      expect(decision.reason).toBe("invalid_epoch_stamp");
    }
  });

  it("a freshly issued mandate at the new epoch authorizes again after advancement", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "credential rotation event", at: NOW - 5 });
    const fresh = issueGrant(mandate({ id: "mandate-fresh", issuedAtEpoch: 1n }), { grantId: "grant-1", issuedAt: NOW - 1000 });
    const decision = evaluate(linkageRequest(), [fresh], { ledger: new EpochLedger(), networkEpoch });
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision === "ALLOW") {
      expect(decision.evidenceRefs).toContain("epoch:1");
    }
  });

  it("one stale mandate does not poison a fresh one (per-grant, deterministic)", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "credential rotation event", at: NOW - 5 });
    const stale = issueGrant(mandate({ id: "mandate-stale", issuedAtEpoch: 0n }), { grantId: "grant-stale", issuedAt: NOW - 1000 });
    const fresh = issueGrant(mandate({ id: "mandate-fresh", issuedAtEpoch: 1n }), { grantId: "grant-fresh", issuedAt: NOW - 1000 });
    const decision = evaluate(linkageRequest(), [stale, fresh], { ledger: new EpochLedger(), networkEpoch });
    expect(decision.decision).toBe("ALLOW");
  });

  it("deterministic: identical epoch state yields identical decisions", () => {
    const networkEpoch = new SecurityEpochAuthority();
    networkEpoch.advance({ reason: "credential rotation event", at: NOW - 5 });
    const grant = issueGrant(mandate(), { grantId: "grant-1", issuedAt: NOW - 1000 });
    const one = evaluate(linkageRequest(), [grant], { ledger: new EpochLedger(), networkEpoch });
    const two = evaluate(linkageRequest(), [grant], { ledger: new EpochLedger(), networkEpoch });
    expect(one).toEqual(two);
  });
});
