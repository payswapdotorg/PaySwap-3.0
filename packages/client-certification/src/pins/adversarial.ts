/**
 * @payswap/client-certification — pinned wire shapes of the adversarial
 * immune system (P8-W2, lane p8-w2; commit 1/4).
 *
 * Authority: @payswap/adversarial (P6-W3 rebuild of the old
 * payswap.org@8a735bf immune system, merged @ f9392a3). The client-
 * certification gate wall cites INV-21 (the adversarial immune plane
 * that can halt promotion) for its escalate-only severity vocabulary —
 * THREAT VOCABULARY ONLY, never duplicated machinery (the rebuilt
 * packages/adversarial owns the machinery; this pin mirrors the closed
 * vocabularies the certification report consumes).
 */

// ---------------------------------------------------------------------------
// Advisory severities (escalate-only ranking anchor)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/adversarial src/advisories.ts
 * `ADVISORY_SEVERITIES` (byte-identical closed vocabulary).
 */
export const PINNED_ADVISORY_SEVERITIES = Object.freeze([
  "low",
  "medium",
  "high",
  "critical",
] as const);

/** STRUCTURAL PIN — authority: @payswap/adversarial `AdvisorySeverity`. */
export type PinnedAdvisorySeverity = (typeof PINNED_ADVISORY_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Advisory actions (the halt vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/adversarial src/advisories.ts
 * `ADVISORY_ACTIONS` (byte-identical closed vocabulary). A client gate
 * failure carries the structural force of `quarantine`: it HALTS the
 * release and cannot be waived.
 */
export const PINNED_ADVISORY_ACTIONS = Object.freeze([
  "restrict",
  "quarantine",
  "retire",
] as const);

/** STRUCTURAL PIN — authority: @payswap/adversarial `AdvisoryAction`. */
export type PinnedAdvisoryAction = (typeof PINNED_ADVISORY_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Advisory statuses (remediation law anchor)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/adversarial src/advisories.ts
 * `AdvisoryStatus` (byte-identical). Only a CLOSED advisory — closed with
 * VERIFIED remediation in the owning package — can ever back a
 * remediation claim against a certification halt.
 */
export const PINNED_ADVISORY_STATUSES = Object.freeze([
  "active",
  "closed",
] as const);

/** STRUCTURAL PIN — authority: @payswap/adversarial `AdvisoryStatus`. */
export type PinnedAdvisoryStatus = (typeof PINNED_ADVISORY_STATUSES)[number];

/**
 * STRUCTURAL PIN — authority: the program INV-21 citation line (the
 * adversarial immune plane). The client-certification gate wall is the
 * CLIENT-SURFACE member of that plane: a failed gate is terminal for the
 * release attempt, and only a NEW attempt carrying verified remediation
 * evidence can ever certify the subject again.
 */
export const PINNED_INV_21_PROVENANCE =
  "INV-21: the adversarial immune plane (@payswap/adversarial) — client-surface member: the certification gate wall" as const;
