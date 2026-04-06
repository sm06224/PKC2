import { describe, it, expect } from 'vitest';
import {
  validateEnvelope,
  isPkcMessage,
  formatRejectReasons,
} from '@adapter/transport/envelope';

function validEnvelopeData() {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'ping',
    source_id: 'container-a',
    target_id: null,
    payload: null,
    timestamp: '2026-04-06T00:00:00Z',
  };
}

describe('validateEnvelope', () => {
  it('accepts a valid ping envelope', () => {
    const result = validateEnvelope(validEnvelopeData());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.envelope.type).toBe('ping');
      expect(result.envelope.source_id).toBe('container-a');
    }
  });

  it('accepts all known message types', () => {
    const types = ['ping', 'pong', 'record:offer', 'record:accept',
      'export:request', 'export:result', 'navigate', 'custom'];

    for (const type of types) {
      const data = { ...validEnvelopeData(), type };
      const result = validateEnvelope(data);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects null data', () => {
    const result = validateEnvelope(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons[0]!.code).toBe('NOT_OBJECT');
    }
  });

  it('rejects non-object data', () => {
    const result = validateEnvelope('hello');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons[0]!.code).toBe('NOT_OBJECT');
    }
  });

  it('rejects wrong protocol', () => {
    const data = { ...validEnvelopeData(), protocol: 'not-pkc' };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.code === 'WRONG_PROTOCOL')).toBe(true);
    }
  });

  it('rejects wrong version', () => {
    const data = { ...validEnvelopeData(), version: 2 };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.code === 'WRONG_VERSION')).toBe(true);
    }
  });

  it('rejects missing type', () => {
    const data = { ...validEnvelopeData() };
    delete (data as Record<string, unknown>).type;
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.code === 'MISSING_TYPE')).toBe(true);
    }
  });

  it('rejects unknown type', () => {
    const data = { ...validEnvelopeData(), type: 'unknown:action' };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.code === 'INVALID_TYPE')).toBe(true);
      expect(result.reasons[0]!.message).toContain('unknown:action');
    }
  });

  it('rejects missing timestamp', () => {
    const data = { ...validEnvelopeData() };
    delete (data as Record<string, unknown>).timestamp;
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.code === 'MISSING_TIMESTAMP')).toBe(true);
    }
  });

  it('collects multiple errors', () => {
    const data = { protocol: 'wrong', version: 99 };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
      const codes = result.reasons.map((r) => r.code);
      expect(codes).toContain('WRONG_PROTOCOL');
      expect(codes).toContain('WRONG_VERSION');
    }
  });

  it('accepts envelope with payload', () => {
    const data = { ...validEnvelopeData(), type: 'custom', payload: { key: 'value' } };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.envelope.payload).toEqual({ key: 'value' });
    }
  });

  it('accepts envelope with target_id', () => {
    const data = { ...validEnvelopeData(), target_id: 'container-b' };
    const result = validateEnvelope(data);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.envelope.target_id).toBe('container-b');
    }
  });
});

describe('isPkcMessage', () => {
  it('returns true for PKC messages', () => {
    expect(isPkcMessage({ protocol: 'pkc-message' })).toBe(true);
  });

  it('returns false for non-PKC data', () => {
    expect(isPkcMessage({ protocol: 'other' })).toBe(false);
    expect(isPkcMessage(null)).toBe(false);
    expect(isPkcMessage('string')).toBe(false);
    expect(isPkcMessage(42)).toBe(false);
    expect(isPkcMessage({})).toBe(false);
  });
});

describe('formatRejectReasons', () => {
  it('formats reasons for display', () => {
    const reasons = [
      { code: 'WRONG_PROTOCOL' as const, message: 'Bad protocol' },
      { code: 'WRONG_VERSION' as const, message: 'Bad version' },
    ];
    const formatted = formatRejectReasons(reasons);
    expect(formatted).toContain('[WRONG_PROTOCOL]');
    expect(formatted).toContain('[WRONG_VERSION]');
    expect(formatted).toContain('Bad protocol');
  });
});
