// fixtures.mjs — deterministic fixture tree builder for validator
// tests (P0-W2). Builds a minimal but realistic workspace with a policy
// YAML, a pnpm-workspace.yaml, and packages whose import edges encode BOTH
// known-good and known-bad cases.
//
// IMPORTANT: the generated tree lives OUTSIDE the repo (under the OS temp
// dir) so that `node --test tools/architecture-governance/test/` never
// discovers generated .ts files as test files. Tests reset the fixture
// root on every run so runs are idempotent; zero network, zero installs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_ROOT = path.join(
  fs.realpathSync(os.tmpdir()),
  "payswap3-w2-test-fixtures",
  "mini-workspace",
);

export const MINI_POLICY = `version: 1
architecture: mini-test
rule: domain-authority-isolation

layers:
  platform:
    owner: platform
    examples: [ui, app]
    may_depend_on: [contracts]
    must_not_depend_on: [financial-implementation]
  contracts:
    owner: architecture
    examples: [shared-protocols]
    may_depend_on: []
  financial:
    owner: financial
    examples: [money]
    may_depend_on: [contracts, trust, capability]
    must_not_depend_on: [ui, model-runtime, lab]
  trust:
    owner: trust
    examples: [mandates]
    may_depend_on: [contracts]
  capability:
    owner: network
    examples: [providers]
    may_depend_on: [contracts, trust]
  intelligence:
    owner: intelligence
    examples: [lab]
    may_depend_on: [capability, contracts]
    cannot_authorize_financial_effects: true
  experience:
    owner: experience
    examples: [web-ui]
    may_depend_on: [contracts]
    must_not_own_financial_truth: true

authority:
  financial_truth: financial
  delegated_power: trust

dependency_rules:
  forbid_cycles: true
  forbid_deep_imports: true
  domain_contracts_framework_free: true
  no_parallel_financial_authority: true

package_layers:
  packages/shared: contracts
  packages/ui: experience
  packages/financial-core: financial
  packages/trust-core: trust
  packages/provider-impl: capability
  packages/lab: intelligence
  packages/app: platform
  packages/rogue: platform
  packages/cyclic-a: platform
  packages/cyclic-b: platform
`;

export const MINI_WORKSPACE = `packages:
  - packages/*
`;

function writeIfChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Known-good edges (must produce ZERO violations):
 *  - app(platform) -> shared(contracts)
 *  - ui(experience) -> shared(contracts)
 *  - financial-core(financial) -> shared, trust-core, provider-impl
 *  - trust-core(trust) -> shared
 *  - provider-impl(capability) -> shared, trust-core
 *  - lab(intelligence) -> shared, provider-impl
 *  - shared(contracts) -> (nothing)
 *  - cyclic-a/cyclic-b(platform): self-contained, no imports
 *
 * Known-bad edges (each MUST be caught by the validator):
 *  - B1 rogue(platform) -> financial-core   [R2 must_not_depend_on via
 *    must_not_depend_on "financial-implementation"? no — target layer is
 *    financial, so this hits R3 (platform may_depend_on only contracts);
 *    R2 fires on basename "financial-implementation" which matches nothing
 *    here — see B1b for the R2 case]
 *  - B1b rogue(platform) -> ui              [R2: must_not_depend_on
 *    financial-implementation? no; ui layer... R3 again]
 *  - B2 financial-core -> ui (deep import into a non-exported subpath)
 *    [R2 must_not_depend_on "ui" matches ui layer AND R3; deep import
 *    via subpath not covered by exports -> R5]
 *  - B3 shared(contracts) imports react     [R7 framework-freedom]
 *  - B4 app -> rogue deep subpath import    [R5 deep import: subpath not
 *    in rogue's exports map]
 *  - B5 lab(intelligence) -> financial-core [R3: intelligence may_depend_on
 *    excludes financial — the INV-9/INV-10 guard]
 *  - B6 cycle: cyclic-a -> cyclic-b -> cyclic-a [R4]
 */
export function buildMiniWorkspace() {
  const root = FIXTURES_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
  writeIfChanged(path.join(root, "spec/architecture/MODULE-OWNERSHIP.yaml"), MINI_POLICY);
  writeIfChanged(path.join(root, "pnpm-workspace.yaml"), MINI_WORKSPACE);
  writeIfChanged(
    path.join(root, "spec/development-state/current-state.json"),
    JSON.stringify(
      {
        policies: {
          no_parallel_financial_authority: true,
          domain_contracts_framework_free: true,
        },
      },
      null,
      2,
    ),
  );

  const pkg = (dir, manifest, files) => {
    const absDir = path.join(root, dir);
    writeIfChanged(path.join(absDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const [relative, content] of Object.entries(files ?? {})) {
      writeIfChanged(path.join(absDir, relative), content);
    }
  };

  pkg("packages/shared", { name: "@mini/shared", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `export const sharedVersion = "1";\n`,
    // B3: contracts layer imports react -> R7 violation
    "src/widget.ts": `import React from "react";\nexport const widget = React;\n`,
  });

  pkg("packages/ui", { name: "@mini/ui", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nexport const ui = sharedVersion;\n`,
    "src/deep.ts": `export const deep = "internal";\n`,
  });

  pkg("packages/financial-core", { name: "@mini/financial", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nimport { mandate } from "@mini/trust";\nimport { providerRef } from "@mini/provider";\nexport const ledger = \`\${sharedVersion}-\${mandate}-\${providerRef}\`;\n`,
    // B2: financial -> ui deep import (R2+R3+R5)
    "src/violations.ts": `import { deep } from "@mini/ui/deep";\nimport { widget } from "@mini/shared/widget";\nexport const bad = \`\${deep}-\${widget}\`;\n`,
  });

  pkg("packages/trust-core", { name: "@mini/trust", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nexport const mandate = \`mandate:\${sharedVersion}\`;\n`,
  });

  pkg("packages/provider-impl", { name: "@mini/provider", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nimport { mandate } from "@mini/trust";\nexport const providerRef = \`\${sharedVersion}/\${mandate}\`;\n`,
  });

  pkg("packages/lab", { name: "@mini/lab", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nimport { providerRef } from "@mini/provider";\nexport const strategy = \`\${sharedVersion}+\${providerRef}\`;\n`,
    // B5: intelligence -> financial (R3, the INV-9 guard)
    "src/discovery.ts": `import { ledger } from "@mini/financial";\nexport const proposal = ledger;\n`,
  });

  pkg("packages/app", { name: "@mini/app", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { sharedVersion } from "@mini/shared";\nexport const app = \`\${sharedVersion}\`;\n`,
    // B4: deep import into rogue's non-exported subpath (R5 + R3 since
    // platform->platform is outside may_depend_on)
    "src/boot.ts": `import { hidden } from "@mini/rogue/secret";\nexport const boot = hidden;\n`,
  });

  pkg("packages/rogue", { name: "@mini/rogue", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `export const rogue = true;\n`,
    "src/secret.ts": `export const hidden = "internal";\n`,
    // B1: platform -> financial layer (R3)
    "src/leak.ts": `import { ledger } from "@mini/financial";\nexport const leaked = ledger;\n`,
  });

  // B6: two-package import cycle (R4)
  pkg("packages/cyclic-a", { name: "@mini/cyclic-a", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { b } from "@mini/cyclic-b";\nexport const a = () => b;\n`,
  });
  pkg("packages/cyclic-b", { name: "@mini/cyclic-b", exports: { ".": "./src/index.ts" } }, {
    "src/index.ts": `import { a } from "@mini/cyclic-a";\nexport const b = () => a;\n`,
  });

  return root;
}

/** A strictly-clean variant: same packages, only known-good edges. */
export function buildCleanWorkspace() {
  const root = buildMiniWorkspace();
  // Remove every known-bad source.
  fs.rmSync(path.join(root, "packages/shared/src/widget.ts"), { force: true });
  fs.rmSync(path.join(root, "packages/financial-core/src/violations.ts"), { force: true });
  fs.rmSync(path.join(root, "packages/lab/src/discovery.ts"), { force: true });
  fs.rmSync(path.join(root, "packages/app/src/boot.ts"), { force: true });
  fs.rmSync(path.join(root, "packages/rogue/src/leak.ts"), { force: true });
  // Break the cycle: cyclic-a keeps its import, cyclic-b drops its back-edge.
  writeIfChanged(
    path.join(root, "packages/cyclic-b/src/index.ts"),
    `import { a } from "@mini/cyclic-a";\nexport const b = () => a;\n`,
  );
  // cyclic-b -> cyclic-a is a legal platform->platform? No: still R3.
  // Simplest clean shape: make both cyclic packages import nothing.
  writeIfChanged(
    path.join(root, "packages/cyclic-a/src/index.ts"),
    `export const a = 1;\n`,
  );
  writeIfChanged(
    path.join(root, "packages/cyclic-b/src/index.ts"),
    `export const b = 2;\n`,
  );
  // rogue also imports nothing now.
  return root;
}
