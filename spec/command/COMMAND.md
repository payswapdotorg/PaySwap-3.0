# PaySwap 3.0 Universal Command Surface — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P7-W3)
Package: `@payswap/command` (`packages/command/`)
Authority owner: platform layer — universal interaction surface (Work Order P7-W3; the application-permission substrate per spec/architecture/MODULE-OWNERSHIP.yaml)
Work order: P7-W3 (spec/dependency/work-orders.md: "Command surface, agent interaction, browser Extension boundary and developer/external-agent APIs.")
Evidence: docs/command-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the universal interaction surface. The
package is the implementation; where code and this document disagree, that
is a defect (either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The command surface owns the UNIVERSAL INTERACTION CONTRACTS: the typed
command surface (grammar, proposal envelopes, method registry, transport
wire shapes), agent interaction protocol boundaries (MCP/A2A/AG-UI), the
permission/confirmation interaction models (approval requests,
trusted-surface confirmations, intent-at-most parsing), the browser
Extension boundary (versioned, permission-scoped manifests, host-page
origin binding, explicit request/response envelopes), and the
developer/external-agent API contracts (versioned, deterministic,
total-error, with explicit capability disclosure).

It does NOT own: financial truth (INV-1 — the financial protocol lane),
money semantics (INV-2 — the grammar carries VERBATIM amount tokens,
never floats), authorization or policy decisions (trust/security lanes —
this surface references authority at most opaquely), capability/connection
state (P2-W1), session/token STORES or transport I/O (composition roots
own stores and physical channels; this package owns the decision laws and
the typed shapes), or any rendering (framework consumers render these
contracts; the package contains no DOM, no framework, no network).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `platform` — `may_depend_on: [contracts,
platform]`. P7-W3 pins the package to the v1 platform pattern: **zero
runtime dependencies and ZERO PaySwap sibling imports** (no tsconfig paths
entries). Cross-lane wire shapes the surface consumes are pinned
STRUCTURALLY byte-identical, locally (`PrincipalRef`, `AuthorityScope`,
transport envelopes, approval channels, the protocol envelope fields);
the Tech Lead wires the real imports at integration — exactly as the
Phase-1/2 lanes pinned AmountSpec and the trust link. Machine-checked by
test/boundary.test.ts: every src module specifier is relative; every test
module specifier is relative or one of the exact toolchain specifiers
{vitest, node:fs, node:path, node:crypto} (the battery runner + the
ambient-declared builtins the boundary scanner/fixtures use); no
`@payswap/*` import exists anywhere; no built-in-module import exists in
src; no randomness/ambient-clock/timer/network appears in src; every file
<= 400 lines; devDependencies are exactly typescript + vitest.

## 2. The laws (numbered)

**LAW 1 — The authority firewall (the headline law).** The command surface
NEVER carries financial authorization: commands are PROPOSALS/INPUTS —
proposal inputs + observations, never financial authority (INV-9: agents
and LLMs cannot declare financial truth; INV-23: the interaction surface
never owns financial truth). Encoded structurally FOUR ways:
- the proposal envelope has NO authority fields (no signature, mandate,
  approval artifact, authorization decision, settlement/finality claim);
  `assertProposalPayloadIsAuthorityFree` deep-scans every payload and
  rejects secret/credential/token/signature/mandate key material
  (INV-19 + authority material) with `FinancialAuthorityError`, listing
  every offending path; opaque REFERENCES (`approval:<hash>`, request
  hashes) remain legal;
- the method effect-class vocabulary is exactly `NO_EFFECT | OBSERVATION |
  PROPOSAL` — there is NO financial-execute member; a method descriptor
  cannot express execute/sign/settle/withdraw/capture (machine-checked);
- the Extension permission vocabulary is exactly `SURFACE_RENDER |
  OBSERVATION_READ | COMMAND_PROPOSE | NOTIFICATION_RECEIVE` — no
  permission can express financial authority (machine-checked);
- no function in the package converts untrusted input (chat text,
  extension messages, agent messages) into authority. The only constructor
  of authenticated confirmations is the trusted-channel seam; chat parsing
  returns an INTENT AT MOST (the return type has no artifact variant).

**LAW 2 — Transports are typed shapes, never I/O.** Hashing (SHA-256),
signing (HMAC-SHA256), clocks and id minting are injected PORTS
(`RequestHasher`, `HmacPort`, `CommandClock`, `IdFactory`) with the Hex64
wire form and contract probes (`assertHasherContract`,
`assertHmacContract`). src performs no cryptography, reads no clock, mints
no entropy (the P4-W3 transports-as-contracts doctrine applied to the
interaction surface).

**LAW 3 — Explicit versioning, no implicit default.** Every request pins
an API version (`X-PaySwap-API-Version`; `COMMAND_SURFACE_API_VERSION` =
1.0.0); the Extension boundary carries an INDEPENDENT pin
(`EXTENSION_BOUNDARY_API_VERSION` = 1.0.0); the proposal envelope carries
`COMMAND_ENVELOPE_SCHEMA_VERSION` = 1. Foreign versions fail closed with
`UNSUPPORTED_VERSION` — never a silent fallback.

**LAW 4 — Total error, fail closed.** Every failure surfaces as a typed
`CommandError` (stable code + category + details) mapped deterministically
onto the wire `ApiError` model. Category -> HTTP status is exhaustive and
deterministic; EXTERNAL_AMBIGUITY maps to 409 + `X-PaySwap-Outcome:
unknown` + a REQUIRED reconciliationRef — never a generic 500 (INV-4:
UNKNOWN is not FAILED; ambiguity is resolved by reconciliation, never
coerced and never blindly retried — an ambiguous idempotent outcome
REPLAYS its recorded result).

**LAW 5 — Idempotency at the contract level (INV-6).** Every mutating
request carries an idempotency key (envelope validation law); every
effect-bearing method descriptor declares `idempotencyRelevant: true`;
the begin decision table (`resolveBeginOutcome`) is pure: no record =>
BEGIN; same key + different command hash => CONFLICT; IN_FLIGHT/COMPLETED
+ same hash => REPLAY; FAILED + same hash => BEGIN (retry re-arms).

**LAW 6 — The Extension boundary has no ambient authority.** The extension
API surface is typed, versioned, permission-scoped: manifests bind
explicit host origins, declare effect-bearing methods UP FRONT, and hold
permissions from the closed vocabulary; every effect-bearing call is an
EXPLICIT request (typed envelope: protocol marker + version + requestId +
method) with a typed response envelope (RESULT | ERROR); the gate
(`assertExtensionRequestAllowed`) fails closed on unknown methods,
undeclared effect-bearing requests, and missing COMMAND_PROPOSE
permission. The extension IMPLEMENTATION is product work outside this
lane.

**LAW 7 — Developer/external-agent APIs are contracts.** Versioned
(explicit pin), deterministic (sorted capability disclosure; deep-equal on
repeat), total-error, with EXPLICIT capability disclosure
(`describeDeveloperApi`) and an explicit agent-visible projection
(`projectExternalAgentApi`): only `agentCallable` methods, each carrying
its REQUIRED authority declaration — an external agent never receives an
unrestricted surface, and tools/cards/skills declare `requiredAuthority`
they can never mint (INV-12 attenuation discipline).

**LAW 8 — Permission/confirmation interaction models.** Approval requests
bind principal + scope + request hash + strict-UTC expiry + channel;
rendered messages MUST carry the trusted-surface deep link (a bare chat
reply is never the completion path); the messaging gateway is capability-
gated (a channel that cannot render approval requests never renders one);
inbound replies are intents at most, always marked
`requiresTrustedSurfaceConfirmation: true`.

**LAW 9 — Timestamps are DATA.** issuedAtMs/expiresAtMs/registeredAtMs
are bigint DATA; wire ISO strings are strict UTC (civil-calendar integer
math — no JS Date, no ambient clock); replay windows and verification
times are explicit parameters.

**LAW 10 — Sessions fail closed.** The lookup decision table is pure and
ordered: REVOKED -> EXPIRED -> STALE_SECURITY_EPOCH -> valid. A stale
credential epoch can never authenticate; agent principals authenticate via
agent keys, never tenant sessions; tokens are deterministic HMAC material
over the canonical versioned payload (monotonic uniqueness, never
entropy).

## 3. Wire-surface table

| Module | Wire surface |
|---|---|
| version.ts | API version pins + explicit-versioning law + envelope schema pin |
| errors.ts | CommandError taxonomy (10 categories; INV-4 isFailureOutcome law) |
| identifiers.ts | Branded ids (Command/CommandRequest/Correlation/Message/ExtensionInstance/SessionToken) + PrincipalRef structural mirror |
| ports.ts | CommandClock/IdFactory/RequestHasher/HmacPort + deterministic reference implementations + Hex64 + constant-time compare |
| canonical.ts | canonicalJson (sorted keys, no whitespace) + bigint-safe transform + strict ISO-8601 UTC DATA parsing |
| command-envelope.ts | CommandProposalEnvelope + IdempotencyScope/Record/BeginOutcome + registrar port + the authority-firewall scan + the begin decision table |
| command-grammar.ts | The six verbs + parse/prefill/disambiguation/no-result turn + keyboard model + chords |
| transport.ts | RequestAuth/RequestEnvelope/ResponseEnvelope/ApiError/HttpTransportResult + validation + status mapping + toWireError + authenticateRequest |
| permission.ts | AuthorityScope + approval channels + interaction models + the Extension permission vocabulary |
| method-registry.ts | MethodDescriptor + effect-class vocabulary + the deterministic registry + disclosure |
| agent-interaction.ts | CommandRef/CapabilityRef + MCP tools + A2A cards/messages/skills + AG-UI events + validators |
| approval-interaction.ts | ApprovalRequest/Message + intent-at-most parsing + the trusted-channel seam + request hashing |
| approval-artifact.ts | The signed artifact contract + signing payload + verify + adjudicateConfirmation + artifact refs |
| messaging-gateway.ts | Channel declarations + the gated gateway (typed next steps, intents at most) |
| session-contract.ts | Tenant/Identity/Session/SessionLookup + the fail-closed decision table + token material |
| webhook-delivery.ts | WebhookEventEnvelope + sign/verify via ports + replay window + deterministic backoff + transport port |
| extension-boundary.ts | ExtensionManifest + message/response envelopes + host bindings + the no-ambient-authority gate |
| developer-api.ts | DeveloperApiDescriptor + capability disclosure + the external-agent projection |

## 4. Pin laws + TL integration contract

- `COMMAND_SURFACE_API_VERSION = '1.0.0'` (semver-shaped; the old
  repository's date-pin '2026-09-30' is NOT carried — re-pinned per the
  canonical surface pattern).
- `EXTENSION_BOUNDARY_API_VERSION = '1.0.0'` (independent pin).
- `COMMAND_ENVELOPE_SCHEMA_VERSION = 1` (integer, mirroring the old
  protocol envelope pin).
- The six grammar verbs are FROZEN: pay · request · invoice · link ·
  convert · withdraw (one set everywhere; withdraw routes to the Balances
  withdraw flow).
- PrincipalRef/AuthorityScope/transport envelopes/approval channels are
  STRUCTURAL MIRRORS of the canonical wire shapes (byte-identical, local).
  TL INTEGRATION: at accept-time the Tech Lead may (a) add
  `packages/command: platform` to MODULE-OWNERSHIP.yaml's package_layers
  annotations, (b) swap the structural mirrors for real type-only imports
  (`@payswap/trust`, `@payswap/protocol`, `@payswap/surface`) exactly as
  done for the P1/P2 lanes, and (c) wire the ports to the platform
  substrate (rpc/server transports, the secrets vault, the system clock).
  None of those steps may change a wire shape pinned here.

## 5. Determinism and boundary discipline

No ambient clock, network, filesystem or randomness anywhere in src/**
(timestamps are DATA; verification times are parameters). Pure contracts:
same inputs -> same outputs (machine-checked for the grammar, envelopes,
registries, disclosures, projections, tokens and signatures). Every file
<= 400 lines (src AND test). No TS enum/namespace. Zero runtime
dependencies; devDependencies exactly typescript + vitest; no node:
imports in src (the boundary test enforces relative-only src specifiers;
tests may use exactly {vitest, node:fs, node:path, node:crypto}).

## 6. Old-repository reconciliation (honest register)

Porting surface: MMP-04 (`@payswap/api`, 6f/99t) + the P7-W3 share of
MMP-35 (`@payswap/ux`). File-level receipt:

| Old file (payswap.org@8a735bf) | Lines | New home | Class |
|---|---|---|---|
| api/src/identity.ts | 306 | session-contract.ts (222) | ADAPT: contracts + pure decision table; the stateful SessionManager store is NOT ported (D-1) |
| api/src/approvals.ts | 532 | approval-interaction.ts (324) + approval-artifact.ts (210) | ADAPT: request/message contracts, intent-at-most parsing, the trusted-channel seam, HMAC signing via ports; the pending-record store is NOT ported (D-1) |
| api/src/grants.ts | 279 | (shapes only) transport.ts evidenceRef + approval refs | ADAPT (concept-level): adjudication is the trust lane's authority (D-2); artifact-verification laws preserved |
| api/src/http.ts | 1125 | transport.ts (365) + method-registry.ts (233) + command-envelope.ts (370) | ADAPT: envelopes, validation, status mapping, authentication decision, idempotency table; the route/handler orchestration is NOT ported (D-3) |
| api/src/webhooks.ts | 268 | webhook-delivery.ts (243) | ADAPT: envelope + signing/verification via ports + backoff math; the dispatcher scheduling store is NOT ported (D-1) |
| api/src/index.ts | 21 | index.ts (97) | ADAPT |
| ux/src/command-center.ts (grammar section) | ~380 | command-grammar.ts (396) | PORT: the six verbs, parser, pre-fill, chips, no-result turn, keyboard model — semantics unchanged |
| ux/src/trusted-approvals.ts | 176 | approval-interaction.ts + approval-artifact.ts | ADAPT: intent-at-most + trusted-surface laws onto the contract functions |
| ux/src/messaging-adapters.ts | 293 | messaging-gateway.ts (311) | ADAPT: the gated gateway; typed next-step descriptors replace the P7-W1 view-model ViewAction (D-4) |
| interfaces/src/http.ts (consumed shapes) | 198 | transport.ts | PORT (shapes; the interfaces package itself is MMP-12/P2-W3's lane) |
| interfaces/src/approval.ts (consumed shapes) | 167 | approval-interaction.ts + approval-artifact.ts | PORT (shapes + laws; D-5 for the hashing port) |
| interfaces/src/webhooks.ts (consumed shapes) | 155 | webhook-delivery.ts | ADAPT (sign/verify via ports; D-5) |
| interfaces/src/canonical-json.ts | 50 | canonical.ts | PORT (verbatim semantics; its old tests are P2-W3's surface) |
| interfaces/src/agent-protocols.ts | 149 | agent-interaction.ts (353) | ADAPT (shapes + net-new validators) |
| protocol envelope/idempotency (consumed shapes) | ~300 | command-envelope.ts | ADAPT (proposal re-encoding, schema pin, firewall scan) |

### The ux-split receipt (file-by-file, MMP-35)

| Old ux file (lines / tests) | Share |
|---|---|
| command-center.ts grammar section (~380 / command-grammar.test.ts 23t) | **P7-W3 (this lane)** -> command-grammar.ts |
| trusted-approvals.ts (176 / 8t) | **P7-W3 (this lane)** -> approval-interaction.ts + approval-artifact.ts |
| messaging-adapters.ts (293 / 14t) | **P7-W3 (this lane)** -> messaging-gateway.ts |
| command-center.ts view-model/search/inbox/work-graph/economic-controls/provider-plane (~2050 / command-center.test.ts 38t + provider-plane 27t + sidebar 24t) | P7-W1 (Web product lane — NOT ported here) |
| journeys.ts (2352 / 40t) | P7-W1 |
| product-journeys.ts (3274 / 55t) | P7-W1 |
| product-ia.ts (1280 / 32t) | P7-W1 |
| honest-states.ts (764 / 19t + outcome-vocabulary 16t) | P7-W1 (+ P2-W3 terminal-state mapping) |
| error-reasons.ts (269 / 15t) | P7-W1 |
| incumbent-views.ts (274 / 12t) | P7-W1 |
| index.ts (49 / boundary 9t) | P7-W1 |

## 7. Limitations (honest register)

1. **No transport I/O.** The package pins wire shapes and decision laws;
   physical delivery (HTTP servers, extension runtime messaging, webhook
   dispatch) is composition-root work (D-3, LAW 2).
2. **No session/approval/idempotency STORES.** The decision tables are
   pure; durable stores implement the registrar/manager ports (D-1).
3. **No authorization evaluation.** Grant adjudication, mandate matching
   and artifact redemption are the trust lane's authority (D-2); this
   surface references authority opaquely.
4. **The grammar's amount stays a verbatim string.** Normalization to
   AmountSpec is the money layer's authority (INV-2 discipline).
5. **The Extension boundary is contracts only.** The extension
   implementation (manifest packaging, runtime channel, UI) is product
   work outside this lane.
6. **The method registry ships no methods.** The registry vocabulary +
   laws are the contract; the canonical method set lands with the product
   lanes (P7-W1/P7-W2) and the TL integration.
