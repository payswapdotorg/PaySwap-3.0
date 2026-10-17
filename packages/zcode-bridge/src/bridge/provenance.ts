/**
 * Bridge implementation: provenance factory (P3-W3).
 *
 * Constructs the auditable provenance record for bridge contracts — the
 * bridge version, stability class, work order, and the substrate pin the
 * shapes were verified against.
 */

import {
  SUBSTRATE_PIN,
  ZCODE_BRIDGE_VERSION,
} from "../version.ts";
import type {
  ZcodeBridgeProvenance,
  ZcodeBridgeStability,
} from "../version.ts";

/**
 * Tag an exported bridge contract with its provenance: the bridge contract
 * version it ships with, its stability class, the work order that
 * introduced it, and the substrate pin it was verified against. The record
 * is frozen.
 */
export function zcodeBridgeProvenance(
  workOrder: string,
  stability: ZcodeBridgeStability = "stable",
): ZcodeBridgeProvenance {
  if (typeof workOrder !== "string" || workOrder.length === 0) {
    throw new Error("zcodeBridgeProvenance: workOrder must be a non-empty string");
  }
  if (stability !== "stable" && stability !== "experimental") {
    throw new Error(
      "zcodeBridgeProvenance: stability must be 'stable' or 'experimental'",
    );
  }
  return Object.freeze({
    bridgeVersion: ZCODE_BRIDGE_VERSION,
    stability,
    workOrder,
    substratePin: SUBSTRATE_PIN,
  });
}
