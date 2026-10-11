# PaySwap 3.0 Surface Contracts — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P2-W3)
Package: `@payswap/surface` (`packages/surface/`)
Layer: contracts (framework-independent, provider-neutral; work order P2-W3)
Consumers: Web (P7-W1), Desktop (P7-W2), Mobile/Extension/SDK/external-agent APIs (P7-W3)
Work order: P2-W3 (spec/dependency/work-orders.md)
Evidence: docs/surface-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the surface plane. The package is the
implementation; where code and this document disagree, that is a defect
(either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The surface owns PRESENTATION CONTRACTS ONLY (INV-22/INV-23):

- the five outcome actions with their honest dispatchability facts,
- the eleven operational areas of the navigation IA,
- the quote/terms disclosure projection,
- progress/exception/UNKNOWN state projections,
- authorization-change surfaces,
- capability/operation discovery projections,
- exact integer minor-unit money display,
- the BLOCK/ALLOW/UNKNOWN security vocabulary in people language.

It does NOT own: financial truth (INV-1/INV-23 — the financial protocol
lane owns it), money semantics or arithmetic (INV-02 — no money
add/scale/compare exists anywhere in this package), authorization or
policy decisions (trust/security lanes), capability/connection state (P2-W1
capability fabric), or any rendering (framework consumers render these
contracts; the package contains no DOM, no framework, no network).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `contracts` — `may_depend_on: [contracts]`
(ADR-0002). P2-W3 pins the surface as a ZERO-DEPENDENCY leaf: **zero
runtime dependencies, zero PaySwap sibling imports** (machine-checked by
test/boundary.test.ts). While the Phase-2 sibling lanes (P2-W1
`packages/capability`, P2-W2 `packages/provider-runtime`) are in flight,
every cross-lane contract shape the surface consumes is pinned
STRUCTURALLY as an opaque, versioned projection (typed envelope with
explicit content); the TL wires imports at integration — exactly as the
Phase-1 lanes pinned AmountSpec.

## 2. AmountSpec — the pinned wire format

The AmountSpec interface is PINNED, byte-identical to the Phase-1 pins
(P1-W1 economic, P1-W2 financial protocol, P1-W3 trust — the authoritative
wire type). Do not deviate:

```ts
interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}
```

- `currency` matches `/^[A-Z]{3}$/` — fiat ISO-style and onchain symbols
  share the shape.
- `minorUnits` is a canonical non-negative decimal integer string: no
  sign, no decimal point, no exponent, no leading zeros except `"0"`.

The surface package declares this shape structurally
(`src/amount-spec.ts`) because the contracts layer cannot import the trust
layer (duplicate-type risk accepted, TL-reconciled at integration — same
decision as the economic lane). All money that crosses the surface is this
wire form; display formatting derives from the minor-unit integer + the
currency's minor-unit digits. A binary float never touches an amount
(INV-02 at the display boundary).

## 3. Projection law (INV-23 — the UI never owns financial truth)

Every view this package produces is a PROJECTION:

- **References, never records.** Surface types carry references to
  authoritative records (`authorityRecordRef`, `evidenceRefs`,
  `previousTermsRef`/`currentTermsRef`, `approvedByRef`); they never
  duplicate a record as truth.
- **Display, never computation.** The surface displays what authorities
  declared: fee totals are displayed verbatim as DECLARED (or honestly
  "not declared" — never summed by the surface); rate values are displayed
  verbatim with provenance; limit bounds are displayed verbatim. No money
  arithmetic exists in this package.
- **Advisory, never authority.** The surface exports no authority verb
  (machine-checked: no export name matches
  authorize/commit/execute/sign/capture/settle/refund/cancel/approve/
  dispatch). Discovery views carry the INV-10 disclaimer; eligible
  operations are candidates, never authorizations.
- **Fail-closed.** Malformed wire amounts, a guarantee without provider
  backing, an eligible operation/corridor without a connected instance
  (INV-13), and a claimed BENEFICIARY_CREDITED without evidence (INV-24)
  all throw typed errors — never silently degrade into a fabricated
  disclosure.

## 4. Quote/terms disclosure (Wise §4.2 discipline, mapped)

`foldQuoteTerms(source, { now, display })` produces the two-level view:

- exact source/target amounts (AmountSpec wire form, formatted with
  integer arithmetic only);
- every fee line item disclosed verbatim; the declared total displayed
  verbatim or honestly "not declared" — never a surface-side sum (no
  hidden fees, no invented totals);
- rate value + provenance + as-of (+ declared rounding rule);
- expiry with an EXPLICIT clock input (`now` — deterministic; no ambient
  clock anywhere in the library); an expired quote leads with that fact;
- funding and recipient assumptions in people language;
- delivery estimate with the EXPLICIT guarantee-vs-estimate label: an
  ESTIMATE is never displayed as a guarantee, and a GUARANTEE requires a
  provider-backed `guaranteeBasis` (a guarantee without provider backing
  is refused — INV-24 discipline);
- locking/refresh/material-change conditions (material changes trigger
  the authorization-change surface, §6).

## 5. Progress/exception/UNKNOWN states (INV-04 at the UX boundary)

`foldProgressTimeline(observations, { now })` projects the canonical
16-stage lifecycle (Wise §4.3 one-truthful-lifecycle mapping). The surface
can SAY:

- **submission is not finality** — PAYOUT_SUBMITTED renders a provider
  acknowledgement, never finality;
- **a payout sent is not beneficiary credit** — PAYOUT_SENT carries the
  honest statement, and BENEFICIARY_CREDITED exists only as its own
  evidence-backed observation (claimed without evidence: refused);
- **UNKNOWN is not FAILED** — an UNKNOWN observation renders as neither
  failure nor success, with reconciliation-first wording and no blind
  retry (INV-04); FAILED renders honestly as failure;
- **late returns stay possible** — whenever a payout was sent, the view
  states that returns can arrive days or weeks later and that history is
  never rewritten (Wise §4.4); RETURNED/REFUNDED/CHARGED_BACK/CANCELLED
  render as new history, never as rewrites.

## 6. Authorization changes

`foldAuthorizationChange(record)` renders the material-change law:
revalidation is ALWAYS required; renewed customer authorization is
required exactly when the APPROVED TERMS changed (QUOTE_EXPIRED,
QUOTE_TERMS_CHANGED, RECIPIENT_CHANGED, AMOUNT_CHANGED,
FUNDING_METHOD_CHANGED, PROVIDER_OBSERVATION_CHANGED); authority-side
changes (MANDATE_REVOKED, SECURITY_EPOCH_ADVANCED) void the authorization
itself — revalidation alone cannot restore it.

## 7. Money display (INV-02 at the display boundary)

`formatMinorUnits`/`formatMoneyAmount` render exact integer minor-unit
amounts with INTEGER ARITHMETIC ONLY (bigint division with an exact
zero-padded remainder — a float never touches the amount). Currency
minor-unit digits and locale data are EXPLICIT INPUTS
(`MoneyDisplayInput`); the library never reads an ambient locale, clock,
registry or environment (machine-checked by the boundary test). The
honest labeled fallback is preserved: an unregistered code assumes 2
digits AND THE OUTPUT SAYS SO.

## 8. Security vocabulary (INV-04/INV-21 at the UX boundary)

`foldSecurityDecision` folds a structurally-pinned gate decision
(BLOCK/ALLOW/UNKNOWN) into people language: BLOCK stays BLOCK with a
no-override statement (security cannot downgrade BLOCK — and neither can
a display fold); UNKNOWN stays UNKNOWN (never rendered as failure or
success); ALLOW never claims blanket trust. `modeIndicator` makes
TEST/LIVE and TESTNET/MAINNET visible (INV-25; enforcement machinery is
provider-runtime P2-W2 territory).

## 9. Discovery projections (INV-10/INV-13)

`foldOperationDiscovery` (what the user can do next + why: eligibility
reasons, required fields, limits) and `foldCorridorCoverage` (a corridor
is a discovery projection over capabilities — never an authority, never
just a currency pair; the view references underlying capability
identities + versions). Catalogue support alone can never be offered as
executable: an eligible row without a connected instance is refused. An
all-unavailable discovery leads with the honest fact — never a failure
tone, nothing silently dropped.

## 10. Determinism and fail-closed posture

All folds are pure: same input, same view. Clocks, locale data and
currency registries are EXPLICIT inputs. Validation is fail-closed
through typed errors (`InvalidSurfaceAmountError`, `InvalidQuoteTermsError`,
`InvalidProgressObservationError`, `InvalidAuthorizationChangeError`,
`InvalidDiscoverySourceError`, `InvalidCorridorSourceError`). The package
exports source directly (`.ts` specifiers, `allowImportingTsExtensions`,
Node >= 22.7 type stripping) with no build step.

## 11. Surface-boundary law catalog (SV ids cited by code and tests)

- SV-1: framework-independent, zero runtime dependencies, zero sibling
  imports (INV-22/INV-27; machine-checked).
- SV-2: exact integer minor-unit display only; floats never touch amounts
  (INV-02 at the display boundary).
- SV-3: UNKNOWN never rendered as failure or success (INV-04 at the UX
  boundary).
- SV-4: no fake success states — submission is not finality; a payout
  sent is not beneficiary credit; BENEFICIARY_CREDITED requires evidence
  (INV-24).
- SV-5: an estimate is never displayed as a guarantee unless a
  provider-backed contract says so (Wise §4.2 mapped).
- SV-6: the UI is a projection — references to authoritative records,
  never duplicates as truth; no authority verbs on the surface (INV-23).
- SV-7: discovery output cannot authorize execution (INV-10); catalogue
  support is not executable connection (INV-13).
- SV-8: honest empty/unavailable states — never dead actions, never
  silent drops, never failure tones for non-failures.
- SV-9: deterministic library code — locale/clock/registry as explicit
  inputs (machine-checked).
- SV-10: BLOCK is never softened (INV-21 at the display boundary).
