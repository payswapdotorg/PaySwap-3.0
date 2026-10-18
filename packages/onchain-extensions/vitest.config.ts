import { defineConfig } from 'vitest/config';

/**
 * Deterministic suite (the accepted battery pattern): every pack is exercised
 * as pure DECLARATIVE DATA — no credentials, no live endpoints, no network,
 * no clocks. The reference packs model the real venue SHAPES; execution and
 * adapter integration belong to the onchain-adapters (P4-W3) and
 * best-execution (P5-W1) lanes, never here.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
