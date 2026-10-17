import { describe, expect, it } from 'vitest';

import {
  validateExtensionManifest,
  validateExtensionMessageEnvelope,
  validateHostOriginBinding,
  assertExtensionRequestAllowed,
  EXTENSION_PROTOCOL_MARKER,
  type ExtensionMessageEnvelope,
} from '../src/extension-boundary.ts';
import { EXTENSION_PERMISSIONS } from '../src/permission.ts';
import {
  ExtensionBoundaryError,
  PermissionDeniedError,
  MethodNotFoundError,
  UnsupportedVersionError,
} from '../src/errors.ts';
import { sampleExtensionManifest } from './fixtures.ts';
import { asCommandRequestId } from '../src/identifiers.ts';

/**
 * NET-NEW (P7-W3): the browser Extension boundary laws — there was no
 * old-repo counterpart to port (the old repository had no extension
 * boundary; the extension IMPLEMENTATION remains product work outside this
 * lane). Machine-checked laws:
 * - the permission vocabulary contains NO financial authority member;
 * - manifests are versioned, permission-scoped and origin-bound;
 * - every request is an explicit, typed envelope (no ambient channel);
 * - effect-bearing calls require the declared method + COMMAND_PROPOSE
 *   permission (the no-ambient-authority gate) and fail closed otherwise.
 */

function message(method: string, options?: { readonly apiVersion?: string }): ExtensionMessageEnvelope {
  return {
    protocol: EXTENSION_PROTOCOL_MARKER,
    apiVersion: options?.apiVersion ?? '1.0.0',
    requestId: asCommandRequestId('req_0001'),
    method,
    payload: { note: 'proposal input' },
  };
}

const SURFACE_METHODS = ['payments.intent.propose', 'quotes.read', 'observations.read'];

describe('THE Extension permission vocabulary (no ambient authority)', () => {
  it('is exactly the four declared permissions — NO financial member exists', () => {
    expect([...EXTENSION_PERMISSIONS]).toEqual([
      'SURFACE_RENDER',
      'OBSERVATION_READ',
      'COMMAND_PROPOSE',
      'NOTIFICATION_RECEIVE',
    ]);
    for (const permission of EXTENSION_PERMISSIONS) {
      expect(permission).not.toMatch(/EXECUTE|SIGN|SETTLE|WITHDRAW|CAPTURE|TRANSFER|AUTHORIZE/i);
    }
  });
});

describe('manifest validation (versioned, permission-scoped, origin-bound)', () => {
  it('accepts a well-formed manifest pinned to the boundary version', () => {
    const manifest = validateExtensionManifest(sampleExtensionManifest());
    expect(manifest.extensionId).toBe('ext_test_1');
    expect(manifest.apiVersion).toBe('1.0.0');
    expect(manifest.permissions).toEqual(['SURFACE_RENDER', 'COMMAND_PROPOSE']);
    expect(manifest.hostOrigins).toEqual(['https://app.payswap.example']);
  });

  it('rejects manifests pinned to foreign API versions (versioned boundary law)', () => {
    expect(() => validateExtensionManifest(sampleExtensionManifest({ apiVersion: '0.9.0' }))).toThrow(
      UnsupportedVersionError,
    );
    expect(() => validateExtensionManifest(sampleExtensionManifest({ apiVersion: '2.0.0' }))).toThrow(
      UnsupportedVersionError,
    );
  });

  it('rejects foreign/duplicate permissions (the vocabulary is closed)', () => {
    expect(() =>
      validateExtensionManifest({
        ...sampleExtensionManifest(),
        permissions: ['MONEY_EXECUTE' as 'COMMAND_PROPOSE'],
      }),
    ).toThrow(ExtensionBoundaryError);
    expect(() =>
      validateExtensionManifest({ ...sampleExtensionManifest(), permissions: ['COMMAND_PROPOSE', 'COMMAND_PROPOSE'] }),
    ).toThrow(ExtensionBoundaryError);
  });

  it('rejects manifests without host origins (origin binding is explicit) and malformed origins', () => {
    expect(() => validateExtensionManifest(sampleExtensionManifest({ hostOrigins: [] }))).toThrow(
      ExtensionBoundaryError,
    );
    expect(() =>
      validateExtensionManifest(sampleExtensionManifest({ hostOrigins: ['not an origin'] })),
    ).toThrow(ExtensionBoundaryError);
    expect(() =>
      validateExtensionManifest({
        ...sampleExtensionManifest(),
        hostOrigins: ['https://a.example', 'https://a.example'],
      }),
    ).toThrow(ExtensionBoundaryError);
  });

  it('rejects manifests without declared effect-bearing methods (effects are explicit, up front)', () => {
    expect(() => validateExtensionManifest(sampleExtensionManifest({ effectBearingMethods: [] }))).toThrow(
      ExtensionBoundaryError,
    );
    expect(() =>
      validateExtensionManifest({ ...sampleExtensionManifest(), effectBearingMethods: ['a', 'a'] }),
    ).toThrow(ExtensionBoundaryError);
  });
});

