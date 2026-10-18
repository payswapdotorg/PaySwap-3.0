import type { OnchainExtensionPack } from '../src/wire/core.ts';
import type { SmartContractDeclaration } from '../src/pins/smart-contract.ts';
import { packContentDigest } from '../src/addressing.ts';
import { validateOnchainExtensionPack } from '../src/validation/core.ts';

/**
 * Shared deterministic fixtures for the onchain-extensions tests (ADAPT of
 * payswap.org@8a735bf packages/onchain-venues/test/helpers.ts). All venue
 * state is SYNTHETIC (fixture descriptors — no credentials, no live
 * endpoints, no real chain claims). Builders produce packs that PASS the
 * full validator; individual tests then mutate specific fields to probe
 * the fail-closed laws. The digest is RE-DERIVED after every mutation so a
 * probe isolates exactly the structural law under test.
 */

export const CHAIN = 'ethereum:mainnet';
export const OTHER_CHAIN = 'solana:mainnet-beta';
/** A canonical fixture contract address (obviously synthetic). */
// PUBLIC: synthetic fixture address (obviously placeholder hex, never a secret).
export const FIXTURE_CONTRACT_ADDRESS = '0xF17E1100000000000000000000000000000F1X7' as const;

/** A synthetic INV-SC01 contract declaration (PORT of the old helper). */
export function syntheticDeclaration(
  contractAddress: string = FIXTURE_CONTRACT_ADDRESS,
  chainRef: string = CHAIN,
): SmartContractDeclaration {
  return {
    kind: 'smart_contract_extension',
    chainRef,
    contractAddress,
    sourceHash: 'sha256:synthetic',
    bytecodeHash: 'sha256:synthetic',
    upgradeAuthority: { kind: 'IMMUTABLE', description: 'synthetic immutable' },
    adminAuthority: { kind: 'IMMUTABLE', description: 'synthetic immutable' },
    pausePowers: [],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority: 'synthetic',
      keyManagement: 'synthetic',
    },
    searchableByLabAfterCertification: true,
  };
}

interface FixtureShape {
  readonly family: OnchainExtensionPack['family'];
  readonly familyExtension: OnchainExtensionPack['familyExtension'];
}

function basePack(shape: FixtureShape): OnchainExtensionPack {
  const packKey = `fixture-${shape.family}`;
  return {
    packId: `onchain-pack/${shape.family}/${packKey}@1.0.0`,
    family: shape.family,
    version: '1.0.0',
    venueSurface: {
      venueKey: packKey,
      displayName: `Fixture ${shape.family} venue`,
      chains: [CHAIN],
      supportsSimulation: true,
    },
    protocol: {
      protocolKey: `fixture-${shape.family}`,
      displayName: `Fixture ${shape.family} protocol`,
      protocolClass: protocolClassFor(shape.family),
      chainKey: CHAIN,
      smartContracts: [syntheticDeclaration()],
    },
    implementation: {
      implementationId: `impl:fixture-${shape.family}:payswap-onchain-extensions`,
      capabilityId: `capability:protocol:${CHAIN}:fixture-${shape.family}`,
      providerName: 'payswap-onchain-extensions',
      providerVersion: '1.0.0',
      adapterRef: `adapter:venue-extension-pack:fixture-${shape.family}`,
      implementationNotes: 'Synthetic fixture pack.',
      knownDeviations: [],
      nativeOptimization: {
        representableAsCapability: true,
        capabilityId: `capability:protocol:${CHAIN}:fixture-${shape.family}`,
      },
      protocolKey: `fixture-${shape.family}`,
      chainKey: CHAIN,
    },
    familyExtension: shape.familyExtension,
    subPacks: [],
    constraints: [
      {
        constraintId: 'certification-precondition',
        kind: 'PRECONDITION',
        description: 'The venue protocol is certified in the capability graph.',
        authorityCarrier: false,
      },
    ],
    certification: {
      certificationRequired: true,
      statusCarried: false,
    },
    provenance: {
      declaredBy: 'onchain-extensions test fixtures',
      artifactRef: 'packages/onchain-extensions/test/fixtures.ts',
      contentDigest: 'fnv1a64:0000000000000000',
    },
  } as OnchainExtensionPack;
}

function protocolClassFor(family: OnchainExtensionPack['family']): string {
  switch (family) {
    case 'dex':
      return 'DEX';
    case 'bridge':
      return 'BRIDGE';
    case 'off-ramp':
      return 'OTHER';
    case 'liquidity':
      return 'DEX';
    case 'lending-staking':
      return 'STAKING';
    case 'intent-protocol':
      return 'INTENT_NETWORK';
    default:
      return 'OTHER';
  }
}

