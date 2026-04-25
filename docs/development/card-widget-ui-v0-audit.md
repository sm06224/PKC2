# Card widget UI v0 audit — 2026-04-25

## 1. Purpose / Status

**docs-only audit、実装ゼロ**。Card wave Slice 1-4 で parser / renderer placeholder / click + keyboard wiring まで完結後、**widget UI 本体(title / archetype badge / excerpt / thumbnail / variant)** をどの粒度で何 slice に切るかを docs-first で固定する。Known limitations に残る `Card / embed presentation (@[card](...)) is not implemented yet` を、最小 chrome から段階的に解消する道筋を明示。

- **Status**: 推奨 **Slice 5.0(minimal chrome)を即着手 → Slice 5.1(excerpt)→ Slice 5.2(thumbnail)→ Slice 6(variants)** の 4 段階。本 PR は **docs-only**、実装は別 wave。
- **触らない**: parser / renderer / action-binder / `.pkc-card-placeholder` selector / data attribute / schema / version / About / CHANGELOG / Known limitations 文言(現時点)/ Import-Export / Color / clickable-image。

参照(読む順):

1. `docs/spec/card-embed-presentation-v0.md` §5.2(描画モデル)/ §5.3(variant)/ §5.4(target 別の許容)
2. `docs/development/card-asset-target-coordination-audit.md`(asset target は v0 future dialect)
3. `src/features/markdown/markdown-render.ts` L395-415(placeholder emit)
4. `src/features/link/card-presentation.ts`(parser、`CardVariant = 'default' | 'compact' | 'wide' | 'timeline'`)
5. `src/styles/base.css` L6148-(`.pkc-card-placeholder:focus-visible` のみ存在、widget chrome なし)

## 2. 現在の card placeholder contract(Slice 4 着地後)

### 2.1 emit される DOM

```html
<span class="pkc-card-placeholder"
      data-pkc-action="navigate-card-ref"
      data-pkc-card-target="entry:lid#log/log-1"
      data-pkc-card-variant="default"
      data-pkc-card-raw="@[card](entry:lid#log/log-1)"
      role="link" tabindex="0">@card</span>
```

- visible text は **`@card`**(default)または **`@card:variant`**(compact / wide / timeline)
- click / Enter / Space で `runEntryRefNavigation` 経由の同 entry routing(Slice 4)
- cross-container `pkc://<other>/entry/<lid>` は silent no-op
- `asset:` / `pkc://<cid>/asset/<key>` は parser-level reject(Slice 3.5)

### 2.2 既存 CSS

`.pkc-card-placeholder:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }` の 1 ルールのみ(Slice 4 で追加)。**widget としての視覚的 chrome は完全に未実装**。

### 2.3 parser が受理する variant

`'default' | 'compact' | 'wide' | 'timeline'` の 4 種(`card-presentation.ts:49`)、未知 variant は parser reject → renderer は link fallback。

### 2.4 spec §5.4 の target 別 widget 期待値(参考)

| target | 期待 widget content |
|---|---|
| `entry:<lid>` | `entry.title` + archetype badge + body の先頭抜粋 |
| `entry:<lid>#log/<logId>` | row の createdAt + text snippet |
| `entry:<lid>#day/<yyyy-mm-dd>` | その日の log 件数 + 先頭 log snippet |
| `entry:<lid>#log/<logId>/<slug>` | **link fallback**(heading anchor は card 粒度に合わない) |
| `pkc://<other>/entry/<lid>` | **skeleton card**(タイトル未解決 / container_id 表示 / "open" CTA) |
| `asset:<key>` | ❌ 非対応(parser reject) |

## 3. Slice 段階の比較

### Slice 5.0 — minimal chrome(推奨即着手)

**含める**:
- `entry.title` 表示(同一 container の entry を解決)
- archetype badge(text / textlog / todo / form / attachment / folder の 6 種、既存 sidebar の archetype indicator と同等の glyph + 1-2 字 label を再利用)
- click affordance(既存の `:focus-visible` outline + 軽い border / hover state を追加)
- block-level rendering へ昇格(`<span>` → `<a>`/`<div>` ベース、ただし inline 配置を保つため `display: inline-block` + 改行)
- missing target("Entry not found" 等の状態表示)
- cross-container target(skeleton card: container_id + "open in another window" 風の inert state)
- malformed target(literal `@[card](...)` か、broken-ref 視覚化)

