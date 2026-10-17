/**
 * @payswap/onchain-security — internal seam between the secrets scan
 * (secrets.ts) and the secrets policy (secrets-policy.ts). Not exported
 * from the package barrel; the vocabulary helpers are shape-detection
 * internals shared by both halves of the secret-boundary kernel.
 */

export { isForbiddenKeyNameLocal, isDerivedIdentifierKeyLocal } from "./secrets.ts";