describe('message envelope validation (explicit, typed, versioned)', () => {
  it('accepts a well-formed request envelope with the protocol marker and pinned version', () => {
    expect(() => validateExtensionMessageEnvelope(message('quotes.read'))).not.toThrow();
  });

  it('rejects foreign protocol markers and versions (no ambient channel)', () => {
    expect(() =>
      validateExtensionMessageEnvelope({ ...message('quotes.read'), protocol: 'other-protocol' as 'payswap-extension' }),
    ).toThrow(ExtensionBoundaryError);
    expect(() => validateExtensionMessageEnvelope(message('quotes.read', { apiVersion: '9.9.9' }))).toThrow(
      UnsupportedVersionError,
    );
  });

  it('rejects empty request ids and methods (typed request/response pairing)', () => {
    expect(() =>
      validateExtensionMessageEnvelope({ ...message('quotes.read'), requestId: '' as never }),
    ).toThrow(ExtensionBoundaryError);
    expect(() => validateExtensionMessageEnvelope(message(''))).toThrow(ExtensionBoundaryError);
  });
});

describe('host origin bindings', () => {
  it('accepts well-formed bindings and rejects malformed ones (fail closed)', () => {
    expect(() =>
      validateHostOriginBinding({ origin: 'https://app.payswap.example', allowedMethods: ['quotes.read'] }),
    ).not.toThrow();
    expect(() => validateHostOriginBinding({ origin: 'ftp://', allowedMethods: ['x'] })).toThrow(
      ExtensionBoundaryError,
    );
    expect(() => validateHostOriginBinding({ origin: 'https://a.example', allowedMethods: [] })).toThrow(
      ExtensionBoundaryError,
    );
  });
});

describe('THE no-ambient-authority gate (assertExtensionRequestAllowed)', () => {
  it('allows a declared effect-bearing method with the COMMAND_PROPOSE permission', () => {
    expect(() =>
      assertExtensionRequestAllowed({
        manifest: sampleExtensionManifest(),
        envelope: message('payments.intent.propose'),
        methodNames: SURFACE_METHODS,
        effectBearingMethodNames: ['payments.intent.propose', 'observations.read'],
      }),
    ).not.toThrow();
  });

  it('allows read-only methods without any effect declaration', () => {
    const readManifest = sampleExtensionManifest({
      permissions: ['OBSERVATION_READ'],
      effectBearingMethods: ['observations.read'],
    });
    expect(() =>
      assertExtensionRequestAllowed({
        manifest: readManifest,
        envelope: message('quotes.read'),
        methodNames: SURFACE_METHODS,
        effectBearingMethodNames: ['payments.intent.propose', 'observations.read'],
      }),
    ).not.toThrow();
  });

  it('rejects UNKNOWN methods fail closed (never a silent dispatch)', () => {
    expect(() =>
      assertExtensionRequestAllowed({
        manifest: sampleExtensionManifest(),
        envelope: message('settlements.execute'),
        methodNames: SURFACE_METHODS,
      }),
    ).toThrow(MethodNotFoundError);
  });

  it('rejects an UNDECLARED effect-bearing method (no ambient path to effects)', () => {
    const manifest = sampleExtensionManifest({ effectBearingMethods: ['other.method'] });
    expect(() =>
      assertExtensionRequestAllowed({
        manifest,
        envelope: message('payments.intent.propose'),
        methodNames: SURFACE_METHODS,
        effectBearingMethodNames: ['payments.intent.propose', 'observations.read'],
      }),
    ).toThrow(PermissionDeniedError);
  });

  it('rejects an effect-bearing method without the COMMAND_PROPOSE permission', () => {
    const noPropose = sampleExtensionManifest({ permissions: ['SURFACE_RENDER'] });
    expect(() =>
      assertExtensionRequestAllowed({
        manifest: noPropose,
        envelope: message('payments.intent.propose'),
        methodNames: SURFACE_METHODS,
        effectBearingMethodNames: ['payments.intent.propose', 'observations.read'],
      }),
    ).toThrow(PermissionDeniedError);
  });

  it('a foreign-version envelope is rejected before any method consideration', () => {
    expect(() =>
      assertExtensionRequestAllowed({
        manifest: sampleExtensionManifest(),
        envelope: message('payments.intent.propose', { apiVersion: '0.0.1' }),
        methodNames: SURFACE_METHODS,
      }),
    ).toThrow(UnsupportedVersionError);
  });
});
