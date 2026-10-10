// scanner.test.mjs — unit tests for the vendored import scanner (P0-W2).
// Run: node --test tools/architecture-governance/test/

import test from "node:test";
import assert from "node:assert/strict";
import { scanImports } from "../lib/scanner.mjs";
import { parseYamlMini, YamlMiniError } from "../lib/yaml-mini.mjs";

test("scanner: captures all import forms with kind and typeOnly", () => {
  const source = [
    `import { a } from "@zcode/shared";`,
    `import type { B } from "@zcode/rpc";`,
    `import {`,
    `  type C,`,
    `  d,`,
    `} from "@zcode/services/node";`,
    `export * from "./local";`,
    `export type { E } from "@zcode/shared/model-config";`,
    `import "@zcode/ui";`,
    `const x = require("@zcode/client");`,
    `const y = await import("@zcode/server/remote");`,
  ].join("\n");
  const imports = scanImports(source);
  assert.equal(imports.length, 8);
  const bySpec = Object.fromEntries(imports.map((item) => [item.specifier, item]));
  assert.equal(bySpec["@zcode/shared"].kind, "import");
  assert.equal(bySpec["@zcode/shared"].typeOnly, false);
  assert.equal(bySpec["@zcode/rpc"].typeOnly, true);
  assert.equal(bySpec["@zcode/services/node"].typeOnly, false);
  assert.equal(bySpec["@zcode/services/node"].kind, "import");
  assert.equal(bySpec["./local"].kind, "export");
  assert.equal(bySpec["@zcode/shared/model-config"].typeOnly, true);
  assert.equal(bySpec["@zcode/ui"].kind, "side-effect");
  assert.equal(bySpec["@zcode/client"].kind, "require");
  assert.equal(bySpec["@zcode/server/remote"].kind, "dynamic-import");
});

test("scanner: string and comment contents never produce imports", () => {
  const source = [
    `// import { fake } from 'comment';`,
    `const s = 'require("@zcode/nope")';`,
    "const t = `from \"@zcode/nope2\" inside template`;",
    `/* import x from 'block' */`,
  ].join("\n");
  const imports = scanImports(source);
  assert.equal(imports.length, 0);
});

test("scanner: two statements on one line both captured", () => {
  const source = `import { a } from "@mini/one"; import { b } from "@mini/two";`;
  const imports = scanImports(source);
  assert.deepEqual(
    imports.map((item) => item.specifier).sort(),
    ["@mini/one", "@mini/two"],
  );
});

test("scanner: multi-line clause reports the specifier's own line", () => {
  const source = ["const x = 1;", "import {", "  a,", "} from '@mini/x';"].join("\n");
  const imports = scanImports(source);
  assert.equal(imports[0].line, 4); // line of the module specifier string
});

test("scanner: escaped quotes inside strings stay inert", () => {
  const source = `const s = "import { x } from \\"@mini/fake\\"";`;
  const imports = scanImports(source);
  assert.equal(imports.length, 0);
});

test("yaml-mini: parses mappings, flow lists, booleans, comments", () => {
  const doc = parseYamlMini(
    [
      `version: 1`,
      `layer:`,
      `  owner: platform # trailing comment`,
      `  examples: [rpc, transport]`,
      `  may_depend_on: [contracts]`,
      `flags:`,
      `  forbid_cycles: true`,
      `  relaxed: false`,
      ``,
      `# full-line comment`,
      `name: "quoted name"`,
    ].join("\n"),
  );
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.layer.examples, ["rpc", "transport"]);
  assert.equal(doc.flags.forbid_cycles, true);
  assert.equal(doc.flags.relaxed, false);
  assert.equal(doc.name, "quoted name");
});

test("yaml-mini: parses block sequences (pnpm-workspace shape)", () => {
  const doc = parseYamlMini(["packages:", "  - packages/*", "  - apps/cli", ""].join("\n"));
  assert.deepEqual(doc.packages, ["packages/*", "apps/cli"]);
});

test("yaml-mini: rejects malformed documents (fail-closed)", () => {
  assert.throws(() => parseYamlMini("just a scalar\n"), YamlMiniError);
  assert.throws(() => parseYamlMini("a:\n  b: 1\n c: 2\n"), YamlMiniError);
  assert.throws(() => parseYamlMini("- item\n"), YamlMiniError);
  assert.throws(() => parseYamlMini("a: [unterminated\n"), YamlMiniError);
});
