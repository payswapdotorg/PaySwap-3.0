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