/** A valid DEX fixture pack (AMM surface). */
export function fixtureDexPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'dex',
        familyExtension: {
          family: 'dex',
          dexKind: 'AMM',
          supportedSwapKinds: ['EXACT_INPUT'],
          supportedChains: [CHAIN],
          quoteSemantics: 'EXECUTABLE',
          slippageProtection: 'DECLARED_LIMIT',
          feeModel: 'EMBEDDED_POOL_FEE',
          supportsSimulation: true,
        },
      }),
    ),
  );
}

/** A valid bridge fixture pack. */
export function fixtureBridgePack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'bridge',
        familyExtension: {
          family: 'bridge',
          bridgeModel: 'LOCK_AND_MINT',
          supportedCorridors: [
            {
              sourceChain: CHAIN,
              destinationChain: OTHER_CHAIN,
              direction: 'TWO_WAY',
            },
          ],
          destinationFinalityRequirement: 'SOURCE_FINALITY',
          reorgHandling: 'WAIT_FOR_FINALITY',
          messageVerification: 'LIGHT_CLIENT',
          refundModel: 'REFUNDABLE_PRE_CONFIRMATION',
        },
      }),
    ),
  );
}

/** A valid off-ramp fixture pack. */
export function fixtureOffRampPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'off-ramp',
        familyExtension: {
          family: 'off-ramp',
          payoutHandoffModel: 'CUSTODIAL_SETTLEMENT',
          supportedPayoutMethods: ['SEPA'],
          supportedJurisdictions: ['US', 'DE'],
          kycRequirement: 'REQUIRED',
          quoteValidityModel: 'EXPIRING_QUOTE',
          settlementRailHandoff: 'fiat-rail:fixture',
        },
      }),
    ),
  );
}

/** A valid liquidity fixture pack. */
export function fixtureLiquidityPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'liquidity',
        familyExtension: {
          family: 'liquidity',
          liquidityModel: 'CONSTANT_PRODUCT_AMM',
          positionShapes: ['FULL_RANGE_POSITION'],
          feeTiersBasisPoints: [30],
          impermanentLossDisclosure: 'DISCLOSED',
          lockupModel: 'NO_LOCKUP',
        },
      }),
    ),
  );
}

/** A valid lending-staking fixture pack (liquid staking with slashing). */
export function fixtureLendingStakingPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'lending-staking',
        familyExtension: {
          family: 'lending-staking',
          positionKind: 'LIQUID_STAKING',
          collateralModel: 'NONE',
          rateModel: 'VARIABLE',
          rateVariability: 'DETERMINISTIC_FORMULA',
          rewardStreams: [],
          unbondingModel: 'INSTANT',
          slashingConditions: ['synthetic slashing exposure (declared)'],
        },
      }),
    ),
  );
}

/** A valid intent-protocol fixture pack. */
export function fixtureIntentPack(): OnchainExtensionPack {
  return validateOnchainExtensionPack(
    withDigest(
      basePack({
        family: 'intent-protocol',
        familyExtension: {
          family: 'intent-protocol',
          settlementModel: 'FULFILLER_SETTLED',
          solverCompetition: 'OPEN',
          supportedDomains: [CHAIN],
          escrowModel: 'ONCHAIN_ESCROW',
          batchCadence: 'BATCHED',
          surplusModel: 'RETURNED_TO_USER',
        },
      }),
    ),
  );
}

/** The fixture pack of each family, keyed by family. */
export function fixturePacks(): readonly OnchainExtensionPack[] {
  return [
    fixtureDexPack(),
    fixtureBridgePack(),
    fixtureOffRampPack(),
    fixtureLiquidityPack(),
    fixtureLendingStakingPack(),
    fixtureIntentPack(),
  ];
}

function withDigest<T extends { provenance: { contentDigest: string } }>(draft: T): T {
  draft.provenance = {
    ...draft.provenance,
    contentDigest: packContentDigest(draft as unknown as OnchainExtensionPack),
  };
  return draft;
}

/**
 * A top-level MUTABLE view of the pack for the fail-closed probes (test
 * infrastructure only — the shipped packs stay deeply readonly; probes
 * deliberately break vocabulary values, so the draft fields are `any`).
 */
export type PackDraft = { -readonly [K in keyof OnchainExtensionPack]: any };

/**
 * A mutated variant of a valid pack with the digest RE-DERIVED after the
 * mutation — the caller gets a candidate whose ONLY defect is the mutated
 * field (isolated fail-closed probes).
 */
export function variant(
  pack: OnchainExtensionPack,
  mutate: (draft: PackDraft) => void,
): unknown {
  const draft = structuredClone(pack) as unknown as PackDraft;
  mutate(draft);
  return withDigest(draft);
}

/**
 * A TAMPERED variant: mutated WITHOUT re-deriving the digest — exactly the
 * silent-mutation attack the provenance law detects.
 */
export function tampered(
  pack: OnchainExtensionPack,
  mutate: (draft: PackDraft) => void,
): unknown {
  const draft = structuredClone(pack) as unknown as PackDraft;
  mutate(draft);
  return draft;
}
