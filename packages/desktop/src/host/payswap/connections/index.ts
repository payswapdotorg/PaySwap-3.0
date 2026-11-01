/**
 * PaySwap Desktop (P13-B) — the provider connection plane barrel.
 *
 * ADR-0007: the connection session authority (the ONLY lifecycle
 * writer), the durable credential broker over the substrate
 * ICredentialService, the pinned provider vocabularies (by-value pins —
 * the desktop never imports @payswap/* at runtime) and the node
 * composition edge.
 */

export * from "./contracts.js";
export * from "./provider-pins.js";
export * from "./credential-broker.js";
export * from "./record-store.js";
export * from "./provider-state-bindings.js";
export * from "./session-authority.js";
export * from "./node-composition.js";
// (P21-A, ADR-0014 D5/D6) The connection-ACTIVATION plane: the probe
// contracts/DTOs + the evidence ledger + the REAL host-side HTTPS
// transports/probes + the channel members + the capability bridge (the
// derivation + the gate-environment composition split at the file law).
export * from "./probe-contracts.js";
export * from "./probe-evidence.js";
export * from "./host-https-transports.js";
export * from "./probe-classification.js";
export * from "./verification-probes.js";
export * from "./probe-members.js";
export * from "./capability-bridge.js";
export * from "./gate-environment.js";
export * from "./chain-definitions.js";
export * from "./chain-from-bridge.js";
export * from "./chain-members.js";
// (P24-2, ADR-0017 D5/D7/D2) The Stripe connection-side planes: the
// RAK operation-level permission binding, the verified-evidence
// account-context resolver, the U1 lifecycle service and the
// per-connection API-version state (the migration law).
export * from "./stripe-rak-permissions.js";
export * from "./stripe-grant-derivation.js";
export * from "./stripe-account-context.js";
export * from "./stripe-u1-lifecycle.js";
export * from "./stripe-api-version-state.js";
