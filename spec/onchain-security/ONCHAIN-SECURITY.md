# PaySwap 3.0 Onchain Security — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P4-W2; R2-W2 rebuild)
Package: `@payswap/onchain-security` (`packages/onchain-security`)
Subpaths: `.` (kernel) · `./threat-intel` · `./adapters/eip712` · `./adapters/erc1271`
Authority owner: Policy and Governance Authority — hard constraints
(spec/architecture/AUTHORITY-MODEL.md); the security layer
(spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`)
Work order: P4-W2 (spec/dependency/work-orders.md: "onchain security —
signing requests, simulation, state diff, scoped authorization, security
gate and immediate recheck"); migration MMI-18 / MMP-21 / MMP-22
(spec/migration/MIGRATION-MATRIX.md)
Evidence: docs/onchain-security-evidence/BASELINE-VERIFICATION-RECORD.md
Rebuild: R2-W2 on base 69998881ab71a12e71b2e7d600c07dea292671d1

This document is the contract law of the onchain security plane. The
package is the implementation; where code and this document disagree,
that is a defect (either fix the code or file an ADR — never silently
diverge).

## 1. Position in the architecture

The onchain security plane owns the DETERMINISTIC SECURITY posture of
consequential onchain writes — the trusted-surface boundary between
intent preparation and user-controlled signing (SECURITY-MODEL.md,
NON-CUSTODY.md, AUTHORITY-MODEL.md; INV-18 pipeline law):

- what a write is (prepare: validated, frozen, content-addressed),
- what it is expected to change (the user-readable expected-state diff),
- whether it may proceed (deterministic BLOCK/ALLOW/UNKNOWN gates),
- who approved it (signed onchain authorization artifacts, minted ONLY
  by a trusted approval surface — INV-5),
- whether the world changed underneath it (the immediate pre-broadcast
  recheck; drift VOIDS, never auto-repairs),
- what power delegated signers hold (scoped signing delegation —
  INV-12),
- what threats surround it (the onchain threat-intelligence vocabulary
  the security layer OWNS: families, detectors, signals, the versioned
  deterministic threat policy, the adversarial analysis agent, the
  no-downgrade verdict composition — INV-21).

It does NOT own: chain/asset/protocol domain definitions (P4-W1), chain
adapters and transports (P4-W3), money semantics beyond the pinned
AmountSpec wire (INV-1/INV-2, the financial lane), trust-lane mandate
evaluation (P1-W3 — pinned structurally, never imported), key custody in
any form (NON-CUSTODY.md), or the immune-system runtime (P6-W3 —
composed through pure data + the wiring layer).

### Layer law (R2-W2)

`MODULE-OWNERSHIP.yaml` layer `security` — `may_depend_on: [trust,
capability, contracts]`; `cannot_downgrade_block: true`. P4-W2 pins this
package as a **ZERO-SIBLING leaf under the v1 pattern**: no `@payswap/*`
module specifier anywhere (src or test), no tsconfig `paths` entries,
zero runtime dependencies, devDependencies exactly the toolchain
(typescript + vitest). Every cross-lane contract shape this package
needs is pinned STRUCTURALLY in `src/pins/` (the accepted
structural-mirror pattern): the trust lane's AmountSpec / Principal /
Mandate / action patterns / approval wire / signing payload, the
capability lane's SmartContractExtension declaration, the execution
lane's quote disclosures (P5-W1 reference), the protocol lane's declared
state machine, and the shared ValidationError. Each pin is a structural
mirror — the real lane's contract remains assignable to the pin by
construction, so drift fails typecheck at the TL's integration station
(integration is TL accept-time). Machine-checked by
test/boundary.test.ts.

## 2. The consequential-write pipeline (INV-18)

```
PREPARED → SIMULATED → GATED_ALLOW → DIFF_READY → AUTHORIZED → RECHECKED → BROADCAST_HANDOFF
     ↘ GATED_UNKNOWN ↗             ↘ (drift) VOIDED                (terminal)
     ↘ BLOCKED (terminal — deterministic BLOCK; no exit, no override)
```

- `prepareWrite` is the ONLY entry: fail-closed validation, secret scan,
  deep freeze, content-addressing. One write targets exactly ONE chain
  (INV-17).
- Simulation is an OBSERVATION, never authority (INV-11):
  OUTCOME_UNKNOWN is first-class and is never FAILED (INV-4). No
  function in this package converts a simulation into authority.
- The gates are a DETERMINISTIC STATE EVALUATION over ten guard
  dimensions (chain, asset, amount, destination, spender_approval,
  expiry, route, protocol_identity, security_state,
  simulation_consistency) — pure function of (write, simulation?,
  versioned policy, composed security state, instant).
- The diff is what the user authorizes against; the artifact binds the
  diff digest.
- Authorization is minted ONLY by `TrustedApprovalSurface.approve()`,
  which re-verifies the request hash, RE-RUNS the gates with current
  policy+state (BLOCK/UNKNOWN cannot be approved into authority), refuses
  self-approval, and signs through a trusted-surface signer port
  (INV-19: the signer is opaque; key material never crosses).
- The recheck compares the re-observed world against EXACTLY what was
  authorized (13 drift dimensions); ANY drift VOIDS — there is no repair
  API.
- The kernel NEVER broadcasts: `handoffForBroadcast` produces a
  SigningRequest for a SignerAdapter (P4-W3 owns submission). Finality is
  observation/evidence/reconciliation, never the handoff receipt.

## 3. The cannot_downgrade_block law (INV-21) — encoded

Layer law `cannot_downgrade_block: true`, encoded at three levels
(src/block-law.ts; tests test/no-downgrade-law.test.ts):

1. **TYPE** — `NoBlockDowngrade<From, To>` resolves to `To` when the
   projection does not leave BLOCK, and to a descriptive error union
   otherwise; `BlockProjection<D>` is the sole lawful projection type of
   a BLOCK decision.
2. **RUNTIME** — `joinGateDecisions` is the ONLY composition primitive:
   a commutative, associative lattice join (ALLOW < UNKNOWN < BLOCK)
   where BLOCK dominates and reasons/checks/evidence only ACCUMULATE.
   No function in this package removes a block reason.
3. **REJECTION** — `attemptBlockDowngrade` ALWAYS throws (a tested
   first-class contract); `assertNoBlockDowngrade` is the fail-closed
   guard for re-evaluation flows (a fresh evaluation may keep or raise
   the restriction, never lower it).

The threat-intelligence lane extends the same law to the four-value
verdict vocabulary (`./threat-intel`): `composeThreatVerdict` is a join
(an agent can only HARDEN), a policy BLOCK overrides an agent ALLOW, a
kernel BLOCK is terminal, and a kernel UNKNOWN is floored at
REQUIRE_CONFIRMATION (`resolveOnchainSecurityDecision`).

## 4. The secrets law (INV-19, NON-CUSTODY.md) — shapes + policy only

Secrets handling in this package is SHAPES + POLICY — never key
material custody:

- `assertNoSecretMaterial` — the deep runtime scan (forbidden key names
  + raw-key/mnemonic value shapes) every agent-facing factory calls;
  a secret-bearing artifact is UNCONSTRUCTIBLE.
- `redactSecretShapedValues` — the display/log policy: a deep copy with
  opaque `[redacted:<shape>]` markers (originals never mutated;
  derived-identifier fields exempt).
- `opaqueCredentialRef` — the ONLY lawful secret reference: an opaque
  `{ kind: "vault_ref", vault, ref }` pointer; the vault (trusted
  surface) owns custody.
- `FindForbiddenSecretKeys<T>` / `SecretFree<T>` — the compile-time
  twins; the boundary test asserts `never` for every agent-facing
  contract.

## 5. The threat-intelligence vocabulary (the "./threat-intel" subpath)

Re-homed from the old repository's separate @payswap/onchain-threat-intel
package (MMP-22): the security layer OWNS the threat-intel vocabulary
(MODULE-OWNERSHIP layer `security` examples include threat-intel).

- 13 threat families with deterministic detectors (evidence-generating;
  exact BigInt-rational arithmetic; absence of intelligence is weak
  evidence only where policy demands coverage).
- Signals carry a MANDATORY evidence chain (observations + digests +
  exact deltas + note) and an integer-bps CALIBRATED CONFIDENCE; an
  evidence-free signal is structurally unconstructible.
- The versioned deterministic threat policy is AUTHORITATIVE
  (ALLOW | ALLOW_WITH_CONSTRAINTS | REQUIRE_CONFIRMATION | BLOCK;
  explicit family×severity table + confidence floors).
- The adversarial analysis agent is deterministic and ADVISORY ONLY
  (INV-9/INV-21): it recommends and FLAGs; `attemptAgentVerdictOverride`
  always throws.
- The immune-system bridge (advisory proposals restrict/quarantine/retire
  + threat-signature registrations) is structurally aligned with the
  advisory/signature publication inputs; the WIRING LAYER performs
  publication/enforcement (composition through pure data — the kernel
  `OnchainSecurityState` projection; TL accept-time integration).

## 6. Versioned, canonical wire shapes

All contracts are versioned (src/version.ts): KERNEL_WIRE_VERSION
`onchain-security-kernel/1`, THREAT_INTEL_WIRE_VERSION
`onchain-threat-intel/1`, ADAPTER_WIRE_VERSION
`onchain-signer-adapters/1`. A stamp changes only through an accepted
Work Order + ADR (INV-29 discipline).

## 7. Boundary rules (machine-checked by test/boundary.test.ts and
test/threat-intel/boundary.test.ts)

1. ZERO sibling imports: every src module specifier is RELATIVE
   (kernel AND threat-intel subpath).
2. tsconfig.json has NO paths entries.
3. EVM/EIP-712/ERC-1271 vocabulary lives ONLY in `src/adapters/*`
   (core contracts stay provider-neutral — INV-17).
4. Determinism: no randomness, no ambient clock, no timers, no network,
   no node: builtins in src.
5. Secret hygiene: no raw-key-shaped literal anywhere (fixtures are
   runtime-assembled).
6. Every file ≤ 400 lines; no TS enum; no TS namespace.
7. devDependencies exactly [typescript, vitest]; no dependencies;
   exports exactly `.`, `./threat-intel`, `./adapters/eip712`,
   `./adapters/erc1271`.
