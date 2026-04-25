# Clickable-Image v2 Decision Audit — 2026-04-25

## 1. Purpose / Status

**docs-only、実装ゼロ**。`docs/development/clickable-image-renderer-audit.md`(#158、2026-04-24)の続編。Card Slice 1-4(#170 / #171 / #178)着地と PR #131 → #132(`asset:` allowlist 一時投入と revert)の経緯を踏まえ、**clickable-image を実装に進めるか / future のまま置くか / どの条件で進めるか** を再判定する。

- **Status**: **決定 — Option B+(下記 §6)を採用**
- **触らない**: `src/features/markdown/markdown-render.ts` / `src/features/markdown/asset-resolver.ts` / `src/adapter/ui/action-binder.ts` / `SAFE_URL_RE` / 既存 tests / migration scanner / dist rebuild / version / schema / About / CHANGELOG

参照(本書を読む順序):

1. `./clickable-image-renderer-audit.md`(2026-04-24、#158)— 11-form syntax matrix と Harbor 4 層の航路図を確定した先行 audit
2. `./card-asset-target-coordination-audit.md`(Slice-3 audit)— PR #131 → #132 の教訓「`asset:` を `SAFE_URL_RE` に戻さない」
3. `../spec/pkc-link-unification-v0.md` §5.7.5 — Future dialect reservations
4. `../spec/card-embed-presentation-v0.md` §7 — clickable-image vs card の責務分離

## 2. Scope / Non-goals

- やること: 8 target combination の **empirical 再 probe**、Option A-E 比較、Harbor 4 層評価、採用判断、spec/INDEX cross-link
- やらないこと: 実装、SAFE_URL_RE 変更、asset-resolver 拡張、Slice-1 parser 変更、新 tests、migration v2 spec の最終化

## 3. 現 main の事実(2026-04-25 時点、empirical 確認済み)

```ts
// src/features/markdown/markdown-render.ts:92
SAFE_URL_RE = /^(https?:|mailto:|tel:|ftp:|entry:|pkc:|#|\/|\.\/|\.\.\/|[^:]*$)/i;
//   asset: は **意図的に未登録**(L78-91 のコメントブロックで根拠固定)
```

```ts
// src/features/markdown/asset-resolver.ts:81
ASSET_LINK_RE = /(^|[^!\\])\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g
//   `[^\]]*` は内側 `]` を跨げないため、clickable-image nest の **外側** `[...](asset:k)` は match しない
```

PR #132 で 5 件の boundary pin tests(`tests/features/markdown/card-render.test.ts` の `asset target (Slice-2 boundary)` describe)が「`asset:` を allowlist に戻したら気付ける」guard として常駐。

## 4. 8 target combination empirical probe(2026-04-25)

`renderMarkdown(resolveAssetReferences(src, ctx))` を直接呼んで実 pipeline と同条件で観察した結果。✅=動く / ⚠️=動くが semantic 注意 / ❌=literal 漏れ。

