# コードブロック・レンダリング標準規約(無印 = render / -norender / -both)+ mermaid 既定 ON — 設計

**Status**: 📐 設計(user 裁定待ち・実装未着手)
**Date**: 2026-07-24
**起源**: user 指示(2026-07-24)
**関連**: html-render(reform-2026-05 PR-2M)/ mermaid(pgc-203 #24)/ csv fence / flag 撤去台帳の前例 #919 / manual 12 章 §12.7.4

---

## §0 user 指示(原文)

> mermaid のレンダリングは既定オンで、あと、html のコードブロックに対して、html-render を作ったと思うけど、デフォルトをレンダリングあり、なしを -norender、切り替え可能オプションを -both にしたい。これは mermaid も同様。今後はこれをコードブロックレンダリング可能なものの標準にしたい

指示された骨子(**決定事項**、本 doc は具体化と残る設計判断の裁定用):

1. **mermaid render を既定 ON**(`editor.mermaid_render_enabled` の default flip)
2. **無印 fence = レンダリング表示**(``` ```html``` がそのまま render される)
3. **`-norender` suffix = ソース表示**、**`-both` suffix = render ⇄ ソースの切替可能**
4. この 3 点セットを**レンダリング可能な言語すべての標準規約**にする

## §1 現状(2026-07-24 実装調査)

fence の特別扱いはすべて単一の markdown-it fence rule(`src/features/markdown/markdown-render.ts:147-184`)に集約されている。

| fence | 現挙動 | gate | 実装 |
|---|---|---|---|
| ```` ```html-render ```` | sandbox iframe で即 render(`sandbox="allow-scripts"` のみ・CSP 注入・srcdoc・auto-resize postMessage) | **なし(常時 ON)** | `html-sandbox.ts` `buildHtmlSandboxIframe()` |
| ```` ```html ```` | 通常 code block(regex highlight + copy ボタン)。**「誤発火防止」の明示テストあり**(`tests/features/markdown/html-sandbox.test.ts:137-142`) | — | default fence + `wrapWithCopyButton` |
| ```` ```mermaid ```` | features 層は placeholder(source を data attr + 内蔵 `<pre>`)のみ emit。adapter の `hydrateMermaidPlaceholders`(`mermaid-renderer.ts`)が lazy `import('mermaid')` で SVG 化。OFF 時は内蔵 `<pre>` がソース表示として残る | `editor.mermaid_render_enabled` **既定 OFF**(`shell-flags.ts:557`) | placeholder + hydrator(theme 連動・WCAG 補正・64 件 cache・エラー可視化) |
| ```` ```csv / tsv / psv ```` | **すでに「無印 = render」**(table 化)。`noheader` オプション precedent あり | なし | `csv-table.ts` `detectCsvLang()`(info 先頭 token)|

surface: S1 center pane / S2 Viewer popup / S3 Split View preview / S4 entry-window + textlog が同一 `renderMarkdown()` を共有。mermaid hydration は 5 経路とも配線済み。

**調査で見つかった既存 gap(本件と独立の既存バグ)**:

- **S4 entry-window に html-render の resize listener が無い**(CSS mirror のみ、`entry-window.ts:2571-2580`)→ S4 では iframe が height 0 のまま
- **S2 Viewer popup の inline style に `.pkc-mermaid-*` mirror が無い**(S4 にはある)→ mermaid 既定 ON 後に popup の placeholder / error 表示が素の見た目になる
- **S2 Viewer popup では copy ボタンが未配線**(action-binder が動かない独立 document。print では strip 済み、screen では死にボタン)— §3 のトグル方式選定の決定的根拠

## §2 標準規約(提案)

### 2.1 fence 記法

| 記法 | 表示 | 備考 |
|---|---|---|
| ```` ```<lang> ```` | **レンダリング**(既定) | html は sandbox iframe、mermaid は SVG、csv 系は table |
| ```` ```<lang>-norender ```` | **ソース表示**(base lang で syntax highlight + copy ボタン) | render 経路に一切入らない(mermaid は placeholder すら出さない = hydrator 不介入の保証) |
| ```` ```<lang>-both ```` | **レンダリング + 切替トグル**(初期 = レンダリング側) | トグルでソース表示に切替。状態は ephemeral(再 render でレンダリング側に戻る) |
| ```` ```html-render ```` | `html` 無印と同義の**恒久 alias** | 後方互換(invariant 5)。既存コンテンツ・spec doc に多数存在するため撤去しない |

- **対象言語 registry**: `html` / `mermaid` / `csv` / `tsv` / `psv`(現時点でレンダラを持つ全言語)。今後レンダラを追加する言語は必ずこの 3 点セット(無印 render / -norender / -both)で実装する
- **解析規則**: info 文字列の先頭 token に対し suffix `-norender` / `-both` を判定 → `{ lang, mode }` に分解。先頭 token 以降のオプション(`noheader` 等)はそのまま各レンダラへ渡す(例: ```` ```csv-both noheader ````)。registry 外の言語(`json-both` 等)は従来どおり通常 code block へ fall through
- 実装は小さな純関数 `parseRenderableFence(info)` + registry を `markdown-render.ts` 側に置き、per-lang regex の散在(現状 3 本)を置き換える。**これが「今後の標準」の実体**

### 2.2 グローバル kill switch(言語単位)

| 言語 | flag | 既定 | OFF 時 |
|---|---|---|---|
| mermaid | `editor.mermaid_render_enabled`(既存) | **true へ flip**(§4) | 全 variant がソース表示(-both のトグルも出ない) |
| html | `editor.html_render_enabled`(**新設**) | true | 同上。**`html-render` alias も止まる**(kill switch として一貫) |
| csv 系 | なし(現状どおり) | — | 従来から無印 render で問題報告ゼロのため flag 不要 |

- html flag は features 層で `defineFlag`(precedent: `src/features/image-optimize/config.ts` — features → core/flags import は既存慣行)。fence rule 内で live getter を読む
- 位置づけは「plain ```` ```html ```` の挙動反転に対する脱出口」。運用が落ち着いたら **#919 式の撤去台帳**で flag ごと撤去を検討

### 2.3 DOM 構造の統一(全 renderable fence 共通)

```html
<div class="pkc-md-block" data-pkc-md-block-kind="code"
     data-pkc-render-lang="html" data-pkc-render-mode="both"
     data-pkc-source-line="…" data-pkc-source-end="…">
  <button class="pkc-md-copy-btn" data-pkc-action="copy-md-block" …>⧉</button>
  <!-- -both のみ: -->
  <input type="checkbox" id="pkc-rv-<random>" class="pkc-render-toggle-input">
  <label for="pkc-rv-<random>" class="pkc-render-toggle" title="ソース / レンダリング切替">‹/›</label>
  <!-- render 内容(html: iframe / mermaid: placeholder→rendered / csv: table): -->
  <div class="pkc-render-slot">…</div>
  <!-- 全 mode 共通の隠しソース(copy 供給源 + -both のソース側表示): -->
  <pre class="pkc-render-source"><code class="language-html">…escaped…</code></pre>
</div>
```

- **copy ボタンが全 mode で機能する**ようになる(現状 html-render は bare iframe で copy 不可)。copy は隠し `<pre>` のソースを読む(`innerText` は非表示要素で `textContent` に fallback するため既存 copy 実装で動く見込み — 実装時に確認)
- source-line attrs は wrapper に hoist(csv / table と同じ precedent)
- 既存 smoke test(iframe selector / sandbox attr)は wrapper 追加後も selector が壊れない

## §3 -both トグル = CSS-only(checkbox + label)方式

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

**mermaid-both × flag OFF の詰め**: flag OFF(hydrate されない)とき、slot 内 placeholder はソース表示のままなので、トグルは「ソース ⇄ ソース」の死にボタンになる。対策: hydrator が SVG 差し替え成功時に wrapper へ `data-pkc-render-ready` を立て、CSS は mermaid の `.pkc-render-toggle` を `[data-pkc-render-ready]` が立つまで非表示にする(hydrator は既に JS なので 2-3 行。`:has()` 不要)。html / csv は同期 render なのでトグル常時表示。

**トグル状態は ephemeral**(state 機構に載せない)。再 render で初期側(レンダリング)に戻る — heading fold 等と同じ扱いで、Container 汚染ゼロ。

## §4 mermaid 既定 ON

- `shell-flags.ts:557` の default を `false → true` に flip(opt-out へ)。OFF 手段は Flags Inspector(既存)
- **bundle 影響ゼロ**: `vite.config` は `inlineDynamicImports: true` で mermaid は既に bundle.js に同梱済み(~3MB、5.5MB cap 内、2026-07-01「mermaid keep・強化対象」)。flip は実行時挙動のみ変える(mermaid fence が存在するときだけ初期化コストが発生。fence 0 件なら従来と同一)
- 既定 OFF を前提にした既存テスト 3 箇所(`textlog-mermaid-hydration` の「flag OFF (default)」等)を「明示 OFF」に書き換え
- マニュアル 07 章 L41「Flags で ON にすると図解が見える」注記 → 既定 ON の記述へ / 12 章 §12.7 / `.claude/skills/manual-maintenance/SKILL.md:32` の「既定 OFF」記述も更新

## §5 後方互換と影響範囲

| 影響 | 内容 | 対策 |
|---|---|---|
| **plain ```` ```html ```` の挙動反転** | 「HTML ソースをコード例として見せる」つもりの既存コンテンツが render される(**本規約で唯一の破壊的変更**。mermaid は無印=placeholder→render 化が「OFF だった機能の ON 化」なのに対し、html は表示意味が変わる) | ① per-block: `-norender` を付ける ② global: `editor.html_render_enabled` OFF ③ STARTUP_NOTICES で告知 + マニュアル 12 章に移行案内 |
| 「誤発火防止」テストの意味反転 | `html-sandbox.test.ts:137-142` は「``` html は code block」を assert | 新仕様の assert に書き換え(`-norender` が同保証を引き継ぐ) |
| sandbox 安全性 | render 対象が増える | 既存 `buildHtmlSandboxIframe` をそのまま使用(`allow-scripts` のみ / CSP / srcdoc escape / `connect-src 'none'`)。**新規の攻撃面は増えない**(html-render で既に開いている面と同一) |
| export 経路 | docx / pptx / 単一 HTML / ZIP は markdown **source** を扱うため suffix はそのまま保存・出力される(html-render と同様)。W27/W28(render 画像 export)backlog は据え置き | 変更不要 |
| spec doc | `pkc-markdown-complete-spec-v4.md` / `markdown-dialect-for-ai-authors-*.md` が html-render を記載 | 実装 PR で新規約を追記(html-render は alias として残る旨) |
| minimap / split-sync | mermaid は既存 class 依存で不変。wrapper 追加は table/csv と同型 | 回帰テストで担保 |

## §6 実装プラン(裁定後・3 PR)

| PR | 内容 | 規律対応 |
|---|---|---|
| **PR-0 hotfix** | 既存 gap 2 件: S4 entry-window の html-render resize listener 追加 / S2 Viewer popup の `.pkc-mermaid-*` CSS mirror 追加 | 「既存問題は別 hotfix PR」(CLAUDE.md 運用 3) |
| **PR-A 標準規約** | `parseRenderableFence` + registry / html 無印 render 化 + `html-render` alias / `-norender`・`-both`(html・mermaid・csv 系)/ DOM 構造統一(§2.3)/ `editor.html_render_enabled` flag / CSS(base.css + S2・S4 mirror)/ hydrator の -both 対応(`data-pkc-render-ready`)/ unit tests + **visual parity test(トグル実クリック ≥1 件)**/ manual 12 章更新 / STARTUP_NOTICES 1 行 / spec doc 追記 | 視覚機能 = parity test 必須(運用 4)/ お知らせ + マニュアル(運用 6) |
| **PR-B mermaid 既定 ON** | flag default flip / 既定 OFF 前提テスト 3 箇所の明示 OFF 化 / manual 07・12 章 + skills 記述更新 / STARTUP_NOTICES 1 行 | 同上 |

merge は各 PR とも CI 全 green 確認後に squash(`merge-on-green` skill)。

## §7 裁定をお願いしたい点(推奨付き)

1. **html のグローバル flag(`editor.html_render_enabled` 既定 ON)を置くか** — 推奨: **置く**。唯一の破壊的変更(§5)への脱出口。mermaid と対称になり、落ち着いたら #919 式台帳で撤去
2. **csv / tsv / psv も `-norender` / `-both` の対象に含めるか** — 推奨: **含める**。同じ fence rule 内で差分僅少、「標準」が最初から全言語に適用される
3. **`-both` の初期表示はレンダリング側で良いか** — 推奨: **yes**(無印 = render と一貫)
4. **`html-render` を恒久 alias として維持で良いか** — 推奨: **yes**(invariant 5。deprecated 扱いにはせず、doc 上は新記法を正とする)
