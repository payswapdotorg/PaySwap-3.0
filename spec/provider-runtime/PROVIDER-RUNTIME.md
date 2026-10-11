# PaySwap 3.0 — Provider Runtime (Work Order P2-W2)

Status: IMPLEMENTED (Phase 2, lane worker-2)
Package: `@payswap/provider-runtime` (`packages/provider-runtime`) — the provider runtime: connection model, credential/browser isolation, execution bridge, endpoint-specific idempotency, authenticated event ingestion, lossless raw-state retention, canonical retrieval and the sandbox/live law.
Layer: `rails` (MODULE-OWNERSHIP.yaml: may_depend_on [contracts, capability, trust, financial]). For THIS phase the package is DELIBERATELY dependency-free (zero runtime deps, zero `@zcode/*`, zero sibling `@payswap/*` imports); the capability-lane references (P2-W1, in flight under the pairwise-disjoint law) and the P1 authorization lineage type are structurally pinned locally in `src/refs.ts` and wired by the TL at integration.

**NAME LAW**: this package is never named or aliased `provider`. The inherited `packages/provider` is ZCode's AI-model provider selection (platform layer) — an entirely different concept. The boundary test guards the name mechanically.

Old-repo evidence (never authority): `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` — `packages/rails/src/stripe.ts` (the REAL Stripe production connector discipline: no provider SDK, injected HTTP transport, namespaced idempotency-key derivation, lossless envelope retention), `packages/adapters/src/credential-broker.ts` (opaque handle/sealed bundle law), `packages/adapters/src/webhooks.ts` (verifier hook + dedupe + replay window), `packages/adapters/src/psp-connector.ts` (merchant keeps the incumbent PSP; fail-closed rail reachability), `packages/connectors/src/external-funds.ts` (external funds as OBSERVATIONS), `packages/rails/src/reconciliation-connectors.ts` (webhook-loss recovery through retrieval + revision ledger), and the adversarial fault families (ambiguous-provider, lost-webhooks, provider-outage — UNKNOWN preservation). The old repo's 13 live-gated suites were never run live (GAP-02): a sandbox-only pass is NOT live certification (Wise §6) — live certification is P8 and nothing in this package claims it.

## Canonical invariant mapping

| Invariant | Enforced in |
|---|---|
| INV-03 historical facts immutable and versioned | `src/raw-state.ts` (append-only per (provider, object, revision); divergent re-record → `RawStateConflictError`; non-monotonic transitions append, never rewrite) |
| INV-04 UNKNOWN ≠ FAILED; reconcile before consequential retry | `src/result-envelope.ts` (classification table), `src/errors.ts` (`isFailureOutcome` false for ambiguity), `src/execution-bridge.ts` retry gate, `src/retrieval.ts` evidence surface |
| INV-05 authorization + evidence lineage | `src/refs.ts` (AuthorizationRef pin), `src/attempts.ts` (every attempt carries authorization + capability + raw-state refs) |
| INV-06 state-changing commands idempotent and replay-safe | `src/idempotency.ts` + `src/idempotency-registrar.ts` (per-operation scope, BEGIN/REPLAY/CONFLICT, AMBIGUOUS occupies the record) |
| INV-07/08 external balances are observations, not custody | The runtime exposes only READ/OBSERVE operation classes and raw-state retention; NO balance type exists in this package (non-custody by absence — nothing here can be mistaken for a PaySwap-owned balance) |
| INV-14 provider state preserved for action/reconciliation/audit | `src/raw-state.ts` (lossless, versioned, immutable, projection separate) |
| INV-19 secrets never enter model context/logs/artifacts | `src/credential-isolation.ts` (opaque handles, sealed bundles, escape-scanned seal), `src/redaction.ts` (boundary redaction with auditable notices), bridge param gate, store boundary redaction |
| INV-24 no fake success / fabricated provider effects | fail-closed fakes (unscripted call = pre-dispatch refusal), unparseable retrieval refused, duplicate dispatch refused |
| INV-25 test/sandbox/live distinctions mechanically enforced | `src/execution-mode.ts` (LIVE never binds a fake transport; `liveBehaviorProof` refuses sandbox evidence with `SANDBOX_NOT_LIVE_PROOF`) |

## The connection model

