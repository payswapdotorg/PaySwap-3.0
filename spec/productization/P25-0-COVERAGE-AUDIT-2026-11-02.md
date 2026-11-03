# P25-0 COVERAGE AUDIT — "Everything Stripe can do, through PaySwap" (2026-11-02)

**Wave:** P25 · **Owner:** resident TL · **Trigger:** the operator's order — *"do an in depth audit to make sure everything that can be done in stripe can be done through payswap once the user connects his stripe account; research ways to fill in the gaps emerged by the audit; write a report on the whole thing; implement all the suggestions from the audit."*

**Status:** audit complete; the implementation (P25-A) lands in the same session per the order.

---

## Base

- **Ground truth for "everything that can be done in Stripe":** the pinned public GA OpenAPI catalogue — release `v2596` (commit `aab1dee`), spec `2026-09-30.endive`, **454 paths / 644 operations (612 v1 + 32 v2), 149 resource families, Packs A–K** — SHA-256-pinned and committed in-repo (`spec-pin.ts`; regeneration byte-identical, test-enforced). Anything Stripe ships AFTER this pin is out of scope until a reviewed re-pin (ADR-0017 D2).
- **The audited product surface:** the P24 conversational connector — census facts → D9 tool registry (5 pinned discovery/action tools + intent-filtered domain read tools) → the read member (`stripeExecuteRead`) and the frozen two-phase action contract (`stripePrepareAction` → human confirm → `stripeExecuteAction`) over the sealed dispatch transport.
- **Method:** every count in this report is computed from the committed artifacts (`operations.json` × the overlay rule engine), cross-checked against the test battery's own assertions. No number is asserted from memory.

## The headline finding

**Today, 46 of 644 operations are dispatchable (7.1%).** The connector's plumbing is generic over the whole catalogue — the schema validator, the dispatch transport, the two-phase executor, the RAK eligibility check and the idempotency classifier are all operationId-parametric — but the P24 overlay deliberately gates a **reviewed 74-operation initial-release surface** (46 IMPLEMENTED + 28 PLANNED). The remaining 570 operations resolve to honest non-dispatchable states:

