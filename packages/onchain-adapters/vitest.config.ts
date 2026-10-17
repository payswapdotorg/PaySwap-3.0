import { defineConfig } from 'vitest/config';

/**
 * DETERMINISTIC battery (the ONLY gate this package ships — R2-W3 law):
 * every network interaction is an injected scripted transport contract;
 * nothing here performs or simulates a live call. The old repository's
 * credential/network-gated live suites (test/live/*, 3 files) were NEVER
 * deterministic evidence (migration-matrix GAP-02) and are NOT ported —
 * recorded as excluded-with-reason in the baseline verification record.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
