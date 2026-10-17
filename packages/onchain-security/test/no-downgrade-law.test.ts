import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertNoBlockDowngrade,
  attemptBlockDowngrade,
  BlockDowngradeForbiddenError,
  evaluateOnchainWriteGates,
  GATE_DECISION_RANK,
  joinGateDecisions,
  stricterGateDecision,
} from "../src/index.ts";
import type { BlockProjection, GateDecision, NoBlockDowngrade } from "../src/index.ts";
import {
  basePolicy,
  baseSecurityState,
  baseWriteRequest,
  NOW,
  MALICIOUS_SPENDER,
  USC_ASSET,
} from "./helpers.ts";
import { prepareWrite } from "../src/index.ts";

/**
 * The encoded cannot_downgrade_block layer law (R2-W2 net-new;
 * MODULE-OWNERSHIP.yaml layer `security`: cannot_downgrade_block: true;
 * canonical INV-21: "Security/adversarial intelligence cannot downgrade
 * BLOCK").
 *
 * The law is encoded at THREE levels, each tested here:
 * 1. TYPE level — NoBlockDowngrade<From, To> and BlockProjection;
 * 2. RUNTIME level — joinGateDecisions (the only composition primitive:
 *    a lattice join where BLOCK dominates and reasons only accumulate);
 * 3. REJECTION level — attemptBlockDowngrade (always throws) +
 *    assertNoBlockDowngrade (the fail-closed re-evaluation guard).
 */

function allowDecision(): GateDecision {
  return evaluateOnchainWriteGates({
    write: prepareWrite(baseWriteRequest(), NOW),
    policy: basePolicy(),
    securityState: baseSecurityState(),
    at: NOW,
  });
}

function blockDecision(): GateDecision {
  // A write to a spender outside the policy allowlist → deterministic BLOCK.
  return evaluateOnchainWriteGates({
    write: prepareWrite(
      baseWriteRequest({
        approvals: [
          {
            asset: USC_ASSET,
            owner: "0x1111111111111111111111111111111111111111",
            spender: MALICIOUS_SPENDER,
            amount: { currency: "USC", minorUnits: "1000000" },
            unlimited: false,
          },
        ],
      }),
      NOW,
    ),
    policy: basePolicy(),
    securityState: baseSecurityState(),
    at: NOW,
  });
}

function unknownDecision(): GateDecision {
  // An uncertified route with escalate policy → UNKNOWN.
  return evaluateOnchainWriteGates({
    write: prepareWrite(baseWriteRequest(), NOW),
    policy: basePolicy({
      knownRoutes: ["fnv1a64:0000000000000009"],
      unknownRoutePolicy: "escalate",
    }),
    securityState: baseSecurityState(),
    at: NOW,
  });
}

describe("the cannot_downgrade_block layer law — TYPE level", () => {
  it("NoBlockDowngrade permits every projection that does not leave BLOCK", () => {
    expectTypeOf<NoBlockDowngrade<"ALLOW", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<NoBlockDowngrade<"ALLOW", "ALLOW">>().toEqualTypeOf<"ALLOW">();
    expectTypeOf<NoBlockDowngrade<"UNKNOWN", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<NoBlockDowngrade<"BLOCK", "BLOCK">>().toEqualTypeOf<"BLOCK">();
  });

  it("NoBlockDowngrade makes a BLOCK downgrade a descriptive TYPE ERROR, not a decision", () => {
    expectTypeOf<NoBlockDowngrade<"BLOCK", "ALLOW">>().toEqualTypeOf<["CANNOT_DOWNGRADE_BLOCK", "BLOCK", "ALLOW"]>();
    expectTypeOf<NoBlockDowngrade<"BLOCK", "UNKNOWN">>().toEqualTypeOf<["CANNOT_DOWNGRADE_BLOCK", "BLOCK", "UNKNOWN"]>();
  });

  it("BlockProjection: the only lawful projection of a BLOCK decision is a BLOCK", () => {
    expectTypeOf<
      BlockProjection<Extract<GateDecision, { decision: "BLOCK" }>>
    >().toEqualTypeOf<{ readonly decision: "BLOCK" }>();
    expectTypeOf<
      BlockProjection<Extract<GateDecision, { decision: "ALLOW" }>>
    >().toBeNever();
  });
});

