/**
 * @payswap/onchain-security — Signer Authorization + Onchain Security
 * Kernel (Work Order P4-W2; R2-W2 rebuild; migration MMI-18).
 *
 * The deterministic security plane between intent preparation and
 * user-controlled signing (spec/architecture/SECURITY-MODEL.md,
 * NON-CUSTODY.md, AUTHORITY-MODEL.md; INV-18 pipeline law):
 *
 * - types.ts:   provider-neutral identity contracts (chain / asset /
 *               protocol identity; the structural P4-W1 alignment
 *               surface — no EVM assumptions in core contracts, INV-17);
 * - pins/:      the structural pins — cross-lane contract shapes
 *               (AmountSpec, Principal, Mandate, ApprovalScope,
 *               SmartContractExtension, quote disclosures, the declared
 *               state machine) mirrored locally under the ZERO-sibling
 *               import law;
 * - digest.ts:  package-local deterministic content addressing;
 * - secrets.ts: the secret-boundary kernel — shapes + policy (redaction,
 *               opaque vault refs), NEVER key custody (INV-19,
 *               NON-CUSTODY.md);
 * - write-intent.ts: prepare — validated consequential-write requests;
 * - simulation.ts:    simulation OBSERVATIONS (never authority, INV-11);
 * - diff.ts:    user-readable expected-state diffs;
 * - gates-policy.ts + gates.ts: the deterministic BLOCK/ALLOW/UNKNOWN
 *               security gates over chain, asset, amount, destination,
 *               spender/approval, expiry, route, protocol/contract
 *               identity + composed security state + simulation
 *               consistency; adversarial agents may FLAG but can NEVER
 *               override a BLOCK (INV-21);
 * - block-law.ts: the encoded cannot_downgrade_block layer law
 *               (MODULE-OWNERSHIP layer `security`) — type + runtime;
 * - delegation.ts: scoped signing delegation (session keys / smart
 *               accounts): attenuated ⊂ parent (INV-12), revocable,
 *               expiring;
 * - authorization.ts + authorization-verify.ts: onchain authorization
 *               requests + signed artifacts minted ONLY by a trusted
 *               approval surface (INV-5) and verified against every
 *               binding;
 * - recheck.ts: immediate pre-broadcast recheck with stale-state
 *               invalidation (drift VOIDS the authorization; it is
 *               re-requested, never auto-repaired);
 * - pipeline-machine.ts + pipeline.ts: the deterministic state machine
 *               prepare → simulate (when supported) → gates → diff →
 *               authorization → recheck → broadcast handoff, with
 *               terminal BLOCKED / VOIDED / BROADCAST_HANDOFF;
 * - signers.ts: SignerAdapter port + signing requests + broadcast
 *               handoff (the kernel never broadcasts);
 * - adapters/eip712.ts + adapters/erc1271.ts (the "./adapters/*"
 *               subpaths): EVM signing semantics (EIP-712 typed data,
 *               ERC-1271 contract signatures) isolated BEHIND adapters —
 *               never in core contracts;
 * - threat-intel/ (the "./threat-intel" subpath): the onchain
 *               threat-intelligence vocabulary the security layer owns —
 *               13 threat families, evidence-chain-mandatory signals with
 *               integer-bps calibrated confidence, the versioned
 *               deterministic threat policy (authoritative), the
 *               adversarial analysis agent (advisory only) and the
 *               no-downgrade verdict composition seam.
 *
 * Boundary law (R2-W2): ZERO sibling imports — no @payswap/* anywhere,
 * tsconfig has NO paths entries; cross-lane shapes live in src/pins/
 * (structural mirrors — the accepted pattern). The immune-system
 * composition is pure data (`OnchainSecurityState` supplied by the wiring
 * layer); the Tech Lead wires the real trust/capability/security lanes at
 * the integration station.
 */

export const PACKAGE_NAME = "@payswap/onchain-security" as const;

export { KERNEL_WIRE_VERSION, ADAPTER_WIRE_VERSION } from "./version.ts";
export * from "./types.ts";
export * from "./pins/index.ts";
export * from "./digest.ts";
export * from "./secrets.ts";
export * from "./secrets-policy.ts";
export * from "./write-intent.ts";
export * from "./simulation.ts";
export * from "./diff.ts";
export * from "./gates-policy.ts";
export * from "./gates.ts";
export * from "./gates-simulation.ts";
export * from "./block-law.ts";
export * from "./delegation.ts";
export * from "./authorization.ts";
export * from "./authorization-verify.ts";
export * from "./recheck.ts";
export * from "./pipeline-machine.ts";
export * from "./pipeline.ts";
export * from "./signers.ts";
