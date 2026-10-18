/**
 * @payswap/onchain-extensions/packs/meridian-lending — a LENDING/STAKING
 * extension pack (NET-NEW family surface; Work Order P5-W2, lane R3-W2).
 *
 * The lending/staking family vocabulary is new in PaySwap 3.0 (MMP-23):
 * yield-bearing position surfaces with declared collateral, rate and
 * unbonding semantics. SYNTHETIC model deployment (a liquid-staking-STYLE
 * shape — no claim about any specific real venue). The pack DECLares the
 * position surface (rates variable, unbonding delayed, slashing exposure
 * disclosed) — it never prices yield, never moves stake and never
 * authorizes a position change.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic)
// ---------------------------------------------------------------------------

export const MERIDIAN_PROTOCOL_KEY = 'meridian-lending' as const;
export const MERIDIAN_CHAIN_KEY = 'ethereum:mainnet' as const;
export const MERIDIAN_VENUE_KEY = 'meridian-lending' as const;
export const MERIDIAN_VERSION = '1.0.0' as const;
/** Synthetic liquid-staking entry contract (model deployment). */
export const MERIDIAN_STAKING_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '0x57a9000000000000000000000000000000000ea7' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const MERIDIAN_STAKING_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: MERIDIAN_CHAIN_KEY,
    contractAddress: MERIDIAN_STAKING_ADDRESS,
    sourceHash: 'sha256:meridian-staking-declared-source',
    bytecodeHash: 'sha256:meridian-staking-deployed-bytecode',
    upgradeAuthority: {
      kind: 'MULTISIG',
      description: 'operator multisig with a 21d timelock',
      delayOrTimelock: '21d timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'operator multisig (withdrawal-credential configuration only)',
    },
    pausePowers: [
      {
        actor: 'operator-multisig',
        scope: 'new deposits (in-flight stakes and the exit queue continue)',
      },
    ],
    oracleDependencies: [
      {
        oracleRef: 'oracle:beacon-chain-observations',
        usage: 'beacon-chain balance observations for staking yield accounting',
      },
    ],
    custody: {
      custodial: true,
      custodianRef: 'meridian staking pool (contract-held stake; exit queue enforced by logic)',
      withdrawalAuthority:
        'stakers exit through the declared unbonding queue — no operator key can front it',
      keyManagement: 'no operator keys; the pool logic alone moves staked funds',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const MERIDIAN_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: MERIDIAN_PROTOCOL_KEY,
  displayName: 'Meridian Liquid Staking (modelled)',
  protocolClass: 'STAKING',
  chainKey: MERIDIAN_CHAIN_KEY,
  smartContracts: [MERIDIAN_STAKING_DECLARATION],
});

const MERIDIAN_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/lending-staking/${MERIDIAN_VENUE_KEY}@${MERIDIAN_VERSION}`,
  family: 'lending-staking',
  version: MERIDIAN_VERSION,
  venueSurface: {
    venueKey: MERIDIAN_VENUE_KEY,
    displayName: 'Meridian lending (liquid-staking venue extension)',
    chains: [MERIDIAN_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'NATIVE_STAKE_COMPOUNDING',
      benchmarkBaseline: true,
      description:
        'The native stake compounding of the venue over its validator pool (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: MERIDIAN_PROTOCOL,
  implementation: {
    implementationId: 'impl:meridian-lending:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:meridian-lending',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:meridian-lending',
    implementationNotes:
      'Lending/staking extension pack (liquid staking with delayed unbonding and disclosed slashing exposure).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:meridian-lending',
    },
    protocolKey: MERIDIAN_PROTOCOL_KEY,
    chainKey: MERIDIAN_CHAIN_KEY,
  },
  familyExtension: {
    family: 'lending-staking',
    positionKind: 'LIQUID_STAKING',
    collateralModel: 'NONE',
    rateModel: 'VARIABLE',
    rateVariability: 'DETERMINISTIC_FORMULA',
    rewardStreams: ['staked-eth-consensus-yield', 'staked-eth-execution-yield'],
    unbondingModel: 'DELAYED',
    unbondingDelayDescription:
      'unstake requests enter the batched exit queue and settle after the declared exit delay (modelled: batched exits)',
    slashingConditions: [
      'validator slashing on the underlying staking pool is disclosed and borne by the pool (modelled)',
    ],
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
      constraintId: 'rates-are-declarations',
      kind: 'LIMITATION',
      description:
        'Rate and yield declarations describe the venue surface; live rates are observations owned by the provider/observation lanes, never this pack.',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/meridian-lending.ts',
    contentDigest: 'fnv1a64:2b81ca10c1486dca',
  },
};

/**
 * The liquid-staking extension pack: validated (fail closed) and
 * deep-frozen on every call — the declarative-law constructor.
 */
export function meridianLendingPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(MERIDIAN_PACK_DATA);
}
