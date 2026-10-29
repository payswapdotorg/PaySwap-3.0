/**
 * The deterministic STELLAR world for the P22-A onchain-adapters battery:
 * the scripted Horizon REST surface (the injected-fetch seam — no SDK, no
 * network), the Stellar adapter factory and the transfer/deploy directive
 * fixtures. The REAL adapter code runs against deterministic transport
 * responses + the deterministic fake kernel (the established family-fixture
 * precedent — test/fixtures/adapters.ts).
 *
 * PUBLIC literals: the SDF-defined testnet network passphrase and the
 * documented Stellar TESTNET USDC issuer are public testnet metadata, never
 * secrets. Account/destination/contract StrKey fixtures are SHAPES assembled
 * at runtime (never real accounts); no secret material ever appears here.
 */

import { StellarChainAdapter } from '../../src/stellar/index.ts';
import { FakeSecurityKernel } from './fake-kernel.ts';
import { ScriptedRestTransport, fakeEndpoint } from './scripted-transport.ts';
import type { OnchainExecutionDirective } from '../../src/pins/onchain-domain/directive.ts';
import { chainCapabilityId } from '../../src/pins/onchain-domain/instance.ts';
import type { ConnectedChainInstance } from '../../src/pins/onchain-domain/instance.ts';
import type { OnchainSecurityPolicy } from '../../src/pins/onchain-security/kernel-port.ts';
import type { RestTransport, RestCallResult, EndpointProfile } from '../../src/transport.ts';
import { routeHashOf } from './adapters.ts';
import { NOW } from './world.ts';

export const STELLAR_CHAIN = 'stellar:testnet';
/** PUBLIC: the SDF-defined testnet network passphrase (a public constant). */
export const STELLAR_PASSPHRASE = 'Test SDF Network ; September 2015';
/** PUBLIC: the documented Stellar TESTNET USDC issuer (public testnet metadata). */
export const STELLAR_TESTNET_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
/** A deterministic second-issuer shape (the collision-law fixture; not a real account). */
export const STELLAR_OTHER_ISSUER = `G${'X'.repeat(55)}`;
export const STELLAR_USDC_ASSET_ID = `${STELLAR_CHAIN}/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`;
export const STELLAR_OTHER_ISSUER_ASSET_ID = `${STELLAR_CHAIN}/asset:USDC:${STELLAR_OTHER_ISSUER}`;
export const STELLAR_NATIVE_ASSET_ID = `${STELLAR_CHAIN}/asset:XLM`;
/** Account/destination/deployer StrKey SHAPE fixtures (never real accounts). */
export const STELLAR_PAYER_ACCOUNT = `G${'A'.repeat(55)}`;
export const STELLAR_DESTINATION_ACCOUNT = `G${'D'.repeat(55)}`;
export const STELLAR_DEPLOYER_ACCOUNT = `G${'A'.repeat(55)}`;

export const STELLAR_LEDGER_SEQ = 523_456;
export const STELLAR_LEDGER_HASH =
  'f00d00000000000000000000000000000000000000000000000000000000ba5e';
export const STELLAR_FEE_MODE = '100';
export const STELLAR_NATIVE_BALANCE = '1000.0000000'; // exact decimal → 10000000000 stroops
export const STELLAR_USDC_BALANCE = '25.5000000'; // exact decimal → 255000000 stroops
export const STELLAR_TX_HASH =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
export const STELLAR_CONTRACT_ID = `C${'B'.repeat(55)}`;
export const STELLAR_WASM_HASH = 'sha256:wasm-bytecode-artifact';
export const STELLAR_SOURCE_HASH = 'sha256:verified-source-artifact';

export type StellarHorizonResponses = Record<
  string,
  () => { status: number; body: unknown; raw?: string }
>;

/** The scripted Horizon responses (transfer + deploy golden paths + overrides). */
export function stellarHorizonResponses(
  overrides?: StellarHorizonResponses,
): StellarHorizonResponses {
  return {
    '/': () => ({ status: 200, body: { network_passphrase: STELLAR_PASSPHRASE } }),
    '/ledgers?order=desc&limit=1': () => ({
      status: 200,
      body: {
        _embedded: { records: [{ sequence: STELLAR_LEDGER_SEQ, hash: STELLAR_LEDGER_HASH }] },
      },
    }),
    [`/accounts/${STELLAR_PAYER_ACCOUNT}`]: () => ({
      status: 200,
      body: {
        sequence: '123456789',
        balances: [
          { asset_type: 'native', balance: STELLAR_NATIVE_BALANCE },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: STELLAR_TESTNET_USDC_ISSUER,
            balance: STELLAR_USDC_BALANCE,
          },
        ],
      },
    }),
    '/fee_stats': () => ({ status: 200, body: { max_fee: { mode: STELLAR_FEE_MODE } } }),
    '/transactions': () => ({ status: 200, body: { hash: STELLAR_TX_HASH } }),
    [`/transactions/${STELLAR_TX_HASH}`]: () => ({
      status: 200,
      body: { successful: true, ledger: STELLAR_LEDGER_SEQ },
    }),
    [`/transactions/${STELLAR_TX_HASH}/operations`]: () => ({
      status: 200,
      body: {
        _embedded: {
          records: [
            { type: 'invoke_host_function', address: STELLAR_DEPLOYER_ACCOUNT },
            { type: 'create_contract', contract_id: STELLAR_CONTRACT_ID },
          ],
        },
      },
    }),
    ...(overrides ?? {}),
  };
}

