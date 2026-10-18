/**
 * @payswap/onchain-extensions/packs/zeroswap-aggregator — an INDEPENDENT
 * 0x-style DEX/aggregator extension pack, made declarative (Work Order
 * P5-W2, lane R3-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-venues/src/aggregator/index.ts).
 *
 * Deliberately NOT a fork of the reference venue (structurally distinct
 * surface): the aggregator composes MULTIPLE liquidity sources (firm RFQ
 * maker orders AND indexed AMM pools) and charges an explicit integrator
 * fee ON TOP of the sourced liquidity (EXPLICIT_COMPONENT fee model —
 * deducted from the routed input, never double-counted inside the sourced
 * output). Its own PROVIDER-NATIVE smart routing is declared as the
 * incumbent baseline (INV-C08 / rule 20).
 *
 * SYNTHETIC model deployment (a 0x-STYLE shape — no claim about any
 * specific real deployment). The old pack's runtime source-composition
 * logic is NOT ported — execution belongs to the P5-W1/P4-W3 lanes.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic — a 0x-STYLE shape, no real claim)
// ---------------------------------------------------------------------------

export const AGGREGATOR_PROTOCOL_KEY = 'zeroswap-aggregator' as const;
export const AGGREGATOR_CHAIN_KEY = 'ethereum:mainnet' as const;
export const AGGREGATOR_VENUE_KEY = 'zeroswap-aggregator' as const;
export const AGGREGATOR_VERSION = '1.0.0' as const;
/** Synthetic settlement-proxy contract (model deployment). */
export const AGGREGATOR_SETTLEMENT_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '0xA11Ce0000000000000000000000000000000BEEF' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const AGGREGATOR_SETTLEMENT_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: AGGREGATOR_CHAIN_KEY,
    contractAddress: AGGREGATOR_SETTLEMENT_ADDRESS,
    sourceHash: 'sha256:zeroswap-settlement-declared-source',
    bytecodeHash: 'sha256:zeroswap-settlement-deployed-bytecode',
    upgradeAuthority: {
      kind: 'MULTISIG',
      description: 'operator multisig with a 24h timelock',
      delayOrTimelock: '24h timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'operator multisig (fee configuration only, never fund custody)',
    },
    pausePowers: [
      {
        actor: 'operator-multisig',
        scope: 'new batch settlement (settled batches are final)',
      },
    ],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority: 'traders withdraw unexecuted orders at any time',
      keyManagement: 'no operator keys touch trader funds',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const AGGREGATOR_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: AGGREGATOR_PROTOCOL_KEY,
  displayName: 'Zeroswap Aggregator (modelled)',
  protocolClass: 'DEX',
  chainKey: AGGREGATOR_CHAIN_KEY,
  smartContracts: [AGGREGATOR_SETTLEMENT_DECLARATION],
});

const AGGREGATOR_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/dex/${AGGREGATOR_VENUE_KEY}@${AGGREGATOR_VERSION}`,
  family: 'dex',
  version: AGGREGATOR_VERSION,
  venueSurface: {
    venueKey: AGGREGATOR_VENUE_KEY,
    displayName: 'Zeroswap aggregator (independent 0x-style venue extension)',
    chains: [AGGREGATOR_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'SMART_SOURCE_ROUTING',
      benchmarkBaseline: true,
      description:
        'The aggregator own smart routing across RFQ makers and AMM sources (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: AGGREGATOR_PROTOCOL,
  implementation: {
    implementationId: 'impl:zeroswap-aggregator:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:zeroswap-aggregator',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:zeroswap-aggregator',
    implementationNotes:
      'Independent 0x-style aggregator DEX extension pack (RFQ + AMM source composition with an explicit integrator fee).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:zeroswap-aggregator',
    },
    protocolKey: AGGREGATOR_PROTOCOL_KEY,
    chainKey: AGGREGATOR_CHAIN_KEY,
  },
  familyExtension: {
    family: 'dex',
    dexKind: 'AGGREGATOR',
    supportedSwapKinds: ['EXACT_INPUT', 'EXACT_OUTPUT'],
    supportedChains: [AGGREGATOR_CHAIN_KEY],
    quoteSemantics: 'EXECUTABLE',
    slippageProtection: 'DECLARED_LIMIT',
    feeModel: 'EXPLICIT_COMPONENT',
    supportsSimulation: true,
    aggregatorSources: ['RFQ_MAKER', 'AMM_POOL'],
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
      constraintId: 'integrator-fee-on-top',
      kind: 'ASSUMPTION',
      description:
        'The explicit integrator fee is charged ON TOP of the sourced liquidity (deducted from the routed input — never double-counted inside the sourced output).',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/zeroswap-aggregator.ts',
    contentDigest: 'fnv1a64:ad05571c698ba2b5',
  },
};

/**
 * The independent aggregator extension pack: validated (fail closed) and
 * deep-frozen on every call — the declarative-law constructor.
 */
export function zeroswapAggregatorPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(AGGREGATOR_PACK_DATA);
}
