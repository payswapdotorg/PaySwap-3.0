/**
 * Import smoke (P2-W3): the package exports resolve under plain Node
 * type-stripping — no build step, no toolchain beyond the devDependencies.
 */
import { describe, expect, it } from "vitest";

import { PACKAGE_NAME, SURFACE_API_VERSION } from "../src/index.ts";

describe("smoke", () => {
  it("the public index imports and identifies itself", () => {
    expect(PACKAGE_NAME).toBe("@payswap/surface");
    expect(SURFACE_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
