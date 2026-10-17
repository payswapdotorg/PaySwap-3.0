/**
 * Compile-time assertion helpers (ported from the accepted
 * packages/execution/test/type-utils.ts pattern, payswap.org@8a735bf).
 */

/** Asserts the type is exactly `true` (compile-time only). */
export type Expect<T extends true> = T;

/** Structural equality of two types (the classic deep-equal trick). */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
