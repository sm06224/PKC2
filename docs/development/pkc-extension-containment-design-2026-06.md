# PKC-Extension 封じ込め設計 — sandbox opaque origin と信頼 2 層モデル(2026-06-11)

**Status**: 設計 doc(#796)。**§7 の PR-1〜3 相当は実装済み(2026-06-12)**: `pkc-ext` チャネル(`extension-channel.ts`)が Tier S sandbox を既定で実装、graph 含む全拡張起動経路が直接切替済み(normative は v2 spec §3.8)。残 = PR-4(Tier T 明示同意 UI)+ §4.2 capability 語彙の拡充。前提だったトランスポート基盤(#795)は着地済み。
**Issues**: #796(封じ込めモデル)/ #795(transport 監査 — 基盤側)/ #791(graph channel v2、パイロットと同一書き換え)/ #773(sandbox iframe workspace)
**user 決定(2026-06-11)**: ① load 機構は sandbox 一本化ではなく **2 層**(same-origin で動かしたいアプリの席を残す)② capability manifest 採用 ③ graph をパイロット第 1 号、**PKC-Extension を名乗るものは封じ込め準拠を原則** ④ 着手順は**トランスポート(基盤)先行**

---

## 1. 動機(#796 本文の要約)

現行の拡張起動(`window.open('') + document.write`)は子を**ホストと同一オリジン**で実行する。インストール済み拡張は PKC-Message を経由せずホスト DOM / IndexedDB(container 本体)/ localStorage / 全 JS グローバルへ直接到達できる。nonce + identity + origin 検証が守るのは「第三者ウィンドウのなりすまし」だけで、**拡張コード自身はインストール時点で全権委任**。PKC-Message はセキュリティ境界ではなく行儀作法に留まっている。

封じ込めの狙い: 拡張を `<iframe sandbox="allow-scripts">`(**`allow-same-origin` なし**)+ `srcdoc` で load し opaque origin 化 → ホスト資産へ構造的に到達不能 → **postMessage(= PKC-Message)を唯一の通路**にする。

## 2. 信頼 2 層モデル(user 決定 ① を反映)

sandbox 一本化はしない。**「same-origin で動かしたいアプリもある」**(user 2026-06-11)ため、層を明示して使い分ける:

| | **Tier S — sandboxed(既定)** | **Tier T — trusted same-origin(明示 opt-in)** |
|---|---|---|
| load | `<iframe sandbox="allow-scripts" srcdoc=...>`(+ manifest 宣言分の allow トークン) | 現行どおり `window.open + document.write` / 同一オリジン iframe |
| origin | opaque(`"null"`) | `location.origin` |
| ホスト資産 | **到達不能**(DOM / IDB / localStorage / globals) | 到達可能 = **全権委任** |
| チャネル判定 | **identity + nonce のみ**(§3) | identity + nonce + origin 検証(現行) |
| 想定 | **PKC-Extension を名乗るもの全部(原則)** | same-origin 前提のアプリ(`registered_as_app` 系 / sandbox で成立しない要件) |
| user への提示 | 宣言 capability の一覧 | **「このアプリはコンテナ全体にアクセスできます」級の明示同意** |

- **既定は Tier S**。manifest 未宣言の拡張は Tier S 最小(`allow-scripts` のみ)で load する。
- Tier T は逃げ道であって既定にしない。launcher 上も両者を視覚的に区別する(設計のみ、UI 実装は go 後)。
- graph 拡張ほか「PKC-Extension」として配布するものは **Tier S 準拠を原則**とする(user 決定 ③)。

## 3. チャネル形成 — opaque origin での判定(#796 コメント「primitive」準拠)

チャネル成立の 3 要素(parent/opener 到達性・偽造不能な `event.source` identity・per-launch nonce)は**すべて origin 非依存**。sandbox が剥ぐのは same-origin 特権であってチャネル形成要素ではない。

| 判定要素 | Tier T(現行) | Tier S(封じ込め) |
|---|---|---|
| `event.origin === location.origin` | 維持 | **捨てる**(opaque で自滅するため) |
| `event.source` identity | 維持 | **維持**(偽造不能の錨) |
| per-launch nonce(v2 では host 発行 `source_id`) | 維持 | **維持** |
| 送信 `targetOrigin` | exact origin(#795 A-1) | `'*'`(identity が宛先を一意化。srcdoc で内容固定の子に別 document が居座る経路はない) |

該当コード: ホスト `graph-extension-launcher.ts` と子 `PKC2-Extensions/graph/src/protocol.ts` の origin 一致 reject を「**opaque のときは identity + nonce のみで判定**」へ落とす。#791 の v2 統合(host 設計 doc §6 段階 2/3)と**同一の書き換え**であり、両対応の検証前段を共通化する。

## 4. Capability manifest(user 決定 ② — 採用)

「インストール = 全権委任」を「**インストール = 宣言された能力集合 + postMessage**」へ変える肝。

### 4.1 宣言(AttachmentBody additive、schema 不変)

```ts
// AttachmentBody への additive field(案)
extension_manifest?: {
  tier?: 'sandboxed' | 'trusted';      // 既定 'sandboxed'
  capabilities?: string[];             // 下表の語彙。既定 []
}
```

### 4.2 capability → sandbox/allow トークン写像(初版語彙・案)

| capability | ホストが付与するもの | 備考 |
|---|---|---|
| `downloads` | `sandbox` に `allow-downloads` | F カテゴリ(ビューア)系で必須 |
| `popups` | `allow-popups` | 外部リンクを新窓で開く拡張 |
| `forms` | `allow-forms` | フォーム送信 UI |
| `clipboard-write` | iframe `allow="clipboard-write"` | コピー機能 |
| `fullscreen` | `allow="fullscreen"` | ビューア全画面 |
| (storage) | **トークンなし** | opaque では localStorage 不可(§5)。永続化はホスト経由 API(将来、transport 基盤側)で提供 |

- 未知 capability はホストが**無視 + user 提示時に警告**(additive / forward 互換)。
- `tier: 'trusted'` の宣言は capability 列挙より重い同意 UI を要求する(§2)。
- OQ-4 `extensionGrants`(v2.2)との関係: **manifest = 拡張側の「要求」、grant = user 承認の「記録」**。承認結果を `Container.meta.extensionGrants` に記録する設計は decision doc OQ-4 を踏襲し、封じ込め実装 go 時に統合する(D4: asset 由来拡張の auto-grant は引き続き保留)。

## 5. 劣化と contract(Tier S で変わるもの)

| 能力 | Tier S での挙動 | contract |
|---|---|---|
| localStorage / sessionStorage | partitioned または例外(browser 依存) | 拡張は**永続化をホストに頼る**(将来の `pkc.kv.*` 等、transport 基盤側で設計)。それまで「Tier S 拡張は再起動で状態を失う」を spec に明記 |
| download | 既定ブロック | `downloads` capability 宣言必須 |
| `window.open` | 既定ブロック | `popups` 宣言必須 |
| alert / prompt | 不可 | ホスト UI に依頼する method(将来)か自前 DOM |
| 高解像度 timer 等 | 制限あり | 影響軽微 |

## 6. Graph パイロット(user 決定 ③)

- graph 拡張は **projection 専用(read API / asset 不要)**のため、Tier S 化しても機能が痩せない — 封じ込めの検証第 1 号に最適。
- 作業内容(実装 go 後): (a) launcher の load を srcdoc + sandbox へ(classic IIFE は srcdoc で動作)(b) ホスト/子の origin 判定を §3 の identity+nonce 判定へ(c) `?pkc-safe-mode` / autostart / retry prompt の不変条件は維持。
- **検証**: PKC2-Extension 側ツール(A1 probe / A2 validator / C1 / F7 — wire 上 opaque 耐性あり、`tools/shared/host-link.ts`)を検証艦隊として使い、実ブラウザで (1) sandbox opaque でのハンドシェイク成立 (2) download ブロック (3) localStorage 不可 (4) ホスト IDB 到達不能、を確認する(監査側はブラウザ無し環境のため**実機検証は PKC2 側の責務**)。

## 7. 実装しない宣言と PR 分割(go 後の参考)

本書は設計のみ。go 後: PR-1 = チャネル判定の opaque 対応(§3、#791 段階 2 と共通)→ PR-2 = manifest parse + sandbox load 経路(Tier S)→ PR-3 = graph パイロット切替 + 実機検証 + parity smoke → PR-4 = Tier T の明示同意 UI。各 PR は bundle 中立〜微増(manifest parse 分)。

## 8. 着手順(user 決定 ④ — 基盤先行)

> **決定(2026-06-11)**: 「先に基盤側、つまりトランスポート」。

1. **先: transport 基盤** — #795 設計群の実装 go(B-1 観測 seam → A-3 fail-closed → A-4 rate/size)+ **read / asset 取得経路の設計**(SR-15。封じ込め下で F カテゴリ拡張が機能するための前提 API)+ v2 gate 一貫性
2. **後: 封じ込め(#796)実装** — 基盤の上に Tier S load + manifest + graph パイロット

封じ込めだけ先行すると F カテゴリ(添付ビューア)系拡張が asset を読めず機能不能になる(申し送り §6 のトレードオフ)— 基盤先行はこれを回避する。順序が入れ替わる(境界が緩いまま API が広がる)リスクは、**「PKC-Extension は Tier S 準拠が原則」を spec/manifest 既定で先に立てる**(本書)ことで抑える。

## 9. Open questions(実装 go 時に確認)

- capabilities 語彙の確定(§4.2 は初版案)と Tier T 同意 UI の文言
- D2(同一オリジン= Tier T への heartbeat 必須)/ D4(asset 由来拡張の auto-grant)— host 設計 doc §9 から継続
- Tier S 拡張の永続化 API(`pkc.kv.*` 等)を transport 基盤のどの段で入れるか

## 関連

- [#796 本文 + コメント「チャネル形成の primitive」](https://github.com/sm06224/PKC2/issues/796)(設計根拠)
- [`pkc-extensions-host-design-2026-06.md`](./pkc-extensions-host-design-2026-06.md)(host 設計、#772)
- [`transport-hardening-and-observability-design-2026-06.md`](./transport-hardening-and-observability-design-2026-06.md)(基盤側 #795)
- [`../spec/pkc-message-api-v2.md`](../spec/pkc-message-api-v2.md)(v2 spec、§3 Host→Extension channel)
- INDEX: [`INDEX.md`](./INDEX.md)