/** A scripted Horizon REST transport for the Stellar testnet chain. */
export function scriptedStellarHorizon(responses?: StellarHorizonResponses) {
  return new ScriptedRestTransport({
    transportId: 'transport:scripted:stellar',
    endpoints: [
      fakeEndpoint({
        endpointId: 'stellar-scripted-1',
        providerName: 'ScriptedHorizon',
        chainKey: STELLAR_CHAIN,
        protocol: 'REST',
      }),
    ],
    responses: stellarHorizonResponses(responses),
  });
}

/** A Stellar adapter over the scripted Horizon + the deterministic fake kernel. */
export function stellarTestAdapter(responses?: StellarHorizonResponses) {
  return new StellarChainAdapter({
    adapterId: 'adapter:stellar:test',
    chainKey: STELLAR_CHAIN,
    transport: scriptedStellarHorizon(responses),
    kernel: new FakeSecurityKernel(),
    issuerScopedAssets: [
      {
        assetId: STELLAR_USDC_ASSET_ID,
        code: 'USDC',
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      },
    ],
  });
}

/** A Stellar adapter over an EXPLICIT transport (the recording-transport proofs). */
export function stellarTestAdapterOverTransport(transport: RestTransport) {
  return new StellarChainAdapter({
    adapterId: 'adapter:stellar:test',
    chainKey: STELLAR_CHAIN,
    transport,
    kernel: new FakeSecurityKernel(),
    issuerScopedAssets: [
      {
        assetId: STELLAR_USDC_ASSET_ID,
        code: 'USDC',
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      },
    ],
  });
}

/** The connected stellar:testnet instance fixture. */
export const STELLAR_INSTANCE: ConnectedChainInstance = {
  instanceId: `instance:${STELLAR_CHAIN}:001`,
  capabilityId: chainCapabilityId(STELLAR_CHAIN),
  chainKey: STELLAR_CHAIN,
  family: 'STELLAR',
};

/** An issuer-scoped USDC transfer directive on stellar:testnet. */
export function stellarUsdcTransferDirective(
  overrides?: Partial<OnchainExecutionDirective>,
): OnchainExecutionDirective {
  return {
    operation: 'onchain.transfer',
    chainKey: STELLAR_CHAIN,
    family: 'STELLAR',
    destination: STELLAR_DESTINATION_ACCOUNT,
    assetId: STELLAR_USDC_ASSET_ID,
    amount: { assetId: STELLAR_USDC_ASSET_ID, minorUnits: '255000000' },
    expiresAt: new Date(NOW + 60_000).toISOString(),
    signerHandle: {
      handleId: 'signer.handle.stellar.001',
      capabilityInstanceId: 'instance:signer:stellar:001',
      custodyModel: 'NON_CUSTODIAL_EXTERNAL',
    },
    ...overrides,
  };
}

/** A Soroban contract-deploy directive (the digest-bound artifact payload). */
export function stellarDeployDirective(
  overrides?: Partial<OnchainExecutionDirective>,
): OnchainExecutionDirective {
  return {
    operation: 'onchain.contract_deploy',
    chainKey: STELLAR_CHAIN,
    family: 'STELLAR',
    expiresAt: new Date(NOW + 60_000).toISOString(),
    signerHandle: {
      handleId: 'signer.handle.stellar.deploy.001',
      capabilityInstanceId: 'instance:signer:stellar:deploy:001',
      custodyModel: 'NON_CUSTODIAL_EXTERNAL',
    },
    familyPayload: {
      artifactHash: STELLAR_WASM_HASH,
      artifactKind: 'WASM',
      sourceHash: STELLAR_SOURCE_HASH,
    },
    ...overrides,
  };
}

/** A kernel policy that allows the given directive on the Stellar testnet. */
export function stellarPolicy(directive: OnchainExecutionDirective): OnchainSecurityPolicy {
  return {
    policyId: 'policy-stellar-1',
    version: 1,
    forbidUnlimitedApprovals: true,
    unknownContractPolicy: 'block',
    unknownRoutePolicy: 'block',
    allowedChains: [STELLAR_CHAIN],
    allowedAssets: [{ chain: STELLAR_CHAIN, assetId: STELLAR_USDC_ASSET_ID, symbol: 'USDC' }],
    allowedDestinations: [STELLAR_DESTINATION_ACCOUNT],
    knownRoutes: [routeHashOf(directive)],
  };
}

/** A transport double that RECORDS every call (the never-reaches-a-transport proof). */
export class RecordingStellarHorizon implements RestTransport {
  readonly transportId: string;
  readonly calls: string[] = [];
  readonly #inner: RestTransport;

  constructor(inner: RestTransport) {
    this.transportId = inner.transportId;
    this.#inner = inner;
  }

  endpoints(): readonly EndpointProfile[] {
    return this.#inner.endpoints();
  }

  async get(path: string): Promise<RestCallResult> {
    this.calls.push(`GET ${path}`);
    return this.#inner.get(path);
  }

  async post(path: string, body: string, contentType: string): Promise<RestCallResult> {
    this.calls.push(`POST ${path}`);
    return this.#inner.post(path, body, contentType);
  }
}