describe("the cannot_downgrade_block layer law — RUNTIME level (the lattice join)", () => {
  it("the restriction rank is total: ALLOW < UNKNOWN < BLOCK", () => {
    expect(GATE_DECISION_RANK.ALLOW).toBeLessThan(GATE_DECISION_RANK.UNKNOWN);
    expect(GATE_DECISION_RANK.UNKNOWN).toBeLessThan(GATE_DECISION_RANK.BLOCK);
    expect(stricterGateDecision("ALLOW", "BLOCK")).toBe("BLOCK");
    expect(stricterGateDecision("UNKNOWN", "ALLOW")).toBe("UNKNOWN");
    expect(stricterGateDecision("BLOCK", "BLOCK")).toBe("BLOCK");
  });

  it("a join with a BLOCK is ALWAYS a BLOCK — no input can soften it", () => {
    const block = blockDecision();
    expect(block.decision).toBe("BLOCK");
    for (const other of [allowDecision(), unknownDecision(), blockDecision()]) {
      expect(joinGateDecisions(block, other).decision).toBe("BLOCK");
      expect(joinGateDecisions(other, block).decision).toBe("BLOCK");
    }
  });

  it("a join only ACCUMULATES reasons/checks/evidence — never removes a block reason", () => {
    const first = blockDecision();
    const second = blockDecision();
    if (first.decision !== "BLOCK" || second.decision !== "BLOCK") {
      throw new Error("fixture must produce BLOCK decisions");
    }
    const joined = joinGateDecisions(first, second);
    if (joined.decision !== "BLOCK") {
      throw new Error("unreachable: joined BLOCK decisions must be BLOCK");
    }
    expect(joined.reasons.length).toBeGreaterThanOrEqual(first.reasons.length);
    for (const reason of first.reasons) {
      expect(joined.reasons.some((r) => r.dimension === reason.dimension && r.code === reason.code)).toBe(true);
    }
    expect(joined.checks.length).toBeGreaterThanOrEqual(first.checks.length);
    expect(joined.evidenceRefs.length).toBeGreaterThanOrEqual(first.evidenceRefs.length);
  });

  it("the join is commutative and associative on decision values (a real lattice)", () => {
    const allow = allowDecision();
    const unknown = unknownDecision();
    const block = blockDecision();
    expect(joinGateDecisions(allow, unknown).decision).toBe("UNKNOWN");
    expect(joinGateDecisions(unknown, allow).decision).toBe("UNKNOWN");
    expect(
      joinGateDecisions(joinGateDecisions(allow, unknown), block).decision,
    ).toBe(joinGateDecisions(allow, joinGateDecisions(unknown, block)).decision);
  });

  it("a join of non-BLOCK inputs never fabricates a BLOCK (the floor is honest)", () => {
    expect(joinGateDecisions(allowDecision(), allowDecision()).decision).toBe("ALLOW");
    expect(joinGateDecisions(allowDecision(), unknownDecision()).decision).toBe("UNKNOWN");
  });
});

describe("the cannot_downgrade_block layer law — REJECTION level", () => {
  it("attemptBlockDowngrade ALWAYS throws, for every attempted target value", () => {
    const block = blockDecision();
    expect(() => attemptBlockDowngrade(block, "ALLOW", "agent:rogue-1")).toThrow(BlockDowngradeForbiddenError);
    expect(() => attemptBlockDowngrade(block, "UNKNOWN", "agent:rogue-1")).toThrow(BlockDowngradeForbiddenError);
    expect(() => attemptBlockDowngrade(block, "BLOCK", "agent:rogue-1")).toThrow(BlockDowngradeForbiddenError);
    expect(() => attemptBlockDowngrade(allowDecision(), "BLOCK", "agent:rogue-1")).toThrow(
      BlockDowngradeForbiddenError,
    );
  });

  it("the rejection carries the attempted decision and the claimer (audit lineage)", () => {
    try {
      attemptBlockDowngrade(blockDecision(), "ALLOW", "agent:rogue-9");
      throw new Error("unreachable: attemptBlockDowngrade always throws");
    } catch (error) {
      const forbidden = error as BlockDowngradeForbiddenError;
      expect(forbidden.name).toBe("BlockDowngradeForbiddenError");
      expect(forbidden.attempted).toBe("ALLOW");
      expect(forbidden.message).toContain("agent:rogue-9");
      expect(forbidden.message).toContain("INV-21");
    }
  });

  it("assertNoBlockDowngrade passes a fresh BLOCK re-evaluation and fails any softening", () => {
    const before = blockDecision();
    expect(() => assertNoBlockDowngrade(before, blockDecision(), "recheck")).not.toThrow();
    expect(() => assertNoBlockDowngrade(before, unknownDecision(), "recheck")).toThrow(BlockDowngradeForbiddenError);
    expect(() => assertNoBlockDowngrade(before, allowDecision(), "recheck")).toThrow(BlockDowngradeForbiddenError);
    // A non-BLOCK before-state may legitimately resolve either way:
    expect(() => assertNoBlockDowngrade(unknownDecision(), allowDecision(), "resolution")).not.toThrow();
  });
});
