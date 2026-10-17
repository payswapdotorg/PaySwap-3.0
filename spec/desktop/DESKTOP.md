# PaySwap 3.0 Desktop — Contract Document

Status: IMPLEMENTED (P7-W2, re-dispatch r2)
Package: `@zcode/desktop` (`packages/desktop/`)
Layer: platform (ZCode-substrate platform package; work order P7-W2)
Shell: the ZCode-derived native shell (Electron) — windows/sessions/
transports follow the ZCode Platform Baseline (docs/ZCODE-PLATFORM-
BASELINE.md), which is BINDING for platform mechanics; PaySwap 3.0 wins
for economic/product semantics.
Work order: P7-W2 (spec/dependency/work-orders.md: "PaySwap Desktop on
the ZCode-derived native shell using shared Surface/backend contracts.")
Evidence: docs/desktop-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the PaySwap Desktop product. The
package modules under `src/host/payswap/` are the implementation; where
code and this document disagree, that is a defect (either fix the code or
file an ADR — never silently diverge).

## 1. Position in the architecture

PaySwap Desktop is the PaySwap product surfaces (non-custodial payment
mission surface) composed over the SHARED Surface/backend contracts and
riding the ZCode-derived native shell. It owns PRESENTATION COMPOSITION
ONLY:

- the mission board: five outcome actions (pay/receive/move/convert/
  checkout) with honest dispatchability facts and the no-dead-buttons
  affordance law,
- the journey honest-states derivation (provider-verified observations
  ONLY — never submission),
- the quote/terms disclosure fold, the progress-timeline fold, the
  security-gate people-language fold, exact minor-unit money display,
- the delegated money-movement references (typed references ONLY),
- the desktop shell integration seams (window/session/transport per the
  substrate).

It does NOT own: financial truth (INV-1/INV-23 — the financial protocol
lane owns it), money semantics or arithmetic (INV-02 — the desktop
displays exact amounts and never computes financial truth), authorization
or policy decisions (trust/security lanes), capability/connection state
(P2-W1 capability fabric), provider execution (P2-W2 provider runtime),
any parallel payment engine (P5-W3 law: money movement is delegated via
typed references), or window/session/transport mechanics (the substrate
owns them; the product composes through them).

### Layer law and the structural-pin law

`MODULE-OWNERSHIP.yaml` layer `platform` — `may_depend_on: [contracts,
platform]`, `must_not_depend_on: [financial-implementation]`.
`packages/desktop` is a ZCode-SUBSTRATE platform package (`@zcode/desktop`).
SUBSTRATE LAW (work order hard constraint 5): **this package NEVER imports
`@payswap/*`** — not at runtime, not type-only. Every accepted shared
contract shape the product composes is pinned STRUCTURALLY in
`src/host/payswap/pins/` (the accepted local-pins pattern — the same
pattern `packages/provider-runtime/src/refs.ts` used to pin the protocol
lane's AuthorizationRef while that lane was in flight; the later-base
`packages/agents/src/pins.ts` is the named reference pattern, absent on
this base). The Tech Lead wires real imports at integration if/when the
substrate dependency law changes. Pins are versioned and canonical (see
§2).

Practical consequence honored by this lane: no dependency changes were
made to `packages/desktop/package.json` (the workspace lockfile stays
frozen — `pnpm install --frozen-lockfile` verifies green), and the
deterministic battery runs on the hoisted vitest already present in the
workspace (`node-linker=hoisted`).

## 2. The pin registry (pinned wire shapes)

`src/host/payswap/pins/pin-registry.ts` records every pin's provenance:
mirrored package + contract version + EXACT source commit + work order.
Pin set version: `1.0.0`; source commit: `2999bbb1658443b72ce9644f32ca
bbebdbecaa37` (Phase-2-complete STATE — the base this lane built on).

| Pin | Mirrors | Shapes |
|-----|---------|--------|
| surface.versioning | @payswap/surface 1.0.0 (P2-W3) | SURFACE_API_VERSION, SurfaceContractProvenance |
| surface.outcomes | @payswap/surface 1.0.0 (P2-W3) | the five outcome actions, dispatch authority, deployment context, capability fold shapes + registry data |
| surface.areas | @payswap/surface 1.0.0 (P2-W3) | the eleven-area IA with honest empty states + registry data |
| surface.money-view | @payswap/surface 1.0.0 (P2-W3) | AmountSpec wire pin, display inputs, digits resolution |
| surface.quote-terms | @payswap/surface 1.0.0 (P2-W3) | fee lines, rate provenance, expiry, estimate-vs-guarantee, conditions, source + view |
| surface.progress-states | @payswap/surface 1.0.0 (P2-W3) | sixteen stages, six statuses, observations, tones, views, facts |
| surface.security-vocabulary | @payswap/surface 1.0.0 (P2-W3) | BLOCK/ALLOW/UNKNOWN decision source + people-language view |
| surface.authorization-changes | @payswap/surface 1.0.0 (P2-W3) | the closed material-change vocabulary |
| protocol.lifecycle | @payswap/protocol 0.1.0 (P1-W2) | attempt states/events (OUTCOME_UNKNOWN exits only via reconciliation), seven distinct evidence kinds, opaque AuthorizationRef |
| provider-runtime.bridge-law | @payswap/provider-runtime 0.1.0 (P2-W2) | three-value result envelope + ambiguity reasons, AuthorizedCommand, SANDBOX/LIVE modes |

PIN LAW: pins are versioned (pin-set version; every pin records the
mirrored contract version), canonical (mirrored from the accepted source
at the recorded commit — never a paraphrase), closed (frozen vocabularies;
guards reject unknown members), opaque where the mirrored contract is
opaque (AuthorizationRef lineage: structural completeness only). Pins
carry NO financial authority — mirroring a shape never moves money.

Pin fidelity is machine-checked against RECORDED FIXTURES
(`test/fixtures/recorded-contract-vocabulary.{json,ts}`; recording method
documented in the fixture header): drift fails the battery rather than
silently widening a contract.

## 3. The desktop honest-states law

THE law of this product (work order hard constraint): **desktop UI states
derive from provider-verified observations (CONFIRMED/UNKNOWN/FAILED),
never from submission.** `product/honest-states.ts` is the law as code:

- A provider envelope outcome is REQUIRED to render a definitive state;
  an input with neither an observation nor an in-flight attempt record
  FAILS CLOSED (no fabricated state is renderable).
- CONFIRMED renders `CONFIRMED` (success tone).
- UNKNOWN renders `UNKNOWN_RECONCILING` (warning tone) — NEITHER failure
  NOR success (INV-04); reconciliation with the provider precedes any
  consequential retry; no blind retry exists on this surface.
- FAILED renders `FAILED` (danger tone) — retry is a NEW intent with
  fresh terms, never a blind re-run.
- An in-flight attempt with no observation yet renders
  `PENDING_OBSERVATION` (neutral tone) — in progress, NEVER a success:
  submission is not finality.
- The provider envelope OUTRANKS a lagging attempt record (the
  observation is the provider-verified fact).
- A protocol attempt held `OUTCOME_UNKNOWN` renders UNKNOWN_RECONCILING
  regardless of any envelope claim — reconciliation is authoritative for
  ambiguous external effects.
- A terminal attempt state contradicting the envelope renders
  UNKNOWN_RECONCILING with the dispute note — the desktop never
  adjudicates between authorities.

## 4. Delegated money movement (no parallel engine)

The desktop product COMPOSES shared contracts; it does NOT re-implement
engines (the P5-W3 law applies to desktop too). `product/delegation.ts`:

- Money movement is delegated via TYPED REFERENCES
  (`DesktopDelegatedMovementRef`: journey id + intent ref + opaque
  authorization lineage + declared amount + issued-at) to the backend
  plane that owns execution.
- The referenced journey MUST exist in the pinned outcome registry; the
  accepting plane is ALWAYS the journey's pinned dispatch authority —
  the desktop never re-routes journeys.
- The receipt is an ACKNOWLEDGEMENT ONLY — never finality, never success.
- There is NO execute/retry/cancel/confirm/settle/payout method anywhere
  on the desktop service surface (enforced structurally and tested).

## 5. Shell integration seams (substrate semantics, binding)

`shell/contracts.ts` + `shell/composition.ts`:

- WINDOW: the product surface binds to the primary desktop window
  created by the substrate's single window-creation path; the product
  declares WHAT it needs from a window (webContents id, label,
  attachment scope) — it has no window machinery of its own.
- SESSION: the product session derives from the substrate's window-host
  attachment scope (`{kind:"local"}` | `{kind:"remote", remoteSessionId}`)
  with the desktop client mode; session id generation is injectable
  (deterministic battery).
- TRANSPORT: the product service is exposed over the substrate's RPC
  stack — MessagePortProtocol → ChannelServer wrapped by
  LoggingChannelServer + NetworkTelemetryChannelServer (inherited
  safeguards; NEVER removed) → ProxyChannel.fromService — registered in
  the host ServiceCollection under channel `payswap-desktop`
  (kebab-case, the substrate's ServiceChannels convention).
- HOST WIRING: `registerPaySwapDesktopService(services, seam)` is
  composed in `src/host/index.ts` `InitLocal.initializeServices` after
  `wireLocalResourceTelemetry` (additive only) — the product rides the
  SAME service-port exposure path as every other host-owned service.
- LOGGER DISCIPLINE: the product logs through the injected host seam
  (writeHostLog-shaped); never a console bypass; no secret material is
  ever logged.

## 6. Deterministic battery

`packages/desktop/vitest.config.ts` (node environment) + the package
`test` script. NO electron runtime, NO network, NO window creation:
everything under test composes pinned shapes and shell seams with
recorded fixtures. Ten suites / 85 tests (see the evidence record for
per-file counts and the classification arithmetic: 8 ported/adapted
old-repo ux-vocabulary titles + 77 net-new).

## 7. Limitations and receipts

- Full electron builds/bundles were NOT attempted (network/runtime-asset
  heavy); the lane battery is typecheck + lint + deterministic suites,
  per the work order. Receipted in the evidence record.
- The renderer-side React composition of the mission surface (inside the
  @zcode/ui shell consumed by the desktop renderer) is deferred: this
  lane delivers the host-side product service and its deterministic
  contract-composition battery; the @zcode/ui shell is outside this
  lane's write surface (`packages/ui` is not `packages/desktop`).
- The structural pins are LOCAL by substrate law; when the TL's
  integration law allows @payswap/* imports into substrate packages, the
  pins can be swapped for real imports without behavior change (the pin
  fidelity battery documents the exact expected shapes).
