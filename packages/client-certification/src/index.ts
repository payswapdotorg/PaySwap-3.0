/**
 * @payswap/client-certification — the client-surface honesty
 * certification suite (P8-W2, lane p8-w2).
 *
 * LAYER LAW (MODULE-OWNERSHIP layer `security`): hard policy gates,
 * `cannot_downgrade_block` — a failed client gate HALTS the release and
 * cannot be waived or downgraded. The package owns CLIENT-CERTIFICATION
 * AUTHORITY, not experience implementation: UI stays in experience-
 * layer packages; this package certifies their contracts.
 *
 * A LEAF IN FLIGHT: zero runtime dependencies, zero non-relative
 * imports in src/**, NO @payswap/* imports, no tsconfig paths — every
 * cross-lane contract shape is a LOCAL STRUCTURAL PIN (src/pins/*.ts;
 * the TL wires the real imports at integration).
 *
 * HARD LAWS (each with a dedicated gate + test class):
 * 1. secret-boundary            — src/secret-boundary.ts
 * 2. dead-action-audit          — src/dead-action.ts
 * 3. truthful-states            — src/state-honesty.ts
 * 4. recipient-authorization    — src/recipient-authorization.ts
 * 5. fresh-conditions           — src/recipient-authorization.ts
 * 6. sandbox-live-separation    — src/sandbox-live.ts
 * 7. accessibility-contract     — src/accessibility.ts
 * 8. responsive-device-contract — src/responsive-device.ts
 * 9. browser-verification-contract — src/browser-verification.ts
 * 10. gate-wall                 — src/gate-wall.ts (the composed run)
 *
 * Determinism: pure functions, caller-supplied instants, byte-identical
 * outputs. Secret-free: fixtures assemble secret-shaped values at
 * RUNTIME from fragments; no literal secret shape exists in this tree.
 */

export const PACKAGE_NAME = "@payswap/client-certification" as const;

// The pinned wire shapes (commit 1/4): every external seam as a local
// structural pin — surface, adversarial, onchain-security, capability,
// ui, command (see ./pins/index.ts for the authority map).
export * from "./pins/index.ts";

// The deterministic digest + the shared escalate-only verdict vocabulary.
export * from "./digest.ts";
export * from "./verdict.ts";

// Hard law 3 — truthful customer-facing states.
export * from "./state-honesty.ts";
