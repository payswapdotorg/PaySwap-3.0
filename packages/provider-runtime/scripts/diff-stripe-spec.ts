/**
 * @payswap/provider-runtime — the Stripe pin-diff DEV-TIME SCRIPT (P24-1).
 *
 * The D2 "generate → diff → review → adopt" law's tooling: produces a
 * machine-readable diff between the PINNED spec and a CANDIDATE spec file
 * (operations added/removed/changed by operationId, with method/path/
 * specDigest evidence on each side). Lives in scripts/ (node builtins are
 * banned in src/ — the boundary battery enforces it).
 *
 * Run from the package root:
 *   node --experimental-strip-types scripts/diff-stripe-spec.ts <candidate-spec.json> [--out <diff.json>]
 *
 * The pinned side is ALWAYS the committed spec (verified against the pin's
 * SHA-256 first — a diff against an altered pin is refused). The output is
 * JSON on stdout (or the --out file). Adoption is NEVER automatic: the TL
 * reviews this artifact before any pin change.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRIPE_OPENAPI_PIN } from '../src/adapters/stripe/catalogue/spec-pin.ts';
import { generateStripeOperationInventory } from '../src/adapters/stripe/catalogue/generator.ts';
import {
  diffStripeOperationInventories,
  summarizeStripeCatalogueDiff,
} from '../src/adapters/stripe/catalogue/pin-diff.ts';

const args = process.argv.slice(2);
const candidatePath = args[0];
const outIndex = args.indexOf('--out');
const outPath = outIndex !== -1 ? args[outIndex + 1] : undefined;

if (candidatePath === undefined || candidatePath.startsWith('--')) {
  console.error('usage: diff-stripe-spec.ts <candidate-spec.json> [--out <diff.json>]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const pinnedSpecPath = join(here, '../src/adapters/stripe/catalogue', STRIPE_OPENAPI_PIN.specFilePath);

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const pinnedBytes = readFileSync(pinnedSpecPath);
const pinnedSha = createHash('sha256').update(pinnedBytes).digest('hex');
if (pinnedSha !== STRIPE_OPENAPI_PIN.specSha256) {
  console.error(
    `the committed pin spec failed its own SHA-256 check (expected ${STRIPE_OPENAPI_PIN.specSha256}, got ${pinnedSha}) — refusing to diff against an altered pin`,
  );
  process.exit(1);
}

const candidateBytes = readFileSync(candidatePath);
let candidateJson: unknown;
try {
  candidateJson = JSON.parse(candidateBytes.toString('utf8'));
} catch (error) {
  console.error(`the candidate spec is not valid JSON: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exit(1);
}

const pinned = generateStripeOperationInventory(JSON.parse(pinnedBytes.toString('utf8')), { sha256Hex });
const candidate = generateStripeOperationInventory(candidateJson as never, { sha256Hex });

const diff = diffStripeOperationInventories(pinned, candidate);
const json = `${JSON.stringify(diff, null, 2)}\n`;
if (outPath !== undefined) {
  writeFileSync(outPath, json);
  console.error(`wrote the pin diff → ${outPath}`);
} else {
  process.stdout.write(json);
}
console.error(summarizeStripeCatalogueDiff(diff));
