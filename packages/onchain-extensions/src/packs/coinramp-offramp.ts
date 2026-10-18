/**
 * @payswap/onchain-extensions/packs/coinramp-offramp — an OFF-RAMP
 * extension pack (NET-NEW family surface; Work Order P5-W2, lane R3-W2).
 *
 * The off-ramp family vocabulary is new in PaySwap 3.0 (MMP-23): the
 * conversion of onchain assets into fiat payout through a declared
 * settlement-rail handoff. SYNTHETIC model deployment (a
 * ramp-provider-STYLE shape — no claim about any specific real venue).
 *
 * The declarative law is sharpest here: the fiat leg is a DECLARED RAIL
 * REFERENCE (settlementRailHandoff) — the pack never models the fiat rail
 * itself, never executes a payout and never carries KYC state; the payout
 * methods, jurisdictions and KYC requirement are surface declarations the
 * capability fabric and compliance lanes consume.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic)
// ---------------------------------------------------------------------------

export const COINRAMP_PROTOCOL_KEY = 'coinramp-offramp' as const;
export const COINRAMP_CHAIN_KEY = 'ethereum:mainnet' as const;
export const COINRAMP_VENUE_KEY = 'coinramp-offramp' as const;
export const COINRAMP_VERSION = '1.0.0' as const;
/** Synthetic onramp settlement contract (model deployment). */
export const COINRAMP_SETTLEMENT_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '0xFa8e7000000000000000000000000000000CA5H' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const COINRAMP_SETTLEMENT_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: COINRAMP_CHAIN_KEY,
    contractAddress: COINRAMP_SETTLEMENT_ADDRESS,
    sourceHash: 'sha256:coinramp-settlement-declared-source',
    bytecodeHash: 'sha256:coinramp-settlement-deployed-bytecode',
    upgradeAuthority: {
      kind: 'PROVIDER_GOVERNED',
      description: 'ramp operator governance with a 72h timelock',
      delayOrTimelock: '72h timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'ramp operator multisig (fee and quote-parameter configuration only)',
    },
    pausePowers: [
      {
        actor: 'ramp-operator-multisig',
        scope: 'new off-ramp orders (in-flight payouts continue on the fiat rail)',
      },
    ],
    oracleDependencies: [
      {
        oracleRef: 'oracle:fiat-quote-feed',
        usage: 'indicative fiat conversion rates for expiring quotes',
      },
    ],
    custody: {
      custodial: true,
      custodianRef: 'coinramp settlement vault (contract-held until fiat payout confirmation)',
      withdrawalAuthority:
        'users reclaim unfulfilled off-ramp orders after declared expiry through the refund path',
      keyManagement: 'no operator keys; the settlement logic alone moves vaulted funds',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const COINRAMP_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: COINRAMP_PROTOCOL_KEY,
  displayName: 'CoinRamp Off-ramp (modelled)',
  protocolClass: 'OTHER',
  chainKey: COINRAMP_CHAIN_KEY,
  smartContracts: [COINRAMP_SETTLEMENT_DECLARATION],
});

const COINRAMP_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/off-ramp/${COINRAMP_VENUE_KEY}@${COINRAMP_VERSION}`,
  family: 'off-ramp',
  version: COINRAMP_VERSION,
  venueSurface: {
    venueKey: COINRAMP_VENUE_KEY,
    displayName: 'CoinRamp off-ramp (onchain-to-fiat handoff venue extension)',
    chains: [COINRAMP_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'DIRECT_FIAT_HANDOFF',
      benchmarkBaseline: true,
      description:
        'The direct fiat handoff of the venue through its declared settlement rail (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: COINRAMP_PROTOCOL,
  implementation: {
    implementationId: 'impl:coinramp-offramp:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:coinramp-offramp',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:coinramp-offramp',
    implementationNotes:
      'Off-ramp extension pack (onchain assets handed off to declared fiat payout rails).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:coinramp-offramp',
    },
    protocolKey: COINRAMP_PROTOCOL_KEY,
    chainKey: COINRAMP_CHAIN_KEY,
  },
  familyExtension: {
    family: 'off-ramp',
    payoutHandoffModel: 'CUSTODIAL_SETTLEMENT',
    supportedPayoutMethods: ['SEPA', 'WIRE', 'ACH'],
    supportedJurisdictions: ['US', 'DE', 'FR', 'SG'],
    kycRequirement: 'REQUIRED',
    quoteValidityModel: 'EXPIRING_QUOTE',
    settlementRailHandoff: 'fiat-rail:sepa-wire-ach',
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
      constraintId: 'fiat-leg-is-a-rail-reference',
      kind: 'LIMITATION',
      description:
        'The fiat payout leg is a declared rail reference — this pack never models, executes or verifies the fiat rail itself.',
      authorityCarrier: false,
    },
    {
      constraintId: 'kyc-is-a-requirement-declaration',
      kind: 'OPERATIONAL_REQUIREMENT',
      description:
        'KYC is declared as required; KYC state and verification belong to the compliance lane, never to the pack.',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/coinramp-offramp.ts',
    contentDigest: 'fnv1a64:244383c51c8562be',
  },
};

/**
 * The off-ramp extension pack: validated (fail closed) and deep-frozen on
 * every call — the declarative-law constructor.
 */
export function coinrampOffRampPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(COINRAMP_PACK_DATA);
}
