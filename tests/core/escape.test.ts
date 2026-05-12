/**
 * PR-2GG(2026-05-12):core/escape の test。
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr } from '@core/escape';

describe('PR-2GG core/escape', () => {
  describe('escapeHtml', () => {
    it('5 文字を entity 化', () => {
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml("'")).toBe('&#39;');
    });

    it('複合 string', () => {
      expect(escapeHtml('A < B & "C" > \'D\'')).toBe(
        'A &lt; B &amp; &quot;C&quot; &gt; &#39;D&#39;',
      );
    });

    it('escape 対象なしは素通し', () => {
      expect(escapeHtml('plain text 漢字 🎉')).toBe('plain text 漢字 🎉');
    });

    it('空 string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('連続 escape 文字', () => {
      expect(escapeHtml('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
    });
  });

  describe('escapeAttr', () => {
    it('escapeHtml と同等(5 文字 entity)', () => {
      const input = `A < B & "C" > 'D'`;
      expect(escapeAttr(input)).toBe(escapeHtml(input));
    });

    it('attr value 用途で safe', () => {
      const malicious = `"><script>alert('x')</script>`;
      const escaped = escapeAttr(malicious);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
      expect(escaped).not.toContain("'");
    });
  });
});
