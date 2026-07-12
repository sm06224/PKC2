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
    expect(text).toContain('mv <lid> <folderLid|@name|root>');
    expect(text).toContain('mkdir "<title>"');
    expect(text).toContain('rename <lid>');
    // v2: alias 構文の説明と例が載っている(AI がそのまま使える)
    expect(text).toContain('as @name');
    expect(text).toContain('mkdir "アーカイブ" as @arc');
    expect(text).toContain('mv lid-123 @arc');
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

  it('v2 alias:mkdir "…" [<parent>] as @name を parse、mv/mkdir の親に @name を使える', () => {
    const r = parseStructureCommands([
      'mkdir "アーカイブ" as @arc',
      'mkdir "2026" f1 as @y26',
      'mkdir "月次" @y26',
      'mv e2 @arc',
    ].join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.ops).toEqual([
      { op: 'mkdir', title: 'アーカイブ', parent: null, alias: '@arc' },
      { op: 'mkdir', title: '2026', parent: 'f1', alias: '@y26' },
      { op: 'mkdir', title: '月次', parent: '@y26' },
      { op: 'mv', lid: 'e2', parent: '@arc' },
    ]);
  });

  it('v2 alias:書式エラー(alias 形式不正 / 余剰 token)は行番号つきエラー', () => {
    const r = parseStructureCommands([
      'mkdir "a" as arc',        // @ なし
      'mkdir "b" as @日本語',     // 非英数字
      'mkdir "c" f1 f2 as @x',   // parent が 2 個
    ].join('\n'));
    expect(r.ops).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toContain('1 行目');
    expect(r.errors[0]).toContain('alias');
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

  it('v2 alias:宣言済み alias を親に使えて、プレビューに (新規) / [@alias] が出る', () => {
    const c = makeContainer();
    const { ops, errors } = parseStructureCommands([
      'mkdir "アーカイブ" as @arc',
      'mkdir "2025" @arc as @y25',
      'mv e2 @y25',
    ].join('\n'));
    expect(errors).toEqual([]);
    const plan = planStructureOps(c, ops);
    expect(plan.errors).toEqual([]);
    expect(plan.preview[0]).toContain('フォルダ作成 "アーカイブ"');
    expect(plan.preview[0]).toContain('[@arc]');
    expect(plan.preview[1]).toContain('"アーカイブ"(新規) 内');
    expect(plan.preview[2]).toContain('"Loose": root → "2025"(新規)');
  });

  it('v2 alias:前方参照 / 重複宣言はエラー', () => {
    const c = makeContainer();
    const { ops } = parseStructureCommands([
      'mv e2 @later',                 // 宣言前の参照
      'mkdir "A" as @dup',
      'mkdir "B" as @dup',            // 重複
      'mkdir "C" @nope',              // mkdir 側の未宣言参照
    ].join('\n'));
    const plan = planStructureOps(c, ops);
    expect(plan.errors).toHaveLength(3);
    expect(plan.errors[0]).toContain('宣言されていません');
    expect(plan.errors[1]).toContain('既に使われています');
    expect(plan.errors[2]).toContain('宣言されていません');
  });

  it('v2 alias:anchor 経由の循環を静的検出(自分の配下に作る新規フォルダへの mv)', () => {
    const c = makeContainer();
    // f2 は f1 の子。f1 の配下に作る新規フォルダへ f1 自身を mv → 循環
    const { ops } = parseStructureCommands([
      'mkdir "trap" f2 as @trap',
      'mv f1 @trap',
    ].join('\n'));
    const plan = planStructureOps(c, ops);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain('循環');
    // root 直下に作る新規フォルダへの mv は循環にならない
    const ok = parseStructureCommands('mkdir "safe" as @s\nmv f1 @s');
    expect(planStructureOps(c, ok.ops).errors).toEqual([]);
  });
});
