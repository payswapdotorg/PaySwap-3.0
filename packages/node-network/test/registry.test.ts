import { describe, expect, it } from "vitest";
import {
  activeEnrollments,
  createEmptyNodeRegistry,
  enrollNode,
  isNodeRevoked,
  nodeEnrollment,
  nodeRegistryDigest,
  nodeRevocation,
  revokeNode,
} from "../src/index.ts";
import { NodeRegistryError } from "../src/index.ts";
import { fixtureOperatorEnrollment } from "./fixtures.ts";

describe("the node registry with revocation (ADR-0020 D5/D11)", () => {
  it("THE HONEST DEFAULT: the registry starts EMPTY — no fake ACTIVE node ships", () => {
    const registry = createEmptyNodeRegistry();
    expect(registry.enrollments).toEqual([]);
    expect(registry.revocations).toEqual([]);
    expect(activeEnrollments(registry)).toEqual([]);
  });

  it("enrolls a validated node (append-only) and looks it up", () => {
    const registry = enrollNode(createEmptyNodeRegistry(), fixtureOperatorEnrollment());
    const record = nodeEnrollment(registry, "node:fixture-gh-1");
    expect(record?.principal.legalName).toBe("Fixture Ghana Router Ltd");
    expect(activeEnrollments(registry)).toHaveLength(1);
  });

  it("rejects a duplicate identity (append-only, never an overwrite)", () => {
    const registry = enrollNode(createEmptyNodeRegistry(), fixtureOperatorEnrollment());
    expect(() => enrollNode(registry, fixtureOperatorEnrollment())).toThrow(
      NodeRegistryError,
    );
  });

  it("rejects an invalid enrollment at the registry seam (fail closed, typed)", () => {
    // the enrollment's OWN typed validation error surfaces (the registry
    // adds nothing and repairs nothing)
    expect(() => enrollNode(createEmptyNodeRegistry(), { nonsense: true })).toThrow(
      /enrollmentVersion/,
    );
  });

  it("revocation is a recorded, accountable fact — and the node leaves the active projection", () => {
    const registry = enrollNode(createEmptyNodeRegistry(), fixtureOperatorEnrollment());
    const revoked = revokeNode(registry, {
      nodeId: "node:fixture-gh-1",
      revokedAt: "2026-11-03T09:00:00Z",
      reason: "regulatory action: licence suspended",
      revokedBy: "operator:payswap-station",
    });
    expect(isNodeRevoked(revoked, "node:fixture-gh-1")).toBe(true);
    expect(activeEnrollments(revoked)).toHaveLength(0);
    // history is immutable: the enrollment stays recorded
    expect(nodeEnrollment(revoked, "node:fixture-gh-1")?.nodeId).toBe("node:fixture-gh-1");
    const revocation = nodeRevocation(revoked, "node:fixture-gh-1");
    expect(revocation?.reason).toBe("regulatory action: licence suspended");
    expect(revocation?.revokedBy).toBe("operator:payswap-station");
  });

  it("revoking an unenrolled or already-revoked node is a typed error (no phantom history)", () => {
    const registry = enrollNode(createEmptyNodeRegistry(), fixtureOperatorEnrollment());
    expect(() =>
      revokeNode(createEmptyNodeRegistry(), {
        nodeId: "node:ghost",
        revokedAt: "2026-11-03T09:00:00Z",
        reason: "x",
        revokedBy: "y",
      }),
    ).toThrow(/phantom/);
    const revoked = revokeNode(registry, {
      nodeId: "node:fixture-gh-1",
      revokedAt: "2026-11-03T09:00:00Z",
      reason: "x",
      revokedBy: "operator:a",
    });
    expect(() =>
      revokeNode(revoked, {
        nodeId: "node:fixture-gh-1",
        revokedAt: "2026-11-03T10:00:00Z",
        reason: "again",
        revokedBy: "operator:a",
      }),
    ).toThrow(/append-once/);
  });

  it("an unaccountable revocation (no reason/authority) is refused", () => {
    const registry = enrollNode(createEmptyNodeRegistry(), fixtureOperatorEnrollment());
    expect(() =>
      revokeNode(registry, {
        nodeId: "node:fixture-gh-1",
        revokedAt: "2026-11-03T09:00:00Z",
        reason: "",
        revokedBy: "operator:a",
      }),
    ).toThrow(NodeRegistryError);
  });

  it("the registry digest covers enrollments AND revocations, order-independently", () => {
    const a = fixtureOperatorEnrollment();
    const b = fixtureOperatorEnrollment({
      nodeId: "node:fixture-ke-1",
      jurisdiction: "KE",
      principal: { legalName: "Fixture Kenya Ltd", registrationRefs: ["reg:KE-1"], jurisdiction: "KE" },
    });
    const left = enrollNode(enrollNode(createEmptyNodeRegistry(), a), b);
    const right = enrollNode(enrollNode(createEmptyNodeRegistry(), b), a);
    expect(nodeRegistryDigest(left)).toBe(nodeRegistryDigest(right));
    const revokedLeft = revokeNode(left, {
      nodeId: a.nodeId,
      revokedAt: "2026-11-03T09:00:00Z",
      reason: "test",
      revokedBy: "operator:t",
    });
    expect(nodeRegistryDigest(revokedLeft)).not.toBe(nodeRegistryDigest(left));
  });
});
