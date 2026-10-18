import { describe, it, expect } from "vitest";
import { cx } from "../../src/payswap/utils/cx.js";

describe("cx", () => {
  it("joins truthy parts with spaces", () => {
    expect(cx("ps-button", "ps-button--primary")).toBe(
      "ps-button ps-button--primary",
    );
  });

  it("drops falsy parts", () => {
    // `falsy` indirection keeps the test's intent (a falsy part) readable
    // to oxlint's no-constant-binary-expression while preserving it.
    const falsy: boolean = false;
    expect(cx("ps-card", falsy && "x", undefined, null, "ps-card--raised")).toBe(
      "ps-card ps-card--raised",
    );
  });

  it("returns empty string for no truthy parts", () => {
    expect(cx(false, undefined, null)).toBe("");
  });
});
