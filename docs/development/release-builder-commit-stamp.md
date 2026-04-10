# Release builder — git commit stamp

このドキュメントは `dist/pkc2.html` に埋め込まれる `pkc-meta.source_commit` の
意味と、2026-04-10 に入った stamp staleness 修正の内容を説明する。

---

## 1. 背景：なぜ stamp が stale になっていたか

`build/release-builder.ts` は `dist/pkc2.html` を生成するときに次を埋め込む:

```json
{
  "source_commit": "<git rev-parse --short HEAD の出力>"
}
```

ところが、PKC2 の実運用では **dist/ を commit に含めるために build:release は
commit の直前に走る**。

```bash
npm run build:bundle
npm run build:release     ← ここで `git rev-parse HEAD` が走る
                            （まだ commit していないので、前の commit の sha が出る）
git add ...
git commit                ← 新しい commit ができる
                            （でも pkc2.html には前の commit sha が焼かれている）
```

つまり `source_commit` は **1 世代古い commit** を指すことがあり、
配布物のトレーサビリティが崩れていた。

---

## 2. 修正内容（最小差分）

### 2.1 stamp の意味を 3 状態に拡張

| 状態 | stamp | 意味 |
|---|---|---|
| clean worktree | `20d7d30` | この short-sha がそのまま配布物の元コミット |
| dirty worktree | `20d7d30+dirty` | short-sha は **1 つ前のコミット**。作業ツリーに未コミットの変更あり |
| git 使用不可 | `unknown` | `git rev-parse` が失敗した (CI 等) |

`+dirty` は **「この artifact は `20d7d30` を土台にして作られたが、その後の変更を含む」**
というシグナル。artifact を見た人が「短縮 sha が commit と完全一致しないケースがある」
ことに気付ける。

### 2.2 ファイル構成

- **`build/git-stamp.ts`** — 新規。`computeGitStamp(runner)` を提供。runner 注入型なので
  ユニットテストで git を実際に呼ばずに clean/dirty/failure すべての分岐を検証できる。
- **`build/release-builder.ts`** — 旧 `getGitCommit()` を削除し、
  `import { computeGitStamp } from './git-stamp'` に差し替え。1 行置換のみ。
- **`src/runtime/release-meta.ts`** — `source_commit` フィールドの JSDoc に
  「`+dirty` サフィックスあり」の意味を明記。ランタイム型自体は従来通り `string`。
- **`tests/build/git-stamp.test.ts`** — 新規。10 本。
- **`tests/runtime/builder-output.test.ts`** — 既存の `source_commit` 検証を
  regex `/^([0-9a-f]{4,}(\+dirty)?|unknown)$/` に厳格化。

### 2.3 最小差分の保証

- runtime 側の型・読み取り・表示ロジック（`meta-reader.ts`, `formatTripleVersion` 等）
  は一切変更していない。
- build pipeline 自体（Vite bundle → shell.html → dist/pkc2.html）のフローも変更なし。
- 既存の `source_commit` が取り得る形（短縮 sha / `unknown`）は後方互換である。
- 新しい形（`<sha>+dirty`）は `string` として読めるので、古い `meta-reader` でも壊れない。

---

## 3. 保証すること / 保証しないこと

### 保証すること

- **clean worktree でビルドすれば、stamp は commit の短縮 sha に完全一致する**。
- **dirty worktree でビルドすれば、`+dirty` サフィックスが必ず付く**。
- **`git rev-parse` が失敗する環境でも `"unknown"` フォールバックで通る**。
- **`rev-parse` が成功して `status --porcelain` だけ失敗する場合は、`+dirty` を付けずに
  clean sha を返す**。「知らないこと」を「dirty である」と偽装しない。
- `trim()` を通すので、`porcelain` が空白だけ返す実装でも誤って dirty 判定しない。

### 保証しないこと

- **「配布物に焼き付く sha が作成される commit の sha に一致すること」は保証しない**。
  これは build が commit より先に走るという運用上の制約そのものであり、
  完全に合わせるには commit hook / rebuild / post-commit stamping のような
  別種の仕組みが必要になる。本 issue のスコープ外。
- **dirty の **内容** は不明**。`+dirty` は「何かある」という 1bit シグナル。
  どのファイルが変更されたかは stamp には現れない。
- **`git stash` 中の差分や、`git worktree` の他の worktree の状態は見ない**。
  `git status --porcelain` の結果に従うのみ。

---

## 4. 推奨する commit 順序

`+dirty` を付けずにリリースしたい場合は、次の順序を推奨する:

```bash
# 1. ソースを commit まで持っていく
git add src/ tests/ docs/
git commit -m "..."

# 2. そのうえで dist/ だけ amend する
npm run build:bundle
npm run build:release
git add dist/
git commit --amend --no-edit
```

ただし PKC2 の既存運用は「dist も含めて 1 commit で push」なので、
実際には dirty suffix が付くのが **日常的な正常パス** である。
`+dirty` は「異常」ではなく「よくある状態」として読んでよい。

---

## 5. 次候補

build infra の次の小改善候補 (本 issue のスコープ外):

- **text archetype の sister export/import** — TEXTLOG が完了したので、
  `text` archetype にも同等の single-file export/import を展開する。
- **container-wide batch export/import** — 複数 entry を 1 ZIP にまとめる。
- **post-commit rebuild hook** — 本物の「正確な」stamp を付けるならこの方向。
  ただし現行の運用フローと噛み合わないので優先度は低い。

---

## 6. 参考

- `build/release-builder.ts` — stamp を pkc-meta に埋める箇所
- `src/runtime/release-meta.ts` — `ReleaseMeta.source_commit` の型定義
- `src/runtime/meta-reader.ts` — ランタイム読み取り
- `docs/planning/resolved/21_release_metadata.md` — ReleaseMeta 全体設計
