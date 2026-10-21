/**
 * @payswap/app — home page oracle (ADAPT of payswap.org@8a735bf
 * packages/web/test/home.test.tsx, MMP-36 behavioral oracle).
 *
 * The public root is a PRODUCT page with claims that are true to the
 * repository's facts: the non-custodial economic-OS positioning, the five
 * outcome actions with honest dispatchability facts (the canonical surface
 * registry — the old suite asserted the old five journeys; the ADAPTED
 * oracle asserts the canonical five actions + their honest not-yet states),
 * the honest coverage summary derived from the recorded evidence (the
 * honest no-evidence state in this repository phase), and CTAs into the
 * authenticated entry boundary and the coverage explorer.
 *
 * Adaptation notes (receipted): the old assertions on the old repo's probe
 * evidence ("MTN MoMo — subscription key rejected (HTTP 401)", the probe
 * date) move to capabilities.test.tsx where recorded evidence is a fixture
 * input; this suite pins BOTH the no-evidence default AND a recorded-
 * evidence fold through the same page.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../src/pages/HomePage.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { foldCoverage } from "../../src/lib/coverage.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "../../src/contracts/harness.js";
import type { HomePageView } from "../../src/contracts/view-models.js";
import { RECORDED_COVERAGE_FIXTURE } from "./fixtures.js";

function renderHome(coverageSource = NO_EVIDENCE_COVERAGE): string {
  const view: HomePageView = {
    positioning: {
      headline:
        "A non-custodial economic operating system for the payment providers and rails you already use.",
      subheadline:
        "PaySwap connects you to your providers and rails — pay, receive, move, convert and reconcile in one place, with authorization and evidence for every financial action. You keep custody of your money and your credentials. Always.",
    },
    outcomeBoard: foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT),
    coverageSummary: foldCoverage(coverageSource),
    commitments: [
      "We never hold your credentials",
      "We never hold your money",
      "Every action carries evidence",
    ],
  };
  return renderToStaticMarkup(<HomePage view={view} />);
}

/** React inserts comment markers between adjacent text nodes — strip them. */
function text(html: string): string {
  return html.replace(/<!--.*?-->/g, "");
}

describe("home page", () => {
  it("states the true product positioning", () => {
    const html = renderHome();
    expect(html).toContain("non-custodial economic operating system");
    expect(html).toContain("payment");
    expect(html).toContain("providers and rails you already use");
  });

  it("presents the five canonical outcome actions with honest dispatchability", () => {
    const html = text(renderHome());
    for (const label of ["Pay", "Receive", "Move", "Convert", "Checkout"]) {
      expect(html).toContain(label);
    }
    // The honest not-yet facts render — never dead buttons, never fake live.
    expect(html).toContain("Not yet dispatchable");
    expect(html).toContain("The economic intake plane is not configured in this deployment");
    expect(html).toContain(
      "No merchant checkout plane exists in this deployment — the merchant package landed with Work Order P5-W3",
    );
  });

  it("leads with the honest nothing-dispatchable fact for this deployment", () => {
    const html = text(renderHome());
    expect(html).toContain("No outcome action is dispatchable in this deployment yet");
    expect(html).toContain("That is the honest fact, not an error");
  });

  it("carries the UNKNOWN honesty language", () => {
    const html = text(renderHome());
    expect(html).toContain("UNKNOWN");
    expect(html).toContain("never silently turned into success or failure");
  });

  it("renders the honest no-evidence coverage state by default", () => {
    const html = text(renderHome());
    expect(html).toContain("No provider evidence is recorded in this deployment");
    expect(html).toContain("never from a marketing list");
  });

  it("renders the recorded coverage summary when evidence is supplied", () => {
    const html = text(renderHome(RECORDED_COVERAGE_FIXTURE));
    expect(html).toContain("Verified connections (test-mode)");
    expect(html).toContain("Stripe");
    expect(html).toContain("Paystack");
    expect(html).toContain("Flutterwave");
    expect(html).toContain("2026-10-02 06:37 UTC");
    expect(html).toContain("MTN MoMo");
    expect(html).toContain("Built, awaiting credentials");
  });

  it("links to the product entry with the honest gate expectation set", () => {
    const html = renderHome();
    expect(html).toContain('href="/payswap/app"');
    expect(html).toContain("Open the product");
    expect(html).toContain("requires authentication");
    expect(html).toContain("not yet available in this deployment phase");
    expect(html).toContain("honest gate");
    expect(html).toContain("not a demo with fake balances or a pretend login");
  });

  it("links to the public surfaces", () => {
    const html = renderHome();
    expect(html).toContain('href="/payswap/capabilities"');
    expect(html).toContain('href="/payswap/security"');
    expect(html).toContain('href="/payswap/developers"');
  });

  it("carries the non-custody commitments", () => {
    const html = renderHome();
    expect(html).toContain("We never hold your credentials");
    expect(html).toContain("We never hold your money");
    expect(html).toContain("Every action carries evidence");
    expect(html).toContain("external observations");
  });

  it("states the API-is-the-authority law in the developer band", () => {
    const html = text(renderHome());
    expect(html).toContain("The API is the authority");
    expect(html).toContain("just one client of it");
    expect(html).toContain("Financial truth is protocol-owned");
  });
});
