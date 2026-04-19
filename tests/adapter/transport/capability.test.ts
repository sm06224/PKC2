import { describe, it, expect } from 'vitest';
import {
  canHandleMessage,
  getSupportedMessageTypes,
  getAcceptanceMode,
} from '@adapter/transport/capability';
describe('capability', () => {
  describe('canHandleMessage', () => {
    it('allows export:request when embedded', () => {
      expect(canHandleMessage('export:request', true)).toBe(true);
    });

    it('rejects export:request when standalone', () => {
      expect(canHandleMessage('export:request', false)).toBe(false);
    });

    it('allows record:offer in any mode', () => {
      expect(canHandleMessage('record:offer', true)).toBe(true);
      expect(canHandleMessage('record:offer', false)).toBe(true);
    });

    it('rejects record:reject in any mode (sender-only by design)', () => {
      // PKC2 sends record:reject when a pending offer is dismissed
      // (main.ts:391). Inbound handling is not part of the current
      // architecture — no outgoing-offer tracking exists.
      // See docs/development/transport-record-reject-decision.md.
      expect(canHandleMessage('record:reject', true)).toBe(false);
      expect(canHandleMessage('record:reject', false)).toBe(false);
    });

    it('rejects unsupported message types', () => {
      expect(canHandleMessage('navigate', false)).toBe(false);
      expect(canHandleMessage('navigate', true)).toBe(false);
      expect(canHandleMessage('custom', false)).toBe(false);
    });

    it('rejects ping/pong (handled by bridge, not routing)', () => {
      expect(canHandleMessage('ping', false)).toBe(false);
      expect(canHandleMessage('pong', false)).toBe(false);
    });
  });

  describe('getSupportedMessageTypes', () => {
    it('returns all supported types', () => {
      const types = getSupportedMessageTypes();
      expect(types).toContain('export:request');
      expect(types).toContain('record:offer');
    });

    it('does not include record:reject (sender-only by design)', () => {
      // See docs/development/transport-record-reject-decision.md
      const types = getSupportedMessageTypes();
      expect(types).not.toContain('record:reject');
    });

    it('does not include ping/pong', () => {
      const types = getSupportedMessageTypes();
      expect(types).not.toContain('ping');
      expect(types).not.toContain('pong');
    });
  });

  describe('getAcceptanceMode', () => {
    it('returns embedded-only for export:request', () => {
      expect(getAcceptanceMode('export:request')).toBe('embedded-only');
    });

    it('returns any for record:offer', () => {
      expect(getAcceptanceMode('record:offer')).toBe('any');
    });

    it('returns null for unsupported types', () => {
      expect(getAcceptanceMode('navigate')).toBeNull();
      expect(getAcceptanceMode('custom')).toBeNull();
    });
  });
});
