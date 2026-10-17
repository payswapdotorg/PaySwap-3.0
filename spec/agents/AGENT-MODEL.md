# PaySwap 3.0 Agent Model — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P3-W1)
Package: `@payswap/agents` (`packages/agents/`)
Authority owner: Intelligence and Learning Authority (spec/architecture/AUTHORITY-MODEL.md)
Work order: P3-W1 (spec/dependency/work-orders.md: "Agent Body/Instance/Package,
Organizations, memory boundary and communications")
Evidence: docs/agents-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the agent plane. The package is the
implementation; where code and this document disagree, that is a defect
(either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The agent plane owns the AGENT MODEL: Agent Bodies (what an agent can do),
Agent Instances (a Body bound to a principal under a replaceable model
binding), Agent Packages (certifiable distributables), ORGANIZATIONS as
versioned graphs of Bodies/Instances, the organization memory boundary and
communications, and agent PROPOSALS.

It does NOT own: financial truth (INV-1, the financial protocol lane),
money semantics (INV-2, the financial lane's bridge), authority (trust
lane — principals, mandates, evaluation, attenuation), hard security
policy (security lane), or the Director/execution graph (P3-W2). An agent
or organization NEVER authorizes a financial effect: it proposes and
orchestrates; authority is resolved exclusively through the trust lane.

### Layer law

`MODULE-OWNERSHIP.yaml` layer `intelligence` — `may_depend_on:
[economic, capability, contracts]`, `cannot_authorize_financial_effects:
true`. P3-W1 pins the package as a RUNTIME LEAF: **zero runtime
dependencies**. The ONE accepted sibling import is TYPE-ONLY (`AmountSpec`,
`MandateRef` and the authority wire types from `@payswap/trust`, the
accepted wire authority — the P1/P2 integration pattern, resolved at
typecheck time via tsconfig paths, erased at runtime). Machine-checked by
test/boundary.test.ts: every src import is relative except the type-only
trust link; no randomness/ambient-clock/timer/fs/network in src/**; every
file <= 400 lines; no TS enum/namespace; devDependencies exactly
typescript + vitest.

## 2. The agent model

```
AgentBody  --(possess: replaceable ModelBinding)-->  AgentInstance
     |                                                  |
AgentPackage (§13 lifecycle)                    Organization (versioned graph)
                                                      |
                    communication / delegation / memory / budgets / evaluators /
                    termination / safety policy
```

- **AgentBody** — the model-independent contract: declared interfaces
  (typed protocol artifacts in/out), capability descriptors, constraints.
  NO model, soul, provider, prompt or weights field (type-level asserted;
  the Body contract key is a content digest over interfaces+capabilities).
- **AgentInstance** — `id` + Body version pin + principal reference +
  OPTIONAL `ModelBinding` + runtime state. `rebindModel` swaps the model
  without touching Body-contract compatibility; multiple DISTINCT models
  can possess ONE Body (`possess`/`possessorsOf`/`possessingBindings`).
- **AgentPackage** — the §13 distributable: Bodies, organization
  templates, required extensions, security-epoch and runtime requirements,
  model compatibility, evaluation suite, provenance. Lifecycle:
  DRAFT → STATIC_ANALYSIS → BENCHMARKED → SECURITY_REVIEW → CERTIFIED →
  AVAILABLE → SUSPENDED → RETIRED (single forward steps; AVAILABLE↔SUSPENDED
  toggle; RETIRED terminal). The evidence ledger makes every promotion
  explicit (actor, timestamp, evidence refs), certification metadata
  (reviewers + evaluation reports) mandatory at CERTIFIED, and publish
  SEALS the distributable content hash (deep-frozen; integrity re-verified
  on resume; tampering fails closed).
- **Organization** — a VERSIONED GRAPH (FROZEN §7): instances with
  communication edges and delegation edges, a memory policy, budgets,
  evaluators, a termination policy and a safety policy. Releasing a draft
  validates the graph, freezes a content hash, deep-freezes the result.
  Released versions are immutable; `derivedFrom` lineage pins each version
  to its predecessor's frozen hash; `nextOrganizationVersion` derives the
  next draft explicitly. Only RELEASED versions execute.

## 3. Strategy vs Organization (§7 law)

Strategy answers WHAT happens. Organization answers WHO or WHAT executes it.

- `StrategyRecommendation` is the advisory WHAT: a strategy id, rationale,
  and an optional advisory citation of an organization version. It
  structurally carries NO executors, instances, grants, authority or
  signature fields (type-level asserted by weak-type detection).
- `StrategyAssignment` pins the WHAT and the WHO side by side: versioned
  (`schemaVersion: 1`), content-hashed over the strategy + the
  organization's FROZEN release hash, and advisory-only — the WHAT/WHO
  must agree, and no assignment confers any right to act.
- `canStrategyExecuteAlone` is `false` for every strategy, by construction
  and by type. The ONLY execution entry point
  (`executeOrganizationCommand`) takes a RELEASED organization plus an
  INJECTED authority adapter; there is no code path from a strategy to an
  effect.

## 4. Proposals never authorize (INV-9 / INV-10)

An `AgentProposal` is a typed, VERSIONED recommendation record
(`schemaVersion: 1`): proposal id, proposing instance, type
(money_movement | strategy | work_action | informational), opaque advisory
payload, rationale, evidence refs, expiry. It is structurally distinct
from a protocol command:

- no idempotency key, command id, authorization, authority envelope,
  mandate, permission grant, signature or approvals field;
- no obligation/clearing/settlement/reservation/netting/finality artifact
  id — the P3-W1 marker-field vocabulary (assertNotProtocolCommand) is
  enforced at ANY nesting depth, with cycle safety;
- no constructor path to obligation, clearing, settlement, reservation,
  netting or finality — `makeProposal` validates and returns a record.

Text that merely DISCUSSES settlement stays legal: the guard scans FIELD
NAMES, not prose. Authority lives exclusively in the trust lane.

## 5. The authority port (execution)

Organization execution is deterministic scheduling over a RELEASED graph:

1. **Participation** — breadth-first relay over communication edges from
   the initiating instance (edge array order). Authority never flows to
   unreachable nodes.
2. **No bypass** — EVERY acting node is resolved through the injected
   `OrganizationAuthorityAdapter.evaluate(...)` (the trust lane's evaluate
   at the composition root). Denials are recorded in the trace.
3. **Attenuation only** — delegation edges mint child authority through
   `adapter.attenuateGrant(...)` ONLY (INV-12): one code path, the child
   narrowed to exactly the command's action/resource, grantee = the
   delegate, full lineage back to the root grant.
4. **Fail-closed delegation** — an edge fires only when its source acted
   with ALLOW, a pool grant carries the edge's mandate, and that grant's
   grantee IS the source principal. Anything else is recorded REJECTED.

The port is TYPE-COMPATIBLE with @payswap/trust's own functions
(compile-time asserted: `typeof trust.evaluate` etc. satisfy the port; the
real trust EpochState is assignable to the local structural
`AuthorityEpochState` view). Evidence-lineage law: an ALLOW decision
cites the authorizing grant as `grant:<grantId>` evidence so delegated
action is attributable.

## 6. Memory boundary (§7 "memory")

Organization memory is a typed, policy-bounded artifact stream — never
ambient shared state (laws M1-M5):

- M1 writers are participants of the organization version;
- M2 retention bounds lifetime: `ephemeral` retains NOTHING (writes fail
  closed), `session` keeps records until an explicit close and never
  reopens, `persistent` is append-only forever;
- M3 content boundary: no protocol-command shape, no root credentials
  (INV-19 discipline) — memory can never become an authority or secret
  carrier;
- M4 scope bounds reads: `isolated` = own records only, `shared` = all
  records of the version; non-participants read nothing;
- M5 records are frozen and the record list is append-only.

Memory is scoped to one (organization, version); a new version starts a
fresh store — carry-forward is never silent.

## 7. Communications (§7 "communication", §24 typed artifacts)

A message travels ONLY along a DECLARED communication edge of a RELEASED
organization version — same version, same channel, declared sender and
receiver (laws C1-C5). Payloads are scanned (command shape + root
credentials). Delivery is deterministic (edge array order), evidenced and
immutable (deep-frozen delivered records); broadcast fans out along the
version's edges in order and fails closed when no receiver is declared.
Communication never crosses organization versions.

## 8. Budgets (§7 "budgets")

Released budgets are exact AmountSpec ceilings. The budget ledger (laws
B1-B5) records evidenced spends by participants against DECLARED budgets,
in exact integer minor units (INV-2; internal add/compare/subtract
helpers only — money semantics remain the financial lane's), one currency
per budget (a EUR ceiling never bounds USD), fails closed with
`BudgetExhaustedError` at the ceiling (never negative, never
best-effort), and keeps an append-only spend trail.

## 9. Termination and safety policy (§7)

- `assessTermination` evaluates a run-state snapshot against the released
  termination policy with the built-in conditions `budget-exhausted`,
  `safety-violation`, `deadline-elapsed` (plus composition-root
  extensions). An UNREGISTERED condition fails closed: the run must
  terminate. When the policy requires human approval, termination becomes
  effective only with an approval artifact reference
  (`applyTerminationApproval`).
- `SafetyPolicyGate` registers a concrete check per declared hard
  constraint. An action is gated through EVERY declared constraint; a
  policy citing an UNREGISTERED constraint blocks every action (an
  unverifiable safety policy is not a policy).

## 10. The runtime contract (§20)

`AgentRuntimeContract`: createSession, execute, streamEvents, approve,
requestTool, checkpoint, pause, resume, cancel, inspect — typed
signatures, no implementation. The reference runtime is deterministic
(injected clock, id factory, executor seam — no wall clock, random ids,
LLM or HTTP inside the runtime), event-sourced (append-only per-session
logs; checkpoint snapshots; `restoreCheckpoint` rewinds runtime state
while the log is retained — historical evidence is immutable), with real
pause/resume/cancel state transitions (terminal states monotonic) and the
FAIL-CLOSED FINANCIAL TOOL GATE: a financial-effect tool call requires a
decision reference resolvable to a trust-lane ALLOW decision; absent,
unknown, denied or needs-approval references REJECT (never best-effort);
unknown tools are denied; construction with financial tools but no
decision source refuses to start. External protocols (MCP, A2A, AG-UI,
REST) are edge adapters to this contract, never domain authority.

## 11. Smart accounts and session keys (§12, INV-19)

User agents may operate non-custodial smart accounts through
provider-neutral SmartAccountCapability. Session-key authority is always
bounded on four axes — exact actions (no wildcards), exact resources, an
exact max total value (AmountSpec), and a finite expiry
(`validateSessionKeyEnvelope`). The ROOT account credential never enters
a session or model context: structurally (only SessionCredentialRef fits
the SessionContext credential slot) and at runtime
(`assertNoRootCredential` scans any context value at any depth).

## 12. Not in this package (deliberately)

- The Director, Economic Execution Graph and strategy MODEL (P3-W2) —
  this package provides the Strategy-vs-Organization LAW and advisory
  records only.
- ZCode runtime/tool/MCP bridges (P3-W3) — the executor and
  authority-adapter seams exist for that wiring.
- Real authority evaluation/attenuation (trust lane), provider
  observation (capability lane), and money semantics (financial lane).
