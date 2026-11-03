# ADR-0018 — P26: the re-authentication flow for the REAUTH tier (the held account-link/session operations)

- **Status:** PROPOSED → ACCEPTED (P26-0, the architecture gate — the P26-A lane implements against this ADR)
- **Date:** 2026-11-03
- **Deciders:** resident TL (the takeover station, P26-0)
- **Supersedes:** none. Extends ADR-0017 (D7 the approval tiers, D10 prepared actions, D13 the held-surface law) and the P25-0 audit's G4 decision. No frozen decision is amended.
- **Resolves:** the P25-0 follow-up "the re-authentication flow that would let `account_links`/`account_sessions`/`PostV2CoreAccountLinks` dispatch at a true REAUTH tier."

## Context

The P25 full-coverage flip left exactly thirteen operations held. Ten of them are the secrets-never-enter-chat law (app secrets, raw webhook endpoints, ephemeral keys, customer-session client secrets, terminal connection tokens, the secret-reveal GET) — permanent holds, not missing flows. The remaining three — **`PostAccountLinks`, `PostAccountSessions`, `PostV2CoreAccountLinks`** — are held for a different reason the audit named precisely: their effect class is `PERMISSION_OR_CREDENTIAL_ADMIN` (approval tier **REAUTH**), the tier vocabulary exists, the UI button label even exists ("Re-authenticate & confirm") — but **no re-authentication flow exists in the product**, so dispatching them on an ordinary card click would be a lie in the tier's name. These three operations' responses carry account onboarding URLs and Dashboard session objects (not credentials), which makes them genuinely useful to a connected user ("send my seller an onboarding link", "open a Dashboard session for my connected account") — the reason the operator's P26 order asks for a proper flow rather than a permanent hold.

The takeover's design constraint is the operator's own boundary: *"close the remaining user-facing gaps **without weakening the security model**."*

## The decisions

### D1 — What "re-authentication" means in this product: a fresh credential proof for the SAME account

A REAUTH-tier dispatch requires the human principal to prove, **at action time**, continued possession of the connection's credential material — a factor the model can never supply, echo, or synthesize. The flow: the operator re-submits the connection's secret key (or a fresh key for the same account) through the host security field (the U1 material-carrying seam, the ONE place material is ever accepted — never chat, never model context); the host verifies it with a **live read-only probe** (`GET /v1/account`) through the sealed transport; the probe must return the **same account id** as the connection's verified evidence (a key for a different account is `REAUTH_ACCOUNT_MISMATCH`, fail-closed). Live keys are refused at the same edge as always (INV-25). No second factor is invented, and none is needed: possession of the account's secret material IS the strongest factor this product holds for its operator.

### D2 — The re-auth proof: host-minted, digest-bound, single-use, short-lived, never exposed

A successful proof mints a **`StripeReauthenticationProof`** (host-side record): proof id (`stripe-reauth:<uuid>`), principal, connection id, verified account id, **a digest binding over the prepared-action digests it may authorize** (the proof is scoped to the pending action(s) that triggered it — never a blank check), issued-at, expiry (**10 minutes**, matching the authorization TTL law), and consumed-at (initially null). The proof never crosses to the renderer as a token: the renderer receives only the opaque proof reference for display, exactly as authorizations do (ADR-0017 D10 pattern). The model cannot mint, see, extend or replay a proof. Proofs are consumed **durably before dispatch** (the same crash-law as single-use authorizations: consumption precedes effect; a crash after consumption is UNKNOWN, never a replay).

### D3 — The executor gate: REAUTH tier requires an unconsumed, unexpired, digest-matching proof

`stripeAuthorizeAction` and the execute path grow one law: an action whose approval tier is `REAUTH` refuses with the typed `REAUTH_PROOF_REQUIRED` unless a valid proof exists — bound to the same principal + connection + this action's digest, unexpired, unconsumed. The tier re-check at execute (the existing law: tier may never increase after approval) additionally re-verifies the proof. A proof bound to different digests does not authorize (typed `REAUTH_DIGEST_MISMATCH`). This makes the REAUTH tier honest end-to-end: the button label "Re-authenticate & confirm" now names a real two-step act — prove, then confirm.

### D4 — The un-hold: exactly three operations, behind the flow

With the flow landed, `PostAccountLinks`, `PostAccountSessions` and `PostV2CoreAccountLinks` flip from `NOT_SUPPORTED_WITH_REASON` to dispatchable at their existing effect class (`PERMISSION_OR_CREDENTIAL_ADMIN`) and tier (`REAUTH`). The dispatchable ledger moves **631 → 634 of 644**; the held list **13 → 10**. The census battery is rewritten to assert the new ledger INCLUDING per-tier counts (the P25 audit's arithmetic drift — the takeover's D-3 defect — can never recur silently). The other ten holds are untouched: they are the secrets law, and this ADR does not amend it. `webhook_endpoints` stays host-plane-owned (ADR-0017 D12); `apps/secrets` and the reveal GET stay held forever or until a separate ADR.

### D5 — The UI surface: the re-auth step is a distinct act, never a chat reply

The pending-action card for a REAUTH-tier action renders the existing two-step affordance: "Re-authenticate & confirm" opens the secure re-auth field (the host security seam); on verified proof, the confirm act authorizes (consuming the proof at execute). The conversational-confirmation gate stays exactly as it is: `tierAllowsConversationalConfirmation` remains NONE/CONFIRM only — a chat reply never confirms a REAUTH-tier action (the pinned-phrase law unchanged). The prepared-action preview names the re-auth requirement in plain language so the user knows what confirming will ask of them.

### D6 — Evidence law

The lane's battery proves: proof lifecycle (mint/verify/consume/expiry), the account-mismatch refusal, the digest-scope refusal, the single-use law (replay refused), the executor gate (REAUTH action refuses without proof; authorizes and executes with one; tier re-check at execute), the census ledger (634/10 with the per-tier assertion), the UI law (the re-auth step surfaces; chat phrases still refuse), and the integration composition. The real-Sandbox tier (an actual proof against a real probe) rides the P26-B harness and is operator-gated on the key re-supply — the composition tier is the in-repo proof, honestly labeled.

## Work orders spawned (the dependency graph records the machine truth)

- **P26-A** (resident-TL): this ADR implemented end-to-end — the provider-runtime overlay/census flip, the desktop proof machinery + executor gate, the payswap-app surface, the batteries.

## Consequences

The connector's last "held for a missing flow" gap closes honestly: REAUTH stops being a vocabulary word and becomes a real gate. The security model is strictly STRENGTHENED (a new host-minted, digest-bound, single-use artifact class; a new typed refusal family), never weakened. A future live-mode ADR (ADR-0019's framework) inherits this pattern for any live-tier re-auth requirements. The three un-held operations remain subject to the RAK, the seal, the account-context re-resolution and every existing executor law — the flow adds a gate, it removes none.
