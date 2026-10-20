import { describe, expect, it } from "vitest";
import {
  DEVICE_BREAKPOINTS_PX,
  DEVICE_CLASSES,
  TOUCH_TARGET_MINIMUM_PX,
  deviceClassForViewport,
  runResponsiveGate,
} from "../src/index.ts";
import type { ResponsiveElementContract } from "../src/index.ts";

/**
 * Hard law 8 — the responsive/device contract: breakpoints and touch
 * targets (>=44px) are contract constants; every interactive element
 * resolves its device-class contract.
 */
function responsiveElementFixture(): ResponsiveElementContract {
  return {
    elementId: "payments.submit.button",
    interactive: true,
    perDeviceClass: [
      { deviceClass: "mobile", touchTargetPx: 48 },
      { deviceClass: "tablet", touchTargetPx: 48 },
      { deviceClass: "desktop", touchTargetPx: 44 },
    ],
  };
}

describe("hard law 8: the responsive/device contract", () => {
  it("the breakpoint + touch-target constants are pinned contract constants", () => {
    expect(DEVICE_BREAKPOINTS_PX.mobileMaxWidth).toBe(767);
    expect(DEVICE_BREAKPOINTS_PX.tabletMinWidth).toBe(768);
    expect(DEVICE_BREAKPOINTS_PX.tabletMaxWidth).toBe(1023);
    expect(DEVICE_BREAKPOINTS_PX.desktopMinWidth).toBe(1024);
    expect(TOUCH_TARGET_MINIMUM_PX).toBe(44);
    expect([...DEVICE_CLASSES]).toEqual(["mobile", "tablet", "desktop"]);
  });

  it("device class resolution is deterministic at the band edges", () => {
    expect(deviceClassForViewport(390)).toBe("mobile");
    expect(deviceClassForViewport(767)).toBe("mobile");
    expect(deviceClassForViewport(768)).toBe("tablet");
    expect(deviceClassForViewport(1023)).toBe("tablet");
    expect(deviceClassForViewport(1024)).toBe("desktop");
    expect(deviceClassForViewport(1920)).toBe("desktop");
  });

  it("a fully resolved element passes; determinism holds", () => {
    const result = runResponsiveGate([responsiveElementFixture()]);
    expect(result.passed).toBe(true);
    expect(result.law).toBe("responsive-device-contract");
    expect(result.digest).toBe(
      runResponsiveGate([responsiveElementFixture()]).digest,
    );
  });

  it("a touch target below 44px fails — at ANY device class", () => {
    const mobile = runResponsiveGate([
      {
        ...responsiveElementFixture(),
        perDeviceClass: [
          { deviceClass: "mobile", touchTargetPx: 43 },
          { deviceClass: "tablet", touchTargetPx: 48 },
          { deviceClass: "desktop", touchTargetPx: 48 },
        ],
      },
    ]);
    expect(mobile.passed).toBe(false);
    expect(
      mobile.violations.some((v) => v.code === "touch_target_below_minimum"),
    ).toBe(true);

    const desktop = runResponsiveGate([
      {
        ...responsiveElementFixture(),
        perDeviceClass: [
          { deviceClass: "mobile", touchTargetPx: 48 },
          { deviceClass: "tablet", touchTargetPx: 48 },
          { deviceClass: "desktop", touchTargetPx: 40 },
        ],
      },
    ]);
    expect(desktop.passed).toBe(false);
  });

  it("an element that does not resolve ALL THREE device classes fails", () => {
    const result = runResponsiveGate([
      {
        ...responsiveElementFixture(),
        perDeviceClass: [
          { deviceClass: "mobile", touchTargetPx: 48 },
          { deviceClass: "desktop", touchTargetPx: 48 },
        ],
      },
    ]);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "device_class_not_resolved"),
    ).toBe(true);
  });

  it("non-interactive elements are carried but not touch-target-audited", () => {
    const result = runResponsiveGate([
      {
        elementId: "payments.heading",
        interactive: false,
        perDeviceClass: [],
      },
    ]);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(1);
  });
});
