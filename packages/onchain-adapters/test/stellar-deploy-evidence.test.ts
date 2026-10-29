import { describe, expect, it } from 'vitest';
import { validateContractDeploymentEvidence } from '../src/pins/onchain-domain/deployment.ts';
import { stellarClassicIssuancePlan } from '../src/stellar/classic-issuance.ts';
import { ScriptedRestTransport, fakeEndpoint } from './fixtures/scripted-transport.ts';
import { routeHashOf } from './fixtures/adapters.ts';
import { NOW, NOW_ISO, baseSecurityState, testSurface, AGENT_PRINCIPAL } from './fixtures/world.ts';
import {
  STELLAR_CHAIN,
  STELLAR_PASSPHRASE,
  STELLAR_TESTNET_USDC_ISSUER,
  STELLAR_DEPLOYER_ACCOUNT,
  STELLAR_LEDGER_SEQ,
  STELLAR_LEDGER_HASH,
  STELLAR_TX_HASH,
  STELLAR_CONTRACT_ID,
  STELLAR_WASM_HASH,
  STELLAR_SOURCE_HASH,
  STELLAR_INSTANCE,
  stellarTestAdapter,
  stellarTestAdapterOverTransport,
  stellarDeployDirective,
} from './fixtures/stellar-world.ts';

/**
 * P22-A (ADR-0016 D4): the deployment EVIDENCE RECORD
 * `{ txHash, contractId, sourceHash, bytecodeHash }` — derives ONLY from a
 * CONFIRMED deployment observation with an OBSERVED `C…` contract id,
 * never fabricated; the classic-asset issuance alternative is declared
 * plan data, never execution. Part 2 of the former stellar-deploy battery
 * (the file law split).
 */

describe('the deployment evidence record (ADR-0016 D4 — { txHash, contractId, sourceHash, bytecodeHash })', () => {
  it('the evidence stage derives the COMPLETE record from a CONFIRMED deployment with an OBSERVED C… contract id', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const directive = stellarDeployDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const feed = adapter.authorize({
      prepared,
      policy: {
        policyId: 'policy-stellar-deploy-1',
        version: 1,
        forbidUnlimitedApprovals: true,
        unknownContractPolicy: 'block',
        unknownRoutePolicy: 'block',
        allowedChains: [STELLAR_CHAIN],
        knownRoutes: [routeHashOf(directive)],
      },
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'stellar-deploy-req-1',
      signingRequestId: 'stellar-deploy-sign-1',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    expect(feed.pipelineState).toBe('BROADCAST_HANDOFF');
    expect(feed.signingRequest.payload).toContain('payswap.stellar.signing-envelope');

    const broadcast = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDDEPLOY',
      at: NOW + 10,
      executionRef: 'stellar-deploy-exec-1',
    });
    expect(broadcast.outcome).toBe('BROADCAST');
    expect(broadcast.externalOperationRef).toBe(STELLAR_TX_HASH);

    const confirmed = await adapter.observeOperation({
      executionRef: 'stellar-deploy-exec-1',
      externalOperationRef: STELLAR_TX_HASH,
      at: NOW + 30,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');

    const evidence = await adapter.deploymentRecord({
      prepared,
      observation: confirmed,
    });
    expect(evidence).toEqual({
      txHash: STELLAR_TX_HASH,
      contractId: STELLAR_CONTRACT_ID,
      sourceHash: STELLAR_SOURCE_HASH,
      bytecodeHash: STELLAR_WASM_HASH,
    });
    // The record validates as COMPLETE evidence.
    expect(validateContractDeploymentEvidence(evidence)).toEqual(evidence);
  });

  it('a NON-CONFIRMED observation never yields a deployment record (never fabricated)', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const directive = stellarDeployDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_DEPLOYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const feed = adapter.authorize({
      prepared,
      policy: {
        policyId: 'policy-stellar-deploy-2',
        version: 1,
        forbidUnlimitedApprovals: true,
        unknownContractPolicy: 'block',
        unknownRoutePolicy: 'block',
        allowedChains: [STELLAR_CHAIN],
        knownRoutes: [routeHashOf(directive)],
      },
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'stellar-deploy-req-2',
      signingRequestId: 'stellar-deploy-sign-2',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    const broadcast = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDDEPLOY',
      at: NOW + 10,
      executionRef: 'stellar-deploy-exec-2',
    });
    // Still in flight (BROADCAST ≠ CONFIRMED): the record never forms.
    await expect(
      adapter.deploymentRecord({ prepared, observation: broadcast }),
    ).rejects.toThrow(/ONLY from a CONFIRMED deployment/);
  });

  it('a deployment whose operations carry NO C… contract id fails closed (the contract id is observed, never guessed)', async () => {
    const noContract = new ScriptedRestTransport({
      transportId: 'transport:scripted:stellar-deploy-noc',
      endpoints: [
        fakeEndpoint({
          endpointId: 'stellar-deploy-noc-1',
          providerName: 'ScriptedHorizon',
          chainKey: STELLAR_CHAIN,
          protocol: 'REST',
        }),
      ],
      responses: {
        '/': () => ({ status: 200, body: { network_passphrase: STELLAR_PASSPHRASE } }),
        [`/transactions/${STELLAR_TX_HASH}/operations`]: () => ({
          status: 200,
          body: { _embedded: { records: [{ type: 'invoke_host_function' }] } },
        }),
      },
    });
    const adapter = stellarTestAdapterOverTransport(noContract);
    const prepared = {
      operationKind: 'PreparedAdapterOperation' as const,
      directive: stellarDeployDirective(),
      writeRequest: {
        writeId: 'write:stellar-deploy-noc',
        action: 'onchain.contract_deploy',
        chain: STELLAR_CHAIN,
        approvals: [],
        route: { routeId: 'route-x', routeHash: 'route:y' },
        expiry: NOW + 60_000,
        requestedBy: 'agent:agent-key-1',
        deployment: {
          deployer: STELLAR_DEPLOYER_ACCOUNT,
          artifactHash: STELLAR_WASM_HASH,
          artifactKind: 'WASM' as const,
        },
      },
      writeDigest: 'fnv1a64:0000000000c0ffee',
      familyPlan: {
        family: 'STELLAR' as const,
        kind: 'contract_deploy' as const,
        observedNetworkPassphrase: STELLAR_PASSPHRASE,
        wasmHash: STELLAR_WASM_HASH,
        sourceHash: STELLAR_SOURCE_HASH,
        fee: { expressible: false as const, reason: 'fixture' },
        ledgerAtPrepare: { height: STELLAR_LEDGER_SEQ, headHash: STELLAR_LEDGER_HASH },
      },
      preparedAt: NOW,
      evidenceRefs: [],
    };
    const confirmed = {
      operationKind: 'OnchainExecutionObservation' as const,
      observationId: 'obs:stellar-deploy-noc',
      executionRef: 'stellar-deploy-exec-noc',
      chainKey: STELLAR_CHAIN,
      environmentClass: 'TESTNET' as const,
      observedAt: new Date(NOW + 30).toISOString(),
      outcome: 'CONFIRMED' as const,
      externalOperationRef: STELLAR_TX_HASH,
    };
    await expect(
      adapter.deploymentRecord({ prepared, observation: confirmed as never }),
    ).rejects.toThrow(/contract id is observable|never fabricated/);
  });

  it('a TRANSFER plan never yields a deployment record (typed)', async () => {
    const adapter = stellarTestAdapter();
    await expect(
      adapter.deploymentRecord({
        prepared: { familyPlan: { family: 'STELLAR', kind: 'transfer' } } as never,
        observation: { outcome: 'CONFIRMED', externalOperationRef: STELLAR_TX_HASH } as never,
      }),
    ).rejects.toThrow(/only a contract_deploy plan derives a deployment record/);
  });
});