**含めない**: excerpt / thumbnail / variant 別レイアウト / hover preview / popover

**理由**: spec §5.2 の preview widget 要件のうち **title + archetype badge + 状態区分が「ユーザーから見て中途半端でない最低ライン」**。Excerpt / thumbnail は重い(再レンダリング + 画像 / data URI)、後段で慎重に。

**CSS budget 見積**: +1.5〜2.5 KB(border / padding / typography / archetype badge color / state variants)、headroom 2.54 KB に **ギリギリ収まる想定**、border-radius / box-shadow を最小化する設計が必要。

**1 PR 規模**: src ~150 LOC(renderer 拡張 + entry resolver) + tests ~200 LOC(missing / cross-container / malformed / variant ignore / 既存 click contract 維持)+ CSS 60-80 行 + manual 短文 + Known limitations 短縮。

### Slice 5.1 — excerpt

**含める**: entry body の短い preview(80-200 文字、改行除去、markdown 記号は plain text に flatten)

**archetype 別の excerpt source**:
- TEXT: body の plain-text 化(markdown render を回避、`#` / `*` 等は除去)
- TEXTLOG: 最新の log の text(`entry:<lid>` の場合)/ 該当 log の text(`#log/<logId>`)/ 該当日の先頭 log(`#day/<yyyy-mm-dd>`)
- TODO: `parseTodoBody().description`
- FORM: form schema の最初の数 field 値
- ATTACHMENT: filename + MIME + size(excerpt 不要、metadata でカバー)
- FOLDER: descendant 件数(`5 entries / 12 items`)

**XSS / markdown 再レンダリング回避**: excerpt は **plain text 専用 helper**(`features/card/excerpt-builder.ts` 仮)で生成、markdown-it / asset-resolver 経路を一切通さない。`escapeHtml` のみ。

**CSS budget**: +0.5〜1 KB(excerpt typography / line-clamp)

**前提**: Slice 5.0 が land してから(state / DOM 構造の確定後)。

### Slice 5.2 — thumbnail

**含める**: card の左側に画像サムネ(64×64 程度)