| # | 入力 | 現 main 挙動 | 評価 |
|---|------|-------------|------|
| 1 | `[![alt](asset:a1)](asset:a1)` | inner→data URI、outer `(asset:a1)` 残存 → validateLink reject → `<p>[<img>](asset:a1)</p>` の **literal 漏れ** | ❌(broken) |
| 2 | `[![alt](asset:a1)](entry:lid)` | inner→data URI、outer entry: は allowlist → `<a data-pkc-action="navigate-entry-ref" href="entry:lid"><img src="data:..."></a>` | ✅(clickable thumbnail to entry) |
| 3 | `[![alt](entry:lid1)](entry:lid2)` | inner=transclusion placeholder、outer=`<a navigate-entry-ref>` → `<a><div class="pkc-transclusion-placeholder"></div></a>`(block-in-inline)| ⚠️(動くが HTML semantic NG、#158 §6.5) |
| 4 | `[![badge](https://...svg)](https://github.com/x)` | 標準 CommonMark で `<a target="_blank"><img></a>` | ✅(README badge、現状で完全動作) |
| 5 | `[![alt](asset:a1)](https://...page)` | inner→data URI、outer http: → `<a target="_blank"><img src="data:..."></a>` | ✅(asset thumbnail to external) |
| 6 | `[![alt](https://...img)](entry:lid)` | inner=img、outer=`<a navigate-entry-ref>` → `<a><img src="https://..."></a>` | ✅(external thumbnail to internal entry) |
| 7 | `[![alt](asset:a1)](pkc://self/entry/lid)` | inner→data URI、outer=`pkc-portable-reference-placeholder` badge(現 renderer は same/cross 区別せず badge 化) | ⚠️(動くが same-container demote 未対応) |
| 8 | `[![alt](asset:a1)](pkc://other/entry/lid)` | inner→data URI、outer=`pkc-portable-reference-placeholder` cross-container badge | ✅(意図どおり cross-container badge) |

**重要発見**: **5/8 combination は現 main で完全動作、1/8 が semantic 注意付きで動作、1/8 が same-container demote 未対応で動作、1/8(`asset:` outer)のみ broken**。#158 audit が「全面実装が必要」と整理した版より状況は良い ━ 既に **大半が canonical として通っている**。

## 5. Option 比較(本 prompt の A-E + 評価)

| Option | 内容 | 必要変更 | 現 main 状態との差分 | 採否 |
|--------|------|---------|---------------------|------|
| **A** future のまま継続 | 5.7.5 reservation 維持、何もしない | ゼロ | 大半が動いている事実が spec に反映されない、user が混乱 | △ 不採用(現実と spec のズレを温存) |
| **B** external URL clickable-image のみ正式 ack | spec §5.7.5 を「現実に動いている form」と「未対応 form」に整理 | docs only | 現 main の挙動と spec を整合 | ✅ **基盤** |
| **C** asset image → entry link のみ(case 2) | docs ack のみ(既に動く) | ゼロ(動作実証済) | spec で canonical として認知 | ✅ **B に併合** |
| **D** asset image → asset link(case 1) | `SAFE_URL_RE` 拡張 + asset-resolver pass 0 + action-binder asset: handler の **3 点同時** | src 200+ LOC + tests 400+ LOC | PR #131 で revert 済み、`asset-resolver = single source of truth` を崩す | ❌ 不採用(再リスク) |
| **E** renderer / resolver 前処理を追加して全面対応 | D + case 3 block-in-inline 解決 + same-container pkc:// demote | src 400+ LOC + tests 600+ LOC + spec 改訂 | PR #131 規模、Card / Color wave に並ぶ独立 wave 必要 | ❌ 本 audit では不採用(将来 v2 wave) |

## 6. 採用判断 — Option B+ ハイブリッド

**採用**: **B + C をまとめて「**現 main の動作を spec で canonical 化**」、D / E は future v2 wave**。

### 6.1 canonical(現状で動く、spec に明記)

- `[![<alt>](https://...img)](https://...url)`(case 4) — 標準 README badge
- `[![<alt>](asset:<key>)](entry:<lid>[#frag])`(case 2) — asset thumbnail to internal entry
- `[![<alt>](https://...img)](entry:<lid>[#frag])`(case 6) — external thumbnail to internal entry
- `[![<alt>](asset:<key>)](https://...url)`(case 5) — asset thumbnail to external
- `[![<alt>](asset:<key>)](pkc://<other>/entry/<lid>)`(case 8) — asset thumbnail with cross-container badge

### 6.2 partial(動くが注意点あり、spec に注記)

- `[![<alt>](entry:<lid1>)](entry:<lid2>)`(case 3) — block-in-inline。**v0 では新規 emit しない**、reader 側の tolerance に依存
- `[![<alt>](asset:<key>)](pkc://<self>/entry/<lid>)`(case 7) — same-container badge は demote 未対応、case 2 形を推奨

### 6.3 future v2(現 main で broken、実装前に進めない)

- `[![<alt>](asset:<key>)](asset:<key>)`(case 1) — `SAFE_URL_RE` への asset: 追加 + asset-resolver pass 0 + action-binder asset: handler の **3 点が同時 land** が必要条件。PR #131 の regression(image src への波及)を再発させない設計 envelope が必須。本 audit では実装に進まず、独立 wave で再評価

### 6.4 永久 invalid

- `[![]](<target>)` — #158 §6.6 の判定維持、do-not-emit

## 7. Harbor 4 層評価

| form | 入港 | 定泊 | 出港 | 座礁回避 |
|------|------|------|------|----------|
| 6.1 全 5 種 | ✅(現 main で resolver/render が処理) | ✅(canonical として safe) | ✅(標準 CommonMark でも valid) | ✅(asset: のみ完全に書換 / 他は標準互換) |
| 6.2 case 3 | ⚠️(paste で来る、render で動く) | ⚠️(block-in-inline)| ✅ | ✅ |
| 6.2 case 7 | ✅(動く) | ⚠️(same-container demote 未対応 = case 2 で書く方が UX 良) | ✅ | ✅ |
| 6.3 case 1 | ❌(asset: outer reject) | ❌(literal 漏れ) | △(外部 reader 想定では動く) | ❌ |
| 6.4 `[![]]` | ❌ | ❌ | ❌ | ❌ |

## 8. Card / embed / transclusion との役割分担

| presentation | 記法 | 用途 | 本 audit の影響 |
|---|---|---|---|
| Card | `@[card](entry:<lid>)` | block preview | clickable-image とは別軸、影響なし |
| Image embed | `![<alt>](asset:<key>)` | inline image | clickable-image は **画像 + click 動作** の 2 mean、image embed は static |
| Transclusion | `![<alt>](entry:<lid>)` | block 展開 | case 3(clickable transclusion)は v0 では新規 emit しない |
| **Link** | `[<label>](entry:<lid>)` / `[<label>](asset:<key>)` | inline anchor | clickable-image は link の image-label variant |
| **Clickable-image** | 6.1 の 5 form | image を click できる thumbnail | **本 audit で canonical 化 ack** |

## 9. 次の最小 follow-up(本 PR に含めない、後続 wave 候補)

1. **spec 整合 PR(s 軽量)**: `docs/spec/pkc-link-unification-v0.md` §5.7.5 を「6.1 canonical / 6.2 partial / 6.3 future v2 / 6.4 invalid」の構造に書換、`docs/spec/card-embed-presentation-v0.md` §7 から本 audit を cross-link
2. **manual 短文追加(任意)**: `docs/manual/05_日常操作.md` に「画像をクリック可能にする」節追加(case 4 / 6 / 2 を例示)
3. **future v2 wave(別 PR、本 audit の決定範囲外)**: case 1 を実装する設計 envelope を `clickable-image-v2-implementation-spec.md` で固める(asset: re-allowlist + pass 0 + action-binder の 3 点同時、PR #131 regression guard を tests で固定)

## 10. 今回あえて触らなかった項目

- 実装(`SAFE_URL_RE` / `asset-resolver` / `action-binder` / image rule / link_open rule)
- 既存 tests(card-render boundary 5 件、migration scanner v1 / v2 future 等は不変)
- migration scanner v2 spec の最終化(case 2 / 6 への opt-in promotion candidate は本 audit で言及のみ、spec は future)
- card widget UI / Color Slice 5 / Import-Export
- version / schema / About / CHANGELOG / Known limitations

## 11. References

- `./clickable-image-renderer-audit.md`(#158、2026-04-24)— 先行 audit、11-form matrix
- `./card-asset-target-coordination-audit.md` — PR #131 → #132 教訓
- `./INDEX.md` — 本 audit は #180 として記録
- `../spec/pkc-link-unification-v0.md` §5.7.5
- `../spec/card-embed-presentation-v0.md` §7
- `src/features/markdown/markdown-render.ts` L78-92(SAFE_URL_RE と asset: 除外コメント)
- `src/features/markdown/asset-resolver.ts` L81(ASSET_LINK_RE)
- `tests/features/markdown/card-render.test.ts` L242-(asset target Slice-2 boundary 5 件)

---

**Status**: docs-only audit(2026-04-25)。Option B+ 採用 ━ 現 main で動いている 5 form を spec で canonical 化、broken 1 form は future v2 wave で envelope 設計してから実装。本 PR では新 doc 1 本追加 + INDEX 1 entry + spec 2 本に短い cross-link を当てるのみ。
