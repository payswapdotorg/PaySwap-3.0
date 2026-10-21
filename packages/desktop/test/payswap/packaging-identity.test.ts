/**
 * Packaging identity contract laws (P9-B) — the desktop packaging side of
 * spec/productization/PRODUCT-IDENTITY.md §1. Every canonical value the
 * spec pins for Lane B is asserted here against the REAL build inputs:
 * the desktop package manifest, the identity module, the electron-builder
 * config and the update-channel placeholder.
 *
 * Node environment only: the electron-builder config is imported with the
 * production build env pinned (ZCODE_ENV=production, linux/x64 target), so
 * assertions run against exactly the object electron-builder would consume
 * during a release build.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { collectBuildMetadata } from "../../scripts/build-metadata.mjs";
import {
  desktopProductIdentities,
  resolveDesktopArtifactSuffix,
  resolveDesktopProductIdentity,
} from "../../scripts/desktop-product-identity.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const desktopManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

/** Minimal PNG IHDR reader (width/height/mode) — no image library needed. */
function readPngIhdr(filePath) {
  const bytes = readFileSync(filePath);
  // PNG signature (8) + IHDR length (4) + "IHDR" (4) -> data at offset 16.
  expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
    true,
  );
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

describe("packaging identity law: canonical §1 values are the law (P9-B)", () => {
  it("the desktop package manifest carries the canonical packaging identity", () => {
    expect(desktopManifest.name).toBe("@payswap/desktop");
    expect(desktopManifest.productName).toBe("PaySwap");
    expect(desktopManifest.version).toBe("1.0.0");
    expect(desktopManifest.description).toBe(
      "PaySwap Desktop — the non-custodial economic operating system.",
    );
    expect(desktopManifest.author).toBe("PaySwap");
  });

  it("the product version is PaySwap-own semver, not the upstream substrate pin", () => {
    const workspaceManifest = JSON.parse(
      readFileSync(join(packageRoot, "../../package.json"), "utf8"),
    );
    expect(desktopManifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(desktopManifest.version).not.toBe(workspaceManifest.version);
  });

  it("build metadata derives the artifact/about version from the desktop package", () => {
    expect(collectBuildMetadata().appVersion).toBe(desktopManifest.version);
  });

  it("the production identity resolves to the canonical §1 values under ZCODE_ENV=production", () => {
    const identity = resolveDesktopProductIdentity({ ZCODE_ENV: "production" });
    expect(identity).toEqual(
      expect.objectContaining({
        flavor: "production",
        appId: "org.payswap.PaySwap",
        productName: "PaySwap",
        linuxExecutableName: "payswap",
        linuxPackageName: "payswap",
      }),
    );
  });

  it("the preview flavor mechanism survives, retargeted to the PaySwap identity", () => {
    expect(desktopProductIdentities.preview).toEqual(
      expect.objectContaining({
        flavor: "preview",
        appId: "org.payswap.PaySwap.preview",
        productName: "PaySwap Preview",
        linuxExecutableName: "payswap-preview",
        linuxPackageName: "payswap-preview",
      }),
    );
    // Flavor isolation: production and preview must never share an installable identity.
    expect(desktopProductIdentities.production.appId).not.toBe(
      desktopProductIdentities.preview.appId,
    );
    expect(desktopProductIdentities.production.linuxPackageName).not.toBe(
      desktopProductIdentities.preview.linuxPackageName,
    );
  });

  it("test-backend builds are marked with the _TEST artifact suffix; production builds are not", () => {
    expect(resolveDesktopArtifactSuffix({ ZCODE_ENV: "test" })).toBe("_TEST");
    expect(resolveDesktopArtifactSuffix({ ZCODE_ENV: "production" })).toBe("");
  });
});

describe("packaging identity law: electron-builder consumes the canonical identity (P9-B)", () => {
  it("the linux packaging config builds deb + AppImage under the PaySwap identity", async () => {
    const previousEnv = {
      ZCODE_ENV: process.env.ZCODE_ENV,
      ZCODE_TARGET_OS: process.env.ZCODE_TARGET_OS,
      ZCODE_TARGET_ARCH: process.env.ZCODE_TARGET_ARCH,
    };
    process.env.ZCODE_ENV = "production";
    process.env.ZCODE_TARGET_OS = "linux";
    process.env.ZCODE_TARGET_ARCH = "x64";
    try {
      const config = (await import("../../electron-builder.config.js")).default;
      expect(config.appId).toBe("org.payswap.PaySwap");
      expect(config.productName).toBe("PaySwap");
      expect(config.linux.executableName).toBe("payswap");
      expect(config.linux.target).toEqual(["deb", "AppImage"]);
      // electron-builder 26 derives the desktop-entry Categories line from
      // linux.category ("Office;Finance" -> "Office;Finance;"); the compound
      // string keeps both menu sections without an invalid desktop.Categories key.
      expect(config.linux.category).toBe("Office;Finance");
      expect(config.linux.maintainer).toMatch(/^PaySwap </);
      expect(config.deb.packageName).toBe("payswap");
      // Artifact names follow the Debian/AppImage conventions and match the
      // GitHub Release asset names (PaySwap_<version>_amd64.deb / PaySwap-<version>.AppImage).
      expect(config.deb.artifactName).toBe("${productName}_${version}_${arch}.${ext}");
      expect(config.appImage.artifactName).toBe("${productName}-${version}.${ext}");
      expect(config.extraMetadata.homepage).toBe("https://github.com/payswapdotorg/PaySwap-3.0");
      expect(config.extraMetadata.author.name).toBe("PaySwap");
      expect(config.extraMetadata.version).toBe(desktopManifest.version);
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});

describe("packaging identity law: raster assets derive from the PaySwap mark (P9-B)", () => {
  it("the master icon is a 1024x1024 RGBA PNG", () => {
    const ihdr = readPngIhdr(join(packageRoot, "build/icon.png"));
    expect(ihdr.width).toBe(1024);
    expect(ihdr.height).toBe(1024);
    expect(ihdr.colorType).toBe(6); // RGBA
  });

  it("the hicolor set covers every size the deb target installs", () => {
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
      const ihdr = readPngIhdr(join(packageRoot, "build/icons", `${size}x${size}.png`));
      expect(ihdr.width).toBe(size);
      expect(ihdr.height).toBe(size);
    }
  });

  it("ICO and ICNS containers are structurally valid", () => {
    const ico = readFileSync(join(packageRoot, "build/icon.ico"));
    // ICONDIR: reserved=0, type=1 (icon), count = 7 PNG entries.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(7);
    const icns = readFileSync(join(packageRoot, "build/icon.icns"));
    expect(icns.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
  });
});

describe("packaging identity law: the dev update feed is an honest placeholder (P9-B)", () => {
  it("dev-app-update.yml carries the PaySwap cache identity and a non-production placeholder URL", () => {
    const doc = parseYaml(readFileSync(join(packageRoot, "dev-app-update.yml"), "utf8"));
    expect(doc.provider).toBe("generic");
    expect(doc.updaterCacheDirName).toBe("payswap-dev-updater");
    // The URL must never pretend to be a real PaySwap feed: it is a localhost
    // placeholder exactly like the production publish config.
    expect(doc.url).toBe("http://localhost:8081");
  });
});
