/**
 * @payswap/onchain-security — structural pin: the shared validation error
 * (R2-W2; the accepted packages/agents/src/pins.ts pattern, re-homed).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`):
 * this package runs with ZERO sibling imports — no @payswap/* anywhere,
 * no tsconfig paths. Where this package needs a CONTRACT SHAPE owned by
 * another lane, the shape is PINNED HERE as a structural mirror: the
 * mirror is a structural supertype/subtype-compatible view of the real
 * lane's contract, so the real contract remains assignable to the pin (or
 * vice versa) and drift is impossible without a typecheck failure at the
 * integration station. The Tech Lead wires the real lanes at accept-time.
 *
 * This module pins the protocol lane's validation-error shape
 * (packages/protocol/src/errors.ts `ValidationError`): a plain named
 * Error, structurally identical, so thrown validation failures from this
 * package satisfy the same `error.name === "ValidationError"` consumer
 * contract.
 */

/** Raised on structurally invalid input (fail closed; never repaired). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
