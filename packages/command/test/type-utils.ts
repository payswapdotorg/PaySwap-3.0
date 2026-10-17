/** Type-level test helpers (ported pattern from the old repository). */
export type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends
  <T>() => T extends Right ? 1 : 2
  ? true
  : false;
export type Expect<T extends true> = T;
