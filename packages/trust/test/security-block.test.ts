import { describe, expect, it } from "vitest";
import { SecurityEpochAuthority, SecurityBlockError, SecurityBlockRegistry } from "../src/index.ts";

/**
 * Net-new (P1-W3): INV-21 — security/adversarial intelligence cannot
 * downgrade BLOCK. A BLOCK verdict survives any epoch advancement; the ONLY
 * exit is an explicit higher-authority revocation, which is itself
 * append-only, evidence-carrying history.
 */

const SUBJECT = "agent:suspicious-agent-1";

function registryWithBlock(issuedAtEpoch = 0n): SecurityBlockRegistry {
  const registry = new SecurityBlockRegistry();
  registry.register({
    id: "block-1",
    subjectRef: SUBJECT,
    reason: "anomalous delegation pattern detected",
    issuedAtEpoch,
    evidenceRefs: ["evidence:anomaly-1", "evidence:anomaly-2"],
  });
  return registry;
}

describe("SecurityBlockRegistry — registration", () => {
  it("registers an append-only block record with evidence", () => {
    const registry = registryWithBlock();
    const block = registry.lookup("block-1");
    expect(block?.subjectRef).toBe(SUBJECT);
    expect(block?.evidenceRefs).toEqual(["evidence:anomaly-1", "evidence:anomaly-2"]);
    expect(registry.history()).toHaveLength(1);
  });

  it("rejects duplicate ids, empty subjects/reasons and negative epochs (fail closed)", () => {
    const registry = registryWithBlock();
    expect(() =>
      registry.register({ id: "block-1", subjectRef: "x", reason: "r", issuedAtEpoch: 0n, evidenceRefs: [] }),
    ).toThrow(SecurityBlockError);
    expect(() =>
      registry.register({ id: "", subjectRef: "x", reason: "r", issuedAtEpoch: 0n, evidenceRefs: [] }),
    ).toThrow(SecurityBlockError);
    expect(() =>
      registry.register({ id: "b", subjectRef: "", reason: "r", issuedAtEpoch: 0n, evidenceRefs: [] }),
    ).toThrow(SecurityBlockError);
    expect(() =>
      registry.register({ id: "b", subjectRef: "x", reason: "", issuedAtEpoch: 0n, evidenceRefs: [] }),
    ).toThrow(SecurityBlockError);
    expect(() =>
      registry.register({ id: "b", subjectRef: "x", reason: "r", issuedAtEpoch: -1n, evidenceRefs: [] }),
    ).toThrow(SecurityBlockError);
  });
});

describe("INV-21 — BLOCK survives epoch advancement", () => {
  it("a block issued at epoch 0 still blocks at epoch 0..N for any N (no downgrade)", () => {
    const registry = registryWithBlock(0n);
    const authority = new SecurityEpochAuthority();
    expect(registry.isBlocked(SUBJECT, 0n)).toBe(true);
    for (let advance = 1; advance <= 10; advance += 1) {
      authority.advance({ reason: `security event ${advance}`, at: advance });
      // however far the epoch advances, the block stands
      expect(registry.isBlocked(SUBJECT, authority.currentEpoch().value)).toBe(true);
    }
  });

  it("there is NO epoch, event or API that downgrades a block (asymmetry vs mandates)", () => {
    const registry = registryWithBlock(2n);
    // before issuance epoch: not yet in force (blocks are never retroactive)
    expect(registry.isBlocked(SUBJECT, 1n)).toBe(false);
    // from issuance onward: in force at every epoch, unconditionally
    expect(registry.isBlocked(SUBJECT, 2n)).toBe(true);
    expect(registry.isBlocked(SUBJECT, 1_000_000n)).toBe(true);
    expect(registry.isBlocked(SUBJECT, 1_000_000_000_000n)).toBe(true);
  });

  it("blocks are per-subject: other subjects are unaffected", () => {
    const registry = registryWithBlock();
    expect(registry.isBlocked("agent:well-behaved-agent", 0n)).toBe(false);
  });
});

