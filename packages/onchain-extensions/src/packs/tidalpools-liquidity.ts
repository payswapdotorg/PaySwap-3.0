/**
 * @payswap/onchain-extensions/packs/tidalpools-liquidity — a LIQUIDITY
 * extension pack (NET-NEW family surface; Work Order P5-W2, lane R3-W2).
 *
 * The liquidity family vocabulary is new in PaySwap 3.0 (MMP-23):
 * liquidity provision positions in pools with declared fee tiers,
 * impermanent-loss disclosure and lockup semantics. SYNTHETIC model
 * deployment (a concentrated-liquidity-AMM-STYLE shape — no claim about
 * any specific real venue). A liquidity pack is a descriptor of what a
 * venue OFFERS (position shapes, tiers, lockups) — it never moves funds,
 * never prices positions and never authorizes provision.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic)
// ---------------------------------------------------------------------------

export const TIDALPOOLS_PROTOCOL_KEY = 'tidalpools-liquidity' as const;
export const TIDALPOOLS_CHAIN_KEY = 'ethereum:mainnet' as const;
export const TIDALPOOLS_VENUE_KEY = 'tidalpools-liquidity' as const;
export const TIDALPOOLS_VERSION = '1.0.0' as const;
/** Synthetic pool factory contract (model deployment). */
export const TIDALPOOLS_FACTORY_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '071deaL00000000000000000000000000000P001' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const TIDALPOOLS_FACTORY_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: TIDALPOOLS_CHAIN_KEY,
    contractAddress: TIDALPOOLS_FACTORY_ADDRESS,
    sourceHash: 'sha256:tidalpools-factory-declared-source',
    bytecodeHash: 'sha256:tidalpools-factory-deployed-bytecode',
    upgradeAuthority: {
      kind: 'MULTISIG',
      description: 'pool council multisig with a 30d timelock',
      delayOrTimelock: '30d timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'pool council multisig (fee-tier enablement only, never position custody)',
    },
    pausePowers: [],
    oracleDependencies: [
      {
        oracleRef: 'oracle:twap-price-observations',
        usage: 'time-weighted average price observations for range positions',
      },
    ],
    custody: {
      custodial: false,
      withdrawalAuthority:
        'liquidity providers withdraw through the pool contracts directly at any time (no lockup)',
      keyManagement: 'no operator keys; pool logic alone moves position liquidity',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const TIDALPOOLS_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: TIDALPOOLS_PROTOCOL_KEY,
  displayName: 'TidalPools Liquidity (modelled)',
  protocolClass: 'DEX',
  chainKey: TIDALPOOLS_CHAIN_KEY,
  smartContracts: [TIDALPOOLS_FACTORY_DECLARATION],
});

const TIDALPOOLS_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/liquidity/${TIDALPOOLS_VENUE_KEY}@${TIDALPOOLS_VERSION}`,
  family: 'liquidity',
  version: TIDALPOOLS_VERSION,
  venueSurface: {
    venueKey: TIDALPOOLS_VENUE_KEY,
    displayName: 'TidalPools liquidity (concentrated-liquidity venue extension)',
    chains: [TIDALPOOLS_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'TIERED_RANGE_PROVISION',
      benchmarkBaseline: true,
      description:
        'The tiered range provision of the venue across its declared fee tiers (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: TIDALPOOLS_PROTOCOL,
  implementation: {
    implementationId: 'impl:tidalpools-liquidity:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:tidalpools-liquidity',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:tidalpools-liquidity',
    implementationNotes:
      'Liquidity extension pack (concentrated-liquidity positions with declared fee tiers and no lockup).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:tidalpools-liquidity',
    },
    protocolKey: TIDALPOOLS_PROTOCOL_KEY,
    chainKey: TIDALPOOLS_CHAIN_KEY,
  },
  familyExtension: {
    family: 'liquidity',
    liquidityModel: 'CONCENTRATED_LIQUIDITY',
    positionShapes: ['FULL_RANGE_POSITION', 'RANGE_POSITION'],
    feeTiersBasisPoints: [5, 30, 100],
    impermanentLossDisclosure: 'DISCLOSED',
    lockupModel: 'NO_LOCKUP',
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
      constraintId: 'liquidity-estimates-are-not-custody',
      kind: 'LIMITATION',
      description:
        'Liquidity and position estimates are declarations, never custody or authorization (the P5-W1 law).',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/tidalpools-liquidity.ts',
    contentDigest: 'fnv1a64:11cfc54653ae5033',
  },
};

/**
 * The concentrated-liquidity extension pack: validated (fail closed) and
 * deep-frozen on every call — the declarative-law constructor.
 */
export function tidalpoolsLiquidityPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(TIDALPOOLS_PACK_DATA);
}
