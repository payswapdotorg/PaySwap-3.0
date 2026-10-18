/**
 * @payswap/onchain-extensions/packs/lockport-bridge — a BRIDGE extension
 * pack (NET-NEW family surface; Work Order P5-W2, lane R3-W2).
 *
 * The bridge family vocabulary is new in PaySwap 3.0 (the old repo
 * modelled DEX/aggregator/intent venues only — MMP-23): this pack seeds it
 * with a LOCK_AND_MINT corridor model (synthetic deployment — a
 * canonical-bridge-STYLE shape, no claim about any specific real venue):
 * escrow on the source chain, mint on the destination, light-client
 * message verification, refunds before confirmation.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic)
// ---------------------------------------------------------------------------

export const LOCKPORT_PROTOCOL_KEY = 'lockport-bridge' as const;
export const LOCKPORT_CHAIN_KEY = 'ethereum:mainnet' as const;
export const LOCKPORT_VENUE_KEY = 'lockport-bridge' as const;
export const LOCKPORT_VERSION = '1.0.0' as const;
/** Synthetic escrow vault contract on Ethereum mainnet (model deployment). */
export const LOCKPORT_ESCROW_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '0x10cK00000000000000000000000000000000C0DE' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const LOCKPORT_ESCROW_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: LOCKPORT_CHAIN_KEY,
    contractAddress: LOCKPORT_ESCROW_ADDRESS,
    sourceHash: 'sha256:lockport-escrow-declared-source',
    bytecodeHash: 'sha256:lockport-escrow-deployed-bytecode',
    upgradeAuthority: {
      kind: 'MULTISIG',
      description: 'bridge council multisig with a 7d timelock',
      delayOrTimelock: '7d timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'bridge council multisig (validator-set updates only, never fund custody)',
    },
    pausePowers: [
      {
        actor: 'bridge-council-multisig',
        scope: 'new deposits (in-flight and minted transfers are final)',
      },
    ],
    oracleDependencies: [],
    custody: {
      custodial: true,
      custodianRef: 'lockport-escrow-vault (contract-held; no operator key can move locked funds)',
      withdrawalAuthority:
        'depositors reclaim unconfirmed transfers through the declared refund path',
      keyManagement: 'no operator keys; the vault logic alone moves locked funds',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const LOCKPORT_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: LOCKPORT_PROTOCOL_KEY,
  displayName: 'Lockport Bridge (modelled)',
  protocolClass: 'BRIDGE',
  chainKey: LOCKPORT_CHAIN_KEY,
  smartContracts: [LOCKPORT_ESCROW_DECLARATION],
});

const LOCKPORT_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/bridge/${LOCKPORT_VENUE_KEY}@${LOCKPORT_VERSION}`,
  family: 'bridge',
  version: LOCKPORT_VERSION,
  venueSurface: {
    venueKey: LOCKPORT_VENUE_KEY,
    displayName: 'Lockport bridge (lock-and-mint corridor venue extension)',
    chains: [LOCKPORT_CHAIN_KEY, 'solana:mainnet-beta', 'polygon:mainnet'],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'DIRECT_CORRIDOR_ROUTING',
      benchmarkBaseline: true,
      description:
        'The direct corridor routing of the venue across its declared lock-and-mint corridors (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: LOCKPORT_PROTOCOL,
  implementation: {
    implementationId: 'impl:lockport-bridge:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:lockport-bridge',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:lockport-bridge',
    implementationNotes:
      'Bridge extension pack (lock-and-mint corridors with light-client message verification).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:lockport-bridge',
    },
    protocolKey: LOCKPORT_PROTOCOL_KEY,
    chainKey: LOCKPORT_CHAIN_KEY,
  },
  familyExtension: {
    family: 'bridge',
    bridgeModel: 'LOCK_AND_MINT',
    supportedCorridors: [
      {
        sourceChain: LOCKPORT_CHAIN_KEY,
        destinationChain: 'solana:mainnet-beta',
        assetRef: 'ethereum:mainnet/asset:USC',
        direction: 'TWO_WAY',
      },
      {
        sourceChain: LOCKPORT_CHAIN_KEY,
        destinationChain: 'polygon:mainnet',
        direction: 'ONE_WAY',
      },
    ],
    destinationFinalityRequirement: 'BOTH',
    reorgHandling: 'WAIT_FOR_FINALITY',
    messageVerification: 'LIGHT_CLIENT',
    refundModel: 'REFUNDABLE_PRE_CONFIRMATION',
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
      constraintId: 'source-finality-before-mint',
      kind: 'ASSUMPTION',
      description:
        'Minting on the destination waits for declared source finality — a reorged source deposit never mints.',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/lockport-bridge.ts',
    contentDigest: 'fnv1a64:7a2c84b2031ac542',
  },
};

/**
 * The lock-and-mint bridge extension pack: validated (fail closed) and
 * deep-frozen on every call — the declarative-law constructor.
 */
export function lockportBridgePack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(LOCKPORT_PACK_DATA);
}
