/**
 * @payswap/onchain-domain — the provider-neutral, rail-agnostic onchain
 * domain (Work Order P4-W1, lane R2-W1; rebuilt on the Phase-3-rebuilt
 * main state).
 *
 * This package owns the ONCHAIN DOMAIN VOCABULARY for PaySwap 3.0:
 * - chain family vocabulary + OPTIONAL family-scoped extensions (the only
 *   place family-specific shapes live; INV-16 family-neutral core);
 * - ChainDefinition / ChainImplementation / ConnectedChainInstance
 *   (catalogue never authorizes — INV-13);
 * - AssetDefinition / AssetObservation (observations, never custody —
 *   INV-7);
 * - ProtocolDefinition / ProtocolImplementation / ConnectedProtocolInstance
 *   (composing the pinned smart-contract declaration — the
 *   declaration-completeness law);
 * - WalletCapability / SignerCapability / SmartAccountCapability
 *   declarations and the opaque SignerHandle (the onchain smart-account
 *   shapes; the agent-side shapes are the intelligence lane's);
 * - OnchainExecutionCapability / ContractInteractionCapability /
 *   DexCapability / BridgeCapability / IntentExecutionCapability;
 * - the deterministic onchain operation semantics and the execution
 *   directive/request/observation vocabulary (UNKNOWN-capable — INV-4;
 *   finality candidates only — INV-1);
 * - the canonical settlement mapping (observations → rail operations →
 *   settlement machinery; no parallel crypto ledger — INV-1/INV-17).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `rails`):
 * v1 hermetic — ZERO sibling imports, no tsconfig paths entries. Where a
 * PaySwap contract shape is needed, it is re-declared locally as a
 * MINIMAL SUBSET-TYPED STRUCTURAL MIRROR with authority-naming doc
 * comments (src/pins.ts, src/pins-smart-contract.ts,
 * src/pins-settlement.ts; the accepted structural-pin pattern).
 * Machine-checked by test/boundary.test.ts.
 *
 * Invariants structurally enforced by this package (canonical ids):
 * - INV-2 exact money: asset amounts are integer minor units;
 * - INV-4 UNKNOWN is not FAILED: OUTCOME_UNKNOWN is a first-class,
 *   explained, reconciliation-requiring outcome;
 * - INV-5 authorization + evidence lineage: every execution request
 *   carries the protocol authorization link; every observation carries
 *   evidence references;
 * - INV-7 observations-not-custody: AssetObservation carries mandatory
 *   freshness, provenance and observer identity and is structurally never
 *   a balance;
 * - INV-8/INV-19 non-custody + secret boundary: agent-facing contracts
 *   carry opaque references only; SignerHandle rejects key-material-shaped
 *   ids;
 * - INV-13 catalogue-never-authorizes: chain/asset/protocol catalogues
 *   carry no authorization scope; execution requires a
 *   connected-instance-shaped scope;
 * - INV-17 one settlement rail family: onchain rails are rail-family
 *   members, never a parallel financial system;
 * - INV-18/INV-20 write discipline: pre-broadcast re-check required;
 *   unknown generic contract writes never execute silently;
 * - INV-1 finality is protocol-owned: observers produce finality
 *   CANDIDATES only.
 */

// Versioning + provenance policy (PACKAGE_NAME lives here).
export * from "./version.ts";

// Domain error taxonomy (structural discipline of the authority lanes).
export * from "./errors.ts";

// The pinned wire shapes of the authority lanes (zero sibling imports —
// subset-typed structural mirrors with authority-naming doc comments) +
// their structural validators (the pinned subset of the authority laws).
export * from "./pins.ts";
export * from "./pins-smart-contract.ts";
export * from "./pins-deployment.ts";
export * from "./pins-settlement.ts";
export * from "./pins-validation.ts";

// Chain family vocabulary + optional family-scoped extensions (the Stellar
// family-extension module is re-exported through family-extensions.ts).
export * from "./family.ts";
export * from "./family-extensions.ts";

// Chain / asset / protocol catalogue entries and connected instances
// (asset observations are a separate module — the file-size law).
export * from "./chain.ts";
export * from "./asset.ts";
export * from "./asset-observation.ts";
export * from "./onchain-protocol.ts";

// Deterministic onchain operation semantics.
export * from "./operations.ts";

// Wallet / signer / smart-account vocabulary (the onchain smart-account
// shapes; non-custody law).
export * from "./wallet.ts";

// The onchain capability flavors (reconciled to the capability fabric via
// the structural pins) + the deterministic flavor validation dispatch.
export * from "./onchain-capabilities.ts";
export * from "./onchain-capability-validation.ts";

// The execution directive/request vocabulary + the execution observations.
export * from "./execution-directive.ts";
export * from "./execution-observation.ts";

// The canonical settlement mapping (structural shapes only).
export * from "./settlement-mapping.ts";
