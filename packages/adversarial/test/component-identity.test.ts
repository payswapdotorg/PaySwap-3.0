/**
 * Component identity + version comparison (P6-W3, lane r4-w3; PORT of
 * the identity-model sites from payswap.org@8a735bf
 * packages/security/test/signatures.test.ts).
 */

import { describe, expect, it } from "vitest";
import {
  compareVersions,
  componentKey,
  componentRef,
  isComponentKind,
  parseVersion,
  versionInRange,
  ValidationError,
} from "../src/index.ts";

describe("component identity + versions", () => {
  it("compares numeric dotted versions totally and deterministically", () => {
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2.0")).toBe(1);
    expect(compareVersions("1.9", "1.10")).toBe(-1);
    expect(compareVersions("2.0.0", "1.999.999")).toBe(1);
    expect(compareVersions("0.0.1", "0.0.2")).toBe(-1);
  });

  it("rejects non-numeric versions (fail closed)", () => {
    expect(() => parseVersion("1.2.3-beta")).toThrowError(ValidationError);
    expect(() => parseVersion("v1")).toThrowError(ValidationError);
    expect(() => parseVersion("1..2")).toThrowError(ValidationError);
    expect(() => compareVersions("1.x", "1.2")).toThrowError(ValidationError);
  });

  it("range matching is inclusive on both bounds", () => {
    const range = { minVersion: "1.2.0", maxVersion: "2.0.0" };
    expect(versionInRange("1.2.0", range)).toBe(true);
    expect(versionInRange("2.0.0", range)).toBe(true);
    expect(versionInRange("1.6.1", range)).toBe(true);
    expect(versionInRange("1.1.9", range)).toBe(false);
    expect(versionInRange("2.0.1", range)).toBe(false);
    expect(versionInRange("1.0.0", { minVersion: "1.0.0" })).toBe(true);
    expect(versionInRange("9.9.9", { maxVersion: "2.0.0" })).toBe(false);
    expect(versionInRange("3.0.0", {})).toBe(true);
  });

  it("kind + id form the deterministic component key; the ref drops the version", () => {
    expect(componentKey({ kind: "agent_package", id: "pkg-1" })).toBe("agent_package:pkg-1");
    expect(
      componentRef({ kind: "extension", id: "ext-1", version: "1.0.0" }),
    ).toEqual({ kind: "extension", id: "ext-1" });
    expect(componentKey({ kind: "capability", id: "cap-1" })).toBe("capability:cap-1");
  });

  it("the component-kind vocabulary is exactly the seven immune kinds", () => {
    expect(isComponentKind("agent_key")).toBe(true);
    expect(isComponentKind("connected_instance")).toBe(true);
    expect(isComponentKind("vendor_plugin")).toBe(false);
    expect(isComponentKind(7)).toBe(false);
  });
});
