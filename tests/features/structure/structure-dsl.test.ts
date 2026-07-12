/**
 * #905 — structure DSL(export / parse / plan)の unit test。
 */
import { describe, it, expect } from 'vitest';
import {
  exportStructureText,
  parseStructureCommands,
  planStructureOps,
} from '@features/structure/structure-dsl';
import type { Container } from '@core/model/container';

const T = '2026-07-12T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-905', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Projects', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'f2', title: 'Sub', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'e1', title: 'Note A', body: 'x', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Loose', body: 'y', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'f2', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'f2', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: {},
  };
}

describe('exportStructureText', () => {
  it('木構造を indent つきで吐き、ヘッダに DSL 語彙の説明を含む(AI へそのまま渡せる)', () => {
    const text = exportStructureText(makeContainer());
    expect(text).toContain('mv <lid> <folderLid|root>');
    expect(text).toContain('mkdir "<title>"');
    expect(text).toContain('rename <lid>');
    expect(text).toContain('- f1  [folder]  "Projects"');
    expect(text).toContain('  - f2  [folder]  "Sub"');
    expect(text).toContain('    - e1  [text]  "Note A"');
    expect(text).toContain('- e2  [text]  "Loose"');
  });
});

describe('parseStructureCommands', () => {
  it('mv / mkdir / rename を parse、コメント・空行は無視', () => {
    const r = parseStructureCommands([
      '# plan',
      '',
      'mv e2 f1',
      'mv e1 root',
      'mkdir "アーカイブ"',
      'mkdir "2026" f1',
      'rename e2 "New Title"',
    ].join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.ops).toEqual([
      { op: 'mv', lid: 'e2', parent: 'f1' },
      { op: 'mv', lid: 'e1', parent: null },
      { op: 'mkdir', title: 'アーカイブ', parent: null },
      { op: 'mkdir', title: '2026', parent: 'f1' },
      { op: 'rename', lid: 'e2', title: 'New Title' },
    ]);
  });

  it('不正行は行番号つきエラー', () => {
    const r = parseStructureCommands('mv onlyone\nmkdir タイトル\nunknown x');
    expect(r.ops).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toContain('1 行目');
    expect(r.errors[1]).toContain('2 行目');
    expect(r.errors[2]).toContain('3 行目');
  });
});

describe('planStructureOps', () => {
  it('正常系は人間可読プレビュー(移動元 → 先)を返す', () => {
    const c = makeContainer();
    const { ops } = parseStructureCommands('mv e2 f2\nmv e1 root\nrename e2 "Z"\nmkdir "New" f1');
    const plan = planStructureOps(c, ops);
    expect(plan.errors).toEqual([]);
    expect(plan.preview[0]).toContain('"Loose": root → "Sub"');
    expect(plan.preview[1]).toContain('"Note A": "Sub" → root');
    expect(plan.preview[2]).toContain('rename "Loose" → "Z"');
    expect(plan.preview[3]).toContain('フォルダ作成 "New"');
  });

  it('検証エラー:不在 lid / 非 folder 親 / 循環 / 自己移動', () => {
    const c = makeContainer();
    const { ops } = parseStructureCommands([
      'mv nope f1',        // 不在 lid
      'mv e2 e1',          // 非 folder 親
      'mv f1 f2',          // f2 は f1 の子孫 → 循環
      'mv f1 f1',          // 自己
      'mkdir "x" e1',      // mkdir の親が非 folder
    ].join('\n'));
    const plan = planStructureOps(c, ops);
    expect(plan.errors).toHaveLength(5);
    expect(plan.errors.some((e) => e.includes('循環'))).toBe(true);
  });
});
