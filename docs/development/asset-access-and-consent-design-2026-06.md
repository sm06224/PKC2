# asset 経路 + 統合 consent モデル 設計 — #806 × #796(2026-06-11)

**Status**: 設計 doc。**実装はプライム・ディレクティブ下で凍結 — go は user 判断**(順序判断は user が C 案を採用済み 2026-06-11)
**Issues**: #806(asset 経路 — SR-13/14/15)/ #796(封じ込め — capability manifest)/ #795(transport 基盤、着地済み)/ 別 repo `PKC2-Extension` SR-13/14/15・F カテゴリ・壁 #80
**前提 doc**: `pkc-extension-containment-design-2026-06.md`(#796 信頼 2 層 + manifest)/ `pkc-message-api-v1.md` §6(storage boundary)/ `pkc-message-api-v2.md` §3(host↔extension)

---

## 0. この doc の位置づけ

#806(asset 経路)と #796(封じ込め)は **consent モデルを共有する**ため、user 決定(C 案 = 同時設計・統合実装)に従い**1 枚に統合**して設計する。本書は実装 go の判断材料であり、コードは書かない。

主務 = **「asset 読み取り(SR-15)の consent を、#796 の capability manifest と二段で統合する」**ことの設計。

## 1. 解く問題(実証済みブロッカー)

v1 には asset に触れる経路が両方向とも無い(`pkc-message-api-v1.md` §6.1/§6.3):

- **書き**: offer への asset 同送は §6.3 で意図的禁止 → asset 付き attachment offer は中身が空
- **読み**: 任意 entry/asset の read API 無し(`export:request` は container 全文一括のみ)

結果: `PKC2-Extension` の **F カテゴリ全 10 ツール(email/docx/pptx/xlsx/pdf ビューア等)+ B12 screenshot-attacher が機能不能**(壁 #80)。

## 2. 三層の consent モデル(統合の核心)

asset 読み取りは機微(base64 全文 = `export:result` 級)。**3 層で守る**:

```
層1: 封じ込め(#796)      — 拡張は postMessage しか持たない(opaque sandbox or 同一オリジン Tier T)
層2: capability manifest  — 拡張が要る能力を install 時宣言、host が grant を決定(静的)
層3: per-request 同意      — asset key ごとの banner(動的)、同一拡張×同一 key は session grant 持続
```

### 2.1 なぜ二段(manifest + per-request)か

- **manifest だけ**(#796 単独)= install 時に `asset-read` を一括許可 → 「install = 広い権限」へ逆戻り(粒度が粗い)
- **per-request だけ**(SR-15 単独案 (a))= 高頻度 read でも毎回 banner → banner 疲れ → 無思考 accept に堕ちる
- **二段** = manifest で**能力の有無**を絞り(未宣言拡張は asset:request を即 reject)、per-request で**個別の同意**を取る(同一 key 再読は session grant で抑制)。静的 gate × 動的 consent の積。

## 3. capability manifest(#796 §4 と統合)

`AttachmentBody` に additive(schema 不変、§9.2 互換):

```ts
interface ExtensionManifest {
  /** 信頼層(#796): 'sandbox'(opaque、既定) | 'trusted'(same-origin、全権・明示 opt-in)。 */
  tier?: 'sandbox' | 'trusted';
  /** 要求能力。host が sandbox/allow トークン + PKC-Message method 許可へ写像。 */
  capabilities?: ExtensionCapability[];
}
type ExtensionCapability =
  | 'asset-read'        // asset:request を送れる(本 doc の主対象)
  | 'entry-write'       // moveToFolder / relation.create(既存 graph 拡張が暗黙に使用)
  | 'downloads'         // sandbox allow-downloads
  | 'clipboard-write'
  | 'popups';
```

- **`asset-read` 未宣言の拡張が `asset:request` を送ったら host は即 reject**(per-request banner すら出さない)。manifest = 能力の門。
- Tier T(trusted same-origin)拡張は manifest なしでも従来どおり全権(後方互換)。Tier S(sandbox)が capabilities の主対象。
- grant の永続化は #796 の `Container.meta.extensionGrants`(OQ-4)に乗せる。

## 4. asset 読み経路 wire(SR-15、設計)

### 4.1 method(v1 additive、新 type 2 つ)

| type | 方向 | payload |
|---|---|---|
| `asset:request` | extension → host | `{ asset_key: string, correlation_id?: string }` |
| `asset:result` | host → extension | `{ asset_key, mime?, filename?, data_base64, correlation_id? }` |
| `asset:reject` | host → extension | `{ asset_key, reason: 'denied'\|'not-found'\|'no-capability', correlation_id? }` |

`correlation_id` は #804 で確立した相関トークンを流用。

### 4.2 host 側フロー(consent gate)

```
asset:request 受信
  → ① flood guard(#795 A-4: サイズ・rate)
  → ② origin / identity 検証(#795 A-3 / #797)
  → ③ manifest gate: 送信元拡張が 'asset-read' 宣言済みか?
        未宣言 → asset:reject{ reason: 'no-capability' }
  → ④ session grant 確認: (extension_id, asset_key) が許可済みか?
        済 → ⑥へ
  → ⑤ per-request 同意 banner(PendingOffer 同型の「asset 提供」UI):
        「拡張 X が asset <key>(<filename>, <mime>, <size>)を要求しています [許可] [拒否]」
        許可 → session grant に (extension_id, asset_key) を記録 → ⑥
        拒否 → asset:reject{ reason: 'denied' }
  → ⑥ asset 取得 → asset:result{ data_base64, mime, filename }(targetOrigin pin 必須)
```

### 4.3 `asset:result` の安全条件(MUST)

1. **targetOrigin pin**: `pinTargetOrigin(受信時 origin)`(#797)。base64 全文 = `export:result` 級の機微 payload。応答先は受信時 window + origin に固定
2. **観測**: B-1 `onTraffic`(#807、着地済み)で request/result/reject ともメタデータ観測。**payload preview の redaction(spec §Observability)で base64 は自動伏字** — asset 往復こそ redaction の主対象
3. **size / chunking**: asset は MB 級。`asset:result` の単発上限 + chunking(別 repo SR-09)の要否は**本 doc では言及のみ**(実装設計で詰める)。A-4 の受信粗サイズ上限は inbound 用なので outbound `asset:result` には別途上限が要る

## 5. SR-13(attachment offer)/ SR-14(mime/filename)

- **SR-14(`record:offer` に `mime_type` / `filename`)= 純 additive、consent 非依存** → **#805 と同じ小物枠で先行 go 可能**(本 doc の凍結とは独立)
- **SR-13(attachment offer 規約)= asset 書き方向 = §6.3 境界変更** → SR-15 と同じテーブル(本 doc 内)。asset を伴う attachment offer の form(offer に asset_key + 別経路 asset 送付 or インライン許可)は実装設計で詰める

## 6. パイロット順(C 案)

1. **graph 拡張(#791)** — asset 不要(projection のみ)。封じ込め(Tier S 化 + manifest `entry-write`)と origin 判定改修(identity+nonce)を**先に検証**。asset 経路を一切使わないので consent UI 抜きで sandbox 化を実機確認できる
2. **F6 pdf-viewer 等の単純ケース** — `asset-read` manifest + 単一 asset の per-request consent を最小構成で検証
3. F カテゴリ全体 → B12 screenshot-attacher(asset 書き = SR-13)

## 7. 実装順の提案(go 後、各独立 PR)

1. **SR-14**(mime/filename additive)— consent 非依存、即着手可
2. **capability manifest の型 + gate**(#796 §4)— asset gate の前提
3. **asset:request/result/reject + per-request consent banner**(SR-15)
4. **graph パイロットの Tier S 化**(#791 + #796)— manifest `entry-write` で実証
5. **SR-13**(attachment 書き)— 最後(境界が最も深い)

## 8. 判断事項(user 確認待ち)

- **D-806-1**: 三層 consent モデル(封じ込め × manifest × per-request)+ 二段(manifest gate + session grant 付き per-request)で確定してよいか
- **D-806-2**: SR-14(mime/filename)を本凍結から外して #805 枠で先行実装してよいか
- **D-806-3**: パイロット順(graph → F6 → F全体 → B12)で良いか
- **D-806-4**: `asset:result` の単発 size 上限の提案値(例: 8 MiB)と chunking の要否判断を実装設計まで保留してよいか
- **D-806-5**: 各 PR の実装 go(順序 §7)を出すタイミング(一括 / 段階)

## 関連

- 封じ込め: [`pkc-extension-containment-design-2026-06.md`](./pkc-extension-containment-design-2026-06.md)
- transport 基盤: [`transport-hardening-and-observability-design-2026-06.md`](./transport-hardening-and-observability-design-2026-06.md)
- v1 spec §6(storage boundary)/ v2 spec §3
- INDEX: [`INDEX.md`](./INDEX.md)
