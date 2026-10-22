/**
 * @payswap/app — the agent task-session TRANSCRIPT GUARD (P13-A).
 *
 * The chat-law WRITER guard, split from ./taskSessionAdapter.ts for the
 * <=400-line file law: secret-shaped material (API keys, Bearer tokens,
 * private keys, webhook signing secrets) is REFUSED before it enters a
 * task transcript — summaries, goal statements and origin notes are all
 * scanned at the writer boundary.
 *
 * This is the app-boundary shape-level guard; the HOST writer's
 * escape-scan remains the authoritative discipline (ADR-0007 D4 — the
 * UX reference's chat law, adopted verbatim: no secret API keys, OAuth
 * tokens, webhook signing secrets, passwords, one-time codes, card
 * security codes, seed phrases or private keys ever enter chat
 * transcripts, model context, screenshots, logs, browser snapshots or
 * analytics).
 */

import { AgentTaskSessionError } from "./taskSessionPort.js";

/** The secret SHAPES refused at the writer (shape-level, not a secrecy proof). */
const SECRET_SHAPES: readonly RegExp[] = [
  /sk_live_[A-Za-z0-9]+/,
  /sk_test_[A-Za-z0-9]+/,
  /rk_live_[A-Za-z0-9]+/,
  /rk_test_[A-Za-z0-9]+/,
  /whsec_[A-Za-z0-9]+/,
  /bearer\s+[A-Za-z0-9._-]{16,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /0x[a-fA-F0-9]{40,}/,
];

/** Fail closed if the text carries a secret shape (the honest chat law). */
export function scanAgentTranscriptText(text: string): void {
  for (const shape of SECRET_SHAPES) {
    if (shape.test(text)) {
      throw new AgentTaskSessionError(
        "SECRET_SHAPED_INPUT",
        "This text looks like secret material (an API key, token or private key). Secrets never enter the composer transcript — credential entry happens through the host-side credential broker only, never in chat.",
      );
    }
  }
}
