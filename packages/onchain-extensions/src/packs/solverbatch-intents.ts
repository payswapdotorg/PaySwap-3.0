/**
 * @payswap/onchain-extensions/packs/solverbatch-intents — an INTENT/SOLVER
 * extension pack, made declarative (Work Order P5-W2, lane R3-W2;
 * PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-venues/src/intents/index.ts).
 *
 * Distinct family surface (intent-protocol, not dex): batch-auction
 * settlement with OPEN solver competition (a CoW-Protocol-STYLE model —
 * synthetic deployment, no claim about any specific real venue). The
 * auction LIMIT is the guaranteed minimum a settlement must meet or the
 * intent expires unexecuted (escrowed funds return to the owner; atomic,
 * no partial fills); solver competition can deliver surplus ABOVE the
 * limit, declared as RETURNED_TO_USER.
 *
 * The old pack's runtime quote/settlement-observation logic is NOT ported
 * — the quote-to-executed seam belongs to the best-execution and
 * observation lanes; this rebuild pins the intent venue capability
 * surface as versioned descriptor data only.
 */

import type { OnchainExtensionPack } from '../wire/core.ts';
import type { SmartContractDeclaration, ProtocolDescriptor } from '../pins/smart-contract.ts';
import { validateOnchainExtensionPack } from '../validation/core.ts';

// ---------------------------------------------------------------------------
// The modelled venue identity (synthetic)
// ---------------------------------------------------------------------------

export const INTENTS_PROTOCOL_KEY = 'solverbatch-intents' as const;
export const INTENTS_CHAIN_KEY = 'ethereum:mainnet' as const;
export const INTENTS_VENUE_KEY = 'solverbatch-intents' as const;
export const INTENTS_VERSION = '1.0.0' as const;
/** Synthetic batch-settlement contract (model deployment). */
export const INTENTS_SETTLEMENT_ADDRESS =
  // PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
  '0xBa7cH00000000000000000000000000000000F00D' as const;

// ---------------------------------------------------------------------------
// The canonical INV-SC01 declaration (SYNTHETIC model deployment)
// ---------------------------------------------------------------------------

export const INTENTS_SETTLEMENT_DECLARATION: Readonly<SmartContractDeclaration> =
  Object.freeze({
    kind: 'smart_contract_extension',
    chainRef: INTENTS_CHAIN_KEY,
    contractAddress: INTENTS_SETTLEMENT_ADDRESS,
    sourceHash: 'sha256:solverbatch-settlement-declared-source',
    bytecodeHash: 'sha256:solverbatch-settlement-deployed-bytecode',
    upgradeAuthority: {
      kind: 'MULTISIG',
      description: 'council multisig with a 48h timelock',
      delayOrTimelock: '48h timelock',
    },
    adminAuthority: {
      kind: 'MULTISIG',
      description: 'council multisig (solver-allowlist configuration only)',
    },
    pausePowers: [
      {
        actor: 'council-multisig',
        scope: 'new batch settlement (settled batches are final)',
      },
    ],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority:
        'intent owners withdraw unexecuted (expired) intents directly from the escrow vault',
      keyManagement: 'no operator keys can move escrowed intent funds',
    },
    searchableByLabAfterCertification: true,
  } satisfies SmartContractDeclaration);

// ---------------------------------------------------------------------------
// The declarative pack
// ---------------------------------------------------------------------------

const INTENTS_PROTOCOL: Readonly<ProtocolDescriptor> = Object.freeze({
  protocolKey: INTENTS_PROTOCOL_KEY,
  displayName: 'Solverbatch Intents (modelled)',
  protocolClass: 'INTENT_NETWORK',
  chainKey: INTENTS_CHAIN_KEY,
  smartContracts: [INTENTS_SETTLEMENT_DECLARATION],
});

const INTENTS_PACK_DATA: OnchainExtensionPack = {
  packId: `onchain-pack/intent-protocol/${INTENTS_VENUE_KEY}@${INTENTS_VERSION}`,
  family: 'intent-protocol',
  version: INTENTS_VERSION,
  venueSurface: {
    venueKey: INTENTS_VENUE_KEY,
    displayName: 'Solverbatch intents (intent/solver venue extension)',
    chains: [INTENTS_CHAIN_KEY],
    supportsSimulation: true,
    nativeOptimization: {
      optimizationKind: 'OPEN_SOLVER_COMPETITION',
      benchmarkBaseline: true,
      description:
        'The open solver competition of the venue over batch auctions (the incumbent baseline — INV-C08/rule 20)',
    },
  },
  protocol: INTENTS_PROTOCOL,
  implementation: {
    implementationId: 'impl:solverbatch-intents:payswap-onchain-extensions',
    capabilityId: 'capability:protocol:ethereum:mainnet:solverbatch-intents',
    providerName: 'payswap-onchain-extensions',
    providerVersion: '1.0.0',
    adapterRef: 'adapter:venue-extension-pack:solverbatch-intents',
    implementationNotes:
      'Intent/solver extension pack (batch-auction settlement with open solver competition).',
    knownDeviations: [],
    nativeOptimization: {
      representableAsCapability: true,
      capabilityId: 'capability:protocol:ethereum:mainnet:solverbatch-intents',
    },
    protocolKey: INTENTS_PROTOCOL_KEY,
    chainKey: INTENTS_CHAIN_KEY,
  },
  familyExtension: {
    family: 'intent-protocol',
    settlementModel: 'FULFILLER_SETTLED',
    solverCompetition: 'OPEN',
    supportedDomains: [INTENTS_CHAIN_KEY],
    escrowModel: 'ONCHAIN_ESCROW',
    batchCadence: 'BATCHED',
    surplusModel: 'RETURNED_TO_USER',
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
      constraintId: 'limit-is-guaranteed-minimum',
      kind: 'ASSUMPTION',
      description:
        'The auction limit is the guaranteed minimum: a settlement that cannot meet it leaves the intent expiring unexecuted, with escrowed funds returning to the owner (atomic, no partial fills).',
      authorityCarrier: false,
    },
    {
      constraintId: 'settlement-observation-required',
      kind: 'OPERATIONAL_REQUIREMENT',
      description:
        'The quote-to-executed transition requires a settlement observation — a quote is never an outcome.',
      authorityCarrier: false,
    },
  ],
  certification: {
    certificationRequired: true,
    statusCarried: false,
  },
  provenance: {
    declaredBy: 'P5-W2 venue registry seed (R3-W2 rebuild)',
    artifactRef: 'packages/onchain-extensions/src/packs/solverbatch-intents.ts',
    contentDigest: 'fnv1a64:b4f7b91959d0ed4f',
  },
};

/**
 * The intent/solver extension pack: validated (fail closed) and deep-frozen
 * on every call — the declarative-law constructor.
 */
export function solverbatchIntentsPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(INTENTS_PACK_DATA);
}
