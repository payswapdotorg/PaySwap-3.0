# @payswap/operations — Lane Specification (P8-W3, lane p8-w3)

Status: DELIVERED (4-commit protocol complete; see docs/release-evidence/P8-W3-VERIFICATION-RECORD.md + docs/release-evidence/RELEASE-READINESS-RECORD.md)
Package: `packages/operations` — `@payswap/operations` v0.1.0
Work Order: P8-W3 (release/operations + reproducible-release tooling + the Gate E release-readiness record — the operator-authorized final wave's release lane)
Rebuild lane: p8-w3 (base `b01a0a9` = the integration commit that closed P8-W1+P8-W2; 28 work orders complete at dispatch)
Porting source (evidence, not authority): payswap.org @ `8a735bf` — the assigned slice of packages/operations (12 src files MINUS browser-verification.ts, which sibling W2 owns; dispositions in the evidence record)

## 1. What this package is

The release/operations contracts package: the deterministic laws that
make a PaySwap release VERIFIABLE, as ONE zero-dependency package —
the four-component digest-chained deployment identity, the
reproducible-build contract (pinned to the substrate archive tool), the
liveness/readiness + evidence-counter + correlated-event observability
contracts, rollback as a first-class versioned artifact with typed
compensation evidence and machine-checked order-independence/idempotence
proofs, the typed operator-action catalog and the assembled runbook with
no-orphan-alerts integrity, the exact provider environment + append-only
activation ledger + progressive exposure rollout gates, the
secrets-hygiene contracts (handles never values), the digest-chained
evidence lineage with deterministic replay, and the
NO-DEPLOYMENT-EXECUTION law as machine-checkable data. Plus the
substrate release tooling this package's contract governs:
`scripts/release/build-release-manifest.mjs` (the deterministic,
self-verifying release-manifest builder).

The package is CONTRACTS + VERIFICATION ONLY (hard law 9): it never
executes a deployment, never touches a live provider, never fabricates
runtime evidence. Production deployment remains subject to explicit
OPERATOR AUTHORIZATION — the standing law; this package's records make
the operator's deployment verifiable when it happens.

## 2. Layer law (the declared layer)

- **Declared layer: `platform`** (telemetry/operations/deployment
  substrate class). The old `operations` package maps PARTIAL onto the
  ZCode telemetry substrate; this rebuild owns the
  operational-contract slice of that substrate class.
- **The package owns OPERATIONAL-CONTRACT authority, NOT financial or
  trust authority.** Money semantics stay pinned to `packages/protocol`
  wires; mandates/grants stay pinned to `packages/trust`; provider
  outcome/event vocabularies and credential-isolation discipline stay
  pinned to `packages/provider-runtime` (`src/pins/provider-runtime.ts`);
  replay/counterfactual semantics and the advisory-evidence boundary
  stay pinned to `packages/lab` (`src/pins/lab.ts`); the health-facing
  progress stages stay pinned to `packages/surface`
  (`src/pins/surface.ts`). This package re-derives NONE of them; it
  composes artifacts that CARRY them. Zero imports, pins only (the
  leaf-in-flight law — the TL wires the authoritative types at
  integration).
- Promotion/rollback/rollout artifacts are CONTRACTS, not executions:
  applying any of them to production is an operator-authorized action
  outside this package (the operator-authorization boundary,
  `src/no-execution.ts`).

## 3. The nine hard laws (each machine-enforced + test-proven)

1. **Deployment identity (`src/deployment-identity.ts`,
   `src/environment.ts`, `src/environment-gates.ts`).** A deployment is
   identified by exactly FOUR components — the exact commit SHA
   (40-hex), the environment record (tier/region/execution
   mode/manifest fingerprint/provider-bindings fingerprint), the build
   digest (64-hex sha256), and the manifest digest (64-hex sha256) —
   ALL required, digest-chained in the fixed `IDENTITY_CHAIN_ORDER`;
   identity is byte-deterministic (`serializeDeploymentIdentity` +
   `identitiesAreByteIdentical`); verification is tamper-evident
   (`verifyDeploymentIdentity` recomputes the chain). The environment
   records carry the configuration contract
   (`CONFIGURATION_CONTRACT`: every environment variable, its consuming
   planes, secret-backed-or-not), completeness checking
   (`checkEnvironmentVariableCompleteness`) and preview/production
   parity over an explicit allowlist (`verifyEnvironmentParity`).
2. **Reproducible build (`src/reproducible-build.ts` +
   `scripts/release/build-release-manifest.mjs`).** The build contract
   is declared as DATA — the `REPRODUCIBLE_BUILD_CONTRACT` (R1..R7:
   deterministic depth-first sorted walk, POSIX paths, mode
   normalization 0755/0644, no ambient metadata, symlinks as link
   entries, fail-closed on unsupported entries, the repo-scale ignore
   set = exactly `.git` + `node_modules`, and byte-determinism) — pinned
   to the substrate tool `scripts/deterministic-tar-archive.mjs` (this
   package owns the CONTRACT + verification, NOT the tool). The release
   manifest tool implements the same laws over the repo tree: sorted
   file list, per-file sha256, total digest over the canonical entry
   stream (`canonicalManifestStream`), the identity record (commit SHA
   from `git rev-parse HEAD`, environment label from `--env`);
   `--verify <file>` re-verifies a tree against a manifest; `--selftest`
   proves determinism (two runs byte-identical), sorting, mode
   normalization, output self-exclusion and tamper/extra/mode-drift
   detection.
3. **Observability (`src/observability.ts`, `src/health.ts`,
   `src/alerting.ts`).** The protocol-ID-correlated operational event
   taxonomy (`OBSERVABILITY_EVENT_TAXONOMY`; every event correlates to
   >= 1 declared protocol-ID kind — `checkEventTaxonomyCorrelation`);
   the LIVENESS/READINESS SEPARATION law (liveness asserts process
   aliveness; readiness cites contract-backed sources or fails —
   `checkHealthContracts`); the ten evidence counters with CUMULATIVE
   monotonicity and digest-anchored snapshots
   (`recordEvidenceCounters`, `checkCounterMonotonicity`); dashboards +
   alert routing with NO ORPHAN ALERTS (every panel groups by a
   protocol ID and cites taxonomy events; every alert rule cites
   taxonomy events — `checkDashboardsAgainstTaxonomy`). No health claim
   without a contract-backed source.
4. **Production health + rollback (`src/rollback.ts`,
   `src/compensation.ts`).** Rollback is a FIRST-CLASS artifact:
   versioned, digest-chained, in a functional append-only ledger; a
   rollback record carries its COMPENSATION EVIDENCE (typed entries:
   UNDO_EFFECT / NET_ADJUSTMENT with exact integer cents / 
   EVIDENCE_MARKER, each referencing its obligation and reconciliation
   requirement) and its operator-authorization reference. The COVERAGE
   LAW: `checkRollbackCoverage` fails closed on any promotion record
   without its rollback record. The PROVABLE LAWS:
   `verifyCompensationOrderIndependence` (every permutation of the
   compensation list yields the identical net-effect digest) and
   `verifyRollbackIdempotence` (set semantics — applying twice changes
   nothing). Rehearsal drills are ADVISORY, Lab-namespaced
   (`recordRollbackRehearsal` brands reports with
   `PINNED_LAB_REPLAY_NAMESPACE` — never production evidence).
5. **Runbook contracts (`src/operator-actions.ts`,
   `src/operator-catalog.ts`, `src/runbook.ts`).** Every operator
   action is a TYPED, auditable contract: authority level (OPERATOR /
   SENIOR_OPERATOR / SECURITY_OFFICER — attenuated delegation:
   `authoritySatisfies`), >= 1 machine-CHECKABLE precondition
   (`checkableBy`), >= 1 typed effect emitting a declared taxonomy
   event, >= 1 evidence obligation with minimum >= 1, a declared
   rollback path (REVERSIBLE / COMPENSATING_ACTION with a resolvable
   compensating action / IRREVERSIBLE_WITH_AUDIT), and a runbook entry
   that EXISTS (`checkOperatorActionCatalog` checks all of this over
   the six-action catalog). The assembled runbook
   (`OPERATIONS_RUNBOOK`) passes `checkRunbookIntegrity`: entries
   reference declared alerts, actions reference existing entries — no
   untyped operational magic, no orphans.
6. **Provider environment + rollout (`src/provider-environment.ts`,
   `src/provider-activation.ts`, `src/rollout.ts`).** The EXACT
   provider environment is a typed record (provider, tier, pinned
   execution mode + transport class, credential CONFIG KEY + HANDLE —
   never a value, honest limitations). The sandbox/live separation is
   STRUCTURAL: LIVE requires the production tier AND a
   PRODUCTION_HTTP transport — a FAKE_DETERMINISTIC transport can never
   serve live behavior. ACTIVATION RECORDS are versioned, immutable,
   append-only; ACTIVATED requires live probe evidence AND a connected
   instance reference (operator input is never proof of integration);
   ENABLEMENT IS DATA, NOT ENVIRONMENT — derived from the activation
   ledger plus explicit operator overrides (fail-closed: an override
   may only DISABLE). The rollout is a PROGRESSIVE EXPOSURE LADDER
   (observe 0% -> canary-1 1% -> percent-10 -> percent-50 -> full 100%)
   with hold/rollback criteria as data, digest-chained stage verdicts
   (ADVANCE / HOLD / ROLLBACK), and preview/production provider parity
   over the explicit allowed-difference set (the per-environment
   credential handle; SANDBOX->LIVE is the only tier-progressive
   execution-mode direction).
7. **Secrets hygiene (`src/secrets.ts`, `src/secrets-rotation.ts`).**
   Secrets are vault/store-backed and referenced by HANDLE, never by
   value: only `*_REF` names / `vault://…` references appear in
   configuration. `SecretResolver` is the runtime boundary contract —
   a resolution result carries a KEY IDENTIFIER, never a value. Hygiene
   is CHECKED (`isSecretShaped` — the shared fail-closed byte scanner
   every operational record checker reuses; `checkSecretReferenceHygiene`
   over config artifacts) and SCRUBBABLE
   (`scrubSecretShapedValues` — deterministic redaction before sharing
   an artifact). Rotation is PROCEDURAL DATA with bounded overlap
   windows; keys that authorize sensitive actions rotate WITH the
   security-epoch bump operator action. Test fixtures are
   runtime-assembled; no secret-shaped literals anywhere.
8. **Evidence lineage (`src/lineage.ts`).** Every operational record
   carries versioned, digest-chained evidence: `appendEvidenceRecord`
   chains each record to its predecessor's digest (prior-digest
   lineage, genesis-anchored); `verifyEvidenceChain` detects tamper and
   splice; `replayEvidenceChain` DETERMINISTICALLY replays the chain
   and verifies the digests; `chainsAreEquivalent` proves replay
   equivalence. The lineage schema is versioned
   (`EVIDENCE_LINEAGE_SCHEMA_VERSION`).
