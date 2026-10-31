/**
 * @payswap/provider-runtime — the Stripe catalogue DEV-TIME GENERATION SCRIPT
 * (P24-0). Lives in scripts/ (NOT src): the boundary battery forbids node
 * builtins in src — this file is the composition edge that binds them.
 *
 * Run from the package root:
 *   bun run scripts/generate-stripe-catalogue.ts
 *   (or: node --experimental-strip-types scripts/generate-stripe-catalogue.ts)
 *
 * Verifies the committed spec's SHA-256 against the pin, regenerates
 * catalogue/operations.json deterministically, and prints the census.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRIPE_OPENAPI_PIN } from '../src/adapters/stripe/catalogue/spec-pin.ts';
import { generateStripeOperationInventory } from '../src/adapters/stripe/catalogue/generator.ts';

const here = dirname(fileURLToPath(import.meta.url));
const catalogueDir = join(here, '../src/adapters/stripe/catalogue');

const specPath = join(catalogueDir, STRIPE_OPENAPI_PIN.specFilePath);
const specBytes = readFileSync(specPath);
const specSha = createHash('sha256').update(specBytes).digest('hex');
if (specSha !== STRIPE_OPENAPI_PIN.specSha256) {
  console.error(`spec SHA-256 mismatch: expected ${STRIPE_OPENAPI_PIN.specSha256}, got ${specSha}`);
  process.exit(1);
}

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const inventory = generateStripeOperationInventory(JSON.parse(specBytes.toString('utf8')), {
  sha256Hex,
});

const outPath = join(catalogueDir, STRIPE_OPENAPI_PIN.inventoryPath);
writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `generated ${inventory.operationCount} operations ` +
    `(v1 ${inventory.namespaceCounts.v1} + v2 ${inventory.namespaceCounts.v2}) ` +
    `from spec ${inventory.specInfoVersion} → ${outPath}`,
);
