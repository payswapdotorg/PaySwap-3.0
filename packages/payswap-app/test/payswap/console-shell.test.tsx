/**
 * @payswap/app — the console SHELL oracle (P10-C, NET-NEW; the
 * static-markup approach of the product suite, applied to the PaySwap
 * Agent Workspace).
 *
 * The shell laws, machine-checked over deterministic static renders
 * (renderToStaticMarkup; the store's initial phase is honestly loading —
 * a skeleton, never fabricated rows):
 * - §1 branding: PaySwap wordmark + "Agent Console" framing, the ps-
 *   design-system root (ps-theme-light), zero ZCode branding in the
 *   eight sections;
 * - §8 a11y: skip link → #ps-console-main, semantic landmarks (header,
 *   nav with an accessible name ×2 — the desktop sidebar + the mobile
 *   nav), main with the id, sections with accessible names, aria-current
 *   on the active section, every interactive element named, decorative
 *   svg aria-hidden, exactly one h1 per render;
 * - the back affordance (label from props) and the honest not-found
 *   inside the workspace chrome;
 * - the console stylesheet carries :focus-visible rules for every
 *   console-specific interactive class (the design-system focus law).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PaySwapAgentWorkspace,
  CONSOLE_ROOT,
  type MissionRecord,
  type WorkspaceStorePort,
} from "../../src/console/PaySwapAgentWorkspace.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import { CONSOLE_SECTIONS } from "../../src/console/contracts.js";

/** A deterministic fake store (loading resolves only in jsdom tests). */
function fakeStore(): WorkspaceStorePort {
  const emptyRecord: MissionRecord = {
    id: "m-0",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    status: "DRAFT",
    intake: { goalStatement: "unused", direction: "PAY" },
    structuralValidation: { ok: true, findings: [] },
    events: [],
  };
  return {
    durability: "BROWSER_PROFILE",
    listMissions: async () => [],
    recordMissionDraft: async (input) => ({ ...emptyRecord, intake: input }),
    recordMissionIntent: async () => emptyRecord,
    missionDetail: async () => null,
    reviseMissionDraft: async (id, input) => ({ ...emptyRecord, id, intake: input }),
    archiveMissionDraft: async (id) => ({ ...emptyRecord, id }),
  };
}

function renderWorkspace(path: string): string {
  return renderToStaticMarkup(
    <PaySwapAgentWorkspace
      navigation={createStaticNavigation(path)}
      store={fakeStore()}
      backToProduct={{ label: "Back to PaySwap", onActivate: () => {} }}
    />,
  );
}

function doc(markup: string): Document {
  return new JSDOM(`<!doctype html><html><body>${markup}</body></html>`).window.document;
}

const BACK_LABEL = "Back to PaySwap";

describe("the console shell renders the PaySwap chrome (§1)", () => {
  it("the wordmark + Agent Console framing + theme root are present", () => {
    const html = renderWorkspace(CONSOLE_ROOT);
    expect(html).toContain("ps-theme-light");
    expect(html).toContain("ps-console-root");
    expect(html).toContain("PaySwap");
    expect(html).toContain("Agent Console");
  });

  it("zero ZCode product branding inside the workspace sections (attribution is settings-only)", () => {
    for (const section of CONSOLE_SECTIONS) {
      const html = renderWorkspace(`${CONSOLE_ROOT}/${section.id}`);
      if (section.id === "settings") {
        continue; // the legal/about location carries the attribution (§8)
      }
      expect(html, section.id).not.toContain("ZCode");
    }
    const root = renderWorkspace(CONSOLE_ROOT);
    expect(root).not.toContain("ZCode");
  });

  it("the settings section carries the upstream attribution as attribution", () => {
    const html = renderWorkspace(`${CONSOLE_ROOT}/settings`);
    expect(html).toContain(
      "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
    );
  });
});

