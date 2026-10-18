import { defineConfig } from "vitest/config";

/**
 * @zcode/ui — vitest config for the PaySwap design-layer suite (P7-W1).
 *
 * jsdom environment (the old @payswap/design suite's DOM needs — MMP-10
 * behavioral oracle); no network, no clock, no ambient state (determinism
 * law). Runs via `npx vitest run` from the package dir.
 */
export default defineConfig({
  test: {
    include: ["test/payswap/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["test/payswap/setup.ts"],
  },
});
