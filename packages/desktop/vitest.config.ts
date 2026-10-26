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
  resolve: {
    alias: {
      // @payswap/app 是 workspace 源码包（desktop 的 package.json 归 Lane B
      // 管），vitest 在这里以相对别名直连其 TS 源 —— node 环境也能解析。
      "@payswap/app/routes": new URL("../payswap-app/src/routes.ts", import.meta.url)
        .pathname,
      "@payswap/app": new URL("../payswap-app/src/index.ts", import.meta.url).pathname,
      // P17-C（ADR-0010 D1）：REAL 引擎源码包直连（与 tsconfig.renderer/vite
      // 两处别名同步）—— 只供 routePlanning* 组合根模块消费。
      "@payswap/route-planning": new URL("../route-planning/src/index.ts", import.meta.url).pathname,
      "@payswap/capability": new URL("../capability/src/index.ts", import.meta.url).pathname,
      "@payswap/route-compiler": new URL("../route-compiler/src/index.ts", import.meta.url).pathname,
      "@payswap/lab": new URL("../lab/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
