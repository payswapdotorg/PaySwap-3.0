/**
 * Test-side view fixtures (deterministic; no ambient env reads).
 */
export function resolveApiRuntimeInputForTests(): {
  configured: boolean;
  baseUrl: string | null;
  envVar: string;
} {
  return { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" };
}
