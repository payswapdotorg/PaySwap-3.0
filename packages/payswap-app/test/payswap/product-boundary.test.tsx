/**
 * @payswap/app — PRODUCT LAW tests (NET-NEW, P7-W1).
 *
 * The web product's laws, machine-checked:
 * - P1 presentation-only view layer: NO fetch/network in the product's
 *   pages/view-models/shell — data arrives via props/contracts; the
 *   runtime host wires transport at TL accept-time integration.
 * - P2 substrate law: no @payswap/* imports anywhere in packages/web/src
 *   (substrate depends on @zcode/* only; cross-lane shapes are pinned
 *   structurally and mirror-tested).
 * - P3 non-custody messaging: the product never claims custody — the
 *   pages' copy vocabulary is pinned (external observations, never
 *   PaySwap custody) and no custody-claiming phrase appears.
 * - P4 honest-UNKNOWN law: UNKNOWN renders as UNKNOWN — the folds and
 *   pages never collapse it into failure or success (checked across the
 *   full static render of every public page).
 * - P5 determinism: no ambient clock/random in the product's view layer
 *   (the router reads window.location only — an input, not a clock).
 *   P10-C refinement: the console store binding's DEFAULT mutation clock
 *   is the one documented exception (see the P5 test body) — it supplies
 *   the pinned store port's explicit `now` argument for user-initiated
 *   mutations only, never a displayed value.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../src/pages/HomePage.js";
import { CapabilitiesPage } from "../../src/pages/CapabilitiesPage.js";
import { SecurityPage } from "../../src/pages/SecurityPage.js";
import { AppOverviewPage } from "../../src/pages/AppOverviewPage.js";
import { AreaPage } from "../../src/pages/AreaPage.js";
import { foldCoverage } from "../../src/lib/coverage.js";
import { foldNavigation } from "../../src/lib/navigation.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { foldExecutionOutcome } from "../../src/lib/honest-states.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  WEB_ORACLE_HARNESS,
} from "../../src/contracts/harness.js";

const PRODUCT_SRC = join(process.cwd(), "src");

function tsSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...tsSources(p));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const SOURCES = tsSources(PRODUCT_SRC).map((file) => ({
  rel: file.slice(process.cwd().length + 1),
  text: readFileSync(file, "utf8"),
}));

describe("product law P1: presentation-only view layer — no network in the product", () => {
  it("no product source performs or initiates any network call", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b/.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("product law P2: the product package imports the design layer only — no parallel engines", () => {
  // P9-A: the product moved out of @zcode/web into its own @payswap/app
  // package, which the web mount and the desktop renderer both consume.
  // The law evolves with it: the PRODUCT package may depend on the @zcode/ui
  // design layer, but NEVER on any other @payswap/* workspace package —
  // cross-lane contract shapes stay pinned structurally in src/pins (the
  // old substrate layer law, restated for the product package boundary).
  it("no @payswap/* workspace import exists anywhere in the product package src", () => {
    const offenders: string[] = [];
    const allSources = tsSources(join(process.cwd(), "src"));
    for (const file of allSources) {
      const text = readFileSync(file, "utf8");
      if (/from\s+["']@payswap\//.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the pins are local structural mirrors — every pin file names its source package + module", () => {
    const surfacePins = SOURCES.find(({ rel }) => rel.endsWith("pins/surface-pins.ts"));
    expect(surfacePins?.text).toContain("@payswap");
    expect(surfacePins?.text).toContain("packages/surface/src");
    const runtimePins = SOURCES.find(({ rel }) =>
      rel.endsWith("pins/provider-runtime-pins.ts"),
    );
    expect(runtimePins?.text).toContain("@payswap");
    expect(runtimePins?.text).toContain("packages/provider-runtime/src");
  });
});

describe("product law P3: non-custody messaging — the product never claims custody", () => {
  it("the security page pins the non-custody vocabulary (external observations, never custody)", () => {
    const html = renderToStaticMarkup(<SecurityPage />);
    expect(html).toContain("external observations");
    expect(html).toContain("never PaySwap custody");
  });

  it("no custody-claiming phrase appears in any rendered public page", () => {
    const CUSTODY_CLAIMS = [
      "we hold your funds",
      "your PaySwap balance",
      "PaySwap wallet",
      "funds held by PaySwap",
      "custody of your money",
    ];
    const homeHtml = renderToStaticMarkup(
      <HomePage
        view={{
          positioning: {
            headline: "A non-custodial economic operating system for the payment providers and rails you already use.",
            subheadline: "PaySwap connects you to your providers and rails.",
          },
          outcomeBoard: foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT),
          coverageSummary: foldCoverage(NO_EVIDENCE_COVERAGE),
          commitments: [
            "We never hold your credentials",
            "We never hold your money",
            "Every action carries evidence",
          ],
        }}
      />,
    );
    const capabilitiesHtml = renderToStaticMarkup(
      <CapabilitiesPage view={foldCoverage(NO_EVIDENCE_COVERAGE)} />,
    );
    const appEntryHtml = renderToStaticMarkup(
      <AppOverviewPage
        navigation={foldNavigation()}
        outcomeBoard={foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT)}
      />,
    );
    for (const claim of CUSTODY_CLAIMS) {
      for (const html of [homeHtml, capabilitiesHtml, appEntryHtml]) {
        expect(html.toLowerCase()).not.toContain(claim);
      }
    }
  });
});

describe("product law P4: honest UNKNOWN — never collapsed into failure or success", () => {
  it("the UNKNOWN fold's words never include failure vocabulary", () => {
    const view = foldExecutionOutcome({
      outcome: "UNKNOWN",
      ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      authorityRef: "att_1",
    });
    for (const failureWord of ["failed", "failure has occurred", "unsuccessful"]) {
      expect(view.headline.toLowerCase()).not.toContain(failureWord);
    }
    expect(view.tone).toBe("unknown");
  });

  it("every harness execution outcome folds without inventing state", () => {
    for (const input of WEB_ORACLE_HARNESS.executionOutcomes) {
      const view = foldExecutionOutcome(input);
      expect(view.outcome).toBe(input.outcome);
      expect(["positive", "neutral", "attention", "unknown", "negative"]).toContain(view.tone);
    }
    // The tone mapping law: CONFIRMED != UNKNOWN != FAILED tones.
    const tones = WEB_ORACLE_HARNESS.executionOutcomes.map(
      (input) => foldExecutionOutcome(input).tone,
    );
    expect(new Set(tones).size).toBe(3);
  });

  it("the app overview gate renders an honest auth boundary — no credential capture", () => {
    const html = renderToStaticMarkup(
      <AppOverviewPage
        navigation={foldNavigation()}
        outcomeBoard={foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT)}
      />,
    );
    expect(html).toContain("Authentication required");
    expect(html).toContain("no pretend login");
    // No credential inputs on the gate.
    expect(html).not.toMatch(/<input[^>]*type=["'](password|text)["']/);
  });

  it("every area surface renders its pinned designed-empty reason — never a spinner, never rows", () => {
    // react-dom/server escapes apostrophes as &#x27; — decode before
    // comparing against the pinned contract literals.
    const decode = (markup: string) => markup.replace(/&#x27;/g, "'");
    for (const area of foldNavigation().areas) {
      const html = renderToStaticMarkup(
        <AreaPage
          areaId={area.id}
          navigation={foldNavigation()}
          outcomeBoard={foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT)}
        />,
      );
      expect(decode(html), area.id).toContain(area.emptyState.reason);
    }
  });
});

describe("product law P5: determinism — no ambient clock or randomness in the view layer", () => {
  it("no Date.now / new Date / Math.random in the product sources", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      // P10-C documented refinement (Phase 10 console surface): the ONE
      // permitted ambient-clock site in the package is the console store
      // binding's DEFAULT mutation clock (src/console/useWorkspaceStore.ts)
      // — it exists only to supply the pinned WorkspaceStorePort's
      // explicit `now` argument at the moment of a user-initiated store
      // mutation (CONSOLE-WORKSPACE.md §5: "now is an explicit input").
      // It never feeds a fold, a view model or a displayed value; the
      // mounts and the tests inject the clock through the same seam. The
      // console suite pins the site: exactly one occurrence, in the
      // default-clock initializer, and nowhere else in src/.
      if (rel === "src/console/useWorkspaceStore.ts") {
        continue;
      }
      if (/Date\.now\(|new\s+Date\(|Math\.random\(/.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
