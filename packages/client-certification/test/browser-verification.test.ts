import { describe, expect, it } from "vitest";
import {
  BROWSER_VERIFICATION_CHECKS,
  BROWSER_VERIFICATION_PRIOR_ART,
  SCREENSHOT_EVIDENCE_STRENGTH,
  recordBrowserVerificationRun,
} from "../src/index.ts";
import type { BrowserRunObservation } from "../src/index.ts";
import { honestBrowserRunFixture } from "./fixtures.ts";

/**
 * Hard law 9 — the browser/device verification contract: the repeatable
 * deterministic form of the 2026-10-19 Gate D live record (area-map
 * completeness, console-error law, viewport matrix, screenshot strength
 * ceiling, protocol correlation, real wiring evidence).
 */
describe("hard law 9: the browser/device verification contract", () => {
  it("the six required checks + the prior-art provenance are pinned", () => {
    expect([...BROWSER_VERIFICATION_CHECKS]).toEqual([
      "desktop-verification",
      "responsive-mobile-verification",
      "console-error-check",
      "key-interaction-verification",
      "screenshot-artifact",
      "real-api-wiring-evidence",
    ]);
    expect(SCREENSHOT_EVIDENCE_STRENGTH).toBe(
      "BROWSER_UNAUTHENTICATED_PROVENANCE",
    );
    expect(BROWSER_VERIFICATION_PRIOR_ART).toContain(
      "docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md",
    );
    expect(BROWSER_VERIFICATION_PRIOR_ART).toContain("2026-10-19");
  });

  it("an honest recorded run passes (the Gate D form); determinism holds", () => {
    const observation: BrowserRunObservation = honestBrowserRunFixture();
    const result = recordBrowserVerificationRun(observation);
    expect(result.passed).toBe(true);
    expect(result.law).toBe("browser-verification-contract");
    expect(result.digest).toBe(recordBrowserVerificationRun(observation).digest);
  });

  it("a missing required check fails (all six are mandatory)", () => {
    const observation: BrowserRunObservation = {
      ...honestBrowserRunFixture(),
      performedChecks: honestBrowserRunFixture().performedChecks.slice(0, 5),
    };
    const result = recordBrowserVerificationRun(observation);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "required_check_missing"),
    ).toBe(true);
  });

  it("an incomplete area map fails (the eleven-area completeness law)", () => {
    const observation: BrowserRunObservation = {
      ...honestBrowserRunFixture(),
      areasObserved: honestBrowserRunFixture().areasObserved.slice(0, 10),
    };
    const result = recordBrowserVerificationRun(observation);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "area_map_incomplete"),
    ).toBe(true);
  });

  it("the viewport matrix law: all three device classes must be verified", () => {
    const observation: BrowserRunObservation = {
      ...honestBrowserRunFixture(),
      viewportsVerified: [
        { widthPx: 390, heightPx: 844 },
        { widthPx: 1280, heightPx: 800 },
      ],
    };
    const result = recordBrowserVerificationRun(observation);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "viewport_matrix_incomplete"),
    ).toBe(true);
  });

  it("the console-error law: defect errors FAIL; environmental errors must be documented limitations", () => {
    const defect = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      consoleErrors: [
        { message: "TypeError: cannot read properties of undefined", classification: "defect" },
      ],
    });
    expect(defect.passed).toBe(false);
    expect(
      defect.violations.some((v) => v.code === "console_defect_error"),
    ).toBe(true);

    const undocumented = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      consoleErrors: [
        { message: "CORS-blocked fetch", classification: "environmental" },
      ],
    });
    expect(undocumented.passed).toBe(false);
    expect(
      undocumented.violations.some(
        (v) => v.code === "environmental_error_undocumented",
      ),
    ).toBe(true);
  });

  it("key interactions correlate to PROTOCOL ids in pinned areas — never DOM artifacts", () => {
    const domArtifact = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      keyInteractions: [
        {
          interactionId: "submit-payment",
          description: "Submit the payment",
          expectedArea: "payments",
          correlatedProtocolId: "button#submit",
        },
      ],
    });
    expect(domArtifact.passed).toBe(false);
    expect(
      domArtifact.violations.some(
        (v) => v.code === "key_interaction_not_protocol_correlated",
      ),
    ).toBe(true);

    const outsideArea = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      keyInteractions: [
        {
          interactionId: "submit-payment",
          description: "Submit the payment",
          expectedArea: "mystery-zone",
          correlatedProtocolId: "commandId",
        },
      ],
    });
    expect(outsideArea.passed).toBe(false);
    expect(
      outsideArea.violations.some(
        (v) => v.code === "key_interaction_outside_surface_vocabulary",
      ),
    ).toBe(true);
  });

  it("screenshot evidence strength is bounded (INV-E04) and real wiring evidence is required", () => {
    const strong = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      screenshots: [
        { evidenceId: "screenshot:payments", strength: "AUTHENTICATED_PROTOCOL_PROOF" },
      ],
    });
    expect(strong.passed).toBe(false);
    expect(
      strong.violations.some((v) => v.code === "screenshot_strength_unbounded"),
    ).toBe(true);

    const unwired = recordBrowserVerificationRun({
      ...honestBrowserRunFixture(),
      realWiringEvidenceRefs: [],
    });
    expect(unwired.passed).toBe(false);
    expect(
      unwired.violations.some(
        (v) => v.code === "real_wiring_evidence_missing",
      ),
    ).toBe(true);
  });
});
