/**
 * The composed immune gate (P6-W3, lane r4-w3; PORT of the SecurityGate
 * sites from payswap.org@8a735bf
 * packages/security/test/quarantine.test.ts — enforceAdvisory +
 * checkSensitiveAction).
 */

import { describe, expect, it } from "vitest";
import {
  ImmuneGate,
  QuarantineLedger,
  RestrictedComponentError,
  SecurityAdvisoryRegistry,
  SecurityEpochAuthority,
  StaleAuthorizationEpochError,
  type EpochScopedAuthorization,
} from "../src/index.ts";

function gate(): ImmuneGate {
  return new ImmuneGate({
    advisories: new SecurityAdvisoryRegistry(),
    quarantine: new QuarantineLedger(),
    epochs: new SecurityEpochAuthority(),
  });
}

function advisoryInput(
  overrides: Partial<Parameters<SecurityAdvisoryRegistry["publish"]>[0]> = {},
): Parameters<SecurityAdvisoryRegistry["publish"]>[0] {
  return {
    advisoryId: "adv-1",
    title: "pkg-1 compromise",
    severity: "critical",
    description: "fixture",
    affected: [{ kind: "agent_package", id: "pkg-1" }],
    action: "quarantine",
    remediation: { summary: "patch", workarounds: [] },
    declaredBy: "source:cert-intel",
    publishedAt: 1_000,
    ...overrides,
  };
}

function authorization(overrides: Partial<EpochScopedAuthorization> = {}): EpochScopedAuthorization {
  return {
    authorizationRef: "authz-1",
    principalRef: "user:customer-1",
    agentRef: "key-agent-1",
    actionClass: "money_movement",
    issuedAtEpoch: 0n,
    expiresAt: 10_000,
    ...overrides,
  };
}

describe("the composed immune gate (enforceAdvisory + checkSensitiveAction)", () => {
  it("enforceAdvisory quarantines affected components and (opt-in) advances the epoch", () => {
    const immune = gate();
    const published = immune.advisories.publish(advisoryInput());
    const record = immune.enforceAdvisory(published, { advanceEpoch: true });
    expect(record.advisoryId).toBe("adv-1");
    expect(record.action).toBe("quarantine");
    expect(record.quarantinedComponents).toEqual([{ kind: "agent_package", id: "pkg-1" }]);
    expect(record.epochAdvanced).toBe(true);
    expect(immune.quarantine.isQuarantined({ kind: "agent_package", id: "pkg-1" })).toBe(true);
    expect(immune.epochs.currentEpoch().value).toBe(1n);
    expect(immune.epochs.currentEpoch().advisoryRef).toBe("adv-1");
  });

  it("enforceAdvisory is idempotent for quarantine and skips the epoch without the opt-in", () => {
    const immune = gate();
    const published = immune.advisories.publish(advisoryInput());
    const first = immune.enforceAdvisory(published);
    const second = immune.enforceAdvisory(published);
    expect(first.quarantinedComponents).toHaveLength(1);
    expect(second.quarantinedComponents).toHaveLength(0);
    expect(first.epochAdvanced).toBe(false);
    expect(second.epochAdvanced).toBe(false);
    expect(immune.epochs.currentEpoch().value).toBe(0n);
  });

  it("restrict/retire advisories compute live — nothing to quarantine", () => {
    const immune = gate();
    const restrict = immune.advisories.publish(
      advisoryInput({ advisoryId: "adv-r", action: "restrict" }),
    );
    const retire = immune.advisories.publish(
      advisoryInput({ advisoryId: "adv-t", action: "retire", affected: [{ kind: "extension", id: "ext-7" }] }),
    );
    expect(immune.enforceAdvisory(restrict).quarantinedComponents).toEqual([]);
    expect(immune.enforceAdvisory(retire).quarantinedComponents).toEqual([]);
    expect(immune.advisories.restrictionFor({ kind: "extension", id: "ext-7" }).retired).toBe(true);
    expect(immune.advisories.restrictionFor({ kind: "agent_package", id: "pkg-1" }).restricted).toBe(true);
  });

  it("an epoch advance VOIDS epoch-scoped authorizations granted under it (the D-1 law)", () => {
    const immune = gate();
    const published = immune.advisories.publish(advisoryInput());
    immune.enforceAdvisory(published, { advanceEpoch: true });
    const stale = authorization({ issuedAtEpoch: 0n });
    expect(() =>
      immune.checkSensitiveAction({ authorization: stale, at: 1_500 }),
    ).toThrowError(StaleAuthorizationEpochError);
    const fresh = authorization({ issuedAtEpoch: 1n });
    expect(() =>
      immune.checkSensitiveAction({ authorization: fresh, at: 1_500 }),
    ).not.toThrow();
  });

  it("a vulnerable AGENT is restricted out of sensitive actions (via agentRef)", () => {
    const immune = gate();
    immune.advisories.publish(
      advisoryInput({
        advisoryId: "adv-agent",
        affected: [{ kind: "agent_key", id: "key-agent-1" }],
        action: "restrict",
      }),
    );
    expect(() =>
      immune.checkSensitiveAction({ authorization: authorization(), at: 1_500 }),
    ).toThrowError(RestrictedComponentError);
    try {
      immune.checkSensitiveAction({ authorization: authorization(), at: 1_500 });
    } catch (error) {
      const restricted = error as RestrictedComponentError;
      expect(restricted.componentKey).toBe("agent_key:key-agent-1");
      expect(restricted.advisoryRefs).toEqual(["adv-agent"]);
    }
  });

  it("a vulnerable PACKAGE through which the action routes is restricted (viaComponents)", () => {
    const immune = gate();
    immune.advisories.publish(
      advisoryInput({ advisoryId: "adv-pkg", affected: [{ kind: "agent_package", id: "pkg-router" }] }),
    );
    expect(() =>
      immune.checkSensitiveAction({
        authorization: authorization(),
        at: 1_500,
        viaComponents: [{ kind: "agent_package", id: "pkg-router" }],
      }),
    ).toThrowError(RestrictedComponentError);
    // A clean via-component passes.
    expect(() =>
      immune.checkSensitiveAction({
        authorization: authorization(),
        at: 1_500,
        viaComponents: [{ kind: "agent_package", id: "pkg-clean" }],
      }),
    ).not.toThrow();
  });

  it("clean components pass the full sensitive-action gate", () => {
    const immune = gate();
    expect(() =>
      immune.checkSensitiveAction({ authorization: authorization(), at: 1_500 }),
    ).not.toThrow();
  });

  it("the gate's authorizeCapabilityUse is the cached-state-bypass rejection", () => {
    const immune = gate();
    const published = immune.advisories.publish(advisoryInput());
    immune.enforceAdvisory(published);
    const decision = immune.authorizeCapabilityUse({
      capabilityId: "cap:1",
      sourceId: "source:1",
      effectiveAvailability: "AVAILABLE",
      providedBy: [{ kind: "agent_package", id: "pkg-1" }],
    });
    expect(decision.decision).toBe("REJECT");
  });
});
