/**
 * PaySwap Desktop (P7-W2) — the product's public barrel.
 *
 * The PaySwap Desktop product on the ZCode-derived native shell: the
 * non-custodial payment mission surface composed over structurally pinned
 * shared Surface/backend contracts, plus the desktop shell integration
 * seams (window/session/transport per the substrate).
 *
 * LAYER LAW: packages/desktop is a ZCode-substrate platform package —
 * it NEVER imports @payswap/* (structural pins in ./pins; see
 * pin-registry.ts). It also never re-implements payment engines: money
 * movement is delegated via typed references only.
 */

// The structural pins (pinned wire shapes).
export * from "./pins/index.js";

// The desktop product surfaces (folds + models).
export * from "./product/index.js";

// The desktop shell integration seams + host composition root.
export * from "./shell/index.js";
