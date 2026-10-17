/**
 * @payswap/onchain-adapters — THE FROZEN FAMILY-ADAPTER LIFECYCLE STAGES
 * (Work Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/contract.ts stage vocabulary).
 *
 * Every chain family implements the adapter lifecycle EXPLICITLY:
 *
 *   observe → prepare → simulate → authorize → broadcast → observe →
 *   finality → reconcile → evidence
 *
 * Stage semantics (deterministic, vendor-neutral):
 * - observe:          read-only rail state — chain heads and external asset
 *                     positions AS OBSERVATIONS (never custody, never a
 *                     balance). Unreachable rails surface availability
 *                     UNKNOWN — never success or failure.
 * - prepare:          translate a validated neutral OnchainExecutionDirective
 *                     + ConnectedChainInstance + fresh chain head into (a)
 *                     the kernel-ready OnchainWriteRequest and (b) the
 *                     family execution plan. Chain-identity cross-checks
 *                     run here.
 * - simulate:         family simulation as an OBSERVATION, never authority.
 *                     Families that cannot simulate (UTXO) declare the
 *                     stage unsupported and FAIL CLOSED when asked.
 * - authorize:        drive the onchain-security kernel (through the
 *                     injected port): gates → diff → authorization request
 *                     → trusted-surface artifact → pre-broadcast recheck →
 *                     signing-request handoff. The ADAPTER never
 *                     authorizes; the kernel owns authority.
 * - broadcast:        submit the TRUSTED-SURFACE-SIGNED payload to the rail.
 *                     The result is BROADCAST (submitted ≠ finality), a
 *                     definitive pre-chain rejection (FAILED), or
 *                     OUTCOME_UNKNOWN when it is unknown whether the
 *                     operation reached the chain (never a transport
 *                     failure class).
 * - observe (result): poll the external operation → execution observation
 *                     (BROADCAST | CONFIRMED | FAILED | OUTCOME_UNKNOWN).
 *                     Reorg/fork detection turns previously-observed state
 *                     into OUTCOME_UNKNOWN (ambiguity).
 * - finality:         compute a finality CANDIDATE with explicit family
 *                     semantics (depth/slots, reorg flags) — finality
 *                     itself stays protocol-owned (candidates only).
 * - reconcile:        given an OUTCOME_UNKNOWN observation, produce the
 *                     deterministic reconciliation plan. Blind retry is
 *                     structurally forbidden; reconciliation is the only
 *                     resolver.
 * - evidence:         append-only per-operation evidence log.
 */

/** The frozen lifecycle stage list (vocabulary v1.0.0 — see version.ts). */
export const ADAPTER_LIFECYCLE_STAGES = [
  'observe',
  'prepare',
  'simulate',
  'authorize',
  'broadcast',
  'observeResult',
  'finality',
  'reconcile',
  'evidence',
] as const;

export type AdapterLifecycleStage = (typeof ADAPTER_LIFECYCLE_STAGES)[number];

/** Explicit per-stage support declaration — unsupported stages fail closed. */
export type AdapterStageSupport = Readonly<Record<AdapterLifecycleStage, boolean>>;

/** Deterministic probe: does the adapter declare the stage supported? */
export function lifecycleStageDeclared(
  adapter: Pick<{ readonly lifecycle: AdapterStageSupport }, 'lifecycle'>,
  stage: AdapterLifecycleStage,
): boolean {
  return adapter.lifecycle[stage] === true;
}