9. **No deployment execution (`src/no-execution.ts`).** The capability
   class is data (`OPERATIONS_CAPABILITY_CLASS =
   CONTRACTS_AND_VERIFICATION_ONLY`); the operator-authorization
   boundary is digest-anchored data (`OPERATOR_AUTHORIZATION_BOUNDARY`);
   the FORBIDDEN EXECUTION CAPABILITIES are a closed vocabulary, and
   `checkContractsOnlySources` scans REAL source files (comments and
   string literals stripped, so the vocabulary's own literals do not
   self-match) — the boundary guard runs it over the package's own src
   tree every battery run. This package certifies release-READINESS
   (capability + evidence), never a deployment.

## 4. The operator-authorization boundary (the standing law)

Production deployment remains subject to EXPLICIT OPERATOR
AUTHORIZATION. This package — and every artifact it defines
(identities, manifests, promotion/rollback records, rollout plans,
activation ledgers, runbooks, evidence chains) — is a CONTRACT that
makes the operator's deployment verifiable; nothing in it executes,
fabricates or substitutes for that authorization. The
release-readiness record (docs/release-evidence/
RELEASE-READINESS-RECORD.md) certifies READINESS, not a deployment.

## 5. Hard constraints (all machine-enforced by test/boundary.test.ts)

