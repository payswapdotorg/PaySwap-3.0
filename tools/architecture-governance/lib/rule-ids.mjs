// rule-ids.mjs — the single registry of rule ids the ownership validator
// implements (P0-W2). Exported so the invariant lint can verify that every
// "ownership:<rule-id>" automation reference in invariants.json is backed by
// a real implemented check. Keep in sync with lib/engine.mjs.

export const AVAILABLE_RULES = [
  "R1-unmapped-package",
  "R2-must-not-depend-on",
  "R3-not-in-may-depend-on",
  "R4-cycle",
  "R5-deep-import",
  "R6-cross-package-relative",
  "R7-contracts-framework-import",
];
