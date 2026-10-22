# ADR-0007: P13 agent-led connector and payment architecture

- Status: ACCEPTED
- Date: 2026-10-22
- Author: Resident TL (P13-0, operator "go" on Issue #3)
- Deciders: resident TL (bounded architecture gate per work order P13-0)
- Evidence base: [P13-0 gap matrix](../../spec/productization/P13-0-GAP-MATRIX-2026-10-22.md)
  (source-backed, surveyed at `ab5b789`); UX authority
  [P13-AGENT-LED-UX-REFERENCE-2026-10-22.md](../../docs/productization-evidence/P13-AGENT-LED-UX-REFERENCE-2026-10-22.md)
  (target, NOT implementation evidence); implementation-state authority
  FEATURE-MAP.md / JOURNEY-MAP.md.

## Context

P13 must make agent-led provider connection (Stripe first) and guided payment
missions real in the packaged desktop app. The gap matrix shows a complete
contracts floor (connection forms/lifecycle/scopes/isolation/transport/
idempotency/result envelopes; mission vocabulary; workspace store port) plus
substrate host mechanisms (encrypted credential storage, a proven
system-browser OAuth + deep-link-return pattern, OS protocol registration,
the `IPaySwapDesktopService` host seam) — and zero runtime wiring for the
product planes: no composer, no intent router, no payment-PSP registry, no
connection session authority, no Stripe adapter, no payment task runtime, no
cross-domain authorization gate. Voice support is absent everywhere.

The P13-0 work order requires deciding: the Stripe integration types and
their auth models, the browser security boundary, return/correlation/session
lifetime, the secret broker and OS credential storage binding, the provider
registry and connection session authority, durable mission/task identity, and
the payment-dispatch authority boundary — then unblocking P13-A/B/C with a
shared typed intent/task contract and file-disjoint scopes.

## Decisions

### D1 — Stripe setup use cases are THREE DISTINCT integrations, and P13-B's first vertical slice is the restricted-key own-store flow in test mode

Stripe does not have one universal onboarding mechanism. The three use cases
from the UX reference are structurally different integrations:

| Use case | Stripe mechanism | Connection form (existing vocabulary) | Credential kind | Requires operator platform registration |
|---|---|---|---|---|
| **U1. Own-store payment acceptance** — the operator's own Stripe account takes payments for their store; PaySwap observes/manages it | Restricted API key pair (test mode: `rk_test_…`/`sk_test_…` restricted to read-only + specific write scopes) entered through the host-side credential broker; verified by a read-only probe (`GET /v1/balance`, `GET /v1/account`) | `SCOPED_API_CREDENTIAL` | `API_KEY` | **No** — works against test mode immediately |
| **U2. Existing account grant** — a user delegates PaySwap scoped access to their existing Stripe account | Stripe OAuth (`/oauth/authorize` with the platform's `client_id`, state correlation, code→token exchange at `/oauth/token`) | `DELEGATED_OAUTH` | `OAUTH` | **Yes** — a registered Stripe platform (client_id + secret) |
| **U3. Marketplace onboarding** — PaySwap as a platform onboarding sellers as connected accounts | Stripe Connect Account Links (Express/Custom: create account → `account_links` → hosted onboarding → return URL) | `CONNECTED_ACCOUNT` | `PROVIDER_DEFINED` | **Yes** — platform credentials + webhook endpoint |

**Decision:** P13-B implements U1 (test mode) as the vertical slice — it is the
only mechanism that requires no operator-gated platform registration, and it
exercises the complete machinery: registry declaration, broker binding,
credential entry through a host-side native secret field (never chat),
read-only verification probe, scope recording from real key capabilities,
lifecycle transition to `PENDING_VERIFICATION` → `ACTIVE` on real provider
evidence, health observation, and revocation/expiry handling. U2 and U3 are
declared in the registry as supported forms whose Connect entries state the
EXACT missing operator configuration (platform client_id/secret; webhook
endpoint) and whose cards render the typed prerequisite — never a dead
button, never a simulated OAuth. If the operator supplies test-mode
credentials for U1, the slice runs the real probe E2E; if not, the machinery
lands with the honest "credentials not provided" state and the blocker is
recorded exactly (the P13-B work-order clause).

**Never-flip law** (from the UX reference, adopted): "Catalogue
entry/opened browser/redirect return is never ACTIVE." `ACTIVE` requires a
successful verification probe through the real transport with the sealed
credential, recorded as provider evidence.

### D2 — System browser with validated deep-link return is the provider-auth boundary; the embedded isolated browser is deferred and honestly declared

Provider-controlled authentication (Stripe's hosted pages, OAuth authorize,
Account Links onboarding) runs in the **user's system browser**. PaySwap
never renders provider login pages, never proxies them, and never collects
credentials on a PaySwap surface. The user authenticates with their own
browser, password manager and MFA; PaySwap receives only the validated
return.

The substrate already proves the pattern end-to-end for model-provider OAuth:
authorize URL opened via `openExternal`, `zcode://oauth/callback` deep-link
return, state map with timeout, pending-URL queuing across cold starts
(`packages/services/src/oauth/oauthService.ts`,
`packages/desktop/src/main/desktopOAuthDeepLink.ts`, with Linux `.desktop`
protocol registration). P13-B adapts this pattern for payment-provider
connections.

**Embedded/isolated interactive browser sessions** (`ISOLATED_INTERACTIVE_BROWSER_SESSION`
form) are NOT built in P13. The form stays declared in the connection-forms
table (it is canonical vocabulary), rendered honestly as unsupported in this
deployment. Rationale: the desktop's existing browser machinery
(`packages/zcode-cua`, `browserView/*`) is the CUA automation plane; reusing
it for user-facing onboarding would require a session-isolation audit
(storage partitioning, origin visibility, credential boundary) whose security
surface is not warranted when the system-browser path already satisfies the
UX reference ("otherwise the system browser is used with validated return/
resume handling") with strictly better credential properties.

### D3 — Connection returns bind to the registered `zcode://` scheme under a NEW `provider` host; the `payment` host stays reserved for P13-C authorization returns

The desktop app registers the `zcode://` protocol at the OS level (Linux
`.desktop` registration verified). Adding a host to the parser is
additive and low-risk; introducing a `payswap://` scheme would fork OS
registration and conflict with the substrate identity.

- `zcode://provider/callback?state=…&code=…|error=…` — connection-onboarding
  returns (P13-B). New host in `desktopDeepLinkUrl.ts` with the same
  pending-queue + renderer-ready handshake discipline as `oauth`.
- `zcode://payment/callback` — stays reserved for payment-authorization/
  provider-redirect returns (P13-C); the channel
  (`PlatformChannels.PaymentCallback` → `onPaymentCallback`) already exists
  end-to-end with no consumer yet.

**Return/correlation/session lifetime contract** (pinned in the shared
contract, D6): each outbound auth attempt mints a single-use `state`
(crypto-random, host-side only — never renderer-visible), bound to
`{connectionTaskId, providerId, form, requestedScopes, expiresAt}` with a
**10-minute default lifetime** (the substrate's OAuth timeout is 5 minutes;
P13 adopts 10 as the typed default for slower hosted onboarding flows). On
return: scheme+host exact match, state known + unconsumed + unexpired,
`error` param surfaced honestly (user-denied → task returns to a resumable
state with the reason recorded, never silently retried). Consumed states are
monotonic. Cold-start returns queue in main and replay at renderer-ready.

### D4 — The durable secret broker is a provider-runtime broker adapter over the substrate `ICredentialService`; secrets never cross the renderer/model boundary in any direction

Binding (P13-B):
- Material enters exactly once through a `DurableCredentialBroker` adapter
  implementing the existing `InMemoryCredentialBroker` discipline (sealed
  bundles, opaque `CredentialHandleId`, registered runtime keys, escape-scan
  on results) with persistence delegated to `ICredentialService`
  (`packages/services/src/credential/` — AES-256-GCM at rest today, with the
  substrate's documented Electron safeStorage migration path).
- Storage keys: `payswap.connection.<connectionId>.credential`; values are
  the sealed material; metadata (kind, description, registeredAt) lives in
  the connection record, never the material.
- The renderer never receives material; the composer/LLM never receives
  material OR handles (it sees connection IDs and lifecycle states only);
  every provider call runs host-side INSIDE `broker.withMaterial` — only the
  clean provider response exits the seal (the `transport.ts` dispatch
  pattern).
- Task-event summaries and logs are escape-scanned before persistence
  (extend `redaction.ts` usage to the task-event writer).
- Chat law (UX reference, adopted verbatim): no secret API keys, OAuth
  tokens, webhook signing secrets, passwords, one-time codes, card security
  codes, seed phrases or private keys ever enter chat transcripts, model
  context, screenshots, logs, browser snapshots or analytics. If credentials
  must be supplied (U1), entry is a host-side native secret field with
  masking and a non-returnable handle — never chat, never the composer.

### D5 — The connection session authority is a host-process service extending the `IPaySwapDesktopService` seam; the payment-PSP registry is typed data with Stripe (U1 test-mode) as its first real entry

- **Authority placement:** the connection session authority lives in the
  desktop host process (main), extending the established
  `packages/desktop/src/host/payswap/shell/` service seam. It is the ONLY
  writer of connection lifecycle states and the ONLY holder of runtime keys
  for the credential broker. The renderer talks to it through the platform
  channel; the agent/composer talks to it only through typed task verbs.
- **Registry:** a typed payment-provider registry declaring per provider:
  id, display identity, supported forms WITH per-form auth mechanism,
  required scopes, account model, test/live support, verification probe
  contract, webhook needs, revocation/retry rules. First entries: `stripe`
  (U1 `SCOPED_API_CREDENTIAL`/test-mode real; U2/U3 declared with exact
  missing operator configuration), plus the honest capability catalogue that
  `/app/connections` already renders (no fabricated providers).
- **Transition discipline:** every lifecycle transition carries evidence
  (probe result, provider signal, principal request, policy decision) and is
  append-only (`connection-lifecycle.ts` law, unchanged).
- **SANDBOX vs LIVE** (INV-25): test-mode Stripe is `SANDBOX`, mechanically
  separated from `LIVE`; a sandbox verification never certifies a live
  corridor.

### D6 — Task identity: one shared typed `AgentTask` envelope, minted host-side, persisted under the workspace-store durability discipline; mission IDs and connection IDs stay domain-scoped

The shared contract (published with this ADR as
`packages/surface/src/agent-tasks.ts`, see D9) defines:

- `AgentTaskId` — host-minted, stable across restarts
  (`task:<kind>:<crypto-random>`), persisted with the task record.
- `AgentTaskKind` — `'CONNECTION_SETUP' | 'PAYMENT_MISSION'` (extensible by
  MINOR surface bump).
- `AgentTaskOrigin` — `'SURFACE_ACTION' | 'COMPOSER_TEXT' | 'SYSTEM'`.
  Voice is honestly absent: `'COMPOSER_VOICE'` exists in the vocabulary ONLY
  as a declared-unsupported origin; the composer states it, never simulates
  it.
- `AgentTaskStatus` — `'DRAFT' | 'ACTIVE' | 'AWAITING_EXTERNAL_RETURN' |
  'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED'`, with the
  monotonic-terminal law.
- Append-only `AgentTaskEvent[]` with correlation refs; every consequential
  attempt carries its idempotency key (the
  `idempotency-registrar.ts` semantics); potentially-effective ambiguity is
  `UNKNOWN` and reconciles before any retry (INV-04/INV-06, reused).
- **Convergence law** (the UX reference's core requirement, now typed):
  a provider Connect-card click, a "connect Stripe" composer text, and (when
  voice exists) a spoken request create-or-resume THE SAME task by
  `(kind, providerId, resumable-window)` correlation; a Pay action click and
  a Pay composer text seed THE SAME payment-intake task by
  `(kind, direction, resumable-window)`. A resumable task (DRAFT/ACTIVE/
  AWAITING_EXTERNAL_RETURN/PAUSED) is resumed, never duplicated.
- Payment missions keep their `MissionIntakeInput` shape (composed, not
  duplicated); connection tasks reference `(providerId, form)` with the
  D3 state binding.

### D7 — The payment-dispatch authority boundary: the composer/LLM/router own ZERO authority; the only consequential path is the canonical one

The typed intent router is DETERMINISTIC phrase/intent classification
surface→task seeding — it does not decide anything financial. The canonical
path (AGENTS.md financial boundary, restated as the P13 wiring contract):

```
Composer/Action (typed intent, advisory)
  → PaymentMission draft (conversational intake; missing fields ASKED, never guessed)
  → Validation against REAL state (accounts observed, corridor eligibility,
    fresh quote/fees, limits, provider scopes, policy)
  → Structured preview (quote provenance + expiry + destination + risk;
    the surface quote-terms/progress projections render it)
  → EXPLICIT scoped user authorization (a UI act on the preview — text/voice/
    NLP is never authorization)
  → Authorization artifact consumed by the execution plane
    (execution-graph kernel + provider-runtime transport INSIDE the credential seal)
  → Observations with evidence (result-envelope; UNKNOWN reconciles)
  → Append-only task timeline + reconciliation
```

P13-C implements the task lifecycle INTO the existing
`@payswap/economic` + `@payswap/execution-graph` +
`@payswap/financial-certification` contracts. No parallel engine, no new
authority verb in the UI, no finality declaration outside the Financial
Protocol Authority vocabulary.

### D8 — Evidence discipline: concept art is never implementation evidence; account credentials gate the real-flow gate

All P13 acceptance artifacts must cite exact commit/build/version and
distinguish offline/contract/sandbox/live evidence (the P13-D work-order
law). The SVG references are design aids. The Stripe test-mode E2E runs only
with operator-provided test-mode credentials delivered through the secret
channel (never chat); without them, P13-B/P13-D record the exact missing
configuration and do NOT mark the sandbox gate passed.

### D9 — The shared contract lives in `@payswap/surface` (contracts layer) and is published NOW, before any lane work

`packages/surface/src/agent-tasks.ts` ships with this ADR (P13-0):
the typed task envelope, origins, statuses, event kinds, the
convergence/resume semantics, and the D3 return-correlation binding —
pinned vocabulary with fail-closed validation, composed with the existing
mission vocabulary (in-package) and the provider-runtime vocabulary (BY
VALUE pins, respecting the boundary law: the contracts layer imports no
siblings). `SURFACE_API_VERSION` bumps 1.2.0 → 1.3.0 (additive; stability
`experimental` for the new module). Lanes implement adapters/consumers
against it; drift is a defect.

## Consequences

- P13-A/B/C receive file-disjoint scopes (below) and can dispatch in
  parallel. The shared contract + this ADR + the gap matrix are their
  binding inputs.
- The Stripe wave is honest by construction: no operator credentials → no
  ACTIVE connection, no simulated OAuth, exact blockers recorded.
- The embedded-browser deferral is a recorded decision with its revisit
  condition (an isolation audit), not an omission.
- The `zcode://` scheme remains the single OS-registered deep-link scheme;
  adding the `provider` host is additive and covered by P13-B's scope.

## File-disjoint lane map (the P13-A/B/C unlock)

Shared, frozen by this ADR (TL-owned; lanes import, never edit):
`packages/surface/src/agent-tasks.ts`, `packages/surface/src/index.ts`
(export block), `packages/surface/src/version.ts`, this ADR, the gap matrix,
`spec/dependency/*`, `spec/development-state/*`. Lane-caused contract changes
route back to the TL as ADR amendments — never in-lane edits.

| Lane | Owns (exclusive) | Must not touch |
|---|---|---|
| **P13-A** (worker-1, composer + routing) | `packages/payswap-app/src/agent/` (NEW: composer, intent router, task-session UI, minimize/reopen, draft/history projection), edits INSIDE `pages/areas/PaymentsAreaSurface.tsx` + `ConnectionsAreaSurface.tsx` + `AccountsAreaSurface.tsx` + `pages/AppOverviewPage.tsx` + `HomePage.tsx` + `console/sections/OverviewSection.tsx` (entry-point integration), `src/lib/agent-*.ts` app-side helpers, app tests under `test/payswap/agent-*`, `payswap-app` CSS additions | provider adapter/session/broker files; payment mission/task runtime files; surface contract files; desktop host services |
| **P13-B** (worker-2, connection plane) | `packages/desktop/src/host/payswap/connections/` (NEW: session authority, durable broker adapter, registry runtime), `packages/desktop/src/host/payswap/shell/contracts.ts` + `service.ts` (SEAM EXTENSION: additive methods only), `packages/desktop/src/main/desktopDeepLinkUrl.ts` + `desktopOAuthDeepLink.ts` (provider host — additive), `packages/provider-runtime/src/adapters/stripe/` (NEW) + stripe transport + verification probes, `packages/shared/src/channels.ts` + `platform.ts` (additive channel/interface entries), provider-runtime tests | payswap-app UI files (P13-A's); payment mission/task runtime (P13-C's); surface contract files |
| **P13-C** (worker-3, payment missions) | `packages/desktop/src/host/payswap/payments/` (NEW: payment task runtime, authorization gate, reconciliation wiring, durable idempotency records), `packages/payswap-app/src/console/mission-*/` extensions for payment-mission projection (additive), economic/execution-graph ADAPTER modules if required (new files only — no edits to existing contract modules), payments tests | composer files (P13-A's); connection adapter/session/broker files (P13-B's); surface contract files |

Conflict rule (concurrency law): seam files touched by B (`shell/contracts.ts`,
`shell/service.ts`, `desktopDeepLinkUrl.ts`, `desktopOAuthDeepLink.ts`,
`channels.ts`, `platform.ts`) are B's exclusive edit surface during the wave;
A and C consume them read-only. If C requires a seam method, it files the
exact signature to the TL and B lands it (or the TL does) — C never edits the
seam.