- Zero runtime dependencies; devDependencies EXACTLY `typescript`
  (^6.0.3) + `vitest` (^3.2.7); the manifest exposes the src barrel.
- Every src/ AND test/ import is RELATIVE — zero `@payswap/*` siblings
  (cross-lane shapes are LOCAL STRUCTURAL PINS, `src/pins/`), zero
  `node:` builtins in src/ (the test layer's `node:fs`/`node:path` and
  the `scripts/release/*.mjs` tooling may — the house pattern).
- The determinism law: no randomness, no ambient clock, no
  floating-point parsing, no network, no Node globals in src/ — all
  timestamps are caller-supplied ISO-8601 UTC strings.
- tsconfig carries NO paths (no hidden sibling wiring);
  `test/node.d.ts` declares `process.cwd` as a function exactly once.
- Every file <= 400 lines (the file law); census receipts pinned
  (25 src files / 19 test files — machine-checked).
- Secret-free source and tests (runtime-assembled fixtures only).

## 6. Integration notes (TL-owned, single-writer law)

The TL wires at integration: the MODULE-OWNERSHIP annotation (platform
layer) + the CI matrix lane + the lockfile importer + the authoritative
type imports replacing the structural pins. The release-manifest tool
is substrate tooling: the TL re-runs it on the MERGED tree and pins the
final digest in the release-readiness record. Sibling cross-references:
P8-W1 owns the financial-certification conformance slice of
`packages/certification/src/production/deployment.ts` (the
promotion/deployment GATES); P8-W2 owns
`packages/operations/src/browser-verification.ts` (the Gate D browser
contract) — this package owns the OPERATIONAL ARTIFACTS (identity,
build, rollback, rollout, runbook, lineage).