describe('the classic-asset issuance alternative (ADR-0016 D4 — declared plan data, never execution)', () => {
  it('the plan derives from valid shapes with the trustline prerequisite as a LITERAL', () => {
    const plan = stellarClassicIssuancePlan(STELLAR_CHAIN, {
      issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      assetCode: 'USDC',
      holderAccount: `G${'H'.repeat(55)}`,
      amountStroops: '1000000',
    });
    expect(plan.kind).toBe('stellar_classic_issuance');
    expect(plan.issuerAccount).toBe(STELLAR_TESTNET_USDC_ISSUER);
    expect(plan.assetCode).toBe('USDC');
    expect(plan.assetId).toBe(`stellar:testnet/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`);
    expect(plan.requiresTrustline).toBe(true);
    expect(plan.descriptiveOnly).toBe(true);
  });

  it('malformed shapes fail closed (issuer/holder G… StrKeys, the classic code law, exact stroops)', () => {
    const holder = `G${'H'.repeat(55)}`;
    expect(() =>
      stellarClassicIssuancePlan(STELLAR_CHAIN, {
        issuerAccount: 'not-a-strkey',
        assetCode: 'USDC',
        holderAccount: holder,
        amountStroops: '1',
      }),
    ).toThrow(/issuerAccount/);
    expect(() =>
      stellarClassicIssuancePlan(STELLAR_CHAIN, {
        issuerAccount: `S${'Q'.repeat(55)}`,
        assetCode: 'USDC',
        holderAccount: holder,
        amountStroops: '1',
      }),
    ).toThrow(/issuerAccount/);
    expect(() =>
      stellarClassicIssuancePlan(STELLAR_CHAIN, {
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: 'TOOLONGASSETCODE13',
        holderAccount: holder,
        amountStroops: '1',
      }),
    ).toThrow(/assetCode/);
    expect(() =>
      stellarClassicIssuancePlan(STELLAR_CHAIN, {
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: 'USDC',
        holderAccount: holder,
        amountStroops: '1.5',
      }),
    ).toThrow(/amountStroops/);
    expect(() =>
      stellarClassicIssuancePlan(STELLAR_CHAIN, {
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: 'USDC',
        holderAccount: STELLAR_TESTNET_USDC_ISSUER,
        amountStroops: '1',
      }),
    ).toThrow(/same account/);
  });
});
