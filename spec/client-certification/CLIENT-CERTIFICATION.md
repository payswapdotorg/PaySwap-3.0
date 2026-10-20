# CLIENT-CERTIFICATION — @payswap/client-certification

Work Order **P8-W2** (lane `p8-w2`, base `main` @ `f9392a3`) — the
security + UX/client/browser certification suite of the final,
operator-authorized certification wave (2026-10-20).

## Scope

The package owns the **CLIENT-SURFACE HONESTY CERTIFICATION LAW**:
deterministic gates and audit contracts that any customer-facing
surface (web / desktop / extension / command) must pass before
release. It certifies the CONTRACTS experience surfaces declare —
states, actions, boundaries, modes, accessibility, responsiveness,
recorded browser runs — and folds them into one escalate-only verdict.

It is a **leaf in flight**: zero runtime dependencies, zero
`@payswap/*` imports, no tsconfig paths. Every cross-lane wire shape it
consumes is a LOCAL STRUCTURAL PIN (`src/pins/*.ts`, value-pinned at
base `f9392a3`; the TL wires the real imports at integration).

## Layer law

Declared layer: **`security`** — hard policy gates,
`cannot_downgrade_block`. A failed client gate HALTS the release and
**cannot be waived or downgraded** (no such API exists; waiver and
downgrade requests are always refused and escalated). The only path
back from a halt is a NEW certification run whose subject carries
verified remediation evidence.

The package owns **client-certification authority, not experience
implementation**: UI stays in experience-layer packages
(`ui`, `web`, `desktop`); this package never renders, never owns DOM
machinery, never ships tokens — it certifies the contracts those
packages declare. (The boundary guard enforces the no-UI-machinery law
textually; `test/boundary.test.ts`.)

## The ten hard laws

Each law has a dedicated gate in `src/` and a dedicated test class in
`test/` (the evidence record maps claims → test sites):

1. **SECRET BOUNDARY** (`src/secret-boundary.ts`) — secrets never reach
   client-renderable state, model-visible context, logs or artifacts.
   The four-probe scan uses the onchain-security vocabulary pinned by
   value (forbidden key names, raw-key/mnemonic/PEM/token shape
   detectors, redaction markers). The **scrubber contract** (total,
   value-redacting, marker-emitting) is certified over runtime-assembled
   secret-bearing fixtures. Violations BLOCK.
2. **DEAD-ACTION AUDIT** (`src/dead-action.ts`) — every customer-visible
   action must resolve a machine-checkable
   `action -> contract -> effect` lineage against declared registries.
   A dead action (renders, accepts input, does nothing), an unevidenced
   effect, or a fake-success action (success promised over a simulated
   effect) is a certification FAILURE. The audit emits the resolved
   lineage table.
3. **TRUTHFUL CUSTOMER-FACING STATES** (`src/state-honesty.ts`) — every
   consequential state is `known-success` (evidence-backed),
   `known-failure` (reasoned, with recourse) or `unknown`
   (reason + reconciliation pointer). No synthetic success, no hidden
   mock path, and the pinned ui tone law: UNKNOWN renders `unknown` —
   never styled as failure or success.
4. **AUTHORIZED RECIPIENT CHANGES** (`src/recipient-authorization.ts`) —
   a recipient change after quote/eligibility always INVALIDATES the
   prior authorization (fresh eligibility + fresh quote conditions
   REQUIRED); a surface that silently carries stale authorization
   fails. Re-issuing is the only path — there is no repair API.
5. **FRESH ELIGIBILITY/QUOTE CONDITIONS** (same module) — freshness is
   carried WITH the state that displays it: eligibility about the prior
   recipient, observed before the change, or an expired quote displayed
   as current terms is a certification failure.
6. **SANDBOX/LIVE SEPARATION** (`src/sandbox-live.ts`) — modes are
   structurally distinct and PINNED PER SURFACE STATE (ambient mode
   inheritance is itself a violation). A test state can never present
   as live or declare live finality; live credentials (vault-custody
   only) never leak into test paths.
7. **ACCESSIBILITY CONTRACT** (`src/accessibility.ts`) — interactive
   elements carry name/role/value lineage; state changes are announced;
   every pointer path has a keyboard path; contrast targets are
   CONTRACT CONSTANTS (WCAG AA: 4.5 normal / 3 large / 3 non-text).
8. **RESPONSIVE/DEVICE CONTRACT** (`src/responsive-device.ts`) —
   breakpoints (767/768/1023/1024) and the ≥44px touch-target floor are
   contract constants; every interactive element resolves its
   device-class contract for all three classes.
9. **BROWSER/DEVICE VERIFICATION CONTRACT**
   (`src/browser-verification.ts`) — the repeatable deterministic form
   of the live browser verification: the six required checks
   (desktop, responsive-mobile, console-error, key-interaction,
   screenshot, real-API-wiring), the eleven-area completeness law, the
   viewport matrix law, the console-error law (defects FAIL;
   environmental errors must be documented limitations), the
   protocol-correlation law (wiring evidence binds to protocol ids,
   never DOM artifacts) and the INV-E04 screenshot-strength ceiling.
10. **GATE WALL** (`src/gate-wall.ts`) — the composed nine-gate run
    plus the wall: failed gates halt release; waiver and downgrade
    requests are always refused and escalated; remediation evidence is
    the only path back and still requires a NEW run; the wall receipt
    catches tampering (severity or gate-count drift).

## Browser-verification provenance

The live prior art is the **2026-10-19 Gate D record** —
`docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md` (resident-TL
live browser acceptance of the product surface at the audited HEAD:
real OAuth, the eleven-area map, the five honest outcome actions with
typed prerequisites, the console-error inventory, the in-gate defect
fix). This package makes those checks REPEATABLE as deterministic
contracts: a recorded run (the observation structure) folds into
PASS/FAIL with a digest. The LIVE browser run itself remains an
operational step — this package is the contract it must satisfy, not a
browser driver.

## Determinism and secret-freedom

Pure functions only; instants are explicit ISO-8601 inputs; digests
are canonical-JSON + FNV-1a (byte-identical across runs). No
secret-shaped literal exists anywhere in the package: the test battery
assembles secret-shaped fixtures at RUNTIME from fragments, and the
boundary guard proves both laws (source scan + fragments law).