**Connection forms** (`src/connection-forms.ts`): the five CAPABILITY-MODEL forms — `DELEGATED_OAUTH`, `CONNECTED_ACCOUNT`, `SCOPED_API_CREDENTIAL`, `ISOLATED_INTERACTIVE_BROWSER_SESSION`, `PROVIDERLESS_RAIL` — each a frozen profile declaring activatable credential kinds, browser-isolation requirement, interactivity and providerlessness. Fail-closed form/credential consistency (a browser-session connection cannot activate on an API key; the reverse either).

**Connection scope** (`src/connection-scope.ts`): what a connection is allowed to do — `allowedOperations` (READ_PROVIDER_STATE / OBSERVE_EXTERNAL_FUNDS / CREATE_EXTERNAL_EFFECT / CANCEL_OR_REVERSE_EFFECT / MANAGE_CONNECTION), `allowedEffectClasses` (NONE / OBSERVATION_ONLY / STATE_CHANGING), `scopedCapabilities` (OPAQUE capability refs; exact-match admission: same ids + different version = `CAPABILITY_VERSION_DRIFT`, refused) and optional expiry. Empty or expired scopes admit nothing; there are no implicit defaults.

**Connection lifecycle** (`src/connection-lifecycle.ts`): PROPOSED → PENDING_VERIFICATION → ACTIVE ⇄ DEGRADED / SUSPENDED, with EXPIRED / REVOKED / DISCONNECTED terminal (monotonic — no exits). Only ACTIVE admits everything; DEGRADED admits reads/management only; everything else admits nothing. Every transition is recorded with time + cause + opaque actor; history is append-only.

## The credential/browser isolation boundary (INV-19)

