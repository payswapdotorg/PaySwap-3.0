import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * @payswap/app — vitest config for the PaySwap product application suite
 * (moved from @zcode/web in P9-A; the suite's laws are unchanged).
 *
 * node environment with static markup rendering — the OLD repo's
 * node-env oracle approach (MMP-36 behavioral oracle), kept: pages render
 * through react-dom/server so markup-level honesty assertions stay
 * deterministic and dependency-free. App-shell tests opt into jsdom
 * per-file (the navigation adapter reads window.location). No network in
 * tests.
 *
 * Resolution note (carried from the web suite): vitest externalizes bare
 * @zcode/* workspace imports — Node cannot execute the substrate's
 * NodeNext .js-suffix TypeScript source — so the design-layer specifier
 * is aliased onto an in-root test stub (test/payswap/design.ts) that
 * re-exports the workspace source through a RELATIVE path, which vite's
 * TS-aware resolver processes. Source files keep importing
 * "@zcode/ui/payswap" (the workspace export).
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: /^@zcode\/ui\/payswap-styles\.css$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap/design-styles.css"),
      },
      {
        find: /^@zcode\/ui\/payswap-tokens\.css$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap/design-styles.css"),
      },
      {
        find: /^@zcode\/ui\/payswap$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap/design.ts"),
      },
    ],
  },
  test: {
    include: ["test/payswap/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
