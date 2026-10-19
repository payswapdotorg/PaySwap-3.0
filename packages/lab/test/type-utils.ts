/**
 * Compile-time assertion helpers. A failed Expect<...> is a tsc error, so
 * the type-level contract guarantees below are enforced by the typecheck
 * gate (the old W2-004 type-utils, carried forward).
 */
export type Expect<T extends true> = T;
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
// ---------------------------------------------------------------------------
// Usage law (why these helpers exist)
// ---------------------------------------------------------------------------
// A failed Expect<...> is a COMPILE error, not a runtime failure: the
// assertion types below are checked by `tsc --noEmit` on every battery
// run, so a contract regression cannot hide behind a passing test suite
// that never exercises the runtime path. Equal<X, Y> is the classic
// mutually-recursive-type identity trick (a type X equals Y exactly when
// the generic instantiation <T>() => T extends X ? 1 : 2 is mutually
// assignable with the same shape over Y); Expect<T extends true> forces
// the argument to be the literal true or the compile fails.
