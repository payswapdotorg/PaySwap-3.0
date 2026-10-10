import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index.ts";

describe("package scaffold", () => {
  it("exposes its package identity", () => {
    expect(PACKAGE_NAME).toMatch(/^@payswap\//);
  });
});
