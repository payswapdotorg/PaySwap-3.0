/**
 * @payswap/onchain-security — the structural pins barrel (R2-W2).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`):
 * `packages/onchain-security` may depend on [trust, capability,
 * contracts] — but this package's v1 pattern (the accepted
 * packages/agents structural-mirror pattern, hardened to ZERO sibling
 * imports) is: NO @payswap/* import anywhere, NO tsconfig paths. Every
 * cross-lane contract shape this package needs is pinned structurally in
 * src/pins/* and re-exported here:
 *
 * - money.ts              the AmountSpec wire (verbatim trust pin, P1-W3)
 *                         + exact canonical comparison;
 * - principal.ts          the Principal model + canonical principalRef;
 * - mandate.ts            the Mandate substrate + action-pattern
 *                         attenuation semantics (INV-12);
 * - authorization-wire.ts ApprovalScope / SignedApprovalArtifact /
 *                         AuthorizationRequest + the canonical trust
 *                         signing payload;
 * - smart-contract.ts     the full smart-contract declaration (INV-20);
 * - quote.ts              execution-quote disclosures (slippage,
 *                         liquidity impact — P5-W1 reference);
 * - state-machine.ts      the declared deterministic state machine
 *                         (terminal-state discipline);
 * - errors.ts             the shared ValidationError shape.
 *
 * Each pin is a STRUCTURAL mirror: the real lane's contract remains
 * assignable to the pin by construction, so drift fails typecheck at the
 * integration station, and the package-local battery stays hermetic
 * (devDependencies: typescript + vitest only).
 */

export * from "./errors.ts";
export * from "./money.ts";
export * from "./principal.ts";
export * from "./mandate.ts";
export * from "./authorization-wire.ts";
export * from "./smart-contract.ts";
export * from "./quote.ts";
export * from "./state-machine.ts";
