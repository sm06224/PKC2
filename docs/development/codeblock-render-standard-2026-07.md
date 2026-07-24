# コードブロック・レンダリング標準規約(無印 = トグル付き render / -render / -norender)— 設計

**Status**: ✅ **裁定済み(2026-07-24)・実装着手可**
**Date**: 2026-07-24(裁定反映 rev 2)
**起源**: user 指示(2026-07-24)+ user 裁定(同日、rev 1 の §7 への回答)
**関連**: html-render(reform-2026-05 PR-2M)/ mermaid(pgc-203 #24)/ csv fence / flag 撤去の前例 #919 / manual 12 章 §12.7.4

---

## §0 user 指示と裁定(2026-07-24)

初回指示:

> mermaid のレンダリングは既定オンで、html のコードブロックに対して、デフォルトをレンダリングあり、なしを -norender、切り替え可能オプションを -both にしたい。これは mermaid も同様。今後はこれをコードブロックレンダリング可能なものの標準にしたい

設計方針変更(同日裁定、こちらが**確定仕様**):

> デフォルトは省略可能とするが -both でトグル可能な表示 / コードブロックのみを強制する -norender / レンダリングのみを強制する -render にする。コレらはフラグ制御をしません。そのほかは(rev 1 §7 の)推奨がいい

確定した骨子:

1. **無印 fence = `-both` の省略形**(レンダリング表示 + ソース切替トグル、初期 = レンダリング側)
2. **`-render` = レンダリングのみ固定**(トグルなし)/ **`-norender` = コードブロックのみ固定**(トグルなし)
3. **フラグ制御なし** — html に脱出口 flag は作らず、mermaid の `editor.mermaid_render_enabled` は**撤去**して常時有効化
4. 対象は csv / tsv / psv を含むレンダリング可能な全言語。今後レンダラを持つ言語はこの標準に従う
5. 旧 `html-render` は新規約で「`html` + `-render`」として**自然に吸収**(現挙動 = レンダリングのみ、と完全一致。alias 実装すら不要)

## §1 現状(2026-07-24 実装調査)

fence の特別扱いはすべて単一の markdown-it fence rule(`src/features/markdown/markdown-render.ts:147-184`)に集約されている。

| fence | 現挙動 | gate | 実装 |
|---|---|---|---|
| ```` ```html-render ```` | sandbox iframe で即 render(`sandbox="allow-scripts"` のみ・CSP 注入・srcdoc・auto-resize postMessage) | なし(常時 ON) | `html-sandbox.ts` `buildHtmlSandboxIframe()` |
| ```` ```html ```` | 通常 code block(regex highlight + copy ボタン)。**「誤発火防止」の明示テストあり**(`tests/features/markdown/html-sandbox.test.ts:137-142`) | — | default fence + `wrapWithCopyButton` |
| ```` ```mermaid ```` | features 層は placeholder(source を data attr + 内蔵 `<pre>`)のみ emit。adapter の `hydrateMermaidPlaceholders`(`mermaid-renderer.ts`)が lazy `import('mermaid')` で SVG 化。OFF 時は内蔵 `<pre>` がソース表示として残る | `editor.mermaid_render_enabled` 既定 OFF(`shell-flags.ts:557`)→ **本規約で撤去** | placeholder + hydrator(theme 連動・WCAG 補正・64 件 cache・エラー可視化) |
| ```` ```csv / tsv / psv ```` | 無印 = table render(トグルなし)。`noheader` オプション precedent あり | なし | `csv-table.ts` `detectCsvLang()`(info 先頭 token)|

surface: S1 center pane / S2 Viewer popup / S3 Split View preview / S4 entry-window + textlog が同一 `renderMarkdown()` を共有。mermaid hydration は 5 経路とも配線済み。

**調査で見つかった既存 gap(本件と独立の既存バグ → PR-0 hotfix)**:

- **S4 entry-window に html-render の resize listener が無い**(CSS mirror のみ、`entry-window.ts:2571-2580`)→ S4 では iframe が height 0 のまま
- **S2 Viewer popup の inline style に `.pkc-mermaid-*` mirror が無い**(S4 にはある)→ mermaid 常時 ON 後に popup の placeholder / error 表示が素の見た目になる
- **S2 Viewer popup では copy ボタンが未配線**(action-binder が動かない独立 document。print では strip 済み、screen では死にボタン)— §3 のトグル方式選定の決定的根拠

## §2 標準規約(確定)

### 2.1 fence 記法

| 記法 | 表示 | 備考 |
|---|---|---|
| ```` ```<lang> ```` | **レンダリング + 切替トグル**(`-both` の省略形。初期 = レンダリング側) | html は sandbox iframe、mermaid は SVG、csv 系は table |
| ```` ```<lang>-both ```` | 同上(明示形) | |
| ```` ```<lang>-render ```` | **レンダリングのみ固定**(トグルなし) | 旧 ```` ```html-render ```` はこの規則で自然に解釈される(挙動不変) |
| ```` ```<lang>-norender ```` | **コードブロックのみ固定**(base lang で syntax highlight + copy ボタン) | render 経路に一切入らない(mermaid は placeholder すら出さない = hydrator 不介入の保証) |

- **フラグ制御なし**(user 裁定)。グローバル kill switch は設けない。表示の強制は per-block の suffix のみで行う
- **対象言語 registry**: `html` / `mermaid` / `csv` / `tsv` / `psv`(現時点でレンダラを持つ全言語)。今後レンダラを追加する言語は必ずこの 4 記法セットで実装する
- **解析規則**: info 文字列の先頭 token に対し suffix `-norender` / `-render` / `-both` を判定 → `{ lang, mode }` に分解(suffix なし = mode `both`)。先頭 token 以降のオプション(`noheader` 等)はそのまま各レンダラへ渡す(例: ```` ```csv-render noheader ````)。registry 外の言語(`json-both` 等)は従来どおり通常 code block へ fall through
- 実装は小さな純関数 `parseRenderableFence(info)` + registry を `markdown-render.ts` 側に置き、per-lang regex の散在(現状 3 本)を置き換える。**これが「今後の標準」の実体**

