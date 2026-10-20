/**
 * The threat-signature registry (P6-W3, lane r4-w3; PORT of the
 * signature sites from payswap.org@8a735bf
 * packages/security/test/signatures.test.ts — detection is
 * evidence-generating and FAIL-OPEN, the deliberate contrast with
 * fail-closed restriction).
 */

import { describe, expect, it } from "vitest";
import {
  matchesActionPattern,
  signatureMatchesIdentity,
  signatureMatchesObservation,
  ThreatSignatureError,
  ThreatSignatureRegistry,
  type ComponentObservation,
} from "../src/index.ts";

describe("threat signatures", () => {
  it("matches exact ids, prefix wildcards and the global wildcard", () => {
    expect(matchesActionPattern("payment.attempt.resolve", "payment.attempt.resolve")).toBe(true);
    expect(matchesActionPattern("payment.attempt.resolve", "payment.attempt.submit")).toBe(false);
    expect(matchesActionPattern("payment.*", "payment.attempt.resolve")).toBe(true);
    expect(matchesActionPattern("payment.*", "settlement.post")).toBe(false);
    expect(matchesActionPattern("*", "anything.at.all")).toBe(true);
    expect(matchesActionPattern("", "payment.attempt.resolve")).toBe(false);
  });

  it("registers with computed provenance content hash", () => {
    const registry = new ThreatSignatureRegistry();
    const signature = registry.register({
      signatureId: "sig-1",
      kind: "vulnerable_extension",
      title: "ext-1 RCE",
      description: "fixture signature",
      affected: { kind: "extension", id: "ext-1", versionRange: { maxVersion: "1.9.9" } },
      indicators: [{ indicatorId: "ind-1", kind: "action_pattern", pattern: "payment.*" }],
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    expect(signature.provenance.source).toBe("source:cert-intel");
    expect(signature.provenance.contentHash).toMatch(/^fnv1a64:/);
    expect(signature.indicators).toHaveLength(1);
    expect(registry.byId("sig-1")).toBeDefined();
  });

  it("matches identity in range; no match outside range, other kind or other id (FAIL-OPEN detection)", () => {
    const registry = new ThreatSignatureRegistry();
    const signature = registry.register({
      signatureId: "sig-2",
      kind: "vulnerable_package",
      title: "pkg-1",
      description: "fixture",
      affected: {
        kind: "agent_package",
        id: "pkg-1",
        versionRange: { minVersion: "1.0.0", maxVersion: "1.5.0" },
      },
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    expect(signatureMatchesIdentity(signature, { kind: "agent_package", id: "pkg-1", version: "1.2.0" })).toBe(true);
    expect(signatureMatchesIdentity(signature, { kind: "agent_package", id: "pkg-1", version: "1.6.0" })).toBe(false);
    expect(signatureMatchesIdentity(signature, { kind: "extension", id: "pkg-1", version: "1.2.0" })).toBe(false);
    expect(signatureMatchesIdentity(signature, { kind: "agent_package", id: "pkg-2", version: "1.2.0" })).toBe(false);
    // FAIL-OPEN detection (the deliberate contrast with restriction): an
    // unknown version produces NO match, never a guess.
    expect(signatureMatchesIdentity(signature, { kind: "agent_package", id: "pkg-1" })).toBe(false);
  });

  it("matches observations only when identity AND an indicator match", () => {
    const registry = new ThreatSignatureRegistry();
    const signature = registry.register({
      signatureId: "sig-3",
      kind: "malicious_behavior",
      title: "behavior",
      description: "fixture",
      affected: { kind: "agent_key", id: "key-1" },
      indicators: [
        { indicatorId: "ind-a", kind: "action_pattern", pattern: "beneficiary.*" },
        { indicatorId: "ind-b", kind: "signal_class", pattern: "velocity" },
      ],
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    const behavioral: ComponentObservation = {
      component: { kind: "agent_key", id: "key-1" },
      action: "beneficiary.change",
    };
    expect(signatureMatchesObservation(signature, behavioral)).toBe(true);
    const signal: ComponentObservation = {
      component: { kind: "agent_key", id: "key-1" },
      signalClass: "velocity",
    };
    expect(signatureMatchesObservation(signature, signal)).toBe(true);
    const token: ComponentObservation = {
      component: { kind: "agent_key", id: "key-1" },
      tokenFamily: "money.usd",
    };
    expect(signatureMatchesObservation(signature, token)).toBe(false);
    const otherKey: ComponentObservation = {
      component: { kind: "agent_key", id: "key-2" },
      action: "beneficiary.change",
    };
    expect(signatureMatchesObservation(signature, otherKey)).toBe(false);
  });

  it("a signature without indicators never matches an observation (identity-scoped intelligence)", () => {
    const registry = new ThreatSignatureRegistry();
    const signature = registry.register({
      signatureId: "sig-4",
      kind: "abuse_pattern",
      title: "scoped intel",
      description: "fixture",
      affected: { kind: "extension", id: "ext-1" },
      indicators: [],
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    expect(
      signatureMatchesObservation(signature, {
        component: { kind: "extension", id: "ext-1" },
        action: "anything",
      }),
    ).toBe(false);
  });

  it("registry queries are deterministic and ordered by registration", () => {
    const registry = new ThreatSignatureRegistry();
    for (const id of ["sig-b", "sig-a", "sig-c"]) {
      registry.register({
        signatureId: id,
        kind: "abuse_pattern",
        title: id,
        description: "fixture",
        affected: { kind: "extension", id: "ext-1" },
        declaredBy: "source:cert-intel",
        publishedAt: 1_000,
      });
    }
    expect(registry.list().map((s) => s.signatureId)).toEqual(["sig-b", "sig-a", "sig-c"]);
    expect(registry.matchIdentity({ kind: "extension", id: "ext-1" })).toHaveLength(3);
    expect(registry.matchObservation({ component: { kind: "extension", id: "ext-1" } })).toHaveLength(0);
  });

  it("rejects duplicate ids and malformed input (fail closed)", () => {
    const registry = new ThreatSignatureRegistry();
    const base = {
      signatureId: "sig-1",
      kind: "vulnerable_package" as const,
      title: "t",
      description: "d",
      affected: { kind: "agent_package" as const, id: "pkg-1" },
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    };
    registry.register(base);
    expect(() => registry.register(base)).toThrowError(ThreatSignatureError);
    expect(() =>
      registry.register({ ...base, signatureId: "", title: "t" }),
    ).toThrowError(/signatureId/);
    expect(() =>
      registry.register({ ...base, signatureId: "sig-2", declaredBy: "" }),
    ).toThrowError(/declaredBy/);
    expect(() =>
      registry.register({
        ...base,
        signatureId: "sig-3",
        affected: { kind: "vendor_plugin" as never, id: "x" },
      }),
    ).toThrowError(/component kind/);
    expect(() =>
      registry.register({
        ...base,
        signatureId: "sig-4",
        affected: {
          kind: "agent_package",
          id: "pkg-1",
          versionRange: { minVersion: "1.x" },
        },
      }),
    ).toThrowError(/numeric dotted/);
    expect(() =>
      registry.register({
        ...base,
        signatureId: "sig-5",
        affected: {
          kind: "agent_package",
          id: "pkg-1",
          versionRange: { minVersion: "2.0.0", maxVersion: "1.0.0" },
        },
      }),
    ).toThrowError(/inverted/);
    expect(() =>
      registry.register({
        ...base,
        signatureId: "sig-6",
        indicators: [{ indicatorId: "", kind: "signal_class", pattern: "x" }],
      }),
    ).toThrowError(/indicator id/);
  });
});
