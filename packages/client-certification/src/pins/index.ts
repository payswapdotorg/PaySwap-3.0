/**
 * @payswap/client-certification — the pin index (P8-W2, lane p8-w2).
 *
 * Every cross-lane contract shape this package consumes is a LOCAL
 * STRUCTURAL PIN (the leaf-in-flight law — zero runtime dependencies,
 * zero @payswap/* imports; the TL wires the real types at integration).
 * The authority map:
 *
 * - ./surface.ts          @payswap/surface (P2-W3)      — outcome actions,
 *   eleven areas, stage statuses, authorization-change kinds, quote
 *   freshness
 * - ./adversarial.ts      @payswap/adversarial (P6-W3)  — advisory
 *   severities/actions/statuses (INV-21 threat vocabulary)
 * - ./onchain-security.ts @payswap/onchain-security (R2-W2) — forbidden
 *   secret keys, value-shape detectors, redaction markers, opaque
 *   credential refs, recheck drift reasons
 * - ./capability.ts       @payswap/capability (P2-W1)   — eligibility
 *   observations, authorization statuses, two-axis availability
 * - ./ui.ts               @payswap/ui src/payswap (P7)  — environment
 *   kinds, tone law, outcome chips, token version
 * - ./command.ts          @payswap/command              — fail-closed
 *   session reasons, protocol-correlation ids
 */

export * from "./surface.ts";
export * from "./adversarial.ts";
export * from "./onchain-security.ts";
export * from "./capability.ts";
export * from "./ui.ts";
export * from "./command.ts";
