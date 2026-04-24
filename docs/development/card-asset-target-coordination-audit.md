# Card / Asset target coordination — Slice-3 docs-first audit

## 1. Purpose / Status

**docs-only、実装ゼロ**。Card Slice-2(#171 / PR #131-#132)着地後に浮上した「`@[card](asset:<key>)` は renderer 層まで届かない」問題を、実装に踏み込む前に **4 選択肢で harbor 4 層評価して 1 つに絞る** ための audit。

- **Status**: **決定** — v0 では **Option C**(asset target は v0 future dialect として demote、canonical 対象から外す)。Slice-1 parser の asset 受理は spec の `❌ 非対応` と整合させるため次 slice で縮めるが、本 audit では実装しない
- **触らない**: asset-resolver 実装 / markdown-render 実装 / SAFE\_URL\_RE / card-presentation parser / card widget UI / action-binder / clickable-image / migration / paste / Copy / version / schema / About / CHANGELOG

## 2. Scope / Non-goals

**やること**:
- 4 選択肢の比較(Option A-D)
- Harbor 4 層(入港 / 定泊 / 出港 / 座礁回避)評価
- PR #131 / #132 の教訓記録
- 採用判断 + 実装時の最小 patch スケッチ(実装しない)

**やらないこと**:
- asset-resolver コード変更
- `SAFE_URL_RE` 再変更(PR #132 で asset: は **意図的に除外** 済み、本 audit で戻さない)
- card widget UI
- Slice-4 以降の着手

## 3. Problem statement

現 main の挙動:

```
@[card](asset:a1)   の markdown が編集中 body に含まれる
  ↓
asset-resolver.ts (markdown-it より前)
  ASSET_LINK_RE = /(^|[^!\\])\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g
  の group 1 `[^!\\]` が "@" に match → `[card](asset:a1)` を asset chip に書換え
  ↓
markdown-it が見る source は `@[📄 a1](#asset-a1)` 的な形
  ↓
card renderer hook の 4-token pattern に match せず → plain link rendering
```

結果:**renderer の card hook は `@[card](asset:...)` を実質見ない**。PR #132 で `SAFE_URL_RE` から `asset:` を除外したのは「direct render leak の再発防止」であり、`renderMarkdown` 直接呼び出し path でもなお asset target card は placeholder 化しない(boundary 5 tests が pin)。

## 4. PR #131 → #132 の教訓

1. **SAFE\_URL\_RE への `asset:` 追加は scope drift** — card placeholder の 4-token pattern を成立させるために allowlist を広げたが、同 allowlist は `[label](asset:key)` / `[](asset:key)` / `[![alt](asset:a)](asset:b)` の通常 asset ref にも作用し、direct renderMarkdown path で live `<a href="asset:…">` / `<img src="asset:…">` anchor が leak する regression を生んだ(PR #132 smoke で実測)
2. **validateLink は link だけでなく image src にも効く** — image 側の allowlist はあとで外すことができない、という気付き
3. **asset-resolver は single source of truth** — asset ref の生死は resolver が握る、という defensive default を崩すと副作用が予測しづらい
4. **実 pipeline では asset-resolver が先** — `[label](asset:key)` 系統は renderer に届く前に preprocess 済み、なので renderer 側で何かしても実 pipeline の挙動を変えるのは限定的
5. **5 boundary pin tests** — allowlist の silent flip を防ぐため、`asset target (Slice-2 boundary)` describe block で 5 件を pin(PR #132、現 main)

**結論**: asset: を renderer の allowlist に入れる方向は **NO**(Option D は再採用不可)。

## 5. Spec との整合確認

`docs/spec/card-embed-presentation-v0.md` を grep すると、asset target × card は **既に `❌ 非対応` として確定済み**:

- §5.4 target 別許容: `asset:<key>` | **❌ 非対応**(asset には card 相当の title / excerpt が無い、embed で十分) | `pkc-link-unification-v0.md` §6.4 と整合
- §8 target × presentation 許容表: `asset:<image-key>` card = **❌ 非対応**、`asset:<non-image-key>` card = **❌ 非対応**、`pkc://<self>/asset/<key>` card = **❌ 非対応**、`pkc://<other>/asset/<key>` card = **❌ 非対応**

つまり **spec レベルでは「card for asset は canonical ではない」が既に決まっている**。Slice-2 の renderer hook が asset target を見ないのは spec と整合している動作であり、**bug ではなく contract どおり**。

唯一の不整合: **Slice-1 parser(`parseCardPresentation`)が asset target を syntax レベルで受理している**。PR #170 の実装時点では spec §5.4 の `❌ 非対応` は presentation 判定であり、syntax-level では「構文として受け取れる」ことは問題ないと解釈していた(migration / scanner で asset target card を検出する余地を残すため)。

## 6. Option A: asset-resolver に `@[card]` skip guard を追加

**概要**:
- `ASSET_LINK_RE` の group 1 `(^|[^!\\])` を `(^|[^!\\@])` 相当に変更、または別ルートで `@[card...](asset:...)` を除外
- `@[card](asset:a1)` は asset-resolver で preprocess されず、そのまま markdown-it に到達
- ただし `SAFE_URL_RE` に `asset:` を戻さない限り validateLink で reject → card hook は 4-token を見ない

**実装規模**: `asset-resolver.ts` に 1-2 行の regex change + `extractAssetReferences` / orphan scanner との影響確認 + 新規 tests。

**問題**:
1. `SAFE_URL_RE` に `asset:` を戻さないと結局 card hook まで届かない → Option D の問題を引き戻すか、Option A と D を両方やることになる
2. Option A 単独では「asset-resolver が skip した asset: ref が markdown-it で plain text に落ちる」だけで、card placeholder は emit されない
3. asset-resolver の regex が `@` prefix を持つ asset ref を skip することで、**既存の orphan 検出(`extractAssetReferences`)** で `@[card](asset:a1)` の key が asset ref として集計されなくなる副作用 → orphan scanner 回帰のリスク
4. spec §5.4 が `❌ 非対応` と言っているものを、実装を回り道させて対応させる動機が弱い

**評価**: **NO**(単独では機能せず、D と組み合わせれば PR #131 の scope drift に戻る)

## 7. Option B: card extraction を asset-resolver より前に行う

**概要**:
- Markdown preprocess 層を 1 段増やす: `@[card](asset:...)` を **一時 sentinel**(例: `PKCCARD_<nonce>_<hash>`)に置換 → asset-resolver を通す → markdown-render で sentinel を placeholder HTML に復元
- 既存 `@[card](entry:...)` / `@[card](pkc://...)` 経路を sentinel 化するかは別判断(しないほうが layer 複雑度が低い)

**実装規模**: 新規 features / markdown/card-preprocess.ts + 呼び出し側 presenter(detail-presenter.ts L80 付近) + sentinel 復元 hook + nonce 生成 + 新規 tests(~100-200 行)。

**問題**:
1. **層順序を増やす** = markdown-it pre に 2 段(card-preprocess → asset-resolver → markdown-it)、エディタ preview で asset-resolver が呼ばれない path(detail-presenter.ts L137)との一貫性確保が必要
2. **sentinel 漏れ** = nonce を short にすれば衝突リスク、long にすれば paste/copy で `PKCCARD_…` が外部に漏れると出港時に壊れる
3. **renderer 側 sentinel 復元 hook 新設** = markdown-it の後処理で sentinel HTML 復元が必要、markdown-it の token API に載せると layer を超える
4. **Harbor 原則** = 入港 / 出港で sentinel が漏れないことを保証するのが難しい(出港の literal 化で PKCCARD_xxx が残りうる)
5. spec §5.4 が `❌ 非対応` と言っているものに層を 1 段足す ROI が合わない

**評価**: **NO**(ROI 不足、Harbor 座礁回避に新しい脆弱性を入れる)

## 8. Option C: `asset:` card を v0 future dialect に demote(= 現状維持)

**概要**:
- **spec §5.4 / §8 の `❌ 非対応` を正とする**: card target は **`entry:<lid>` / `pkc://<cid>/entry/<lid>`** のみ canonical
- asset target card は **future dialect**(`clickable-image-renderer-audit.md` と同格扱い)
- Slice-2 renderer の挙動(asset target を placeholder 化しない)は **contract どおり**、修正不要
- Slice-1 parser の `@[card](asset:a1)` 受理は spec と整合させるため **次 slice で narrow**(parse 時に asset target を reject、または `{ kind: 'future-dialect', reason: 'asset-target-not-canonical-in-v0' }` に分類) — **この audit では触らない**

**実装規模**: **ゼロ**(現状維持)。将来 parser narrow する場合でも `card-presentation.ts` の `isValidCardTarget` の asset ブランチを削除する 3-5 行の patch + boundary tests 3-5 件。

**メリット**:
1. spec が既に `❌ 非対応` と言っている方針を実装と揃えるだけ、思想的整合性が最高
2. asset-resolver / markdown-render / SAFE\_URL\_RE いずれも触らない、layer 複雑度増加ゼロ
3. PR #132 で pin した 5 boundary tests がそのまま「asset: card は emit しない」contract として機能
4. future dialect として残すので、後から asset preview card UI を入れる場合は clickable-image / asset-preview wave と一緒に再設計する余地がある
5. Harbor 4 層すべて ✅(現状維持のため regression ゼロ)

**デメリット**:
1. `[@card](asset:...)` を body に書いた user には「renderer で card にならず plain text に落ちる」という expectation gap(ただし spec §5.4 で `❌ 非対応` 既存、Slice-2 boundary 5 tests が明示)
2. asset preview card UX(title + archetype + thumbnail)をやりたければ別 slice で企画する必要

**評価**: **採用**。

## 9. Option D: SAFE\_URL\_RE に asset: を再導入し、renderer 側で明示処理

**概要**:
- PR #131 で 1 度実施 → PR #132 で revert。
- 再採用するには、`asset:` が link / image の両方で safe に振る舞う保証を renderer 側で加える必要(link\_open で `asset:` 検出 → card hook 外では live anchor を emit しない、image rule で `<img src="asset:">` を emit しない、等)

**実装規模**: `markdown-render.ts` link\_open / image rule に asset: 特化 handler + 5+ boundary tests + SAFE\_URL\_RE 再変更 + asset-resolver 呼び出し漏れ path(detail-presenter L137 等)の全洗い出し。

**問題**:
1. PR #132 で `asset:` を意図的に除外し `asset: is intentionally NOT on this allowlist` の根拠コメント + 5 boundary pin tests を入れたばかり、これを戻すと「なぜ戻した / 戻さないのか」の歴史が読みにくくなる
2. renderer 層で asset: を live anchor にしない guard を **実質 3 箇所**(link\_open / image rule / card hook)に入れる必要、Slice-1 の `single source of truth` 原則と衝突
3. 「asset-resolver が single source of truth」思想から外れる、layer 責務が曖昧になる
4. direct renderMarkdown path で asset resolve が走らない場合(preview、tests)の動作が実 pipeline と乖離する

**評価**: **NO**(PR #132 の決定を覆すだけのメリットがない、spec §5.4 とも不整合)

## 10. Harbor 4 層評価

| Option | 入港(paste-in) | 定泊(PKC 内) | 出港(export) | 座礁回避(unsafe / leak) | 総合 |
|--------|:--:|:--:|:--:|:--:|:--:|
| A(asset-resolver skip guard) | ⚠️ 単独では効かない、D 併用必要 | ⚠️ orphan scanner 回帰リスク | ⚠️ D 併用時に leak 復活 | ⚠️ D 併用すれば leak | **NO** |
| B(sentinel 前置き) | ⚠️ sentinel 衝突リスク | ❌ 新 layer、責務が割れる | ❌ PKCCARD_ 外部 leak | ❌ sentinel 漏れで新脆弱性 | **NO** |
| C(future dialect demote) | ✅ 現状維持、壊れない | ✅ spec §5.4 と整合 | ✅ asset: body に残らない(asset-resolver が resolve) | ✅ 5 boundary tests pin | **YES** |
| D(SAFE\_URL\_RE 再導入) | ✅ tokenise される | ❌ 3 箇所 guard 必要 | ✅ asset: literal 残存 | ❌ PR #131 regression 再燃リスク | **NO** |

**決定**: **Option C 採用**。

## 11. 採用方針

### 11.1 v0 契約(現状確定)

- **Card target は `entry:<lid>` / `entry:<lid>#<fragment>` / `pkc://<cid>/entry/<lid>` のみ canonical**
- **`asset:<key>` card は v0 future dialect**(canonical ではない、placeholder 化しない、silent drop でもない)
- **`pkc://<cid>/asset/<key>` card は v0 future dialect**(同上)
- spec `docs/spec/card-embed-presentation-v0.md` §5.4 / §8 の `❌ 非対応` が正、本 audit はこれを実装レベルで再確認

### 11.2 asset target card を `@[card](asset:a1)` と body に書いた場合の挙動(v0)

| 経路 | 挙動 |
|------|------|
| 実 pipeline(asset-resolver 経由) | asset-resolver が `[card](asset:a1)` 部分を asset chip(`[📄 a1](#asset-a1)`)に preprocess、`@` prefix は素通り、結果 `@[📄 a1](#asset-a1)` として通常 link rendering |
| direct renderMarkdown(preview / tests) | `SAFE_URL_RE` が asset: を reject → 4-token 未成立 → literal text `@[card](asset:a1)` 表示 |
| editor paste-conversion | presentation は保持(link→link / embed→embed / card→card)、target 書換のみなので asset target card は grammar としては入る |
| Copy link | External Permalink のまま、card 生成しない |
| Migration v1 | target 書換のみ、presentation 触らない(asset target card も触らない) |

### 11.3 Slice-1 parser の asset 受理 narrow(任意、別 slice)

現 `card-presentation.ts` の `isValidCardTarget`:
```ts
if (target.startsWith('asset:')) {
  return ASSET_KEY_RE.test(target.slice('asset:'.length));
}
```
これを spec §5.4 の `❌ 非対応` と整合させるなら、asset target は parse 時点で reject するのが素直。**本 audit では narrow しない**(後続 slice 判断、実装規模 3-5 行 + 既存 test 調整)。narrow しない場合の副作用は「future migration scanner 等で `parseCardPresentation('@[card](asset:a1)')` が成功 → target に `asset:` が入る」のみで、presentation 化しない以上は実害なし。

## 12. 実装に進む場合の最小 patch 範囲

**Option C は「現状維持」なので実装ゼロが正。**

もし Slice-1 parser narrow(§11.3)を follow-up で行う場合の最小 patch:

```
src/features/link/card-presentation.ts
  isValidCardTarget の asset ブランチを削除
  (asset: target を parse 時点で reject)
tests/features/link/card-presentation.test.ts
  既存 "parses asset target" を "rejects asset target (future dialect)" に差し替え
  "format asset target" 系も同様
docs/spec/card-embed-presentation-v0.md
  §5.3 (reservation) に「v0 では asset target は parser 受理しない」の 1 段落追加
  §13 Status table の asset 行を "spec: ❌ 非対応 / parser: reject from v0.2+" に更新(v0 は現実装維持でもよい)
```

patch 規模: **src 5 行 + tests 20-30 行差し替え + spec 1 段落**。**docs-first audit の結論が「実装しない」なのでここは参考情報**。

## 13. 必須 regression tests(実装する場合)

現 main に既に存在(PR #132 で pin 済み):

- `tests/features/markdown/card-render.test.ts` describe block `asset target (Slice-2 boundary)` 5 件
  - `@[card](asset:a1)` direct → card placeholder にならない
  - `[label](asset:a1)` → live `<a href="asset:">` emit しない
  - `[](asset:a1)` → 同上
  - `[![alt](asset:a1)](asset:b2)` → 外側 asset anchor 漏れなし
  - `![alt](asset:a1)` → `<img src="asset:">` emit しない

**Option C 採用では追加 test 不要**。parser narrow を行う場合は上記 §12 を参照。

## 14. Known limitations との整合

| 項目 | 現状 | 本 audit の影響 |
|------|------|------|
| About `Card / embed presentation is not implemented yet` | 残存 | **変わらない**(asset target を future dialect に降格しても card 全体は widget 未実装のまま) |
| CHANGELOG v2.1.1 Known limitations 同項目 | 残存 | 変わらない |
| `Clickable image syntax is not implemented` | 残存 | 変わらない(clickable-image は別 feature) |

Option C は「現状契約の再確認」なので **Known limitations は一切触らない**。Slice-5 以降で card widget UI が landing した時点で widget-side Known limitation の書換を再評価(asset target card を widget で扱うかは別判断)。

## 15. 今回あえて触らなかった項目

- `asset-resolver.ts` 実装変更(Option A で検討したが採用せず)
- `markdown-render.ts` 実装変更(Option B / D で検討したが採用せず)
- `SAFE_URL_RE` 変更(PR #132 の決定を維持、Option D は不採用)
- `card-presentation.ts` parser narrow(§11.3 / §12 に記録、本 audit では実装しない)
- card widget UI / thumbnail / excerpt / action-binder 連携
- transclusion 実装変更 / migration / paste / Copy
- clickable-image renderer support(`clickable-image-renderer-audit.md` の別 slice)
- Color tag Slice 2-4
- Import / Export
- version / schema / About / CHANGELOG

## 16. 次の最小 follow-up PR 提案

1. **(推奨)現状維持で Card wave を一旦 close**、別 wave(Color Slice 2 / clickable-image audit 続編 / Import-Export cleanup)に移る
2. **Card Slice-1 parser asset narrow**(任意、§11.3):3-5 行 src + tests 差し替え、spec に 1 段落追加。asset target の受理が将来 migration scanner で誤検出を生むリスクを回避したい場合
3. **Card Slice-4: click wiring**(asset 問題とは独立): `data-pkc-card-target` → 既存 `navigate-entry-ref` / `navigate-asset-ref` に dispatch、widget UI なし
4. **Card Slice-5: widget UI 実装**(最小 chrome = title + archetype badge、thumbnail / excerpt は別 slice)

推奨は (1) で一度 wave を閉じる。Card wave はここまでで `@[card](entry:...)` / `@[card](pkc://...)` の placeholder 化まで進んでおり、次の UX 判断(widget UI を作るか、先に click wiring か、そもそも pause するか)は統括役判断に委ねる。

## References

- `docs/spec/card-embed-presentation-v0.md` — card presentation v0 契約
- `docs/spec/pkc-link-unification-v0.md` — target grammar
- `docs/development/clickable-image-renderer-audit.md` — 同構造の future dialect audit(参考)
- `src/features/markdown/asset-resolver.ts` — asset ref preprocess、`ASSET_LINK_RE` の `[^!\\]` prefix
- `src/features/markdown/markdown-render.ts` — `SAFE_URL_RE` / `pkc-card` core rule
- `src/features/link/card-presentation.ts` — Slice-1 parser helper
- `tests/features/markdown/card-render.test.ts` — Slice-2 renderer tests + asset boundary 5 tests
- `docs/development/INDEX.md` #169 / #170 / #171 — Card wave 履歴
- PR #131(asset: 追加、merge 済み)/ PR #132(asset: revert、merge 済み)— 本 audit の前提