**source**:
- TEXT body の最初の `![](asset:k)` を解決
- ATTACHMENT で MIME が image/* の場合は asset 本体
- TEXTLOG の該当 log の最初の image
- それ以外は archetype glyph(Slice 5.0 の badge を流用)

**asset target card は v0 future**(`card-asset-target-coordination-audit.md` Option C)、`@[card](asset:k)` 自体は parser reject なので、thumbnail は **entry-target card 内の "entry が持っている画像"** を引っ張る形に限定。

**懸念点**: data URI 解決のため `asset-resolver` を呼ぶ → CSS / DOM コストが増える。**Slice 5.2 は user feedback 後でよい**(必要性が証明されてから)。

### Slice 6 — advanced variants

**含める**: parser 側で受理済の `compact` / `wide` / `timeline` variant の UI 差し替え

| variant | レイアウト |
|---|---|
| `default` | Slice 5.0 + 5.1 のフル chrome(title + badge + excerpt) |
| `compact` | title + archetype badge のみ(Slice 5.0 だけ) |
| `wide` | 5.1 + 5.2(title + badge + excerpt + thumbnail + open CTA) |
| `timeline` | 日付軸(`#day/<yyyy-mm-dd>`)に最適化、件数バー等 |

**前提**: 5.0 + 5.1 + 5.2 が出揃ってから(差分 layout を作る基盤が必要)。

## 4. missing / cross-container / malformed 表示方針

| state | 既存 Slice 4 挙動 | Slice 5.0 widget 表示 |
|---|---|---|
| 正常(entry 解決) | navigate-entry-ref click | `[archetype-badge] Entry Title`(block) |
| missing(unknown lid) | click は no-op、`data-pkc-ref-broken` は **立てない**(card 契約) | `[?] Entry not found: <lid>`(grayed out、click は inert) |
| cross-container `pkc://<other>/entry/<lid>` | silent no-op | `[🌐] Cross-container · <container_id>`(skeleton、click 不可、現状の portable-reference-placeholder badge と同色) |
| malformed `pkc://nope` 等 | silent no-op | literal `@[card](raw)` 表示 or `[!] Malformed card`(後者推奨、render hard fail を避ける) |
| asset target(parser reject) | parser で literal text 化 | n/a(Slice 5.0 は触らない) |

**a11y**: missing / malformed の card は `aria-disabled="true"` + `tabindex="-1"`(focusable から外す)、cross-container は `aria-label` で container_id を含めて screen reader が読める形に。

## 5. CSS budget 見積もり

現状: bundle.css **93.46 KB / 96 KB(97.4%)、headroom 2.54 KB**。

| Slice | 推定追加 | 累積 bundle.css |
|---|---|---|
| 5.0 minimal chrome | +1.5〜2.5 KB | 95.0〜96.0 KB(headroom ギリギリ) |
| 5.1 excerpt | +0.5〜1 KB | 95.5〜97.0 KB(**budget 超過リスク**) |
| 5.2 thumbnail | +1〜2 KB | 96.5〜99.0 KB(**確実に超過、budget 引き上げ必要**) |
| 6 variants | +1.5〜2 KB | 累積で 98〜100 KB(budget 引き上げ必須) |

**結論**: Slice 5.0 は現 budget で収まる(設計次第)、Slice 5.1 で **96 → 98 KB の dedicated budget bump PR が必要になる可能性大**(PR #138 と同じ pattern)、Slice 5.2 / 6 は確実に bump 必要。**Slice 5.0 着地と同時に "次の bump タイミング" を見える化する**。

## 6. Known limitations 書換タイミング

現状(`build/about-entry-builder.ts:168` + `CHANGELOG_v2.1.1.md` §142):
> 'Card / embed presentation (`@[card](...)`) is not implemented yet'

**Slice 5.0 着地時に短縮**(全削除はしない):
> 'Card widget excerpt + thumbnail + advanced variants(compact/wide/timeline)は未実装 — Slice 1-4(2026-04-25)で parser + renderer placeholder + click/keyboard wiring 着地、Slice 5.0(2026-04-XX)で minimal chrome(title + archetype badge + missing/cross-container 状態表示)着地'

**Slice 5.1 着地時に再短縮**: 'thumbnail + advanced variants は未実装'。
**Slice 6 着地時に削除**: Card は完成、Embed presentation 単独の Known limitation に分離(transclusion は別 surface)。

## 7. 推奨実装 slice — Slice 5.0 minimal chrome

**スコープ**:

1. `src/features/card/widget-presenter.ts`(NEW、~80-100 LOC、pure helper)
   - `buildCardWidget(target: string, container: Container): CardWidgetData | null`
   - parsed entry-ref → entry lookup → `{ kind, title, archetype, lid, status: 'ok'|'missing'|'cross-container'|'malformed' }` を返す
   - cross-container は `parsePortablePkcReference` で container_id を抜く
2. `src/features/markdown/markdown-render.ts`
   - placeholder の visible text を、可能な範囲で widget data 入りに差し替えるか、または **renderer 側は placeholder のまま emit**、`adapter/ui` 側で hydrate する 2 案。
   - **推奨**: **renderer は現行通り placeholder のみ emit**(同期 + container 不要)、新たに **`adapter/ui/card-hydrator.ts` を `adapter/ui/transclusion.ts` と同 pattern** で導入、render 後に DOM を walk して `.pkc-card-placeholder` を hydrate する。
3. `src/adapter/ui/card-hydrator.ts`(NEW、~80-100 LOC)
   - 既存 `transclusion.ts` の expander pattern を踏襲
   - placeholder element ごとに `data-pkc-card-target` を読み、`buildCardWidget` を呼んで chrome を生成、子要素を入れ替える
   - 失敗 / unknown は inert state へ
4. `src/styles/base.css`(+1.5〜2.5 KB)
   - `.pkc-card-widget`(block container)/ `.pkc-card-widget-title` / `.pkc-card-widget-badge` / 状態 modifier
   - dark / light theme awareness(既存 `--c-*` token を流用)
5. tests(+200 LOC)
   - hydrator unit tests(missing / cross-container / malformed / archetype 別 / variant ignore)
   - renderer-level boundary が壊れていないこと
6. Known limitations 短縮 + INDEX 追加 + bundle / release / manual rebuild

**1 PR で閉じられるか**: ✅(parser / click wiring は不変、新規 module 2 つ + CSS + tests + docs)

**arch risk**: 中(transclusion expander pattern を踏襲するので参考実装あり、新規 design は最小)

## 8. 評価軸まとめ

| 軸 | Slice 5.0 | 5.1 | 5.2 | 6 |
|---|---|---|---|---|
| ユーザー価値 | **高**(visible 化) | 中 | 中 | 中 |
| 中途半端さ解消 | **高** | 中 | 中 | 低 |
| CSS budget impact | 中(headroom ギリギリ) | budget bump リスク | budget bump 確定 | budget bump 確定 |
| XSS / markdown render risk | 低(plain text のみ) | 中(excerpt sanitize 注意) | 中(asset-resolver 再呼び) | 低 |
| action-binder integration | 不変(既存 click 経路を維持) | 不変 | 不変 | 不変 |
| Card / embed / transclusion 役割分担 | ✅(card = 要約 widget、transclusion = inline 展開、明確) | ✅ | ✅ | ✅ |
| future asset-card / thumbnail との整合 | ✅(parser reject 維持で entry-target 専用) | ✅ | △(thumbnail source は entry-internal asset 限定) | ✅ |
| 1 PR で閉じる | ✅ | ✅ | ⚠️(budget bump と一括の判断あり) | △(variant 4 種 + layout 差分は重い) |

## 9. 今回あえて触らなかった項目

- 実装(parser / renderer / action-binder / new modules)
- CSS / tests 変更
- `.pkc-card-placeholder` selector / data attribute contract(Slice 5.0 着地後も byte-for-byte 不変方針)
- Card / Color / Import-Export / clickable-image / Extension Capture
- schema / version / About / CHANGELOG / Known limitations 文言(現時点、Slice 5.0 着地時に短縮)
- variant の hover preview / popover(spec §5.2 で「必須化しない」と明記、Slice 6 でも optional)
- transclusion expander との統合(独立 module で進める方針)

## 10. 次の最小 follow-up(本 PR 範囲外)

1. **Slice 5.0 minimal chrome 実装 PR**(本 audit を canonical reference に、新規 `widget-presenter.ts` + `card-hydrator.ts` + CSS + tests + Known limitations 短縮 + manual 短文)
2. **CSS budget 状況確認**: Slice 5.0 着地後の bundle.css が 95+ KB なら、Slice 5.1 着手前に **budget bump PR**(PR #138 と同 pattern、96 → 98 KB)を docs-only で先行
3. **Slice 5.1 excerpt**: 5.0 の DOM / state が固まってから、archetype 別 excerpt builder を pure helper として追加
4. **Slice 5.2 thumbnail**: user feedback 後(実需が見えてから)
5. **Slice 6 variants**: 5.0 + 5.1 + 5.2 の chrome / data 経路が出揃ってから、layout 差分のみで実装

## 11. References

- `./INDEX.md` #170 / #171 / #178(Card Slice 1 / 2 / 4)
- `docs/spec/card-embed-presentation-v0.md` §5.2 / §5.3 / §5.4 / §6 / §7 / §13
- `docs/spec/pkc-link-unification-v0.md` §5.7.5 / §6
- `docs/development/card-asset-target-coordination-audit.md`(Option C — asset target を v0 future dialect)
- `docs/development/clickable-image-v2-decision-audit.md`(card と clickable-image の独立性)
- `src/features/link/card-presentation.ts`(parser + CardVariant 4 種)
- `src/features/markdown/markdown-render.ts` L395-415(placeholder emit)
- `src/styles/base.css` L6148-(focus-visible のみ存在)
- `src/adapter/ui/transclusion.ts`(hydrator 設計の参考)

---

**Status**: docs-only audit(2026-04-25)。Slice 5.0(minimal chrome)を即着手推奨、5.1 / 5.2 / 6 は段階的に着地。本 audit が canonical reference として機能、Slice 5.0 実装 PR は本 doc を起点に書く。