- Material enters an `InMemoryCredentialBroker` exactly once (`registerBundle`) and lives behind a `#private` field with NO getter. Only the OPAQUE HANDLE (`cred:1`, `cred:2`, … — deterministic sequence, no entropy) crosses back out.
- A handle resolves to a `SealedCredentialBundle`. Material leaves the seal ONLY inside `withMaterial` under a broker-registered `ConnectorRuntimeKey`, and the callback result is DEEP-SCANNED (async results scanned after await): any string of the material appearing anywhere in the result throws `CredentialIsolationViolationError` — a leak is never silently sanitized.
- **THE DISPATCH PATTERN**: the provider interaction itself (transport.send with secret-bearing headers built by the adapter's binder) runs INSIDE the seal; only the clean provider response comes out. Returning secret-bearing headers from the seal is itself a violation — proven by test.
- Isolated interactive browser sessions follow the same law through `BrowserSessionBroker` (`sess:N` opaque refs; cookies/storage sealed; escape-scanned).
- `src/redaction.ts` is the boundary redaction engine: secret-named FIELDS (apiKey, client_secret, password, access_token, cookie, authorization, private_key, seed, mfa…) and credential-shaped VALUES (Bearer/Basic tokens, PEM private keys) are replaced with auditable `[REDACTED:…]` markers + FNV-1a fingerprints at every artifact boundary (raw-state store, event records, command params gate). Reference-shaped ids (eventId, correlationId, sessionId…) deliberately SURVIVE so lineage stays intact. Redaction is deterministic, cycle-safe, never a crash vector.

## The execution bridge (authorized command → external effect attempt)

`src/execution-bridge.ts` composes the laws in dispatch order:

1. **Command validation** — structural `AuthorizationRef` lineage (the P1-W2 pattern pinned in `src/refs.ts`), registered operation binding, params clean of secret material (fail-closed before dispatch).
2. **Connection admission** — lifecycle + scope (operation class, effect class, exact capability reference).
3. **Endpoint-specific idempotency** — the operation's registered contract (fail-closed INV-06: no contract → no state-changing execution, NO universal fallback), derived key, registrar decision (BEGIN / REPLAY / CONFLICT / AMBIGUOUS-occupied).
4. **The INV-04 gate** — a consequential re-dispatch while the prior attempt is an unresolved UNKNOWN is REFUSED (`ReconciliationRequiredBeforeRetryError`) unless a provider retrieval recorded AFTER the ambiguity exists (object-anchored or correlation-anchored). The runtime SUPPLIES the retrieval evidence; the definitive resolution of the ambiguity belongs to the P1-W2 protocol lane's reconciliation authority.
5. **Dispatch inside the seal** (the dispatch pattern above).
6. **Classification + retention** — the transport response → CONFIRMED / UNKNOWN / FAILED; delivered object state retained losslessly in the raw-state store.
7. **Attempt record** — commandId, correlationId, authorization, capability, operationId, idempotencyKey, executionMode, connectionId, dispatchedAt/completedAt, outcome, providerReferences, rawStateRecordId, failure/ambiguity — the Wise §4.4 identifier persistence + INV-05 lineage, on an append-only injectable ledger (`src/attempts.ts`).

**The result envelope** (`src/result-envelope.ts`): delivered 2xx → CONFIRMED (with provider references + retained raw state); delivered definitive provider error → FAILED (retryability per provider semantics; a 5xx is still an ANSWER, not an ambiguity); not-delivered REFUSED_BEFORE_DISPATCH → FAILED retryable (never left the process); not-delivered TIMEOUT_AFTER_DISPATCH / CONNECTION_LOST_AFTER_DISPATCH / MALFORMED_RESPONSE → **UNKNOWN** (INV-04 — the command may have landed; must be reconciled before any consequential retry; never collapsed into FAILED). `assertInvariantOutcome` guards the envelope laws structurally.

## Endpoint-specific idempotency (Wise §4.4 — never one universal mechanism)

`src/idempotency.ts` owns the PER-OPERATION contract registry. Each `OperationIdempotencyContract` declares: key scope (which provider-side dimensions the key is unique within — connection/account and/or endpoint), key derivation (`NAMESPACED_COMMAND_ID` → `payswap:<commandId>`; `CALLER_SUPPLIED_PROVIDER_FIELD` — the provider's own per-endpoint field carries the key; `PROVIDER_ASSIGNED_ECHO`), replay behavior (original result replay vs harmless noop ack), conflict reporting (provider signal vs local detection), and the optional `providerEvidenceField` (customerTransactionId-style — PROVIDER EVIDENCE, never a PaySwap constant). The registrar (`src/idempotency-registrar.ts`) is the INV-06 decision point: BEGIN / REPLAY (in-flight, completed-with-result, or ambiguous) / CONFLICT (same key, different body — never a silent success, never a re-execution); FAILED re-arms for retry; **AMBIGUOUS keeps the record occupied** (exits: complete-with-reconciliation-evidence or fail-with-reconciliation-evidence). Records persist the full identifier set (key, command id, correlation id, provider references, times).

## Event/webhook ingestion

`src/events.ts` + `src/event-extractor.ts`, in ingestion order:

1. **Authenticated ingestion where supported** — signature verification through the PLUGGABLE `WebhookSignatureVerifier` contract; signature VALUES are opaque strings at this layer (the cryptography belongs to the platform/capability lane — P1-W3 finding F-2 precedent). Without a verifier, ingestion is refused unless the provider was explicitly declared unauthenticated at construction (fail-closed).
2. **Replay window** — a signature timestamp outside the tolerance window (stale or unreasonably future) is rejected.
3. **Duplicate delivery harmless** — (provider, eventId) is the dedupe key; a duplicate returns the ORIGINAL record, never ingested twice.
4. **Out-of-order cannot regress canonical state** — the event's object state is retained through the raw-state store whose ordering law keeps the newest observation canonical; a late older event is retained in history and flagged `SUPERSEDED_BY_NEWER_OBSERVATION`.
5. **Record persistence** — event id, provider-issued creation time, PaySwap receipt time, raw-payload record reference (redacted at the store boundary) and processing outcome; the append-only ingestion log covers every outcome kind including rejections.

## Raw provider-state retention (INV-03/INV-14)

`src/raw-state.ts`: every provider response/event/retrieval state is retained as an immutable, versioned `RawProviderStateRecord` — append-only per (provider, objectType, externalId, revision): identical re-record = idempotent replay; divergent re-record = `RawStateConflictError`. Secret-shaped material is redacted AT THE BOUNDARY with auditable notices (semantics preserved losslessly). Non-monotonic provider transitions append new revisions — history is never rewritten. The stable PaySwap PROJECTION follows the ordering law (occurredAt ?? receivedAt, then arrival sequence): out-of-order arrivals can never regress the canonical observation. Normalization is ADDITIVE and pluggable (`ProviderStateNormalizer`; the identity normalizer preserves the provider's status vocabulary verbatim) — it never replaces the raw state, which remains the evidence of record. The full classification envelope is P2-W1's territory; this projection keeps only the opaque normalized summary.

## Canonical retrieval + reconciliation supply

`src/retrieval.ts`: controlled provider retrieval through per provider/object-type contracts (read operation, fetch params builder, response parser) dispatched INSIDE the credential seal against a live connection. Every retrieval retains the answer losslessly and records full PROVENANCE (fetchId, retrievedAt, reason — RECONCILIATION_AFTER_AMBIGUITY / SCHEDULED_POLL / OPERATOR_INITIATED / EVENT_LOSS_RECOVERY — connectionId, correlationId) on an append-only ledger. `hasPostAmbiguityRetrievalEvidence` answers the reconcile-before-retry question the bridge gate consumes. **The authority boundary**: this runtime SUPPLIES retrieval; it does not decide financial truth — the definitive resolver of ambiguous outcomes is the P1-W2 protocol lane (the retrieval evidence feeds its reconciliation cases).

## The sandbox/live law (INV-25)

`src/execution-mode.ts`: SANDBOX and LIVE are the only modes (no default, no third state). Transport classes are FAKE_DETERMINISTIC and PRODUCTION_HTTP; **a LIVE runtime can never bind a FAKE_DETERMINISTIC transport** (a fake cannot execute production effects — mechanically refused at construction). SANDBOX may bind production transports pointed at provider sandbox environments, but every record it produces is branded SANDBOX and `liveBehaviorProof` refuses sandbox evidence with `SANDBOX_NOT_LIVE_PROOF` — a sandbox path can NEVER be represented as proof of live behavior (Wise §6; live certification is P8).

## Determinism and test discipline

All time flows through the injected `RuntimeClock` (`DeterministicClock` in tests — explicit advance only; `Date.now` appears ONLY in the `SystemRuntimeClock` composition-root edge, boundary-guarded). No entropy anywhere (deterministic sequence ids, FNV-1a content hashes — binding-never-security, same law as the P1 lanes; real crypto is the platform/capability lane's). The battery uses `ScriptedFakeTransport` — deterministic, in-memory, CANNOT execute production effects (an unscripted call is a pre-dispatch refusal, never an invented provider answer). Test coverage: connection forms/scope/lifecycle, isolation escape proofs (sync and async), redaction proofs, sandbox/live law, per-operation idempotency, raw-state immutability + ordering, event ingestion (verifier plugging, duplicates, out-of-order), retrieval + gate, bridge confirmed/unknown/failed + timeout→reconcile→retry golden path, architectural boundary (relative imports only, ≤400-line files, zero-deps manifest, name law, no-enum, no fake-looking secrets).

## Deferral register (honest limitations — each a DELIVERABLE, not a hidden gap)

1. **Durable persistence**: every store (connections, credential broker, idempotency registrar, raw-state store, event ingest log, retrieval ledger, attempt ledger) is a deterministic in-memory reference. Durable adapters are a separately-accepted Work Order (the P1 lanes carry the same deferral). Nothing here may be treated as durable.
2. **Real provider adapters**: this package ships the RUNTIME + contracts; concrete connectors (Stripe/Wise/…-shaped adapters on this framework) are P5-W3/later lane work. The old repo's stripe.ts discipline is adapted, not its Stripe specifics (no live credentials exist in this program; live certification is P8).
3. **Cryptographic signature verification**: the webhook verifier contract is pluggable and OPAQUE; real HMAC/Ed25519 verification arrives with the platform/capability crypto owner (P1-W3 finding F-2 lineage). The battery proves the plugging, not the crypto.
4. **The AMBIGUOUS idempotency record's terminal exits** (`complete`/`fail` with reconciliation evidence) are callable by the reconciliation CONSUMER (the protocol-lane integration); this package records the semantics and proves them at the registrar level, but the TL wiring that drives them from protocol reconciliation cases is integration work.
5. **Funds-observation reconciliation subjects** (external funds positions as INV-07/08 observations feeding protocol reconciliation) remain with the P1-W2 RESERVED case taxonomy; this runtime supplies the observation/retrieval surfaces those cases will consume.
