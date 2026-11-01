/**
 * @payswap/provider-runtime — the Stripe catalogue DEV-TIME GENERATION SCRIPT
 * (P24-0; extended by P24-1 with the request-schema artifact). Lives in
 * scripts/ (NOT src): the boundary battery forbids node builtins in src —
 * this file is the composition edge that binds them.
 *
 * Run from the package root:
 *   bun run scripts/generate-stripe-catalogue.ts
 *   (or: node --experimental-strip-types scripts/generate-stripe-catalogue.ts)
 *
 * Verifies the committed spec's SHA-256 against the pin, regenerates
 * catalogue/operations.json (the P24-0 inventory) AND
 * catalogue/operation-schemas.json (the P24-1 request-schema artifact,
 * ADR-0017 D4) deterministically, and prints the census summary.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRIPE_OPENAPI_PIN } from '../src/adapters/stripe/catalogue/spec-pin.ts';
import { generateStripeOperationInventory } from '../src/adapters/stripe/catalogue/generator.ts';
import { generateStripeOperationSchemas } from '../src/adapters/stripe/catalogue/schema-generator.ts';

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

const specJson = JSON.parse(specBytes.toString('utf8'));

const inventory = generateStripeOperationInventory(specJson, { sha256Hex });

const outPath = join(catalogueDir, STRIPE_OPENAPI_PIN.inventoryPath);
writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `generated ${inventory.operationCount} operations ` +
    `(v1 ${inventory.namespaceCounts.v1} + v2 ${inventory.namespaceCounts.v2}) ` +
    `from spec ${inventory.specInfoVersion} → ${outPath}`,
);

const schemas = generateStripeOperationSchemas(specJson, { sha256Hex });
const schemasPath = join(catalogueDir, STRIPE_OPENAPI_PIN.schemasPath);
writeFileSync(schemasPath, `${JSON.stringify(schemas, null, 1)}\n`);
console.log(
  `generated request schemas for ${schemas.operationCount} operations ` +
    `(${Object.keys(schemas.defs).length} interned defs; ` +
    `unresolvable refs: ${schemas.unresolvableRefs.length}; ` +
    `unrepresentable ops: ${schemas.unrepresentableOperations.length}) → ${schemasPath}`,
);
