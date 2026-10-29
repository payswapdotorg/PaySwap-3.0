import { describe, expect, it } from 'vitest';
import { DeploymentGrantRequiredError, ValidationError } from '../src/errors.ts';
import { ADAPTER_DEPLOY_LIFECYCLE_PATH, isDeployLifecycleStage } from '../src/contract/deployment.ts';
import { NOW, NOW_ISO } from './fixtures/world.ts';
import {
  STELLAR_CHAIN,
  STELLAR_PASSPHRASE,
  STELLAR_DEPLOYER_ACCOUNT,
  STELLAR_WASM_HASH,
  STELLAR_SOURCE_HASH,
  STELLAR_INSTANCE,
  RecordingStellarHorizon,
  scriptedStellarHorizon,
  stellarTestAdapter,
  stellarTestAdapterOverTransport,
  stellarDeployDirective,
} from './fixtures/stellar-world.ts';

/**
 * P22-A (ADR-0016 D4/D7): the contract-DEPLOY lifecycle PATH
 * `prepare → authorize → broadcast → observeResult → evidence` (the frozen
 * ordered subsequence of the nine-stage lifecycle — an extension, never a
 * bypass) + THE NO-GRANT TYPED REFUSAL: a deploy directive without its
 * grant is a TYPED DeploymentGrantRequiredError and NEVER reaches a
 * transport (D7). Part 1 of the former stellar-deploy battery (the file
 * law split).
 */

describe('the frozen deploy lifecycle path (ADR-0016 D4 — prepare → authorize → broadcast → observeResult → evidence)', () => {
  it('ADAPTER_DEPLOY_LIFECYCLE_PATH is the ordered subsequence of the nine-stage lifecycle (an extension, never a bypass)', () => {
    expect(ADAPTER_DEPLOY_LIFECYCLE_PATH).toEqual([
      'prepare',
      'authorize',
      'broadcast',
      'observeResult',
      'evidence',
    ]);
    expect(Object.isFrozen(ADAPTER_DEPLOY_LIFECYCLE_PATH)).toBe(true);
    for (const stage of ADAPTER_DEPLOY_LIFECYCLE_PATH) {
      expect(isDeployLifecycleStage(stage)).toBe(true);
    }
    // The stages OUTSIDE the deploy path are the family-neutral ones.
    expect(isDeployLifecycleStage('observe')).toBe(false);
    expect(isDeployLifecycleStage('simulate')).toBe(false);
    expect(isDeployLifecycleStage('finality')).toBe(false);
    expect(isDeployLifecycleStage('reconcile')).toBe(false);
  });

  it('prepare binds the digest-bound artifact into a contract_deploy plan (wasm hash + source hash)', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const prepared = await adapter.prepare({
      directive: stellarDeployDirective(),
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(prepared.familyPlan.kind).toBe('contract_deploy');
    if (prepared.familyPlan.kind !== 'contract_deploy') throw new Error('unreachable');
    expect(prepared.familyPlan.wasmHash).toBe(STELLAR_WASM_HASH);
    expect(prepared.familyPlan.sourceHash).toBe(STELLAR_SOURCE_HASH);
    expect(prepared.familyPlan.observedNetworkPassphrase).toBe(STELLAR_PASSPHRASE);
    expect(prepared.writeRequest.deployment).toEqual({
      deployer: STELLAR_DEPLOYER_ACCOUNT,
      artifactHash: STELLAR_WASM_HASH,
      artifactKind: 'WASM',
    });
    expect(prepared.writeRequest.action).toBe('onchain.contract_deploy');
  });

  it('a deploy directive WITHOUT its digest-bound artifact never prepares (typed)', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const { familyPayload: _omit, ...withoutPayload } = stellarDeployDirective();
    await expect(
      adapter.prepare({
        directive: withoutPayload,
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/artifactHash/);
    await expect(
      adapter.prepare({
        directive: stellarDeployDirective({
          familyPayload: { artifactHash: STELLAR_WASM_HASH, artifactKind: 'hex' },
        }),
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/artifactKind/);
  });

  it('a Stellar deploy plan REQUIRES the source hash (the evidence record needs both halves)', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    await expect(
      adapter.prepare({
        directive: stellarDeployDirective({
          familyPayload: { artifactHash: STELLAR_WASM_HASH, artifactKind: 'WASM' },
        }),
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/sourceHash/);
  });
});

describe('the deploy NO-GRANT typed refusal (ADR-0016 D7 — a smuggled deploy NEVER reaches a transport)', () => {
  it('a deploy broadcast without its grant is a TYPED DeploymentGrantRequiredError and the transport is NEVER called', async () => {
    const recording = new RecordingStellarHorizon(scriptedStellarHorizon());
    const adapter = stellarTestAdapterOverTransport(recording);
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const prepared = await adapter.prepare({
      directive: stellarDeployDirective(),
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(recording.calls.length).toBeGreaterThan(0); // prepare observed through the seam

    // The smuggled handoff: a fabricated signing request over the prepared
    // deploy write, never authorized through the kernel.
    const callsBeforeSmuggle = recording.calls.length;
    const smuggled = {
      requestId: 'smuggled-sign-1',
      chain: STELLAR_CHAIN,
      signerAddress: STELLAR_DEPLOYER_ACCOUNT,
      payload: 'payswap.stellar.signing-envelope',
      authorizationRef: 'forged:authorization',
      recheckRef: 'forged:recheck',
      deadline: NOW + 60_000,
      writeDigest: prepared.writeDigest,
    };
    let refused: unknown;
    try {
      await adapter.broadcast({
        handoff: smuggled,
        signedPayload: 'BASE64SIGNEDDEPLOY',
        at: NOW + 10,
        executionRef: 'stellar-deploy-smuggled-1',
      });
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(DeploymentGrantRequiredError);
    expect((refused as DeploymentGrantRequiredError).code).toBe('DEPLOYMENT_GRANT_REQUIRED');
    expect((refused as DeploymentGrantRequiredError).category).toBe('AUTHORIZATION_REQUIRED');
    // NEVER reached a transport: zero new calls after the smuggle attempt.
    expect(recording.calls.length).toBe(callsBeforeSmuggle);
    expect(recording.calls.some((call) => call.startsWith('POST'))).toBe(false);
  });

  it('the generic authorize-before-broadcast law still holds for an UNKNOWN write digest (also never a transport call)', async () => {
    const recording = new RecordingStellarHorizon(scriptedStellarHorizon());
    const adapter = stellarTestAdapterOverTransport(recording);
    const callsBefore = recording.calls.length;
    await expect(
      adapter.broadcast({
        handoff: {
          requestId: 'smuggled-sign-2',
          chain: STELLAR_CHAIN,
          signerAddress: STELLAR_DEPLOYER_ACCOUNT,
          payload: 'payswap.stellar.signing-envelope',
          authorizationRef: 'forged:authorization',
          recheckRef: 'forged:recheck',
          deadline: NOW + 60_000,
          writeDigest: 'fnv1a64:00000000deadbeef',
        },
        signedPayload: 'BASE64SIGNEDDEPLOY',
        at: NOW + 10,
        executionRef: 'stellar-deploy-smuggled-2',
      }),
    ).rejects.toThrow(ValidationError);
    expect(recording.calls.length).toBe(callsBefore);
  });
});
