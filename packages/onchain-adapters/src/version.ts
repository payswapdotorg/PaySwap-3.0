/**
 * @payswap/onchain-adapters — package + contract vocabulary versions
 * (Work Order P4-W3, lane R2-W3).
 *
 * Every frozen vocabulary this package owns is versioned: the lifecycle
 * stage list, the environment classes, the error taxonomy codes and the
 * family semantics models. A vocabulary change is a CONTRACT change and
 * must bump the version here (the same law as the accepted P1/P2 lanes).
 */

export const PACKAGE_NAME = '@payswap/onchain-adapters' as const;

/** Version of the adapter lifecycle contract itself (the nine stages). */
export const ADAPTER_LIFECYCLE_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the structural environment/rail discriminator vocabulary. */
export const RAIL_ENVIRONMENT_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the family semantics vocabulary (fee/finality/reorg models). */
export const FAMILY_SEMANTICS_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the transport contract vocabulary (ports + result unions). */
export const TRANSPORT_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the error taxonomy (machine-readable codes). */
export const ERROR_TAXONOMY_VERSION = '1.0.0' as const;