| Support state today | Count |
| --- | --- |
| IMPLEMENTED (dispatchable) | **46** |
| PLANNED_P24_INITIAL_RELEASE | 28 |
| ACCOUNT_GATED (treasury/issuing/terminal/sigma/climate/identity/financial-connections) | 122 |
| SANDBOX_TEST_HELPER_ONLY (test_helpers/*) | 41 |
| NOT_SUPPORTED_WITH_REASON (the default) | 407 |

By capability: all 285 READ_ONLY operations exist in the catalogue, but only 24 reads are dispatchable; **zero of 32 v2 operations** dispatch; of 359 state-changing operations, 22 dispatch. **The honest answer to the operator's question is NO** — a connected user today can read customers/products/payments/invoices/disputes and run the curated payment/catalog/billing lifecycle, but cannot list issuing cards, search radar early-fraud warnings, manage tax registrations, walk v2 core events, or run 400+ other catalogue operations through PaySwap.

## The capability audit (beyond the operation count)

Five planes were audited; four have gaps:

1. **Discovery (D9)** — SOUND. The five pinned tools (`discover_capabilities`, `search_operations`, `describe_operation`, `prepare_action`, `request_tools`) are census-driven and already surface all 644 facts; the intent filter + caps (10 domain / 24 total) exist precisely so a bigger dispatchable surface cannot flood the model context. No universal `stripe.request` escape hatch exists (battery-asserted) — correct by law.
2. **Read plane** — PLUMBED FOR ALL, GATED TO 24. `stripeExecuteRead` enforces READ_ONLY + dispatchable + RAK + seal; any read flips on with no code change.
3. **Write plane** — PLUMBED FOR ALL, GATED TO 22. The two-phase contract (digest-bound prepare, host-resolved principal, single-use authorize, tier re-check at execute, INV-04 UNKNOWN) is operationId-parametric.
4. **Events/webhooks (D12)** — the host receiving plane exists (signature verification, durable inbox, digest-bound destinations, sealed `whsec_` broker). Raw webhook-endpoint MANAGEMENT operations are deliberately NOT exposed (see G4).
5. **Connection plane** — OPERATOR_GATED as recorded at P24-D: the composition tier is test-proven; real Sandbox credentials + live substrate runtime + Electron CDP receipts remain the standing operator actions. The credential gate refuses `pk_`, `sk_live_`, `rk_live_` (INV-25/D14): **the entire plane is Sandbox-only today by law** — live keys are a separate future ADR.

## The gap register

| # | Gap | Severity | The fill (researched, chosen) |
| --- | --- | --- | --- |
| G1 | **Read coverage**: 261 of 285 reads non-dispatchable | Critical | The P25 rule flip: every READ_ONLY operation becomes dispatchable (IMPLEMENTED; IMPLEMENTED_WITH_LIMITS on account-gated families). Zero per-op code — the validator/transport are generic. |
| G2 | **Write coverage**: 337 of 359 writes non-dispatchable | Critical | Same rule flip; every non-credential-admin write rides the EXISTING two-phase contract with its rule-derived tier (CONFIRM / STRONG_CONFIRM). No parallel engine, no shortcut. |
| G3 | **v2 API**: 0 of 32 dispatchable | High | Included in the flip. The v2 JSON serializer, page-token pagination and `V2_IDENTIFIER_OR_READ_BACK_ONLY` idempotency class already exist and are tested. |
| G4 | **Credential-admin operations** (13 held — see the deep-dive below) | Held by law | **Not a gap to fill — a boundary to keep.** `apps/secrets` + `webhook_endpoints` + ephemeral keys + customer-session/connection-token surfaces carry credential-class material in responses (the secrets-never-enter-chat law; webhook destinations are already managed by the D12 host plane with sealed storage); `account_links`/`account_sessions` are REAUTH-tier and no re-authentication flow exists — dispatching them on a card click would be a lie in the tier's name. All thirteen stay `NOT_SUPPORTED_WITH_REASON`, reasons recorded here and in the census. |
| G5 | **File upload** (`PostFiles`, the catalogue's ONLY multipart operation) | Medium | Implement multipart/form-data serialization in the transport (new `transport/multipart.ts`): the `file` parameter travels as a base64 string (digest-bound like every parameter), decoded to a binary part at the wire edge; other fields serialize as form parts (strings raw, composites as JSON). State: `IMPLEMENTED_WITH_LIMITS` — the validator's 100k-char parameter bound caps files at ~75 KB binary; larger artifacts belong to a future attachment plane, not chat parameters. |
| G6 | **Read-back routes**: 18 reviewed routes cover the 22 implemented writes; 337 new writes need verification routes | Critical (for G2) | Rule-derived read-back resolution (new `catalogue/read-back-routes.ts`): same-path GET (updates/deletes) → object GET at `path/{id}` (creates) → parent-object GET (sub-actions) → explicit reviewed `null` for one-shot surfaces. The reviewed P24 table overrides the rule where they diverge; the totality battery asserts every dispatchable write resolves a dispatchable read-back or a reviewed null. |
| G7 | **The battery cannot scale by hand**: the family battery's 46 hand-written happy/error cases cannot grow to 638 | Critical (for G1–G3) | A **generated totality battery** (new test): for EVERY dispatchable operation, synthesize minimal valid parameters from the committed schema records (enum→first value, integer→minimum, object→required properties, union→first viable variant), assert strict validation passes, assert the fake-transport wire (method/path/query/body split/idempotency header), and assert the error path (unknown parameter → INVALID_PARAMETERS). Deterministic, no network, no per-op hand work. |
| G8 | **Dead support-state vocabulary**: `IMPLEMENTED_WITH_LIMITS` had no producer; `SANDBOX_TEST_HELPER_ONLY`/`ACCOUNT_GATED` were permanent non-dispatchable states | Medium | P25 gives `IMPLEMENTED_WITH_LIMITS` three honest producers: account-gated families (Stripe rejects if the product is not enabled on the account), test helpers (test-mode only), and `PostFiles` (the parameter-size bound). `SANDBOX_TEST_HELPER_ONLY`/`ACCOUNT_GATED`/`OPERATOR_CONFIG_REQUIRED`/`MANUAL_PROVIDER_UI_ONLY`/`DEPRECATED_OR_REMOVED` remain reserved vocabulary with no producer — recorded, not silently deleted. |
| G9 | **Intent filter blind to short families**: the ≥4-char token/segment rule can never match `tax` | Low | Lower the threshold to ≥3 characters (both tokenizer and family segments). `tax`, `core`, `apps` become intent-matchable. |
| G10 | **Wording drift**: the discovery note says "only IMPLEMENTED operations are dispatchable" while the registry admits both IMPLEMENTED states | Low | Fix the string. |
| G11 | **Cursor pagination**: `paginateList` exists (v1 cursor + v2 page-token, budget 10 pages) but is unwired in production | Low — complete already | **Keep model-driven paging** (the read tool exposes `limit`/`starting_after`; the model walks pages across turns — everything IS reachable). Auto-pagination is a UX follow-up, not a coverage gap. Recorded, deliberately not taken. |
| G12 | **Wire-version split**: production dispatches carry `Stripe-Version: 2025-08-27.basil` while the catalogue pins `2026-09-30.endive` shapes | Recorded boundary | Unchanged by design (ADR-0017 D2): the migration is a separate tested work item — flipping the request version changes wire semantics account-wide and must not ride a coverage wave. The audit records the split as the named follow-up with its risk attached. |

## The P25 surface law (the implemented decision)

```
dispatchableP25(op) = every catalogue operation EXCEPT the thirteen held
  (the credential-admin family set + the secrets-law path prefix + the
  reviewed secrets-in-response holds)

support state:
  held (13)                             → NOT_SUPPORTED_WITH_REASON   (G4 + the deep-dive)
  family test_helpers/*                 → IMPLEMENTED_WITH_LIMITS     (test-mode only)
  family in ACCOUNT_GATED_FAMILIES      → IMPLEMENTED_WITH_LIMITS     (account entitlement)
  PostFiles (reviewed override)         → IMPLEMENTED_WITH_LIMITS     (param-size bound, G5)
  otherwise                             → IMPLEMENTED
```

**THE AUDIT'S DEEP-DIVE CATCHES (found while filling G4 — live bugs, fixed at source):**

1. **The create-secret escape (pre-existing, P24-0):** `PostAppsSecrets` — whose response carries the stored secret payload — silently ESCAPED the credential-admin family rule, because `/v1/apps/secrets` (a 3-segment path) derives resource family `apps`, while the `apps/secrets` family-table entry only ever matched 4-segment paths like `/v1/apps/secrets/delete`. Fix: a `SECRETS_LAW_PATH_PREFIXES` path-prefix check ahead of the family table. Had the P25 flip shipped without the audit, the create-secret operation would have dispatched at mere CONFIRM tier.
2. **Five more secrets-in-response surfaces** the family rule never saw: `PostEphemeralKeys` / `DeleteEphemeralKeysKey` (the `ek_` secret rides create AND delete responses), `PostCustomerSessions` (single-use client secret), `PostTerminalConnectionTokens` (short-lived SDK connection token), `GetAppsSecretsFind` (a GET that REVEALS the stored payload — held by reviewed override so the structural GET→READ_ONLY invariant stays intact), and `PostV2CoreAccountLinks` (the v2 twin of the held v1 `PostAccountLinks` — same REAUTH semantics, missed by the family table because the v2 path geometry derives family `core`). All held, fail-closed.
3. **The under-classified money-mover:** `PostTerminalRefunds` (POST `/v1/terminal/refunds` — a REAL refund) classified as STRIPE_CONFIGURATION_WRITE (CONFIRM tier) because the family table keys `terminal` (not `refunds`) and the irreversible-path regex matched only the singular `/refund`. Fix: the regex now matches `/refunds` — the operation is FINANCIAL_IRREVERSIBLE_OR_REVERSAL at STRONG_CONFIRM (one further path-end refund create was reclassified with it).

**Ledger after the flip (computed from the artifacts):**

| | Count |
| --- | --- |
| Dispatchable | **631 / 644 (98.0%)** |
| — IMPLEMENTED | 468 |
| — IMPLEMENTED_WITH_LIMITS | 163 (122 account-gated + 41 test helpers + 1 file upload — PostTerminalConnectionTokens moved from this bucket to held) |
| Held with reason | 13 (2.0% — G4 + the deep-dive) |
| Reads dispatchable | 284 / 285 (the reveal GET is held) |
| Writes dispatchable | 347 / 359 |
| v2 dispatchable | 31 / 32 (the v2 account-links twin is held) |

Every dispatchable write keeps its rule-derived approval tier: 235 STRIPE_CONFIGURATION_WRITE (CONFIRM) · 76 FINANCIAL_IRREVERSIBLE_OR_REVERSAL (STRONG_CONFIRM) · 40 FINANCIAL_CREATE (STRONG_CONFIRM) · 1 CUSTOMER_COMMUNICATION (CONFIRM). The conversational-confirmation gate still refuses STRONG_CONFIRM/REAUTH in chat (card-only). The RAK still filters every dispatch against the connection's granted permission rules — **the catalogue no longer artificially restricts; the account's own scopes and entitlements decide.**

## The honest boundaries (unchanged by the flip, restated)

1. **Sandbox-only by law** — live keys refused (INV-25/D14); the live tier is a separate operator ADR.
2. **The real tiers stay OPERATOR_GATED** — real Sandbox credentials, the live substrate runtime, Electron CDP receipts. The P25 proof is the composition tier: the generated battery over the fake transport + the existing composition battery.
3. **RAK scope filtering** — a connection granting only `customers: Read` still cannot read invoices; that is the connection's own grant, not a PaySwap restriction.
4. **Account entitlement** — treasury/issuing/terminal/… operations dispatch but Stripe rejects them if the account lacks the product; the state says so upfront (`IMPLEMENTED_WITH_LIMITS`).
5. **The pin boundary** — operations Stripe ships after `v2596` do not exist for PaySwap until a reviewed re-pin.
6. **File size** — base64 parameters ≤100k chars (~75 KB binary) today; the attachment plane is future work.
7. **The thirteen holds** — a connected user cannot create/reveal app secrets, register raw webhook endpoints (the D12 host destination plane owns that), mint ephemeral keys, or open account-links/onboarding sessions through chat. Each hold is a recorded decision with its reason, not an omission.

## Verification plan (the gates)

- provider-runtime: tsc 0 + the full vitest battery INCLUDING the new generated totality battery (every dispatchable op: synthesized happy path + strict error path + wire assertions + read-back resolution).
- desktop: the three scoped tsc gates 0/0/0 · architecture 0/0/0 · oxlint 0 new errors · the desktop battery (composition battery, prepared-action batteries, wiring over the full dispatchable set).
- payswap-app: the registry/output/pins batteries.
- The P24 hand family battery stays green for the historical 46 (the money-mover classifications are unchanged).

## Follow-ups (recorded, not silently dropped)

- The live-tier ADR (live keys, `MANUAL_PROVIDER_UI_ONLY`/`DEPRECATED_OR_REMOVED` producers for the live surface).
- The re-authentication flow that would let `account_links`/`account_sessions`/`PostV2CoreAccountLinks` dispatch at a true REAUTH tier.
- The attachment plane for large binary artifacts (beyond the 75 KB parameter bound).
- The `2025-08-27.basil → 2026-09-30.endive` request-version migration runbook (G12).
- Auto-pagination over `paginateList` as a UX enhancement (G11).
- A response-surface secrets review for the whole dispatchable set (the deep-dive held the credential-class responses it found; a systematic sweep of every operation's RESPONSE schema for secret-shaped fields would harden the class further).

---

## CORRECTION APPENDIX (appended at P26-0, 2026-11-03 — the takeover audit)

The incoming TL's verification against the committed artifacts found two arithmetic drifts in this document's prose. Neither changes any decision, held operation, or code artifact — the census battery's asserted counts (631 dispatchable · 468 IMPLEMENTED · 163 IMPLEMENTED_WITH_LIMITS · 13 held · 284 reads · 31 v2) were always correct. The drifted numbers are corrected here so the record never misleads:

1. **"122 ACCOUNT_GATED" (§ the ledger table's decomposition, and § honest boundaries #4's context)** — the in-tree count of account-gated operations dispatching as IMPLEMENTED_WITH_LIMITS is **121** after the PostTerminalConnectionTokens move to held (the ledger line "163 = 122 account-gated + 41 test helpers + 1 file upload" double-counted the move: the correct decomposition is **163 = 121 + 41 + 1**). The family TABLE itself (`ACCOUNT_GATED_FAMILIES`, 40 families) is unchanged; the drift is only in this document's arithmetic.

2. **The approval-tier ledger ("235 STRIPE_CONFIGURATION_WRITE (CONFIRM) · 76 FINANCIAL_IRREVERSIBLE_OR_REVERSAL (STRONG_CONFIRM) · 40 FINANCIAL_CREATE (STRONG_CONFIRM) · 1 CUSTOMER_COMMUNICATION (CONFIRM)")** — those four numbers sum to 352, but the dispatchable-write total is 347. Recomputed from operations.json × overlay at 2d18a42, the true tier ledger of the 347 dispatchable writes is **231 STRIPE_CONFIGURATION_WRITE · 75 FINANCIAL_IRREVERSIBLE_OR_REVERSAL · 40 FINANCIAL_CREATE · 1 CUSTOMER_COMMUNICATION = 347** (the table apparently included five of the override-held writes). On the wire this is **232 CONFIRM-tier · 115 STRONG_CONFIRM-tier**.

**The anti-drift law (landed with P26-A):** the census battery now asserts the per-tier counts, so neither ledger can drift from the artifacts silently again.
