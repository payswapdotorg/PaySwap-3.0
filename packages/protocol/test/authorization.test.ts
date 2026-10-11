import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  freezeAuthorizationRef,
  isValidAuthorizationRef,
  requireAuthorizationLineage,
  sameAuthorizationLineage,
  validateAuthorizationRef,
  type AuthorizationRef,
} from '../src/index.ts';

const ref: AuthorizationRef = {
  artifactId: 'art-approve-1',
  mandateRef: 'mandate-42',
  approverRef: 'principal:approver-7',
  epoch: 12n,
  artifactHash: 'sha256:abc123',
};

describe('opaque authorization refs (INV-05 boundary; trust-lane wiring deferred to TL integration)', () => {
  it('validates the structural shape: non-empty ids, non-negative bigint epoch, optional hash', () => {
    expect(() => validateAuthorizationRef(ref)).not.toThrow();
    expect(() => validateAuthorizationRef({ ...ref, artifactId: '' })).toThrow(ValidationError);
    expect(() => validateAuthorizationRef({ ...ref, mandateRef: ' ' })).toThrow(ValidationError);
    expect(() => validateAuthorizationRef({ ...ref, approverRef: 'x'.repeat(257) })).toThrow(ValidationError);
    expect(() => validateAuthorizationRef({ ...ref, epoch: -1n })).toThrow(ValidationError);
    expect(() => validateAuthorizationRef({ ...ref, epoch: 1.5 as unknown as bigint })).toThrow(ValidationError);
    expect(() => validateAuthorizationRef({ ...ref, artifactHash: '' })).toThrow(ValidationError);
    // artifactHash is optional
    const { artifactHash: _hash, ...withoutHash } = ref;
    expect(() => validateAuthorizationRef(withoutHash)).not.toThrow();
  });

  it('performs NO trust-semantic validation (opacity by design)', () => {
    // Arbitrary opaque ids are structurally valid — semantics live in the trust lane.
    expect(
      isValidAuthorizationRef({
        artifactId: 'any-opaque-id',
        mandateRef: 'any-mandate',
        approverRef: 'any-approver',
        epoch: 0n,
      }),
    ).toBe(true);
    expect(isValidAuthorizationRef({ artifactId: '', mandateRef: 'm', approverRef: 'a', epoch: 0n })).toBe(false);
  });

  it('freezeAuthorizationRef returns a frozen, validated copy', () => {
    const frozen = freezeAuthorizationRef(ref);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen).toEqual(ref);
    expect(() => freezeAuthorizationRef({ ...ref, epoch: -3n })).toThrow(ValidationError);
  });

  it('sameAuthorizationLineage compares every opaque field + epoch', () => {
    expect(sameAuthorizationLineage(ref, ref)).toBe(true);
    expect(sameAuthorizationLineage(ref, { ...ref, epoch: 13n })).toBe(false);
    expect(sameAuthorizationLineage(ref, { ...ref, artifactId: 'other' })).toBe(false);
    expect(sameAuthorizationLineage(ref, { ...ref, artifactHash: 'sha256:zzz' })).toBe(false);
  });

  it('requireAuthorizationLineage enforces INV-05: at least one structurally valid ref', () => {
    expect(() => requireAuthorizationLineage([])).toThrow(ValidationError);
    const frozen = requireAuthorizationLineage([ref]);
    expect(frozen).toHaveLength(1);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(() => requireAuthorizationLineage([{ ...ref, mandateRef: '' }])).toThrow(ValidationError);
  });
});
