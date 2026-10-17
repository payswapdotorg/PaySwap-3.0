import { describe, expect, it } from 'vitest';

import {
  asCommandId,
  asCommandRequestId,
  asCorrelationId,
  asMessageId,
  asExtensionInstanceId,
  asSessionToken,
  MAX_ID_LENGTH,
  validatePrincipalRef,
  principalRefKey,
} from '../src/identifiers.ts';
import { ValidationError } from '../src/errors.ts';
import type { Equal, Expect } from './type-utils.ts';
import type { CommandId, CommandRequestId, PrincipalRef } from '../src/identifiers.ts';

describe('branded identifiers', () => {
  it('brand validated non-empty, bounded, trimmed strings', () => {
    expect(asCommandId('cmd_1')).toBe('cmd_1');
    expect(asCommandRequestId('req_1')).toBe('req_1');
    expect(asCorrelationId('conv_1')).toBe('conv_1');
    expect(asMessageId('msg_1')).toBe('msg_1');
    expect(asExtensionInstanceId('ext_1')).toBe('ext_1');
    expect(asSessionToken('sess_1')).toBe('sess_1');
  });

  it('rejects empty, overlong and whitespace-padded values (fail closed)', () => {
    expect(() => asCommandId('')).toThrow(ValidationError);
    expect(() => asCommandId(' padded ')).toThrow(ValidationError);
    expect(() => asCommandId('x'.repeat(MAX_ID_LENGTH + 1))).toThrow(ValidationError);
    expect(() => asSessionToken('')).toThrow(ValidationError);
  });

  it('brands are compile-time nominal (a CommandId is not a CommandRequestId)', () => {
    const commandId = asCommandId('same-string');
    const requestId = asCommandRequestId('same-string');
    expect(commandId).toBe(requestId); // same runtime string
    type _Nominal = Expect<Equal<CommandId, CommandId>>;
    type _Distinct = Expect<Equal<CommandId, CommandRequestId> extends true ? false : true>;
    void requestId;
  });

  it('validatePrincipalRef accepts {principalType, principalId} and rejects everything else', () => {
    const principal = validatePrincipalRef({ principalType: 'user', principalId: 'alice' });
    expect(principal).toEqual({ principalType: 'user', principalId: 'alice' });
    expect(() => validatePrincipalRef(null)).toThrow(ValidationError);
    expect(() => validatePrincipalRef({ principalType: '', principalId: 'x' })).toThrow(ValidationError);
    expect(() => validatePrincipalRef({ principalType: 'user' })).toThrow(ValidationError);
    expect(() =>
      validatePrincipalRef({ principalType: 'user', principalId: 'x'.repeat(MAX_ID_LENGTH + 1) }),
    ).toThrow(ValidationError);
  });

  it('principalRefKey renders the canonical `type:id` form', () => {
    const principal: PrincipalRef = { principalType: 'user', principalId: 'alice' };
    expect(principalRefKey(principal)).toBe('user:alice');
    expect(principalRefKey({ principalType: 'service', principalId: 'bot-1' })).toBe('service:bot-1');
  });
});
