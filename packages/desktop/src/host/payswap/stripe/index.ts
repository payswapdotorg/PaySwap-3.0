/**
 * PaySwap Desktop (P24-2) — the Stripe host-plane barrel: the frozen
 * prepared-action contracts (P24-0, re-exported — never modified) plus
 * this wave's implementation surface (the executor, the seams, the
 * event plane). The desktop composition root (the TL's P24-D wiring)
 * consumes this surface.
 */

export * from "./prepared-action-contracts.js";
export * from "./stripe-pins.js";
export * from "./action-seams.js";
export * from "./prepared-action-digest.js";
export * from "./prepared-action-store.js";
export * from "./prepared-action-classify.js";
export * from "./prepared-action-gates.js";
export * from "./prepared-action-executor.js";
export * from "./webhook-secret-broker.js";
export * from "./webhook-destination-records.js";
export * from "./webhook-destinations.js";
export * from "./event-inbox-records.js";
export * from "./event-inbox.js";
export * from "./event-plane.js";
