/**
 * Security advisories + the global restriction view (P6-W3, lane r4-w3;
 * PORT of payswap.org@8a735bf packages/security/test/advisories.test.ts
 * — the old INV-S01 law re-cited canonically).
 */

import { describe, expect, it } from "vitest";
import {
  advisoryAffects,
  SecurityAdvisoryError,
  SecurityAdvisoryRegistry,
  ValidationError,
  type AffectedComponentRef,
} from "../src/index.ts";

function publishInput(overrides: Partial<Parameters<SecurityAdvisoryRegistry["publish"]>[0]> = {}) {
  return {
    advisoryId: "adv-1",
    title: "ext-1 RCE",
    severity: "high" as const,
    description: "fixture advisory",
    affected: [
      {
        kind: "extension",
        id: "ext-1",
        versionRange: { minVersion: "1.0.0", maxVersion: "1.9.0" },
      },
    ] as readonly AffectedComponentRef[],
    action: "restrict" as const,
    remediation: { summary: "upgrade to 2.0.0", workarounds: ["disable ext-1"] },
    declaredBy: "source:cert-intel",
    publishedAt: 1_000,
    ...overrides,
  };
}

describe("security advisories + the global restriction view", () => {
  it("publishes with computed provenance and active status", () => {
    const registry = new SecurityAdvisoryRegistry();
    const advisory = registry.publish(publishInput());
    expect(advisory.status).toBe("active");
    expect(advisory.provenance.contentHash).toMatch(/^fnv1a64:/);
    expect(advisory.provenance.publishedAt).toBe(1_000);
    expect(registry.listActive()).toHaveLength(1);
  });

  it("rejects empty affected sets and duplicate ids", () => {
    const registry = new SecurityAdvisoryRegistry();
    registry.publish(publishInput());
    expect(() => registry.publish(publishInput())).toThrowError(/already exists/);
    expect(() =>
      registry.publish(publishInput({ advisoryId: "adv-2", affected: [] })),
    ).toThrowError(/at least one component/);
    expect(() =>
      registry.publish(
        publishInput({ advisoryId: "adv-3", remediation: { summary: "", workarounds: [] } }),
      ),
    ).toThrowError(/remediation summary/);
  });

  it("affects the in-range package version", () => {
    const advisory = new SecurityAdvisoryRegistry().publish(publishInput());
    expect(
      advisoryAffects(advisory, { kind: "extension", id: "ext-1", version: "1.4.2" }),
    ).toBe(true);
  });

  it("does not affect the patched version", () => {
    const advisory = new SecurityAdvisoryRegistry().publish(publishInput());
    expect(
      advisoryAffects(advisory, { kind: "extension", id: "ext-1", version: "2.0.0" }),
    ).toBe(false);
  });

  it("treats an unknown version as affected (FAIL-CLOSED restriction — the deliberate contrast)", () => {
    const advisory = new SecurityAdvisoryRegistry().publish(publishInput());
    expect(advisoryAffects(advisory, { kind: "extension", id: "ext-1" })).toBe(true);
  });

  it("unscoped components match every version", () => {
    const advisory = new SecurityAdvisoryRegistry().publish(
      publishInput({ affected: [{ kind: "agent_package", id: "pkg-1" }] }),
    );
    expect(
      advisoryAffects(advisory, { kind: "agent_package", id: "pkg-1", version: "99.0.0" }),
    ).toBe(true);
    expect(advisoryAffects(advisory, { kind: "agent_package", id: "pkg-1" })).toBe(true);
  });

  it("restricts the vulnerable extension and package everywhere, whatever graph/source presents them (the global view)", () => {
    const registry = new SecurityAdvisoryRegistry();
    registry.publish(publishInput());
    registry.publish(
      publishInput({
        advisoryId: "adv-2",
        affected: [{ kind: "agent_package", id: "pkg-9" }],
        action: "restrict",
        severity: "low",
      }),
    );
    // No scope parameter exists — every presentation gets the same answer.
    const view = registry.restrictionFor({ kind: "extension", id: "ext-1", version: "1.2.0" });
    expect(view.restricted).toBe(true);
    expect(view.quarantined).toBe(false);
    expect(view.retired).toBe(false);
    expect(view.advisoryRefs).toEqual(["adv-1"]);
    expect(registry.isRestricted({ kind: "agent_package", id: "pkg-9" })).toBe(true);
    expect(registry.isRestricted({ kind: "extension", id: "ext-2" })).toBe(false);
    expect(registry.activeRestrictedKeys()).toEqual([
      "agent_package:pkg-9",
      "extension:ext-1",
    ]);
  });

  it("escalation ladder: retire > quarantine > restrict; most severe advisory first (deterministic order)", () => {
    const registry = new SecurityAdvisoryRegistry();
    registry.publish(
      publishInput({ advisoryId: "adv-restrict", severity: "low", action: "restrict" }),
    );
    registry.publish(
      publishInput({ advisoryId: "adv-retire", severity: "critical", action: "retire" }),
    );
    registry.publish(
      publishInput({ advisoryId: "adv-quarantine", severity: "high", action: "quarantine" }),
    );
    const view = registry.restrictionFor({ kind: "extension", id: "ext-1", version: "1.4.0" });
    expect(view.restricted).toBe(true);
    expect(view.quarantined).toBe(true);
    expect(view.retired).toBe(true);
    // Most severe driver first: critical > high > low.
    expect(view.advisoryRefs).toEqual(["adv-retire", "adv-quarantine", "adv-restrict"]);
  });

  it("closes only with verified remediation; history stays append-only", () => {
    const registry = new SecurityAdvisoryRegistry();
    registry.publish(publishInput());
    expect(() =>
      registry.close({ advisoryId: "adv-1", closedAt: 2_000, closureNote: "n", remediationVerified: false }),
    ).toThrowError(/verified remediation/);
    expect(() =>
      registry.close({ advisoryId: "adv-1", closedAt: 2_000, closureNote: "", remediationVerified: true }),
    ).toThrowError(/closureNote/);
    expect(() =>
      registry.close({ advisoryId: "adv-1", closedAt: 900, closureNote: "n", remediationVerified: true }),
    ).toThrowError(/before the advisory publication/);
    const closed = registry.close({
      advisoryId: "adv-1",
      closedAt: 2_000,
      closureNote: "patched in 2.0.0",
      remediationVerified: true,
    });
    expect(closed.status).toBe("closed");
    expect(registry.listActive()).toHaveLength(0);
    // Closed advisories no longer restrict.
    expect(registry.isRestricted({ kind: "extension", id: "ext-1", version: "1.4.0" })).toBe(false);
    expect(() =>
      registry.close({ advisoryId: "adv-1", closedAt: 3_000, closureNote: "again", remediationVerified: true }),
    ).toThrowError(/already closed/);
    // History: published then closed — append-only, never rewritten.
    expect(registry.history().map((event) => event.eventType)).toEqual(["published", "closed"]);
  });

  it("unknown severities/actions fail closed with the pinned validation error", () => {
    const registry = new SecurityAdvisoryRegistry();
    expect(() =>
      registry.publish(publishInput({ advisoryId: "x1", severity: "extreme" as never })),
    ).toThrowError(ValidationError);
    expect(() =>
      registry.publish(publishInput({ advisoryId: "x2", action: "burn" as never })),
    ).toThrowError(ValidationError);
    expect(registry.byId("missing")).toBeUndefined();
    expect(() =>
      registry.close({ advisoryId: "missing", closedAt: 1, closureNote: "n", remediationVerified: true }),
    ).toThrowError(SecurityAdvisoryError);
  });
});
