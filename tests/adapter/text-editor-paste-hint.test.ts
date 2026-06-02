/**
 * @vitest-environment happy-dom
 *
 * pgc-142 wave-δ #16(user bug report 2026-05-24):
 * 「スクショ貼付できるようになっているかも気になる」
 *
 * 投資調査結果:スクショ paste(Ctrl+V で画像 → attachment + markdown
 * link 挿入)は既存 `PASTE_ATTACHMENT` action で動作中(`action-binder.ts
 * handlePaste`、line 7461+)。
 *
 * 本 PR の改善:**空 body の text editor に placeholder hint** を追加して
 * 「Ctrl+V で image 貼付可能」を可視化。書き始めると自然に消えるため
 * UI ノイズなし。`detail-presenter.ts textPresenter.renderEditorBody` で
 * entry.body が empty のときだけ placeholder set。
 */

import { describe, it, expect } from 'vitest';
import { getPresenter } from '@adapter/ui/detail-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-01-01T00:00:00Z';

function makeEntry(body: string): Entry {
  return {
    lid: 'paste-hint-test',
    title: 'test',
    body,
    archetype: 'text',
    created_at: TS,
    updated_at: TS,
  };
}

describe('pgc-142 text editor paste hint placeholder', () => {
  it('空 body の text editor:placeholder に Ctrl+V / image 動線 hint', () => {
    const presenter = getPresenter('text');
    const editor = presenter.renderEditorBody(makeEntry(''));
    const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(textarea).not.toBeNull();
    const placeholder = textarea?.getAttribute('placeholder') ?? '';
    expect(placeholder).toContain('Ctrl+V');
    expect(placeholder).toContain('image');
    expect(placeholder).toContain('screenshot');
  });

  it('非空 body の text editor:placeholder 出ない(書き始めたら hint 不要)', () => {
    const presenter = getPresenter('text');
    const editor = presenter.renderEditorBody(makeEntry('# 既存 body'));
    const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(textarea?.getAttribute('placeholder')).toBeNull();
  });

  it('placeholder に slash menu の案内も含まれる', () => {
    const presenter = getPresenter('text');
    const editor = presenter.renderEditorBody(makeEntry(''));
    const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    const placeholder = textarea?.getAttribute('placeholder') ?? '';
    expect(placeholder).toContain('slash menu');
  });

  it('placeholder は textarea.placeholder property で読める(browser native 動作)', () => {
    const presenter = getPresenter('text');
    const editor = presenter.renderEditorBody(makeEntry(''));
    const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(textarea?.placeholder).toContain('Ctrl+V');
  });
});
