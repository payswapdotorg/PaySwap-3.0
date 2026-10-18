import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { validateVenueQuote } from "../src/engine-support.ts";
import { evaluateNetOutcome } from "../src/scoring.ts";
import { validateBestExecutionPolicy } from "../src/policy.ts";
import { BestExecutionEngine } from "../src/best-execution.ts";
import { fixtureQuote } from "./venue-fixtures.ts";
import { baseBestExecutionPolicy } from "./venue-fixtures.ts";
import { validateBestExecutionPolicy as validatePolicy } from "../src/policy.ts";

/**
 * Adversarial (PORT of the old best-execution adversarial suite): the
 * core-venue separation guard, no privileged venue id, the secret-field
 * guard, observations-not-custody.
 */
const packageRoot = process.cwd();
const srcDir = join(packageRoot, "src");

function listTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files.sort();
}
const sourceFiles = listTypeScriptFiles(srcDir);

describe("the core-venue separation guard", () => {
  it("src mentions NO venue name (word-boundary regex scan, comments included)", () => {
    const venueNames = [
      "uniswap", "sushiswap", "curve", "balancer", "1inch", "cowswap", "matcha",
      "paraswap", "hashflow", "bancor", "kyber", "stargate", "lifi", "debridge",
      "zeroswap", "solverbatch", "lockport", "coinramp", "tidalpools", "meridian",
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8").toLowerCase();
      for (const venue of venueNames) {
        if (new RegExp(`\\b${venue}\\b`).test(source)) {
          offenders.push(`${relative(packageRoot, file)}: ${venue}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("src contains no address-shaped constant (real or famous)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      if (/0x[0-9a-fA-F]{40}/.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("NO privileged venue id (runtime parity probe): identical dimensions, identical nets", () => {
    const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
    const famousLooking = { ...fixtureQuote(), venueId: "official-venue-001", quoteId: "quote:official:001" };
    const neutral = { ...fixtureQuote(), venueId: "zzz-neutral-venue", quoteId: "quote:neutral:001" };
    const famousNet = evaluateNetOutcome({ candidate: { candidateId: "f", quote: famousLooking }, policy }).netNumeraireMinorUnits;
    const neutralNet = evaluateNetOutcome({ candidate: { candidateId: "n", quote: neutral }, policy }).netNumeraireMinorUnits;
    expect(famousNet).toBe(neutralNet);
  });

  it("an unknown venue id gets no hidden penalty (identical nets)", () => {
    const policy = validatePolicy(baseBestExecutionPolicy());
    const base = evaluateNetOutcome({ candidate: { candidateId: "a", quote: fixtureQuote() }, policy });
    const renamed = evaluateNetOutcome({
      candidate: { candidateId: "b", quote: { ...fixtureQuote(), venueId: "totally-unknown-venue" } },
      policy,
    });
    expect(base.netNumeraireMinorUnits).toBe(renamed.netNumeraireMinorUnits);
  });

  it("the secret-field guard: no key/seed/secret-shaped property declarations in src", () => {
    const offenders: string[] = [];
    const secretPattern = /(apiKey|api_key|secretKey|secret_key|privateKey|private_key|mnemonic|passphrase|keystore|password)\s*[:?]/;
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      if (secretPattern.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("OBSERVATIONS-NOT-CUSTODY: stripping freshness/provenance/observer makes the quote invalid", () => {
    const { freshness, provenance, observer, ...stripped } = fixtureQuote();
    void freshness;
    void provenance;
    void observer;
    expect(() => validateVenueQuote(stripped)).toThrowError();
  });

  it("no custody-named exports in the SCORING CORE (a quote is an observation, never custody)", () => {
    const scoringCore = sourceFiles.filter((file) =>
      [
        "quote.ts", "quote-fees.ts", "policy.ts", "scoring.ts", "scoring-order.ts",
        "venue-port.ts", "engine-support.ts", "engine-assess.ts",
        "best-execution.ts", "execution-record.ts", "route-validity.ts", "provenance.ts",
        "exact-math.ts", "amount.ts",
      ].some((name) => file.endsWith(name)),
    );
    const offenders: string[] = [];
    for (const file of scoringCore) {
      const source = readFileSync(file, "utf8");
      const custodyExports = source.match(/export (?:const|function|class) \w*(custody|ledger|mint|balance)\w*/gi);
      if (custodyExports !== null) {
        offenders.push(`${relative(packageRoot, file)}: ${custodyExports.join(",")}`);
      }
    }
    expect(scoringCore.length).toBe(15);
    expect(offenders.join("\n")).toBe("");
  });

  it("a fresh engine exposes no venue constructors (opaque registrations only)", () => {
    const engine = new BestExecutionEngine();
    expect(engine.venues().length).toBe(0);
    expect(typeof (engine as unknown as Record<string, unknown>).createVenue).not.toBe("function");
  });

  it("the engine never consults optimizationOrigin (INV-C08 runtime probe)", () => {
    const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
    const native = evaluateNetOutcome({
      candidate: { candidateId: "a", quote: { ...fixtureQuote(), optimizationOrigin: "PROVIDER_NATIVE" } },
      policy,
    });
    const composed = evaluateNetOutcome({
      candidate: { candidateId: "b", quote: { ...fixtureQuote(), optimizationOrigin: "COMPOSED" } },
      policy,
    });
    expect(native.netNumeraireMinorUnits).toBe(composed.netNumeraireMinorUnits);
  });

  it("no float parsing anywhere in src (no parseFloat/Number('1.5') conversions of wire data)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      if (/\bparseFloat\b/.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the venue-quote validation rejects venue garbage (never crashes the caller)", () => {
    expect(() => validateVenueQuote(null)).toThrowError();
    expect(() => validateVenueQuote("quote")).toThrowError();
    expect(() => validateVenueQuote(42)).toThrowError();
  });
});
