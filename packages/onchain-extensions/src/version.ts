/**
 * @payswap/onchain-extensions — package + contract vocabulary versions
 * (Work Order P5-W2, lane R3-W2).
 *
 * Every frozen vocabulary this package owns is versioned: the pack-family
 * vocabulary, the wire shapes and the addressing law. A vocabulary change is
 * a CONTRACT change and must bump the version here (the same law as the
 * accepted P1-P4 lanes).
 */

export const PACKAGE_NAME = '@payswap/onchain-extensions' as const;

/** Version of the pack-family vocabulary (the six families + semantics). */
export const PACK_FAMILY_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the pack wire shapes (core descriptor + family extensions). */
export const PACK_WIRE_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the canonical addressing law (pack/protocol/chain identities). */
export const PACK_ADDRESSING_CONTRACT_VERSION = '1.0.0' as const;

/** Version of the registry + composition contract (declarative only). */
export const PACK_REGISTRY_CONTRACT_VERSION = '1.0.0' as const;
