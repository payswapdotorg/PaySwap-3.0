import { describe, expect, it } from "vitest";
import {
  addCryptoAmounts,
  compareCryptoAmounts,
  defineCryptoAmount,
  defineCryptoAsset,
  equalsCryptoAmount,
  isCryptoAmountPositive,
  subCryptoAmounts,
} from "../src/assets.ts";
import type { CryptoAmount, CryptoAssetKind } from "../src/assets.ts";
import {
  InvalidCryptoAmountError,
  InvalidIdentifierError,
  ValidationError,
} from "../src/errors.ts";
import { ETH, USDC, ethAmount, usdcAmount } from "./fixtures.ts";

/**
 * The crypto assets + exact amounts suite (PORT of old
 * packages/merchant-crypto test/assets.test.ts — 27 sites — onto the
 * P5-W3 package: same laws, consolidated per the old-site accounting;
 * assets come from the shared deterministic ./fixtures.ts where
 * convenient). All amounts are exact bigint minor units (INV-2); the
 * asset's decimals are scale metadata carried from the asset, never
 * a floating-point path.
 */

describe("defineCryptoAsset (old defineCryptoAsset block, 10 sites -> 5 tests)", () => {
  it("defines a frozen asset with the declared fields (PORTED: old 'defines a frozen USDC asset')", () => {
    expect(USDC.id).toBe("asset.usdc");
    expect(USDC.displayName).toBe("USD Coin");
    expect(USDC.symbol).toBe("USDC");
    expect(USDC.decimals).toBe(6);
    expect(USDC.kind).toBe("STABLECOIN");
    expect(ETH.symbol).toBe("ETH");
    expect(ETH.decimals).toBe(18);
    expect(ETH.kind).toBe("NATIVE_CRYPTO");
    const wbtc = defineCryptoAsset({
      id: "asset.wbtc",
      displayName: "Wrapped Bitcoin",
      symbol: "WBTC",
      decimals: 8,
      kind: "TOKEN",
    });
    expect(wbtc.id).toBe("asset.wbtc");
    expect(wbtc.decimals).toBe(8);
    expect(wbtc.kind).toBe("TOKEN");
    expect(Object.isFrozen(wbtc)).toBe(true);
  });

  it("rejects malformed symbols: lowercase, one character, seventeen characters (PORTED: old symbol sites)", () => {
    for (const symbol of ["usdc", "U", "ABCDEFGHIJKLMNOPQ", "US-DC"]) {
      expect(() =>
        defineCryptoAsset({
          id: "asset.usdc",
          displayName: "USD Coin",
          symbol,
          decimals: 6,
          kind: "STABLECOIN",
        }),
      ).toThrow(ValidationError);
    }
    expect(() =>
      defineCryptoAsset({
        id: "asset.usdc",
        displayName: "USD Coin",
        symbol: "usdc",
        decimals: 6,
        kind: "STABLECOIN",
      }),
    ).toThrow(/symbol must be two to sixteen uppercase/);
  });

  it("rejects out-of-range and non-integer decimals: -1, 19, 2.5 (PORTED: old decimals sites)", () => {
    for (const decimals of [-1, 19, 2.5]) {
      expect(() =>
        defineCryptoAsset({
          id: "asset.usdc",
          displayName: "USD Coin",
          symbol: "USDC",
          decimals,
          kind: "STABLECOIN",
        }),
      ).toThrow(ValidationError);
    }
    expect(() =>
      defineCryptoAsset({
        id: "asset.usdc",
        displayName: "USD Coin",
        symbol: "USDC",
        decimals: 2.5,
        kind: "STABLECOIN",
      }),
    ).toThrow(/decimals must be an integer between 0 and 18/);
  });

  it("rejects an empty or oversized displayName and a malformed id (PORTED: old 'rejects an empty id' + 'rejects an empty displayName'; ADAPT: the id law now raises InvalidIdentifierError)", () => {
    expect(() =>
      defineCryptoAsset({
        id: "",
        displayName: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        kind: "STABLECOIN",
      }),
    ).toThrow(InvalidIdentifierError);
    expect(() =>
      defineCryptoAsset({
        id: "asset.usdc",
        displayName: "",
        symbol: "USDC",
        decimals: 6,
        kind: "STABLECOIN",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoAsset({
        id: "asset.usdc",
        displayName: "x".repeat(129),
        symbol: "USDC",
        decimals: 6,
        kind: "STABLECOIN",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects an undeclared kind (PORTED: old 'rejects an undeclared kind')", () => {
    expect(() =>
      defineCryptoAsset({
        id: "asset.fake",
        displayName: "Fake",
        symbol: "FAKE",
        decimals: 6,
        kind: "FAKE" as unknown as CryptoAssetKind,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoAsset({
        id: "asset.fake",
        displayName: "Fake",
        symbol: "FAKE",
        decimals: 6,
        kind: "stablecoin" as unknown as CryptoAssetKind,
      }),
    ).toThrow(ValidationError);
  });
});

describe("defineCryptoAmount (old defineCryptoAmount block, 5 sites -> 3 tests)", () => {
  it("copies decimals from the asset and freezes the amount (PORTED: old 'decimals copied' + 'always carries the asset decimals exactly')", () => {
    const amount = defineCryptoAmount(USDC, 110_000_000n);
    expect(amount.assetId).toBe(USDC.id);
    expect(amount.value).toBe(110_000_000n);
    expect(amount.decimals).toBe(USDC.decimals);
    expect(Object.isFrozen(amount)).toBe(true);
    expect(isCryptoAmountPositive(amount)).toBe(true);
    const wei = ethAmount(1_000_000_000_000_000_000n);
    expect(wei.assetId).toBe(ETH.id);
    expect(wei.decimals).toBe(18);
    expect(defineCryptoAmount(ETH, 1n).decimals).toBe(18);
    expect(defineCryptoAmount(USDC, 1n).decimals).toBe(6);
  });

  it("rejects JS-number values — INV-2 has no floating-point path (ADAPTED: old 'keeps value as bigint')", () => {
    expect(() => defineCryptoAmount(USDC, 42 as unknown as bigint)).toThrow(ValidationError);
    expect(() => defineCryptoAmount(USDC, 42 as unknown as bigint)).toThrow(/JS number/);
    expect(typeof defineCryptoAmount(USDC, 42n).value).toBe("bigint");
    const floated = { assetId: USDC.id, value: 42, decimals: 6 } as unknown as CryptoAmount;
    expect(() => addCryptoAmounts(floated, floated)).toThrow(ValidationError);
    expect(() => addCryptoAmounts(floated, floated)).toThrow(/JS number/);
  });

  it("rejects negative values and allows zero — zero is well-formed, not positive (PORTED: old 'rejects a negative value' + 'allows zero')", () => {
    expect(() => defineCryptoAmount(USDC, -1n)).toThrow(ValidationError);
    expect(() => defineCryptoAmount(USDC, -1n)).toThrow(/non-negative/);
    const zero = defineCryptoAmount(USDC, 0n);
    expect(zero.value).toBe(0n);
    expect(zero.decimals).toBe(USDC.decimals);
    expect(Object.isFrozen(zero)).toBe(true);
    expect(isCryptoAmountPositive(zero)).toBe(false);
  });
});

describe("exact same-asset amount arithmetic (old add/sub/compare/equals blocks, 9 sites -> 5 tests)", () => {
  it("addCryptoAmounts sums same-asset amounts into a new frozen amount (PORTED)", () => {
    const a = usdcAmount(1n);
    const b = usdcAmount(2n);
    const sum = addCryptoAmounts(a, b);
    expect(sum.value).toBe(3n);
    expect(sum.assetId).toBe(USDC.id);
    expect(sum.decimals).toBe(6);
    expect(Object.isFrozen(sum)).toBe(true);
    expect(a.value).toBe(1n);
    expect(b.value).toBe(2n);
  });

  it("addCryptoAmounts throws InvalidCryptoAmountError when assets or scale metadata differ (PORTED: old 'assetIds differ' + 'decimals differ for the same id')", () => {
    expect(() => addCryptoAmounts(usdcAmount(1n), ethAmount(1n))).toThrow(InvalidCryptoAmountError);
    const usdcEighteen = defineCryptoAsset({
      id: USDC.id,
      displayName: "USD Coin (alternate scale)",
      symbol: "USDC",
      decimals: 18,
      kind: "STABLECOIN",
    });
    const a = usdcAmount(1n);
    const b = defineCryptoAmount(usdcEighteen, 1n);
    expect(a.assetId).toBe(b.assetId);
    expect(() => addCryptoAmounts(a, b)).toThrow(InvalidCryptoAmountError);
    expect(() => addCryptoAmounts(a, b)).toThrow(/single asset/);
  });

  it("subCryptoAmounts subtracts exactly and throws on underflow instead of going negative (PORTED: old sub sites)", () => {
    const difference = subCryptoAmounts(usdcAmount(5n), usdcAmount(3n));
    expect(difference.value).toBe(2n);
    expect(difference.assetId).toBe(USDC.id);
    expect(difference.decimals).toBe(6);
    expect(Object.isFrozen(difference)).toBe(true);
    expect(subCryptoAmounts(usdcAmount(3n), usdcAmount(3n)).value).toBe(0n);
    expect(() => subCryptoAmounts(usdcAmount(3n), usdcAmount(5n))).toThrow(
      InvalidCryptoAmountError,
    );
    expect(() => subCryptoAmounts(usdcAmount(3n), usdcAmount(5n))).toThrow(/would go negative/);
  });

  it("compareCryptoAmounts orders -1 / 0 / +1 within one asset and throws across assets (PORTED: old compare sites)", () => {
    const one = usdcAmount(1n);
    const two = usdcAmount(2n);
    expect(compareCryptoAmounts(one, two)).toBe(-1);
    expect(compareCryptoAmounts(two, one)).toBe(1);
    expect(compareCryptoAmounts(one, usdcAmount(1n))).toBe(0);
    expect(() => compareCryptoAmounts(one, ethAmount(1n))).toThrow(InvalidCryptoAmountError);
  });

  it("equalsCryptoAmount is structural (not referential) and cross-asset amounts are never equal (PORTED: old equals sites)", () => {
    const a = usdcAmount(7n);
    const b = usdcAmount(7n);
    expect(a).not.toBe(b);
    expect(equalsCryptoAmount(a, b)).toBe(true);
    expect(equalsCryptoAmount(a, usdcAmount(8n))).toBe(false);
    expect(equalsCryptoAmount(usdcAmount(1n), ethAmount(1n))).toBe(false);
    expect(equalsCryptoAmount(usdcAmount(0n), usdcAmount(0n))).toBe(true);
    expect(isCryptoAmountPositive(usdcAmount(0n))).toBe(false);
    expect(isCryptoAmountPositive(usdcAmount(1n))).toBe(true);
  });
});
