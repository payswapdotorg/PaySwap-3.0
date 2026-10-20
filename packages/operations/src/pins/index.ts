/**
 * @payswap/operations — local structural pins (the leaf-in-flight law).
 *
 * Cross-lane contract shapes are mirrored BY VALUE into src/pins/ —
 * never imported (zero sibling imports is a hard battery law). Each pin
 * cites its authority package/file; the TL wires the real types at
 * integration and test/pins.test.ts pins the bytes so drift is caught
 * by the battery, not by review.
 */

export * from "./provider-runtime.js";
export * from "./lab.js";
export * from "./surface.js";
