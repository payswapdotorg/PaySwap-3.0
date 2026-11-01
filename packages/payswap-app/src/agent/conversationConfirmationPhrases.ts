/**
 * @payswap/app — the CONVERSATIONAL CONFIRMATION phrases (P24-3,
 * handoff §7.2).
 *
 * The DETERMINISTIC intake helper for the conversational half of the
 * two-phase action law: when a prepared action is pending, an EXACT
 * affirmative from the user ("yes", "do it", …) IS the human
 * confirmation for approval tiers NONE and CONFIRM, and an exact
 * negative is the refusal — decided by THIS pinned phrase table, never
 * by model interpretation (the model can never mint, route or forge a
 * confirmation; §13.4 "user clarification is a human event").
 *
 * LAWS:
 * - EXACT MATCH ONLY after normalization (lowercase, whitespace, and
 *   terminal punctuation stripped): "yes" confirms, "yes but change the
 *   amount" does NOT (it reaches the model, which can only prepare a
 *   NEW action).
 * - Strong tiers (STRONG_CONFIRM, REAUTH) NEVER confirm conversation-
 *   ally — the approval card / re-auth path is the only instrument.
 */

/** The pinned affirmative phrases (tiers NONE and CONFIRM only). */
export const CONVERSATION_CONFIRM_PHRASES: readonly string[] = Object.freeze([
  "yes",
  "y",
  "yes do it",
  "yes please do it",
  "yes please",
  "do it",
  "go ahead",
  "proceed",
  "confirm",
  "confirm it",
  "confirmed",
  "approve",
  "approved",
  "ok",
  "okay",
]);

/** The pinned refusal phrases (any tier). */
export const CONVERSATION_REFUSE_PHRASES: readonly string[] = Object.freeze([
  "no",
  "n",
  "nope",
  "do not",
  "dont do it",
  "do not do it",
  "don't do it",
  "refuse",
  "decline",
  "cancel it",
  "cancel the action",
  "stop",
]);

/** Normalize one line: lowercase, collapse whitespace, strip terminal punctuation (+ any whitespace it leaves). */
export function normalizeConfirmationText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What an exact-match line decides about the pending action. */
export type ConversationConfirmationDecision = "CONFIRM" | "REFUSE" | "NOT_A_DECISION";

/**
 * Match one user line against the pinned decision phrases (exact match
 * only — anything else is NOT_A_DECISION and reaches the model).
 */
export function matchConversationConfirmation(text: string): ConversationConfirmationDecision {
  const normalized = normalizeConfirmationText(text);
  if (CONVERSATION_CONFIRM_PHRASES.includes(normalized)) {
    return "CONFIRM";
  }
  if (CONVERSATION_REFUSE_PHRASES.includes(normalized)) {
    return "REFUSE";
  }
  return "NOT_A_DECISION";
}

/** May this approval tier be confirmed conversationally? (§7.2: low tiers only.) */
export function tierAllowsConversationalConfirmation(
  tier: string,
): boolean {
  return tier === "NONE" || tier === "CONFIRM";
}
