import { describe, expect, it } from "vitest";
import {
  NODE_ENROLLMENT_VERSION,
  NODE_ENROLLMENT_MODES,
  NODE_ROLES,
  assertOperatorEnrolled,
  enrollmentHasActiveInstance,
  validateNodeEnrollmentRecord,
} from "../src/index.ts";
import { NodeEnrollmentError } from "../src/index.ts";
import { fixtureEnrollment, fixtureOperatorEnrollment } from "./fixtures.ts";

describe("node enrollment validation (ADR-0020 D5 — accountable, explicit, fail-closed)", () => {
  it("validates a well-formed enrollment and freezes it", () => {
    const record = validateNodeEnrollmentRecord(fixtureOperatorEnrollment());
    expect(record.nodeId).toBe("node:fixture-gh-1");
    expect(record.enrollmentMode).toBe("OPERATOR_ENROLLED");
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.instanceBindings)).toBe(true);
  });

  it("rejects a stale version (never coerced)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(fixtureEnrollment({ enrollmentVersion: "0.9.0" })),
    ).toThrow(NodeEnrollmentError);
  });

  it("rejects an unregistered anonymous principal (accountability is the point)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({
          principal: { legalName: "Ghost", registrationRefs: [], jurisdiction: "GH" },
        }),
      ),
    ).toThrow(/registrationRefs/);
  });

  it("rejects an inferred/unknown role (the role is explicit — D5)", () => {
    expect(() => validateNodeEnrollmentRecord(fixtureEnrollment({ roles: ["SILENT_ROUTER"] })))
      .toThrow(NodeEnrollmentError);
    expect([...NODE_ROLES]).toEqual([
      "TECHNICAL_ROUTER",
      "PAYMENT_FACILITATOR",
      "MERCHANT_OF_RECORD",
      "CUSTODIAN",
      "AGENT",
      "PAYOUT_ORIGINATOR",
      "REGULATED_PAYMENT_INSTITUTION",
    ]);
    expect([...NODE_ENROLLMENT_MODES]).toEqual(["OPERATOR_ENROLLED", "FIXTURE"]);
  });

  it("rejects a provider-facing node with no instance binding (offers bind to REAL instances)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({ roles: ["PAYOUT_ORIGINATOR"], instanceBindings: [] }),
      ),
    ).toThrow(/REAL connected instance/);
    // a TECHNICAL_ROUTER may enroll without one (it routes, it does not hold rails)
    expect(() => validateNodeEnrollmentRecord(fixtureEnrollment({ instanceBindings: [] })))
      .not.toThrow();
  });

  it("rejects a custody role without licence evidence (D8 — custody is regulated activity)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({
          roles: ["CUSTODIAN"],
          custody: { takesCustody: false, licenceProgrammeRefs: [] },
        }),
      ),
    ).toThrow(/custody by definition/);
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({
          roles: ["CUSTODIAN"],
          custody: { takesCustody: true, licenceProgrammeRefs: [] },
        }),
      ),
    ).toThrow(/licence\/programme evidence/);
    const lawful = validateNodeEnrollmentRecord(
      fixtureEnrollment({
        roles: ["CUSTODIAN"],
        custody: { takesCustody: true, licenceProgrammeRefs: ["licence:bof-2026"] },
      }),
    );
    expect(lawful.custody.takesCustody).toBe(true);
  });

  it("rejects a dishonest custody declaration (licence refs but takesCustody=false)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({
          custody: { takesCustody: false, licenceProgrammeRefs: ["licence:x"] },
        }),
      ),
    ).toThrow(/honest/);
  });

  it("rejects secret material in the key field (a PUBLIC verification key only — INV-19)", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({ nodePublicKeyPem: "-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----" }),
      ),
    ).toThrow(/SPKI PEM public key/);
  });

  it("rejects a jurisdiction mismatch between the record and its principal", () => {
    expect(() =>
      validateNodeEnrollmentRecord(
        fixtureEnrollment({
          jurisdiction: "KE",
          principal: { legalName: "Fixture", registrationRefs: ["reg:1"], jurisdiction: "GH" },
        }),
      ),
    ).toThrow(/match/);
  });

  it("the D11 gate: a FIXTURE enrollment is never promotable", () => {
    const fixture = validateNodeEnrollmentRecord(fixtureEnrollment());
    expect(() => assertOperatorEnrolled(fixture)).toThrow(/never promotable/);
    const operator = validateNodeEnrollmentRecord(fixtureOperatorEnrollment());
    expect(assertOperatorEnrolled(operator)).toBe(operator);
  });

  it("enrollmentHasActiveInstance consults the binding statuses (D5)", () => {
    expect(enrollmentHasActiveInstance(validateNodeEnrollmentRecord(fixtureEnrollment()))).toBe(
      true,
    );
    const revokedBinding = validateNodeEnrollmentRecord(
      fixtureEnrollment({
        instanceBindings: [
          { instanceId: "inst:x", providerName: "paystack", authorizationStatus: "REVOKED" },
        ],
      }),
    );
    expect(enrollmentHasActiveInstance(revokedBinding)).toBe(false);
    void NODE_ENROLLMENT_VERSION;
  });
});
