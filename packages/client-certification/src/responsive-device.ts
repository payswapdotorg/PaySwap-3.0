/**
 * @payswap/client-certification — the responsive/device contract
 * (P8-W2, hard law 8).
 *
 * NET-NEW law on the canonical architecture: layout breakpoints and
 * touch targets are CONTRACT CONSTANTS, not per-surface preferences.
 * Every interactive element resolves its device-class contract for all
 * three device classes, and every touch target meets the 44px minimum
 * (the mobile accessibility floor).
 *
 * Deterministic only: pure folds; viewport widths are explicit inputs.
 */

import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 8). */
const LAW = "responsive-device-contract" as const;

/**
 * The breakpoint contract constants (px): mobile below the tablet band,
 * tablet below the desktop band. CONTRACT-LEVEL.
 */
export const DEVICE_BREAKPOINTS_PX = Object.freeze({
  mobileMaxWidth: 767,
  tabletMinWidth: 768,
  tabletMaxWidth: 1023,
  desktopMinWidth: 1024,
} as const);

/** The touch-target contract constant (px) — the mobile floor. */
export const TOUCH_TARGET_MINIMUM_PX = 44;

/** The three device classes every interactive element must resolve. */
export const DEVICE_CLASSES = Object.freeze([
  "mobile",
  "tablet",
  "desktop",
] as const);

export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** Resolve a viewport width to its device class (deterministic). */
export function deviceClassForViewport(widthPx: number): DeviceClass {
  if (widthPx <= DEVICE_BREAKPOINTS_PX.mobileMaxWidth) {
    return "mobile";
  }
  if (widthPx <= DEVICE_BREAKPOINTS_PX.tabletMaxWidth) {
    return "tablet";
  }
  return "desktop";
}

/** One device-class resolution of one element. */
export interface DeviceClassRender {
  readonly deviceClass: DeviceClass;
  /** The rendered touch target size (px). */
  readonly touchTargetPx: number;
}

/** One interactive element's declared responsive contract. */
export interface ResponsiveElementContract {
  readonly elementId: string;
  readonly interactive: boolean;
  /** The per-device-class renders — must cover ALL THREE device classes. */
  readonly perDeviceClass: readonly DeviceClassRender[];
}

/**
 * The responsive/device gate (hard law 8). Any violation is a HALT for
 * the release.
 */
export function runResponsiveGate(
  elements: readonly ResponsiveElementContract[],
): ClientGateResult {
  const violations: CertificationViolation[] = [];
  for (const element of elements) {
    const id = element.elementId;
    if (id.length === 0) {
      violations.push(
        violationOf(LAW, "malformed_element", "an element declaration requires an elementId"),
      );
      continue;
    }
    if (!element.interactive) {
      continue;
    }
    const resolved = new Set<DeviceClass>();
    for (const render of element.perDeviceClass) {
      resolved.add(render.deviceClass);
      if (render.touchTargetPx < TOUCH_TARGET_MINIMUM_PX) {
        violations.push(
          violationOf(
            LAW,
            "touch_target_below_minimum",
            `element '${id}' renders a ${render.touchTargetPx}px touch target at device class '${render.deviceClass}' — the contract constant is ${TOUCH_TARGET_MINIMUM_PX}px`,
          ),
        );
      }
    }
    for (const deviceClass of DEVICE_CLASSES) {
      if (!resolved.has(deviceClass)) {
        violations.push(
          violationOf(
            LAW,
            "device_class_not_resolved",
            `element '${id}' does not resolve a render for device class '${deviceClass}' — every interactive element resolves its device-class contract`,
          ),
        );
      }
    }
  }
  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: elements.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      violations,
    }),
  });
}
