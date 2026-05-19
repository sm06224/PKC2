# Bug:`>` 引用 + `:::section` lazy continuation 取り込み(2026-05-18 user 報告)

**Status**:✅ **RESOLVED**(2026-05-19、PR #474 で対応完了)
**Severity**:中(機能不足、user が「引用ブロック化しない」と報告)
**Reporter**:user(2026-05-18)
**Path**:`src/features/markdown/markdown-render.ts`(center pane 経路)
**関連**:`src/features/ast/parse.ts`(AST 経路は既に修正済、対称性欠落)

**Resolution(2026-05-19)**:修正方針 A(共有 utility 化)で着地。新規 `src/features/markdown/colon-block-normalize.ts` を起こし、`ensureBlankAroundColonBlocks(body)`(AST 経路)+ `ensureBlankAroundColonBlocksWithLineMap(source, lineMapIn)`(markdown-render.ts 経路、Split View source-line tracking 保持)の 2 entry を export。`parse.ts` は inline 実装を削除して共有 utility を import、`markdown-render.ts` の preprocessor chain は admonition rewrite 後 / directive 処理前に挿入。center pane / Viewer popup / Split View preview の 3 surface すべてで lazy continuation 取り込み再現せず、blockquote と `:::section` が独立構造として render される。

---

## §1 問題サマリ

user 報告:**「`>` の直後行に `:::section` を書き始めないと引用ブロック化しない」**。

具体例(壊れるパターン):
```markdown
> 引用テキスト
:::section{role=note}
section 内容
:::
```

期待される render:
- blockquote(`<blockquote>引用テキスト</blockquote>`)
- section(`<section class="pkc-section-note">section 内容</section>`)

実際の render:
- HTML 構造が崩れる(`<blockquote>` 内に `<section>` が nested、もしくは
  closer 認識失敗で literal `:::` が残る)

回避策(現状):
```markdown
> 引用テキスト

:::section{role=note}
section 内容
:::
```
**`>` と `:::section` の間に blank line を明示挿入**すれば期待通り動作。

---

## §2 根本原因

CommonMark の **blockquote lazy continuation** 仕様:`>` で始まる blockquote
は、次行が `>` prefix 無しでも「paragraph continue 」として blockquote 内に
取り込まれる。

`processSectionBlocks`(`markdown-render.ts:1891`)は `parseBlockDirectiveOpen`
で `^:::name...$` を line-by-line に検出するため、`:::section` を OPEN
sentinel に置換するところまでは動作する。

しかし置換後の sentinel line も lazy continuation の対象になるため、
markdown-it が parse すると:

```
> 引用テキスト                           ← blockquote 開始
<SENTINEL_OPEN>1<OPEN>                  ← lazy 継続 → blockquote 内
                                         ← blank line → blockquote 終了
section 内容                              ← 新 paragraph
<SENTINEL_OPEN>1<CLOSE>                  ← lazy 継続 → paragraph 内
```

`postProcessSectionSentinels` は `<p>OPEN</p>` → `<section>` 等で正規 HTML
化するが、blockquote 内 nested は構造が壊れる。

## §3 AST 経路では既に修正済(2026-05-15 PR-W24 v3)

`src/features/ast/parse.ts:512` の **`ensureBlankAroundColonBlocks`** で:

```ts
function ensureBlankAroundColonBlocks(body: string): string {
  // 全 `:::` 行(opener / closer)の **前** に blank line を強制挿入
  let out = body.replace(/\n([ \t　]*:::)/g, '\n\n$1');
  // malformed `:::role{...<no close brace>$` の attrs drop
  out = out.replace(/^([ \t　]*:::[a-zA-Z0-9_-]+)\{[^}\n]*$/gm, '$1');
  // `:::role{...}` opener の後に blank line(content と分離)
  out = out.replace(
    /^([ \t　]*:::[a-zA-Z0-9_-]+(?:\{[^}\n]{0,200}\})?[ \t]*)\n([^\n])/gm,
    '$1\n\n$2',
  );
  // 3+ 連続 newline を 2 に collapse
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}
```

これにより AST 経路では blockquote と `:::section` の間に必ず blank line が
挿入され、lazy continuation を構造的に回避。

**しかし center pane / Viewer popup / Split View で使われる `markdown-render.ts`
経路には同等の preprocessor が存在しない**。AST 経路と center pane で挙動が
分岐している(対称性欠落)。

---

## §4 修正方針(設計合意済 / 未実装)

### 方針 A:`ensureBlankAroundColonBlocks` を共有 utility に切り出して両経路で使う

1. `src/features/markdown/colon-block-normalize.ts`(NEW)に関数を移動
   - parse.ts と markdown-render.ts 両方から import
   - 機能は同一、test も共通化
2. `markdown-render.ts` の preprocessor chain の **冒頭**(`processBlankLineMarkers`
   より前)で呼び出す
3. 既存 AST 経路は import 先を変えるだけ(behavior 不変)

### 方針 B:markdown-render.ts に独自実装

- AST 経路と挙動が分岐するリスクあり、選択肢として弱い

### 方針 C:`processSectionBlocks` の中で blank line 挿入を行う

- 影響範囲が限定的だが、他の `:::` block(:::quote / :::figure / :::if 等)も
  同じ問題を持つため scope が狭すぎる

### 推奨

**方針 A**(共有 utility 化)。`:::section` だけでなく `:::quote` / `:::figure`
/ `:::if` / `:::admonition` / `:::callout` 全てに同じ問題が潜在し得るため、
preprocessor chain 全体への入力 normalize として実装するのが合理的。

---

## §5 影響範囲(将来 wave で fix するときの参考)

### §5.1 修正対象 file

- `src/features/markdown/markdown-render.ts`:preprocessor chain に
  `normalizeColonBlocks(text, lineMap)` を冒頭追加
- `src/features/ast/parse.ts`:既存 `ensureBlankAroundColonBlocks` を import に
  置換
- 新規 `src/features/markdown/colon-block-normalize.ts`:共通 utility

### §5.2 test 追加候補

- `tests/features/markdown/colon-block-normalize.test.ts`:正規化単体
- `tests/features/markdown/center-pane-blockquote-section-parity.test.ts`:
  center pane 経路で blockquote + `:::section` が期待通り render される
- `tests/smoke/markdown-blockquote-section-parity.spec.ts`:visual parity

### §5.3 case matrix(CLAUDE.md §10 §4 準拠)

| 軸 | カバー |
|----|--------|
| 構造 | `> + :::section` / `> + :::quote` / `> + :::figure` / `> + :::if` / `> + :::admonition` |
| 間隔 | blank line あり(現行 OK)/ blank line 無し(本 bug)/ 複数 blank line |
| nesting | blockquote 内に `:::` を意図的に置く(`> :::section\n> 内容\n> :::`)|
| malformed | `:::section{...<no close brace>` で attrs drop の挙動維持 |
| 既存機能 | 単独 `:::section` / `:::quote` / `:::figure` の regression 0 |

最低 10 件、user 提供ケースは matrix に組込必須(CLAUDE.md §10 §4 規律)。

### §5.4 surface 別 dual-render path 確認(CLAUDE.md §10 §9 準拠)

修正後は **3 surface 全て** で動作確認必須:
1. **center pane**(detail-presenter.ts):base.css 込みで完全機能
2. **Viewer popup**(rendered-viewer.ts):独立 document、inline `<style>`
3. **Split View preview**(detail-presenter.ts edit mode):`sourceLineAnchors: true` 経路

### §5.5 LineMap thread(CLAUDE.md §10 §10 準拠)

`ensureBlankAroundColonBlocks` は blank line を **挿入** する preprocessor のため、
`tagSourceLines` の `data-pkc-source-line` が原文行 index を指すよう
`lineMap` を thread する必要あり。現 parse.ts 実装では未対応(AST 経路は
`shieldLineLeadingMarkers` で別途処理)。共有化時は signature を
`(text, lineMapIn) → { transformed, lineMap }` に拡張する形が望ましい。

---

## §6 着手前提条件 / 議論待ち

1. **方針 A / B / C のいずれを選ぶか**:user 確認待ち(推奨は A)
2. **共有 utility の置き場**:`src/features/markdown/` か新規 `src/features/markdown/preprocess/`
   サブディレクトリか
3. **既存 `ensureBlankAroundColonBlocks` の関数名**:共有化時に `normalizeColonBlocks`
   へ rename 検討(より一般的な名前)
4. **fix と一緒に extend するか**:`:::quote` 等他 directive にも同じ問題が潜在、
   現報告は `:::section` だが他 block でも横展開で fix する scope を user に確認

---

## §7 history

| date | event |
|---|---|
| 2026-05-18 | **user 報告**:「`>` の直後行に `:::section` を書き始めないと引用ブロック化しない」 |
| 2026-05-18 | 私(Claude)が原因特定:`markdown-render.ts` 経路に `ensureBlankAroundColonBlocks` が無いため。AST 経路は PR-W24 v3(2026-05-15)で fix 済 |
| 2026-05-18 | **docs-only 着地**:本書で背景 + 修正方針を明文化、user 判断で実装 wave 開始 |
| TBD | 実装着手(方針 A 想定、1 PR ~半日)|

---

## §8 関連 doc

- `src/features/ast/parse.ts`:`ensureBlankAroundColonBlocks` の既存実装
- `src/features/markdown/markdown-render.ts`:`processSectionBlocks` 等の
  preprocessor chain
- `CLAUDE.md` §10 §4 / §9 / §10:wave 規律(matrix / 3 surface / LineMap thread)
- `docs/spec/markdown-dialect-for-ai-authors-v3.md`:`:::section` の formal 規約
- `docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`:
  simple → formal 写像 + tolerant parse 規約
