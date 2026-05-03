# Doc CI automation — Phase 5 (reform-2026-05)

**Status**: LIVE(active policy / CI gate、2026-05-02 着地)
**目的**: `docs/` の整合性(INDEX 登録 + cross-ref)を CI で blocking に維持し、Phase 1-3 cleanup wave で達成した状態(orphan 0 / dead-link 0)が次以降の PR で silently 退化しないようにする

## 背景

reform-2026-05 の doc cleanup wave(Phase 1A archive → Phase 1B 補強 → Phase 2 consolidation → Phase 3 orphan triage → Phase 4 spec audit)で、`docs/development/` の **103 live docs 全てが INDEX に登録**、**docs 全 379 ファイルの cross-ref が green** という状態を達成した。しかし、これを人手 PR review だけで維持するのは現実的ではない:

- 新 doc を起こしたが INDEX 登録を忘れる(=直近で起こった失敗)
- doc を archive subdir へ動かしたが、別 doc の cross-ref が古い相対パスのまま
- `[Cmd+[ / Cmd+]](macOS)` のように、markdown link 解釈の罠で意図しない link が混入

これらは **静的検査で機械的に潰せる**。Phase 5 はこの自動化に当てる。

## 検査の 2 種

### 1. Orphan check(`build/check-doc-orphans.cjs`)

- **対象**: `docs/development/**/*.md` 全件(257 件 / 2026-05-02)
- **判定**:
  - **live doc**(`docs/development/<file>.md`):INDEX.md が当該 filename を参照していれば OK
  - **archived doc**(`docs/development/archived/<group>/<file>.md`):同 group の `SUMMARY.md` が INDEX.md から参照されていれば OK(archive subdir は SUMMARY 経由の **2 段間接登録** モデル)
  - **always-allowed**:`INDEX.md` 自身、`README.md`(あれば)
- **失敗時**:`[doc-orphans] FAIL N orphan(s):` + 行頭 `-` 付き list を stderr に出して exit 1

### 2. Dead-link check(`build/check-doc-deadlinks.cjs`)

- **対象**: `docs/**/*.md` 全件(379 件 / 2026-05-02)
- **解析**: 各ファイルに対し `[label](path)` および `![alt](path)` を grep し、target が relative path なら resolve して existsSync 検証
- **skip 対象**(false positive 防止):
  - `#anchor-only` リンク
  - URI scheme 付き(`http(s)://`, `mailto:`, `entry:`, `asset:`, `pkc://`, `javascript:` 等)
  - **placeholder syntax**:`${var}` template literal、backtick を含む target、`<placeholder>` 形式、`...`(ellipsis stand-in)
  - これらは doc 内の code 例 / grammar 例で頻出する pseudo-target で、real path ではない
- **fragment / query**:`foo.md#section` / `foo.md?bar=1` は fragment / query 部分を切り落として file 存在のみ検証(anchor は validate しない、heading rename への耐性)
- **code block 除外**:fenced code(```...```、~~~...~~~)と inline code(`...` 単一 backtick)は事前に空白置換(行番号維持)
- **失敗時**:`[doc-deadlinks] FAIL N broken link(s):` + `<src>:<line> → <target>` 形式の list を stderr に出して exit 1

## 実行方法

```bash
npm run check:doc-orphans      # orphan のみ
npm run check:doc-deadlinks    # dead-link のみ
npm run check:docs             # 両方(CI と同じ)
```

## CI への組込

`.github/workflows/ci.yml` の `verify` job、Lint step の **直後** に `Doc orphans + dead-links` step として `npm run check:docs` を blocking で実行。`typecheck → lint → check:docs → test → build:bundle → ...` の順序で、source code の compile gate を通った後・テスト走行前に doc 整合を確認する。

PR review checklist(`pr-review-checklist.md` §3)にも `npm run check:docs` を追記、docs/ を 1 行でも触る PR は pre-PR で実行することを義務化。

## 既知の制約 / 将来拡張余地

- **anchor validation 未対応**: `foo.md#section` の `#section` が実在するかは現状検証しない。heading rename を頻繁に行わない方針なので不要、必要になれば markdown-it 等で AST 解析を追加。
- **reference-style link 未対応**: `[label][ref]` + `[ref]: path` 形式は採用が稀のため未実装。実例が増えたら parser 拡張。
- **archive 2 段間接登録の `SUMMARY.md` 内容検証なし**: 現在は「SUMMARY.md が INDEX から参照されていれば、その subdir 内の doc は registered と見なす」のみ。SUMMARY 内に当該 doc が個別 list されているかまでは確認しない(SUMMARY 自体が doc 一覧の責務を負う、という運用契約に依拠)。SUMMARY が doc を漏らした場合、orphan としては検知されない。これは Phase 6 以降で必要なら追加。

## 関連

- 上位 doctrine: [`debug-privacy-philosophy.md`](./debug-privacy-philosophy.md) ではなく、こちらは doc hygiene side。
- 運用 checklist: [`pr-review-checklist.md`](./pr-review-checklist.md) §3
- Phase 1-4 の cleanup 経緯: `archived/v1-audits/SUMMARY.md` 等の各 archive group SUMMARY と、上位 [`archived/SUMMARY.md`](./archived/SUMMARY.md)
- INDEX canonical truth source: [`INDEX.md`](./INDEX.md)
