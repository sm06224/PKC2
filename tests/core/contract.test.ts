import { describe, it, expect } from 'vitest';
import { SLOT } from '@runtime/contract';

describe('SLOT constants', () => {
  it('defines all required HTML element IDs', () => {
    expect(SLOT.ROOT).toBe('pkc-root');
    expect(SLOT.DATA).toBe('pkc-data');
    expect(SLOT.META).toBe('pkc-meta');
    expect(SLOT.CORE).toBe('pkc-core');
    expect(SLOT.STYLES).toBe('pkc-styles');
    expect(SLOT.THEME).toBe('pkc-theme');
  });

  it('has exactly 6 slots', () => {
    expect(Object.keys(SLOT)).toHaveLength(6);
  });

  it('all values are prefixed with pkc-', () => {
    for (const value of Object.values(SLOT)) {
      expect(value).toMatch(/^pkc-/);
    }
  });
});
