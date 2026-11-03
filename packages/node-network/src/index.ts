/**
 * @payswap/node-network — the public barrel (P27-D).
 *
 * THE PACKAGE LAW: this package is INTELLIGENCE (ADR-0020 D12 —
 * "intelligence cannot authorize financial effects"). It produces
 * discovery inputs (signed capability offers, eligibility facts, saga
 * plans) and NEVER authorizations: per-leg authorization lives in the
 * existing desktop host authority; financial truth stays in the financial
 * layer. Zero sibling imports (a leaf engine consumed through
 * @payswap/route-planning's pins/ports per ADR-0009 D2); the only node
 * builtin is node:crypto (offer/attestation signing — D5).
 */

export * from "./canonical.ts";
export * from "./errors.ts";
export * from "./classification.ts";
export * from "./enrollment.ts";
export * from "./attestation.ts";
export * from "./offer.ts";
export * from "./offer-verification.ts";
export * from "./registry.ts";