describe("INV-21 — the explicit higher-authority revocation path", () => {
  it("retires a block only via the explicit path, from the revocation epoch onward", () => {
    const registry = registryWithBlock(0n);
    registry.revokeAsHigherAuthority({
      blockId: "block-1",
      revokedBy: "authority:security-council@2",
      reason: "false positive confirmed by human review",
      revokedAtEpoch: 4n,
    });
    expect(registry.isBlocked(SUBJECT, 3n)).toBe(true); // before revocation: still blocked
    expect(registry.isBlocked(SUBJECT, 4n)).toBe(false); // from revocation epoch: retired
    expect(registry.isBlocked(SUBJECT, 5n)).toBe(false);
    // the block record and the revocation record both remain as evidence
    expect(registry.lookup("block-1")).toBeDefined();
    expect(registry.revocationOf("block-1")?.revokedBy).toBe("authority:security-council@2");
  });

  it("revocation is append-only: cannot repeat, reverse or backdate", () => {
    const registry = registryWithBlock(2n);
    registry.revokeAsHigherAuthority({
      blockId: "block-1",
      revokedBy: "authority:security-council@2",
      reason: "reviewed",
      revokedAtEpoch: 3n,
    });
    expect(() =>
      registry.revokeAsHigherAuthority({
        blockId: "block-1",
        revokedBy: "authority:other",
        reason: "again",
        revokedAtEpoch: 5n,
      }),
    ).toThrow(/append-only and cannot be repeated or reversed/);
    expect(() =>
      registry.revokeAsHigherAuthority({
        blockId: "block-unknown",
        revokedBy: "authority:x",
        reason: "r",
        revokedAtEpoch: 5n,
      }),
    ).toThrow(SecurityBlockError);
    const other = registryWithBlock(5n);
    expect(() =>
      other.revokeAsHigherAuthority({
        blockId: "block-1",
        revokedBy: "authority:x",
        reason: "backdated",
        revokedAtEpoch: 4n, // before the block even existed
      }),
    ).toThrow(/cannot be backdated/);
  });

  it("empty authorities/reasons are rejected (evidence-carrying revocation only)", () => {
    const registry = registryWithBlock();
    expect(() =>
      registry.revokeAsHigherAuthority({ blockId: "block-1", revokedBy: "", reason: "r", revokedAtEpoch: 1n }),
    ).toThrow(SecurityBlockError);
    expect(() =>
      registry.revokeAsHigherAuthority({ blockId: "block-1", revokedBy: "a:x", reason: "", revokedAtEpoch: 1n }),
    ).toThrow(SecurityBlockError);
  });
});

describe("INV-21 determinism", () => {
  it("identical registry state answers identically at the same epoch, repeatedly", () => {
    const registry = registryWithBlock(1n);
    for (let repetition = 0; repetition < 5; repetition += 1) {
      expect(registry.isBlocked(SUBJECT, 0n)).toBe(false);
      expect(registry.isBlocked(SUBJECT, 1n)).toBe(true);
      expect(registry.isBlocked(SUBJECT, 42n)).toBe(true);
    }
  });

  it("a revoked block that is re-registered as a NEW record blocks again from its own epoch", () => {
    const registry = registryWithBlock(0n);
    registry.revokeAsHigherAuthority({
      blockId: "block-1",
      revokedBy: "authority:security-council@2",
      reason: "resolved",
      revokedAtEpoch: 1n,
    });
    registry.register({
      id: "block-2",
      subjectRef: SUBJECT,
      reason: "new independent evidence",
      issuedAtEpoch: 2n,
      evidenceRefs: ["evidence:new-1"],
    });
    expect(registry.isBlocked(SUBJECT, 1n)).toBe(false);
    expect(registry.isBlocked(SUBJECT, 2n)).toBe(true);
    expect(registry.isBlocked(SUBJECT, 9n)).toBe(true);
  });
});
