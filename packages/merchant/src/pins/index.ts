/**
 * @payswap/merchant — the pinned wire shapes barrel (P5-W3, lane R3-W3).
 *
 * Every cross-lane contract shape of this package is a LOCAL
 * STRUCTURAL PIN (the v1 leaf-in-flight law — zero sibling imports;
 * the TL wires the types at integration). Each pin module names its
 * AUTHORITY. Commit 1/4 of the R3-W3 rebuild: this barrel plus the pin
 * modules below are the COMPLETE type-level pin surface; the
 * implementation lands in commit 2/4 and the ported suite in 3/4.
 *
 * Authorities pinned:
 * - ./protocol.ts      — @payswap/protocol (P1-W2): money, the
 *                        SettlementInstructionId typed reference, the
 *                        canonical settlement-attempt lifecycle.
 * - ./capability.ts    — @payswap/capability (P2-W1): execution modes
 *                        (CREDITED to the capability lane), the
 *                        connected-instance authorization scope.
 * - ./payment.ts       — the payment acceptance plane: method kinds,
 *                        acceptance policy/decision, settlement
 *                        destinations, recourse, material terms.
 * - ./onchain.ts       — the onchain-security kernel: ChainRef +
 *                        AssetIdentity shape laws.
 * - ./envelope.ts      — the provider-state envelope (INV-14): raw
 *                        provider state preserved verbatim.
 * - ./route-compiler.ts— @payswap/route-compiler (ACCEPTED R3-W1):
 *                        the merchant settlement seam (modes, honest
 *                        notice, eligibility evidence, P5-W3 marker).
 * - ./stripe.ts        — the Stripe PSP surface, byte-verified vs the
 *                        old rails/adapters evidence (paths, status
 *                        mapping, idempotency law, key-kind shapes;
 *                        THE NO-NETWORK LAW).
 * - ./wallet-payment.ts— THE DELEGATION SEAM: the wallet-payment
 *                        injection port with its HANDOFF-ONLY exit.
 */

export * from "./protocol.ts";
export * from "./capability.ts";
export * from "./payment.ts";
export * from "./onchain.ts";
export * from "./envelope.ts";
export * from "./route-compiler.ts";
export * from "./stripe.ts";
export * from "./wallet-payment.ts";
