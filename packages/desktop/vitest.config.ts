import { defineConfig } from "vitest/config";

/**
 * @zcode/desktop — PaySwap Desktop deterministic test battery (P7-W2).
 *
 * Node-environment vitest suite for the desktop product's contract-
 * composition laws. NO Electron runtime, NO network, NO window creation:
 * everything under test composes pinned shared contract shapes and shell
 * seams with recorded fixtures (work-order hard constraint 3).
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
