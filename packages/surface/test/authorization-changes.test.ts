/**
 * Authorization-change tests (P2-W3, net-new): revalidation is ALWAYS
 * required for a material change; renewed customer authorization is
 * required exactly when the APPROVED TERMS changed (Wise §4.2 mapped to
 * the frozen architecture); authority-side changes void the authorization
 * itself. References are preserved (INV-23).
 */

import { describe, expect, it } from "vitest";

import {
  AUTHORIZATION_CHANGE_KINDS,
  type AuthorizationChangeRecord,
  foldAuthorizationChange,
} from "../src/index.ts";

function record(
  kind: AuthorizationChangeRecord["kind"],
  overrides: Partial<AuthorizationChangeRecord> = {},
): AuthorizationChangeRecord {
  return {
    changeId: `change:${kind}`,
    kind,
    detectedAt: "2026-10-11T12:00:00Z",
    previousTermsRef: "terms:approved:1",
    currentTermsRef: "terms:current:2",
    authorityRecordRef: "record:quote-authority",
    approvedByRef: "principal:customer",
    evidenceRefs: ["evidence:change"],
    ...overrides,
  };
}

describe("terms-material changes require renewed authorization", () => {
  it("QUOTE_EXPIRED requires revalidation AND renewed authorization", () => {
    const view = foldAuthorizationChange(record("QUOTE_EXPIRED"));
    expect(view.requiresRevalidation).toBe(true);
    expect(view.renewedAuthorizationRequired).toBe(true);
    expect(view.changeClass).toBe("TERMS_MATERIAL");
    expect(view.headline).toContain("expired");
    expect(view.actionRequired).toContain("renewed customer authorization");
  });

  it("RECIPIENT_CHANGED, AMOUNT_CHANGED and FUNDING_METHOD_CHANGED are terms-material", () => {
    for (const kind of ["RECIPIENT_CHANGED", "AMOUNT_CHANGED", "FUNDING_METHOD_CHANGED"] as const) {
      const view = foldAuthorizationChange(record(kind));
      expect(view.changeClass).toBe("TERMS_MATERIAL");
      expect(view.renewedAuthorizationRequired).toBe(true);
    }
  });

  it("PROVIDER_OBSERVATION_CHANGED is terms-material", () => {
    const view = foldAuthorizationChange(record("PROVIDER_OBSERVATION_CHANGED"));
    expect(view.renewedAuthorizationRequired).toBe(true);
    expect(view.explanation).toContain("changed after the approval");
  });
});

describe("authority-side changes void the authorization itself", () => {
  it("MANDATE_REVOKED: revalidation alone cannot restore a revoked mandate", () => {
    const view = foldAuthorizationChange(record("MANDATE_REVOKED"));
    expect(view.changeClass).toBe("AUTHORITY_SIDE");
    expect(view.renewedAuthorizationRequired).toBe(false);
    expect(view.requiresRevalidation).toBe(true);
    expect(view.actionRequired).toContain("new mandate");
  });

  it("SECURITY_EPOCH_ADVANCED: epoch-stale authorizations are invalid by design", () => {
    const view = foldAuthorizationChange(record("SECURITY_EPOCH_ADVANCED"));
    expect(view.changeClass).toBe("AUTHORITY_SIDE");
    expect(view.actionRequired).toContain("current epoch");
  });
});

describe("projection law + fail-closed guards (INV-23)", () => {
  it("the view carries references, never the records", () => {
    const view = foldAuthorizationChange(record("QUOTE_TERMS_CHANGED"));
    expect(view.previousTermsRef).toBe("terms:approved:1");
    expect(view.currentTermsRef).toBe("terms:current:2");
    expect(view.approvedByRef).toBe("principal:customer");
    expect(view.evidenceRefs).toEqual(["evidence:change"]);
  });

  it("the change-kind vocabulary is closed (all 8 kinds, unknown refused)", () => {
    expect([...AUTHORIZATION_CHANGE_KINDS]).toHaveLength(8);
    expect(() =>
      foldAuthorizationChange(record("MAGIC" as never)),
    ).toThrow(/closed/);
  });

  it("empty references are refused", () => {
    expect(() =>
      foldAuthorizationChange(record("QUOTE_EXPIRED", { approvedByRef: "" })),
    ).toThrow(/approvedByRef/);
    expect(() =>
      foldAuthorizationChange(record("QUOTE_EXPIRED", { changeId: "" })),
    ).toThrow(/changeId/);
  });
});
