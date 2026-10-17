import { describe, expect, it } from 'vitest';

import {
  COMMAND_SURFACE_API_VERSION,
  EXTENSION_BOUNDARY_API_VERSION,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  SUPPORTED_COMMAND_API_VERSIONS,
  SUPPORTED_EXTENSION_API_VERSIONS,
  API_VERSION_HEADER,
  asApiVersionString,
  isApiVersionString,
  isSupportedApiVersion,
  assertSupportedApiVersion,
  assertEnvelopeSchemaVersion,
} from '../src/version.ts';
import { UnsupportedVersionError } from '../src/errors.ts';

describe('version pins + the explicit-versioning law', () => {
  it('pins the command surface and extension boundary API versions (independent pins)', () => {
    expect(COMMAND_SURFACE_API_VERSION).toBe('1.0.0');
    expect(EXTENSION_BOUNDARY_API_VERSION).toBe('1.0.0');
    expect(COMMAND_ENVELOPE_SCHEMA_VERSION).toBe(1);
    expect(API_VERSION_HEADER).toBe('X-PaySwap-API-Version');
  });

  it('supports exactly the pinned API versions (explicit; no implicit default)', () => {
    expect([...SUPPORTED_COMMAND_API_VERSIONS]).toEqual([COMMAND_SURFACE_API_VERSION]);
    expect([...SUPPORTED_EXTENSION_API_VERSIONS]).toEqual([EXTENSION_BOUNDARY_API_VERSION]);
    expect(isSupportedApiVersion(COMMAND_SURFACE_API_VERSION)).toBe(true);
    expect(isSupportedApiVersion('0.9.0')).toBe(false);
    expect(isSupportedApiVersion('')).toBe(false);
  });

  it('isApiVersionString narrows well-formed semver-shaped versions only', () => {
    expect(isApiVersionString('1.0.0')).toBe(true);
    expect(isApiVersionString('2026-09-30')).toBe(false);
    expect(isApiVersionString('1')).toBe(false);
    expect(isApiVersionString(1)).toBe(false);
    expect(isApiVersionString('1.0.0-beta')).toBe(false);
  });

  it('asApiVersionString rejects malformed versions fail-closed (UnsupportedVersionError)', () => {
    expect(() => asApiVersionString(undefined, 'request.apiVersion')).toThrow(UnsupportedVersionError);
    expect(() => asApiVersionString('v1', 'request.apiVersion')).toThrow(UnsupportedVersionError);
    expect(asApiVersionString('2.0.0', 'request.apiVersion')).toBe('2.0.0');
  });

  it('assertSupportedApiVersion rejects unsupported pins with the supported list in the message', () => {
    expect(() => assertSupportedApiVersion('9.9.9', 'request.apiVersion')).toThrow(UnsupportedVersionError);
    try {
      assertSupportedApiVersion('9.9.9', 'request.apiVersion');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedVersionError);
      const versionError = error as UnsupportedVersionError;
      expect(versionError.category).toBe('UNSUPPORTED_VERSION');
      expect(versionError.message).toContain('supported:');
    }
    expect(assertSupportedApiVersion(COMMAND_SURFACE_API_VERSION, 'request.apiVersion')).toBe(
      COMMAND_SURFACE_API_VERSION,
    );
  });

  it('assertEnvelopeSchemaVersion accepts the pin and rejects foreign schema versions', () => {
    expect(assertEnvelopeSchemaVersion(1)).toBe(1);
    expect(() => assertEnvelopeSchemaVersion(2)).toThrow(UnsupportedVersionError);
    expect(() => assertEnvelopeSchemaVersion(0)).toThrow(UnsupportedVersionError);
    expect(() => assertEnvelopeSchemaVersion('1')).toThrow(UnsupportedVersionError);
  });
});