### 2.2 mermaid flag の撤去

「フラグ制御をしない」裁定により、`editor.mermaid_render_enabled` は**既定 ON 化ではなく撤去**(#918 → #919 と同じ「flag ごと撤去」の即時適用):

- `hydrateMermaidPlaceholders` 先頭の flag gate(`mermaid-renderer.ts:208`)を削除 → 常時 hydrate
- `shell-flags.ts:557-565` の flag 定義を削除(Flags Inspector は registry 駆動なので自動で消える)
- 既存 container の `__flags__` に残る当該 key は registry 不在で単に無視される(無害)
- **bundle 影響ゼロ**: `vite.config` は `inlineDynamicImports: true` で mermaid は既に bundle.js に同梱済み(~3MB、5.5MB cap 内、2026-07-01「mermaid keep・強化対象」)。変わるのは実行時挙動のみ(mermaid fence が存在するときだけ初期化コストが発生。fence 0 件なら従来と同一)
- 既定 OFF を前提にした既存テスト(`textlog-mermaid-hydration` の「flag OFF (default)」等 3 箇所 + smoke の URL flag 付与)を書き換え。「render させない」保証は `-norender` のテストが引き継ぐ

### 2.3 DOM 構造の統一(全 renderable fence 共通)

```html
<div class="pkc-md-block" data-pkc-md-block-kind="code"
     data-pkc-render-lang="html" data-pkc-render-mode="both"
     data-pkc-source-line="…" data-pkc-source-end="…">
  <button class="pkc-md-copy-btn" data-pkc-action="copy-md-block" …>⧉</button>
  <!-- mode=both のみ: -->
  <input type="checkbox" id="pkc-rv-<random>" class="pkc-render-toggle-input">
  <label for="pkc-rv-<random>" class="pkc-render-toggle" title="ソース / レンダリング切替">‹/›</label>
  <!-- render 内容(html: iframe / mermaid: placeholder→rendered / csv: table): -->
  <div class="pkc-render-slot">…</div>
  <!-- both / render 共通の隠しソース(copy 供給源 + both のソース側表示): -->
  <pre class="pkc-render-source"><code class="language-html">…escaped…</code></pre>
</div>
```

- mode `norender` は従来の code block 出力そのもの(slot なし・トグルなし)
- mode `render` はトグルなし(slot + 隠しソースのみ)
- **copy ボタンが全 mode で機能する**ようになる(現状 html-render は bare iframe で copy 不可)。copy は隠し `<pre>` のソースを読む(`innerText` は非表示要素で `textContent` に fallback するため既存 copy 実装で動く見込み — 実装時に確認)
- source-line attrs は wrapper に hoist(csv / table と同じ precedent)
- 既存 smoke test(iframe selector / sandbox attr)は wrapper 追加後も selector が壊れない

## §3 トグル = CSS-only(checkbox + label)方式

**JS 配線ゼロ**で 4 surface + textlog 全部に同時適用するため、checkbox + label + sibling combinator で実装する:

```css
.pkc-render-source { display: none; }
.pkc-render-toggle-input:checked ~ .pkc-render-slot { display: none; }
.pkc-render-toggle-input:checked ~ .pkc-render-source { display: block; }
```

**選定理由**: S2 Viewer popup / S4 entry-window は独立 document で **action-binder が存在しない**(S2 の copy ボタンが現に死んでいる)。JS 委譲方式だと surface ごとに inline script を増やす = 本 repo が最も警戒する parity 事故の温床。CSS-only なら:

- S1/S3 は `base.css`、S2/S4 は inline style mirror に同じ 3 行を足すだけ
- `:has()` 等の新しめ CSS 不要(sibling combinator は全ブラウザ安泰、Firefox 含む)
- checkbox はネイティブにキーボード操作可(a11y)
- print では `.pkc-render-toggle` を非表示(copy ボタン strip と同じ扱い)、選択中の面をそのまま印刷

**mermaid の hydration 完了前の polish(任意)**: mermaid の SVG 化は非同期なので、hydrate 完了前にトグルを押すと「ソース ⇄ ソース」の一瞬がありうる。hydrator が SVG 差し替え成功時に wrapper へ `data-pkc-render-ready` を立て、mermaid のトグルはそれまで CSS 非表示にする(hydrator は既に JS なので 2-3 行、`:has()` 不要)。flag 撤去により必須ではなくなったが、体裁として実装する。

**トグル状態は ephemeral**(state 機構に載せない)。再 render で初期側(レンダリング)に戻る — heading fold 等と同じ扱いで、Container 汚染ゼロ。

## §4 後方互換と影響範囲

| 影響 | 内容 | 対策 |
|---|---|---|
| **plain ```` ```html ```` の挙動反転** | 「HTML ソースをコード例として見せる」つもりの既存コンテンツが render + トグル表示になる(**本規約で唯一の意味反転**) | per-block で `-norender` を付ける(グローバル脱出口はなし = user 裁定)。STARTUP_NOTICES で告知 + マニュアル 12 章に移行案内 |
| **mermaid 常時 ON 化** | flag OFF で運用していた環境も render される | トグル / `-norender` で代替(ソース閲覧は無印でもトグルで可能)。flag 撤去は #919 式の恒久判断 |
| **csv 系にトグルが付く** | 無印 csv の見た目に切替 UI が加わる(table 自体は不変) | render 固定にしたければ `-render` |
| 「誤発火防止」テストの意味反転 | `html-sandbox.test.ts:137-142` は「``` html は code block」を assert | 新仕様の assert に書き換え(`-norender` が同保証を引き継ぐ) |
| sandbox 安全性 | render 対象が増える | 既存 `buildHtmlSandboxIframe` をそのまま使用(`allow-scripts` のみ / CSP / srcdoc escape / `connect-src 'none'`)。**新規の攻撃面は増えない**(html-render で既に開いている面と同一) |
| export 経路 | docx / pptx / 単一 HTML / ZIP は markdown **source** を扱うため suffix はそのまま保存・出力される(html-render と同様)。W27/W28(render 画像 export)backlog は据え置き | 変更不要 |
| spec doc | `pkc-markdown-complete-spec-v4.md` / `markdown-dialect-for-ai-authors-*.md` が html-render を記載 | 実装 PR で新規約を追記(`html-render` = `html` + `-render` として自然継続する旨) |
| minimap / split-sync | mermaid は既存 class 依存で不変。wrapper 追加は table/csv と同型 | 回帰テストで担保 |

## §5 実装プラン(2 PR)

| PR | 内容 | 規律対応 |
|---|---|---|
| **PR-0 hotfix** | 既存 gap 2 件: S4 entry-window の html-render resize listener 追加 / S2 Viewer popup の `.pkc-mermaid-*` CSS mirror 追加 | 「既存問題は別 hotfix PR」(CLAUDE.md 運用 3) |
| **PR-A 標準規約一式** | `parseRenderableFence` + registry / 無印 = both・`-render`・`-norender`(html・mermaid・csv 系)/ DOM 構造統一(§2.3)/ CSS-only トグル(base.css + S2・S4 mirror)/ **mermaid flag 撤去**(§2.2)/ hydrator の `data-pkc-render-ready` / unit tests + **visual parity test(トグル実クリック ≥1 件)**/ manual 07・12 章更新 / STARTUP_NOTICES 新 entry / spec doc 追記 | フラグ制御なしの標準を一体で着地(中間状態を作らない)。視覚機能 = parity test 必須(運用 4)/ お知らせ + マニュアル(運用 6) |

merge は各 PR とも CI 全 green 確認後に squash(`merge-on-green` skill)。

## §6 裁定記録(2026-07-24)

rev 1 の §7 に対する user 回答で確定:

1. ~~html グローバル flag~~ → **フラグ制御なし**(html 新 flag は作らない。mermaid flag も撤去)
2. csv / tsv / psv も対象に **含める**(推奨どおり)
3. 初期表示は **レンダリング側**(推奨どおり)
4. `html-render` → alias 実装不要。新 suffix `-render` の導入により **記法として自然に吸収**(挙動不変)
