/**
 * @payswap/onchain-extensions/packs/uniswap-v2 — THE REFERENCE VENUE
 * EXTENSION, made declarative (Work Order P5-W2, lane R3-W2; PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-venues/src/uniswap/index.ts).
 *
 * Uniswap v2 modelled as a DECLARATIVE extension pack: the published v2
 * contracts (Router02 and the Factory — public documented constants, never
 * secrets) declared through the canonical INV-SC01 smart-contract law; the
 * venue's OWN optimization — router-native multi-hop path selection over
 * the factory's pairs — declared as the PROVIDER-NATIVE incumbent baseline
 * (INV-C08 / rule 20); the 0.30% pool fee declared as EMBEDDED in the pool
 * execution (never double-counted as a separate fee component).
 *
 * The old pack's EXECUTION surface (quote/planWrite/simulate and the v2
 * constant-product math) is NOT ported — execution belongs to the
 * best-execution (P5-W1) and adapters (P4-W3) lanes; this rebuild pins the
 * venue's capability SURFACE as versioned descriptor data only.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration } from '../pins/smart-contract.ts';
import type { ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// Published v2 contract constants (public documentation values — not secrets)
// ---------------------------------------------------------------------------

/** Uniswap V2 Router02 on Ethereum mainnet (published constant). */
export const UNISWAP_V2_ROUTER_02_ADDRESS =
  // PUBLIC: well-known documented mainnet deployment address.
  '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as const;

/** Uniswap V2 Factory on Ethereum mainnet (published constant). */
export const UNISWAP_V2_FACTORY_ADDRESS =
  // PUBLIC: well-known documented mainnet deployment address.
  '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' as const;

export const UNISWAP_V2_PROTOCOL_KEY = 'uniswap-v2' as const;
export const UNISWAP_V2_CHAIN_KEY = 'ethereum:mainnet' as const;
export const UNISWAP_V2_VENUE_KEY = 'uniswap-v2' as const;
export const UNISWAP_V2_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declarations (public, published properties)
// ---------------------------------------------------------------------------

/** The canonical INV-SC01 declaration of the published v2 Router02. */
export const UNISWAP_V2_ROUTER_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: UNISWAP_V2_CHAIN_KEY,
    contractAddress: UNISWAP_V2_ROUTER_02_ADDRESS,
    sourceHash: 'sha256:uniswap-v2-router02-declared-source',
    bytecodeHash: 'sha256:uniswap-v2-router02-deployed-bytecode',
    upgradeAuthority: {
      kind: 'IMMUTABLE',
      description: 'Router02 has no upgrade path (deployed, verified, immutable)',
    },
    adminAuthority: {
      kind: 'IMMUTABLE',
      description: 'Router02 exposes no administrative functions',
    },
    pausePowers: [],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority: 'n/a — the router never takes custody of funds',
      keyManagement: 'n/a — no operator keys',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

/** The canonical INV-SC01 declaration of the published v2 Factory. */
export const UNISWAP_V2_FACTORY_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: UNISWAP_V2_CHAIN_KEY,
    contractAddress: UNISWAP_V2_FACTORY_ADDRESS,
    sourceHash: 'sha256:uniswap-v2-factory-declared-source',
    bytecodeHash: 'sha256:uniswap-v2-factory-deployed-bytecode',
    upgradeAuthority: {
      kind: 'IMMUTABLE',
      description: 'The v2 factory has no upgrade path',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'feeToSetter governance multisig (fee-switch only, not fund custody)',
    },
    pausePowers: [],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority: 'n/a — the factory never takes custody of funds',
      keyManagement: 'n/a — no operator keys',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const UNISWAP_V2_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: UNISWAP_V2_PROTOCOL_KEY,
  displayName: 'Uniswap v2',
  protocolClass: 'DEX',
  chainKey: UNISWAP_V2_CHAIN_KEY,
  smartContracts: [UNISWAP_V2_ROUTER_DECLARATION, UNISWAP_V2_FACTORY_DECLARATION],
});

const UNISWAP_V2_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/dex/${UNISWAP_V2_VENUE_KEY}@${UNISWAP_V2_VERSION}`,
  family: 'dex',
  version: UNISWAP_V2_VERSION,
  venueSurface: {
    venueKey: UNISWAP_V2_VENUE_KEY,
    displayName: 'Uniswap v2 (reference venue extension)',
    chains: [UNISWAP_V2_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'ROUTER_NATIVE_PATH_SELECTION',
      benchmarkBaseline: true,
      description:
        'The router-native multi-hop path selection of the venue over its factory pairs (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: UNISWAP_V2_PROTOCOL,
  implementation: {
    implementationId: 'impl:uniswap-v2:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:uniswap-v2',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:uniswap-v2',
    implementationNotes:
      'Reference DEX extension pack declaring the capability surface of the published v2 contracts.',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:uniswap-v2',
    },
    protocolKey: UNISWAP_V2_PROTOCOL_KEY,
    chainKey: UNISWAP_V2_CHAIN_KEY,
  },
  familyExtension: {
    family: 'dex',
    dexKind: 'AMM',
    supportedSwapKinds: ['EXACT_INPUT', 'EXACT_OUTPUT'],
    supportedChains: [UNISWAP_V2_CHAIN_KEY],
    quoteSemantics: 'EXECUTABLE',
    slippageProtection: 'DECLARED_LIMIT',
    feeModel: 'EMBEDDED_POOL_FEE',
    supportsSimulation: true,
  },
  subPacks: [],
  constraints: [
    {
      constraintId: 'certification-precondition',
      kind: 'PRECONDITION',
      description:
        'The venue protocol is certified in the capability graph before any effect is planned or executed.',
      authorityCarrier: false,
    },
    {
      constraintId: 'connected-instance-precondition',
      kind: 'PRECONDITION',
      description:
        'A genuinely connected protocol instance with ACTIVE authorization exists (INV-C05 — the catalogue never authorizes).',
      authorityCarrier: false,
    },
    {
      constraintId: 'pool-fee-embedded',
      kind: 'ASSUMPTION',
      description:
        'The 0.30% v2 pool fee is embedded in the pool execution math and is never double-counted as a separate fee component.',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/uniswap-v2.ts',
    contentDigest: 'fnv1a64:4ac4f3f5385f34b5',
  },
};

/**
 * The reference Uniswap v2 extension pack: validated (fail closed) and
 * deep-frozen on every call — the declarative-law constructor.
 */
export function uniswapV2Pack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(UNISWAP_V2_PACK_DATA);
}
