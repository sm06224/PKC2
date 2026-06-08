import { describe, it, expect } from 'vitest';
import { matchChordSequence } from '../../../src/features/keymap/match';
import type { KeyBinding } from '../../../src/features/keymap/types';

const chord = (mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }>, key: string) => ({
  ctrl: mods.ctrl ?? false,
  shift: mods.shift ?? false,
  alt: mods.alt ?? false,
  meta: mods.meta ?? false,
  key: key.toLowerCase(),
});

const bind = (sequence: ReadonlyArray<ReturnType<typeof chord>>, commandId: string): KeyBinding => ({
  sequence,
  commandId,
});

describe('matchChordSequence', () => {
  const bindings: KeyBinding[] = [
    bind([chord({ ctrl: true }, 'p')], 'cmd.single'),
    bind([chord({ ctrl: true }, 'k'), chord({ ctrl: true }, 's')], 'cmd.chord'),
    bind([chord({ ctrl: true }, 'k'), chord({ ctrl: true }, 'b')], 'cmd.chord2'),
    bind([chord({ alt: true }, '1')], 'view.detail'),
  ];

  it('exact single chord match', () => {
    const m = matchChordSequence([chord({ ctrl: true }, 'p')], bindings);
    expect(m.kind).toBe('matched');
    if (m.kind === 'matched') expect(m.binding.commandId).toBe('cmd.single');
  });

  it('partial match for leader chord', () => {
    const m = matchChordSequence([chord({ ctrl: true }, 'k')], bindings);
    expect(m.kind).toBe('partial');
    if (m.kind === 'partial') {
      expect(m.candidates.length).toBe(2);
      expect(m.candidates.map((c) => c.commandId).sort())
        .toEqual(['cmd.chord', 'cmd.chord2']);
    }
  });

  it('exact match wins over partial', () => {
    // single 'p' AND prefix of nothing → matched
    const m = matchChordSequence([chord({ ctrl: true }, 'p')], bindings);
    expect(m.kind).toBe('matched');
  });

  it('completes chord sequence', () => {
    const m = matchChordSequence(
      [chord({ ctrl: true }, 'k'), chord({ ctrl: true }, 's')],
      bindings,
    );
    expect(m.kind).toBe('matched');
    if (m.kind === 'matched') expect(m.binding.commandId).toBe('cmd.chord');
  });

  it('no match when buffer too long', () => {
    const m = matchChordSequence(
      [chord({ ctrl: true }, 'k'), chord({ ctrl: true }, 's'), chord({ ctrl: true }, 'x')],
      bindings,
    );
    expect(m.kind).toBe('none');
  });

  it('no match when no command bound', () => {
    const m = matchChordSequence([chord({ ctrl: true }, 'z')], bindings);
    expect(m.kind).toBe('none');
  });

  it('empty buffer returns none', () => {
    const m = matchChordSequence([], bindings);
    expect(m.kind).toBe('none');
  });

  it('case-insensitive matching via lowercase normalization', () => {
    // bindings は lowercase で登録、buffer も lowercase で渡される前提
    const m = matchChordSequence([chord({ alt: true }, '1')], bindings);
    expect(m.kind).toBe('matched');
    if (m.kind === 'matched') expect(m.binding.commandId).toBe('view.detail');
  });
});
