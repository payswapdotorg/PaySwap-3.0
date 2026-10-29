/**
 * @payswap/onchain-adapters — THE CONTRACT-DEPLOY LIFECYCLE PATH (P22-A,
 * lane 3-a; ADR-0016 D4).
 *
 * The frozen nine-stage adapter lifecycle (./stages.ts) gains an explicitly
 * scoped DEPLOY path: deploying a smart-contract artifact rides the SAME
 * stages in the SAME order — nothing about the lifecycle is bypassed or
 * reordered — with deployment-specific semantics at each stage:
 *
 *   prepare      the wasm/contract ARTIFACT HASH is bound into the kernel
 *                write (the digest-bound deployment leg) — an artifact-less
 *                deploy directive never prepares;
 *   authorize    THE GRANT LAW — the injected onchain-security kernel owns
 *                authority exactly as for every consequential write; a
 *                deploy directive without its grant is a TYPED refusal
 *                (DeploymentGrantRequiredError) and NEVER reaches a
 *                transport (the ADR-0016 D7 no-bypass discipline);
 *   broadcast    the DEPLOY TRANSACTION is submitted to the rail through
 *                the injected transport (submitted ≠ finality);
 *   observeResult the CONTRACT ID is observed from the rail (the `C…`
 *                contract StrKey on Soroban), producing the CONFIRMED
 *                observation that carries the finality CANDIDATE;
 *   evidence     the DEPLOYMENT RECORD { txHash, contractId, sourceHash,
 *                bytecodeHash } — the only source of a
 *                SmartContractExtensionPin for what the deployment
 *                produced (never fabricated; see
 *                ../pins/onchain-domain/deployment.ts).
 */

import type { AdapterLifecycleStage } from './stages.ts';

/**
 * The frozen deploy lifecycle path (ADR-0016 D4): the ordered subsequence of
 * the nine lifecycle stages a contract deployment rides. Every member is an
 * AdapterLifecycleStage — the deploy path EXTENDS the lifecycle, it never
 * bypasses it.
 */
export const ADAPTER_DEPLOY_LIFECYCLE_PATH: readonly AdapterLifecycleStage[] =
  Object.freeze(['prepare', 'authorize', 'broadcast', 'observeResult', 'evidence']);

/** Deterministic probe: is `stage` part of the frozen deploy path? */
export function isDeployLifecycleStage(stage: AdapterLifecycleStage): boolean {
  return ADAPTER_DEPLOY_LIFECYCLE_PATH.includes(stage);
}