describe("the console shell carries the §8 landmark + navigation contracts", () => {
  it("a skip link jumps to the main region", () => {
    const html = renderWorkspace(CONSOLE_ROOT);
    expect(html).toContain('href="#ps-console-main"');
    expect(html).toContain("Skip to main content");
  });

  it("landmarks: header, two named navs, main with the skip-target id", () => {
    const document = doc(renderWorkspace(CONSOLE_ROOT));
    expect(document.querySelectorAll("header.ps-topbar")).toHaveLength(1);
    const navs = Array.from(document.querySelectorAll("nav")).filter(
      (nav) => nav.getAttribute("aria-label") === "Console sections",
    );
    expect(navs).toHaveLength(2); // desktop sidebar + mobile wrap
    const main = document.querySelector("main");
    expect(main?.id).toBe("ps-console-main");
    expect(main?.getAttribute("tabindex")).toBe("-1");
  });

  it("every section renders an accessible section with its title + verbatim purpose", () => {
    for (const section of CONSOLE_SECTIONS) {
      const document = doc(renderWorkspace(`${CONSOLE_ROOT}/${section.id}`));
      const region = document.querySelector(
        `section[aria-labelledby="ps-console-${section.id}-heading"]`,
      );
      expect(region, section.id).not.toBeNull();
      expect(document.getElementById(`ps-console-${section.id}-heading`)?.textContent).toBe(
        section.title,
      );
      expect(region?.textContent).toContain(section.purpose);
      // Exactly one h1 per section render.
      expect(document.querySelectorAll("h1")).toHaveLength(1);
    }
  });

  it("aria-current=page marks the active section in BOTH navigations", () => {
    for (const section of CONSOLE_SECTIONS) {
      const document = doc(renderWorkspace(`${CONSOLE_ROOT}/${section.id}`));
      const current = Array.from(
        document.querySelectorAll('[aria-current="page"]'),
      ).filter((el) => el.getAttribute("href") === `${CONSOLE_ROOT}/${section.id}`);
      expect(current, section.id).toHaveLength(2);
    }
    // The root renders the overview as active.
    const rootDoc = doc(renderWorkspace(CONSOLE_ROOT));
    const active = Array.from(rootDoc.querySelectorAll('[aria-current="page"]')).filter(
      (el) => el.getAttribute("href") === `${CONSOLE_ROOT}/overview`,
    );
    expect(active).toHaveLength(2);
  });

  it("all eight sections appear in the navigation with real hrefs", () => {
    const document = doc(renderWorkspace(CONSOLE_ROOT));
    for (const section of CONSOLE_SECTIONS) {
      expect(
        document.querySelectorAll(`a[href="${CONSOLE_ROOT}/${section.id}"]`).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the console shell affordances", () => {
  it("the back-to-product control renders the mount's label", () => {
    const html = renderWorkspace(CONSOLE_ROOT);
    expect(html).toContain(BACK_LABEL);
  });

  it("the honest not-found for an unknown section path (inside the chrome)", () => {
    const html = renderWorkspace(`${CONSOLE_ROOT}/nowhere`);
    expect(html).toContain("ps-console-root"); // the chrome stays
    expect(html).toContain("Section not found");
    expect(html).toContain("/console/nowhere");
    expect(html).toContain("Nothing was found at this console address");
    // Real next actions: the overview route + the product back control.
    expect(html).toContain(`href="${CONSOLE_ROOT}"`);
    expect(html).toContain(BACK_LABEL);
  });

  it("loading is an honest skeleton with status semantics (never fabricated rows)", () => {
    const document = doc(renderWorkspace(CONSOLE_ROOT));
    const status = document.querySelectorAll('[role="status"]');
    expect(status.length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).toContain("Loading");
    expect(document.querySelectorAll(".ps-console-mission-row")).toHaveLength(0);
  });
});

describe("aria contracts across the console shell", () => {
  const RENDERED = [
    ...CONSOLE_SECTIONS.map((section) => [
      section.id,
      renderWorkspace(`${CONSOLE_ROOT}/${section.id}`),
    ] as [string, string]),
    ["not-found", renderWorkspace(`${CONSOLE_ROOT}/nowhere`)],
  ];

  it("every link and button is accessible-named", () => {
    for (const [name, markup] of RENDERED) {
      const document = doc(markup);
      const anonymous: string[] = [];
      for (const el of document.querySelectorAll("a[href], button")) {
        const text = (el.textContent ?? "").trim();
        const ariaLabel = el.getAttribute("aria-label");
        if (text === "" && !ariaLabel) {
          anonymous.push(`${name}: <${el.tagName.toLowerCase()}>`);
        }
      }
      expect(anonymous).toEqual([]);
    }
  });

  it("every svg/icon decoration is hidden from assistive tech", () => {
    for (const [name, markup] of RENDERED) {
      const document = doc(markup);
      for (const svg of document.querySelectorAll("svg")) {
        expect(svg.getAttribute("aria-hidden"), `${name} svg`).toBe("true");
      }
    }
  });

  it("every form control is labelled (label htmlFor or field context)", () => {
    const document = doc(renderWorkspace(`${CONSOLE_ROOT}/missions`));
    for (const control of document.querySelectorAll("input, select, textarea")) {
      const id = control.getAttribute("id");
      expect(id, "control carries an id").toBeTruthy();
      expect(document.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
  });

  it("no live-region alert outside a real error (loading/UNKNOWN announce politely)", () => {
    for (const [name, markup] of RENDERED) {
      const document = doc(markup);
      for (const el of document.querySelectorAll('[role="alert"]')) {
        // In the loading-state static render, nothing has failed yet.
        expect(el.textContent, `${name} unexpected alert`).toContain("failed");
      }
    }
  });
});

describe("the console stylesheet focus law (§8 — visible focus)", () => {
  it("every console interactive class carries a :focus-visible rule", () => {
    const css = readFileSync(join(process.cwd(), "src/console/console.css"), "utf8");
    for (const className of [
      "ps-console-nav-link",
      "ps-console-nav-item",
      "ps-console-action",
      "ps-console-link",
    ]) {
      expect(css, className).toMatch(new RegExp(`\\.${className}:focus-visible`));
    }
    expect(css).toContain("outline: 2px solid");
  });

  it("reduced-motion collapses console transitions (media query + data attribute)", () => {
    const css = readFileSync(join(process.cwd(), "src/console/console.css"), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('[data-reduced-motion="true"]');
  });

  it("the mobile nav swaps with the sidebar at the lg breakpoint", () => {
    const css = readFileSync(join(process.cwd(), "src/console/console.css"), "utf8");
    expect(css).toMatch(/\.ps-console-sectionnav\s*\{[^}]*display:\s*flex/);
    expect(css).toContain("@media (min-width: 1024px)");
  });
});
