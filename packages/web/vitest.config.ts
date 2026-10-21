import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * @zcode/web — vitest config for the WEB-MOUNT suite (P9-A).
 *
 * The PaySwap product suite moved with the product into @payswap/app
 * (packages/payswap-app/test); what remains HERE is the web platform
 * seam: the vite-env adapter + the route-contract mount that decides
 * which surface (PaySwap product / agent console / share / callback)
 * owns a browser pathname. node environment by default (the substrate's
 * deterministic posture); mount tests opt into jsdom per-file.
 *
 * Resolution notes (carried from the pre-P9-A config):
 * - vitest externalizes bare @zcode/* workspace imports — Node cannot
 *   execute the substrate's NodeNext .js-suffix TypeScript source — so
 *   the design-layer specifier is aliased onto an in-root stub that
 *   re-exports the workspace source through a RELATIVE path.
 * - the same treatment applies to the @payswap/app product package:
 *   aliased onto its source barrel so vite's TS-aware resolver processes
 *   the product source (and its css imports get stubbed, as before).
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: /^@zcode\/ui\/payswap-styles\.css$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap-design-styles.css"),
      },
      {
        find: /^@zcode\/ui\/payswap-tokens\.css$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap-design-styles.css"),
      },
      {
        find: /^@zcode\/ui\/payswap$/,
        replacement: path.resolve(import.meta.dirname, "test/payswap-design.ts"),
      },
      {
        find: /^@payswap\/app$/,
        replacement: path.resolve(import.meta.dirname, "../payswap-app/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
