/**
 * @vitest-environment happy-dom
 *
 * pgc-143 wave-δ #17(user bug report 2026-05-24):
 * 「エントリリンクを貼りやすくする動線も欲しいし」
 *
 * `/entry` slash command を追加 ── 既存 `[[` autocomplete と並行動線。
 * slash menu から `/entry` を選ぶと:
 *   1. `/entry` 文字列を `[[` に置換
 *   2. caret を `[[` 直後に move
 *   3. openEntryRefAutocomplete を 直接 open
 * user は 1 step で entry-ref picker に到達。
 *
 * 既存動線:
 *   - `[[` トリガー(typing で開く)
 *   - `@` トリガー
 *   - context menu の `📝 Markdown link` で外部 copy
 *
 * 本 PR で追加した `/entry` は slash 一覧から **discoverable** な動線。
 */

import { describe, it, expect } from 'vitest';
import { SLASH_COMMANDS } from '@adapter/ui/slash-menu';

describe('pgc-143 /entry slash command', () => {
  it('SLASH_COMMANDS に id="entry" が登録される', () => {
    const entry = SLASH_COMMANDS.find((c) => c.id === 'entry');
    expect(entry).not.toBeUndefined();
    expect(entry?.label).toContain('/entry');
    expect(entry?.label).toContain('entry');
  });

  it('/entry は onSelect callback 経由(static text insert ではない)', () => {
    const entry = SLASH_COMMANDS.find((c) => c.id === 'entry');
    expect(entry?.onSelect).toBeDefined();
    expect(entry?.insert).toBeUndefined();
  });

  it('/entry の label は「link to another entry」案内文を含む', () => {
    const entry = SLASH_COMMANDS.find((c) => c.id === 'entry');
    expect(entry?.label).toContain('link');
  });

  it('/asset と並んで Link / media group に存在(配置順 verify)', () => {
    const assetIdx = SLASH_COMMANDS.findIndex((c) => c.id === 'asset');
    const entryIdx = SLASH_COMMANDS.findIndex((c) => c.id === 'entry');
    expect(assetIdx).toBeGreaterThan(-1);
    expect(entryIdx).toBeGreaterThan(-1);
    // /asset と近く(±3 以内)
    expect(Math.abs(entryIdx - assetIdx)).toBeLessThan(3);
  });
});
