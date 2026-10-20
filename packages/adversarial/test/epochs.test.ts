/**
 * The security-epoch authority + epoch-scoped authorizations (P6-W3,
 * lane r4-w3; PORT of payswap.org@8a735bf
 * packages/security/test/epochs.test.ts — the void-on-advance law; the
 * old per-principal credential-epoch composition sites are covered by
 * the already-merged trust lane, per the recorded consolidation
 * decision).
 */

import { describe, expect, it } from "vitest";
import {
  AuthorizationExpiredError,
  checkSensitiveActionAuthorization,
  evaluateSensitiveActionAuthorization,
  isSensitiveActionClass,
  NonMonotonicSecurityEpochError,
  SENSITIVE_ACTION_CLASSES,
  SecurityEpochAuthority,
  StaleAuthorizationEpochError,
  type EpochScopedAuthorization,
} from "../src/index.ts";

function authorization(overrides: Partial<EpochScopedAuthorization> = {}): EpochScopedAuthorization {
  return {
    authorizationRef: "authz-1",
    principalRef: "user:customer-1",
    actionClass: "money_movement",
    issuedAtEpoch: 0n,
    expiresAt: 10_000,
    ...overrides,
  };
}

describe("the network security epoch", () => {
  it("starts at genesis epoch 0 and only advances monotonically", () => {
    const authority = new SecurityEpochAuthority();
    expect(authority.currentEpoch()).toEqual({
      value: 0n,
      advancedAt: 0,
      reason: "genesis: implicit epoch 0",
    });
    const first = authority.advance({ reason: "incident", at: 1_000 });
    expect(first.value).toBe(1n);
    expect(first.advancedAt).toBe(1_000);
    const second = authority.advance({ reason: "advisory", at: 2_000, advisoryRef: "adv-1" });
    expect(second.value).toBe(2n);
    expect(second.advisoryRef).toBe("adv-1");
    expect(authority.history()).toHaveLength(3);
    expect(authority.history()[1]).toEqual(first);
  });

  it("rejects non-monotonic advances", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "r", at: 1_000 });
    expect(() => authority.advance({ reason: "", at: 2_000 })).toThrowError(
      NonMonotonicSecurityEpochError,
    );
    expect(() => authority.advance({ reason: "r", at: 999 })).toThrowError(
      NonMonotonicSecurityEpochError,
    );
  });

  it("allows a current-epoch, unexpired authorization", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "r", at: 1_000 });
    expect(() =>
      evaluate(authority, authorization({ issuedAtEpoch: 1n }), 1_500),
    ).not.toThrow();
  });

  it("rejects a sensitive action when the epoch bumped past issuance (void-on-advance)", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "r", at: 1_000 });
    const stale = authorization({ issuedAtEpoch: 0n });
    expect(() => evaluate(authority, stale, 1_500)).toThrowError(StaleAuthorizationEpochError);
  });

  it("an epoch-bump invalidates EVERY stale authorization at once (the global hammer)", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "r1", at: 1_000 });
    authority.advance({ reason: "r2", at: 2_000 });
    for (const ref of ["authz-a", "authz-b", "authz-c"]) {
      const check = evaluateSensitiveActionAuthorization(
        authorization({ authorizationRef: ref, issuedAtEpoch: 1n }),
        authority,
        2_500,
      );
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("stale_security_epoch");
    }
    const fresh = evaluateSensitiveActionAuthorization(
      authorization({ issuedAtEpoch: 2n }),
      authority,
      2_500,
    );
    expect(fresh.allowed).toBe(true);
  });

  it("rejects expired authorizations deterministically (expiry is input-time based)", () => {
    const authority = new SecurityEpochAuthority();
    expect(() =>
      evaluate(authority, authorization({ expiresAt: 1_000 }), 1_001),
    ).toThrowError(AuthorizationExpiredError);
    expect(() =>
      evaluate(authority, authorization({ expiresAt: 1_000 }), 1_000),
    ).not.toThrow();
  });

  it("carries structured error data and a non-throwing evaluation twin", () => {
    const authority = new SecurityEpochAuthority();
    authority.advance({ reason: "r", at: 1_000 });
    try {
      evaluate(authority, authorization({ issuedAtEpoch: 0n }), 1_500);
      expect.unreachable("must throw");
    } catch (error) {
      const stale = error as StaleAuthorizationEpochError;
      expect(stale.authorizationRef).toBe("authz-1");
      expect(stale.issuedAtEpoch).toBe(0n);
      expect(stale.currentEpoch).toBe(1n);
    }
    const freshAuthority = new SecurityEpochAuthority();
    const expired = evaluateSensitiveActionAuthorization(
      authorization({ expiresAt: 100 }),
      freshAuthority,
      1_500,
    );
    expect(expired.reason).toBe("authorization_expired");
    expect(expired.currentEpoch).toBe(0n);
  });

  it("sensitive action classes are the conservative set", () => {
    expect(SENSITIVE_ACTION_CLASSES).toEqual([
      "money_movement",
      "beneficiary_change",
      "credential_change",
      "mandate_change",
      "rail_execution",
    ]);
    expect(isSensitiveActionClass("money_movement")).toBe(true);
    expect(isSensitiveActionClass("marketing_broadcast")).toBe(false);
  });

  it("fails closed on malformed authorizations", () => {
    const authority = new SecurityEpochAuthority();
    expect(() =>
      evaluate(authority, authorization({ authorizationRef: "" }), 1),
    ).toThrowError(/authorizationRef/);
    expect(() =>
      evaluate(authority, authorization({ principalRef: "" }), 1),
    ).toThrowError(/principalRef/);
    expect(() =>
      evaluate(authority, authorization({ actionClass: "marketing_broadcast" as never }), 1),
    ).toThrowError(/action class/);
  });
});

function evaluate(
  authority: SecurityEpochAuthority,
  authorization: EpochScopedAuthorization,
  at: number,
): void {
  checkSensitiveActionAuthorization(authorization, authority, at);
}
