# P7-W3 Baseline Verification Record — Universal Command Surface

Work order: P7-W3 (spec/dependency/work-orders.md: "Command surface, agent
interaction, browser Extension boundary and developer/external-agent
APIs.").
Lane: product (Phase 7, worker-3, re-dispatch r2 — the original lane was
lost to an orchestrator-side sandbox reset; no worker fault).
Branch: `work/p7-w3-r2` (base `2999bbb1658443b72ce9644f32cabbebdbecaa37`
= the mandated Phase-2-complete dispatch STATE; the write surface is
net-new and pairwise-disjoint from every sibling landing).
Write surface: `packages/command/**`, `spec/command/**`,
`docs/command-evidence/**` (pairwise-disjoint law — zero files touched
outside the surface; `git diff --name-only 2999bbb..HEAD` lists only this
surface).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; evidence not authority).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/command/` on Node v24.21.0 / TypeScript
6.0.x / vitest 3.2.x, exactly as the work order prescribes:

```
cd packages/command
rm -rf node_modules package-lock.json
npm install --no-workspaces   # exit 0 (typescript@6.0.x + vitest@3.2.x; warnings only: esbuild postinstall not in allowScripts — no impact)
npx tsc --noEmit              # exit 0 (strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess + verbatimModuleSyntax; src + test + vitest.config.ts)
npx vitest run                # exit 0 — 19 files / 221 tests, ALL PASS
```

Per-file test counts (vitest): command-grammar 24, approval-artifact 16,
extension-boundary 16, command-envelope 16, transport 16, messaging-
gateway 15, session-contract 13, agent-interaction 12, method-registry
12, approval-interaction 12, webhook-delivery 14, developer-api 9,
boundary 9, canonical 10, ports 8, errors 5, identifiers 5, version 6,
smoke 3. Export surface: 139 runtime exports (plain-Node type-stripping
import path additionally exercised via vitest's transform pipeline).
File law: 20 src files + 23 test files, every one <= 400 lines
(machine-checked by boundary.test.ts, split-length semantics).

## 2. Old-suite porting account (mechanically recounted by test TITLE)

Old suites in this work order's porting surface: the old api suite
(MMP-04) — mechanically recounted at the pinned SHA as 79 direct test
titles + 20 conformance-harness titles = 99 (matches the migration
matrix's recorded 6f/99t) — plus the P7-W3 share of the old ux suite
(MMP-35): command-grammar.test.ts (23) + trusted-approvals.test.ts (8) +
messaging-adapters.test.ts (14) = 45. **Total old surface: 144 titles.**

| Old suite (titles) | New home | Ported | Adapted | Rewritten | Dropped (reason) |
|---|---|---|---|---|---|
| api http.test.ts direct (26) | transport/command-envelope/method-registry tests | 0 | 15 | 1 | 10 (route/dispatch/body-parsing/journey/policy orchestration = server impl; NOT_FOUND/version/evidenceRef/ambiguity laws survive) |
| api http conformance (6) | transport tests | 3 | 1 | 2 | 0 |
| api identity.test.ts (13) | session-contract tests | 3 | 8 | 0 | 2 (revocation sweep + unknown-tenant lookup: store mechanics) |
| api approvals.test.ts direct (15) | approval-artifact + approval-interaction tests | 11 | 2 | 0 | 2 (NEEDS_APPROVAL grant coupling; signing-key branding helper) |
| api approvals conformance (7) | approval-interaction + approval-artifact tests | 5 | 2 | 0 | 0 |
| api grants.test.ts (11) | approval-artifact verify tests | 0 | 3 | 0 | 8 (trust-lane adjudication: evaluate() is the trust lane's authority; artifact-verification + epoch-staleness LAWS preserved) |
| api webhooks.test.ts direct (9) | webhook-delivery tests | 4 | 3 | 0 | 2 (dispatcher retry-scheduling store; the backoff MATH is ported) |
| api webhooks conformance (7) | webhook-delivery tests | 7 | 0 | 0 | 0 |
| api boundary.test.ts (5) | boundary.test.ts | 0 | 0 | 4 | 1 (no-any law superseded: strict tsc is the battery gate) |
| ux command-grammar.test.ts (23) | command-grammar.test.ts | 23 | 0 | 0 | 0 |
| ux trusted-approvals.test.ts (8) | approval-interaction + approval-artifact tests | 1 | 7 | 0 | 0 |
| ux messaging-adapters.test.ts (14) | messaging-gateway.test.ts | 14 | 0 | 0 | 0 |
| **TOTAL (144)** | | **68** | **44** | **7** | **25** |

New-suite classification (221 titles): **PORTED 59 + ADAPTED 30 +
REWRITTEN 6 + NET-NEW 126 = 221.** Old-side PORTED (68) exceeds new-side
PORTED (59) because several old titles merge into single new tests (three
old session-fail-closed titles -> one auth vocabulary test; three old
webhook replay-window titles -> one bidirectional test; two old approvals
expiry titles -> one adjudication test; grants tamper/expired/bound ->
the approval-artifact verify tests). Net-new highlights: the
authority-firewall scan + envelope laws (11), the effect-class and
extension-permission vocabulary laws, the Extension boundary suite (16 —
no old counterpart existed), the developer-API suite (9), agent
interaction validators (12), ports (8), canonical (10), the registry
disclosure laws, the session decision-table decomposition, and hardening
inside every ported file.

## 3. Per-file adaptation receipts (old -> new)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| packages/api/src/identity.ts | 306 | session-contract.ts | 222 | ADAPT: Session/SessionLookup contracts + evaluateSessionStatus (the pure fail-closed decision table) + deterministic token material via the HMAC port; the stateful SessionManager store NOT ported (D-1) |
| packages/api/src/approvals.ts | 532 | approval-interaction.ts + approval-artifact.ts | 534 | ADAPT: request/message contracts, intent-at-most parsing, the trusted-channel seam (the ONLY confirmation constructor), artifact signing/verification via ports, adjudicateConfirmation; the pending-record store NOT ported (D-1) |
| packages/api/src/grants.ts | 279 | (concept-level) | — | ADAPT (concept): adjudication is the trust lane's authority (D-2); lineage/evidence refs preserved on ResponseMeta and artifact refs |
| packages/api/src/http.ts | 1125 | transport.ts + method-registry.ts + command-envelope.ts | 968 | ADAPT: request/response envelopes + validation + status mapping + toWireError + authenticateRequest (the pure auth decision); route table -> the typed method registry; idempotency wrapper -> the pure decision table + registrar port; handler orchestration NOT ported (D-3) |
| packages/api/src/webhooks.ts | 268 | webhook-delivery.ts | 243 | ADAPT: envelope + sign/verify via ports + endpoint config validation + backoff math; dispatcher scheduling NOT ported (D-1); attempt timestamps become bigint DATA |
| packages/api/src/index.ts | 21 | index.ts | 97 | ADAPT |
| packages/ux/src/command-center.ts (grammar section, ~380) | ~380 | command-grammar.ts | 396 | PORT: six verbs, parseCommand, pre-fill, chips, no-result turn, keyboard model/chords — semantics unchanged; citations mapped to canonical invariants |
| packages/ux/src/trusted-approvals.ts | 176 | approval-interaction.ts + approval-artifact.ts | (shared) | ADAPT: intent-at-most + trusted-surface laws onto the contract functions |
| packages/ux/src/messaging-adapters.ts | 293 | messaging-gateway.ts | 311 | ADAPT: the gated gateway; typed next-step descriptors replace the P7-W1 view-model ViewAction (D-4) |
| packages/interfaces/src/http.ts | 198 | transport.ts | (shared) | PORT (consumed shapes; the interfaces package is MMP-12/P2-W3's lane) |
| packages/interfaces/src/approval.ts | 167 | approval-interaction.ts + approval-artifact.ts | (shared) | PORT (shapes + laws; computeRequestHash re-authored onto the hasher port, D-5) |
| packages/interfaces/src/webhooks.ts | 155 | webhook-delivery.ts | (shared) | ADAPT (sign/verify via ports, D-5; ambient-time defaults deliberately NOT ported) |
| packages/interfaces/src/canonical-json.ts | 50 | canonical.ts | 200 | PORT (verbatim semantics; + net-new bigint-safe transform + strict-UTC parser) |
| packages/interfaces/src/agent-protocols.ts | 149 | agent-interaction.ts | 353 | ADAPT (shapes + net-new fail-closed validators) |
| packages/protocol envelope/idempotency (consumed shapes) | ~300 | command-envelope.ts | 370 | ADAPT (re-encoded as the PROPOSAL envelope: schema pin, no authority fields, the firewall scan) |
| packages/api/test/node-ambient.d.ts | 23 | test/node.d.ts | 49 | PORT pattern (process.cwd as a FUNCTION global — the P1-W2 CI lesson) |
| (test scaffolding) | — | test/fixtures.ts (182), type-utils.ts (6) | — | NET-NEW (REAL node:crypto port injections + deterministic builders + the omitField helper) |

Classification (migration matrix legend): package-level **PORT** with
net-new contract surfaces (the Extension boundary and developer-API
suites had no old counterpart); file-level: PORT (grammar, canonical,
transport/approval shapes), ADAPT (identity, approvals, grants, http,
webhooks, trusted-approvals, messaging, agent-protocols, envelope),
NET-NEW (errors, identifiers, ports, permission vocabulary,
method-registry, extension-boundary, developer-api, session decision
table, webhook backoff).

## 4. Decision records

**D-1 — Stateful service stores are not ported; their decision LAWS are.**
The old SessionManager/ApprovalService/WebhookDispatcher classes carried
in-memory stores plus scheduling loops. This lane ports typed contracts
plus the PURE decision tables (evaluateSessionStatus, adjudicateConfirmation,
resolveBeginOutcome, backoffDelayMs) and the typed ports
(IdempotencyRegistrar, SessionManagerContract, WebhookTransport,
ExtensionBridgePort). Durable stores are composition-root work; the laws
cannot be implemented incorrectly downstream.

**D-2 — Grant adjudication is the trust lane's authority.** The old
GrantAuthority wrapped trust evaluation (evaluate/checkEpoch/
verifyApprovalArtifact from @payswap/trust — a forbidden sibling here).
This package mirrors only result-facing references (evidenceRef,
approval:<hash> refs, the SessionLookup epoch vocabulary); the 8
grant-adjudication old tests are dropped with the laws preserved where
they are canonical (artifact verification in approval-artifact tests;
epoch staleness in session-contract + transport auth tests).

**D-3 — The HTTP handler orchestration is not ported.** The old
createApiHandler (1125 lines: routing, authentication pipeline,
idempotency wrapping, journey endpoints, capability stubs) decomposes into
typed contracts: the route table becomes the method registry; the auth
pipeline becomes the pure authenticateRequest decision; the idempotency
wrapper becomes the decision table + registrar port; the response shapes
become the wire envelopes. The server composition itself is product/TL
integration work.

**D-4 — The messaging gateway's next steps are typed descriptors.** The
old inbound outcome carried the ux view-model's ViewAction (P7-W1's
share). The gateway contract carries `{ kind: 'TRUSTED_SURFACE' |
'NAVIGATION', ... }` instead — the interaction law without the UI-product
dependency.

**D-5 — Cryptography moves to injected ports.** The old packages called
node:crypto directly in src (createHash/createHmac/timingSafeEqual). The
hard constraint (no built-in-module imports in src) is satisfied by the
RequestHasher/HmacPort typed shapes + constant-time hex compare; tests
inject REAL node:crypto implementations, proving the wire contracts are
implementable with a real primitive (known-answer test pins the SHA-256
hex form). The old ambient-time signing default
(`Math.floor(Date.now()/1000)`) is deliberately NOT ported — timestamps
are explicit parameters.

**D-6 — Version pins re-based.** The old date-pin ('2026-09-30') becomes
explicit semver-shaped pins ('1.0.0' command surface + '1.0.0' extension
boundary, independent) per the canonical packages/surface pattern; the
envelope schema version stays an integer pin (1). TERMINAL_STATE and
RATE_LIMITED survive in the merged error taxonomy; UNSUPPORTED_VERSION is
net-new for the explicit-versioning law.

**D-7 — The ux split.** The P7-W3 share of old ux is exactly: the
command-center grammar section (~380 lines -> command-grammar.ts),
trusted-approvals.ts (176), messaging-adapters.ts (293) — 45 tests. The
remaining ~10,300 lines / 287 tests (view-models, search/inbox/work-graph,
journeys, product IA, honest states, error reasons, incumbent views,
sidebar) are P7-W1's UI-product share, receipted file-by-file in
spec/command/COMMAND.md §6.

**D-8 — The capability two-axis stubs are not duplicated.** The old
http.ts capability stubs (two-axis availability) belong to the P2-W1
capability lane's authority; this surface references capability discovery
through the method-registry vocabulary instead (OBSERVATION effect class
+ capability disclosure).

## 5. Determinism receipts

- Boundary test: no Math.random / crypto.randomUUID / new Date / Date.now
  / performance.now / setTimeout / setInterval / fetch / built-in-module
  imports / process.env anywhere under src/** (text-based scanner — doc
  references are phrased without the forbidden tokens).
- Timestamps are DATA: bigint fields or strict ISO-8601 UTC strings
  validated by the civil-calendar parser (leap years machine-checked);
  verification/replay times are explicit parameters.
- Purity machine-checked: parseCommand (deep-equal on repeat),
  createCommandProposalEnvelope, buildMethodRegistry/describeRegistryMethods,
  describeDeveloperApi/projectExternalAgentApi, mintSessionTokenVia,
  signWebhookEventVia/signApprovalArtifact (same inputs -> same outputs),
  resolveBeginOutcome (decision table).
- Registry lookups preserve sorted order; idempotency begin is a pure
  function of (existing record, command hash).

## 6. Invariant mapping (canonical ids -> enforcement evidence)

| Canonical invariant | Enforcement in this package |
|---|---|
| INV-4 (UNKNOWN is not FAILED) | errors.ts isFailureOutcome; EXTERNAL_AMBIGUITY -> 409 + outcome marker + REQUIRED reconciliationRef; ambiguous idempotent outcomes REPLAY (never re-armed) |
| INV-5 (authorization + evidence lineage) | ResponseMeta.evidenceRef on mutations; envelope causation/correlation lineage; approval artifact refs |
| INV-6 (idempotent state-changing commands) | mutation idempotency-key validation; effect-bearing methods declare idempotencyRelevant; resolveBeginOutcome + the registrar port |
| INV-9 (agents/LLMs cannot declare financial truth) | LAW 1 in full: the firewall scan, the effect-class vocabulary, MCP requiredAuthority, the agent projection |
| INV-12 (attenuated delegation) | A2A cards/skills declare requiredAuthority they never mint; defaultScopes are request envelopes |
| INV-19 (secrets never enter artifacts) | the payload denylist (secret/credential/token/... keys); keys are injected strings at the ports |
| INV-22/INV-23 (shared framework-independent contracts; UI never owns financial truth) | the whole package is the shared typed surface; zero framework imports; the authority-firewall law |
| INV-24 (no dead financial actions) | grammar pre-fill (missing parameters are form fields, never errors); disambiguation chips; the no-result intent turn |
| INV-26/INV-27/INV-28 (package discipline) | zero runtime deps, zero sibling imports, relative-only specifiers, no paths entries, pairwise-disjoint write surface |

## 7. Limitations (honest register)

1. No transport I/O, no stores, no authorization evaluation, no extension
   implementation, no money normalization, no shipped canonical method set
   — see spec/command/COMMAND.md §7.
2. The old api suite's recorded count (6f/99t) reconciles exactly with the
   mechanical title recount at the pinned SHA (79 direct + 20 conformance).
3. The battery is hermetic and deterministic; no live-provider evidence is
   claimed or implied (P8 territory).
4. `packages/command` is not yet annotated in MODULE-OWNERSHIP.yaml's
   package_layers (out of this lane's write surface — TL accept-time
   integration, per the pairwise-disjoint law).
