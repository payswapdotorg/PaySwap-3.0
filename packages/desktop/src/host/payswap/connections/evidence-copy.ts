/**
 * PaySwap Desktop (P13-B) — the connection-plane EVIDENCE COPY (the
 * honest-state strings recorded on lifecycle transitions and rendered
 * by the UI). Split from ./session-authority.ts for the ≤400-line file
 * law. Every string is people language, escape-scanned before recording.
 */

export const EVIDENCE_SEEDED =
  "The setup task was seeded. Nothing is connected yet: a connection exists only after the verification probe records real provider evidence." as const;

export const EVIDENCE_SEALED =
  "The restricted test-mode key was sealed by the host credential broker. Verification is still required: the connection becomes ACTIVE only after the read-only probe (GET /v1/balance + GET /v1/account) answers through the real Stripe transport with this sealed key." as const;

export const EVIDENCE_PROBE_CONFIRMED =
  "The read-only verification probe CONFIRMED through the real Stripe transport with the sealed key" as const;

export const EVIDENCE_PROBE_UNKNOWN =
  "The probe outcome is UNKNOWN (timeout/lost connection/malformed answer) — it must be reconciled by re-running the read-only probe before any conclusion (INV-04)." as const;

export const EVIDENCE_PROBE_FAILED =
  "The probe FAILED (the provider answered with an error) — the evidence is recorded; the connection is not ACTIVE." as const;

export const EVIDENCE_REVOKED = (terminal: string) =>
  `Revocation requested: the sealed credential was deleted and the connection is ${terminal} (terminal).` as const;

export const EVIDENCE_RETURN_ERROR = (error: string) =>
  `The provider return carried an error (${error}). The setup is resumable; nothing was connected.` as const;
