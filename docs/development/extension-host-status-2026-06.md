# PKC-Extension host-push 体系 — 実装棚卸し(2026-06-13)

**Status**: 🟢 棚卸しスナップショット(2026-06-13 時点の実装状況の正本)
**役割**: 2026-06-10〜13 の transport 監査 → host-push 体系 → 封じ込め → graph 切替の
一連(PR #793〜#824)を 1 枚に棚卸しし、**実装済み / 将来(未実装・凍結)** の境界を
固定する。normative spec は `docs/spec/pkc-message-api-v2.md` §3.8(本書は状況記録)。
**live tracking は GitHub Issues が正本**(方針正本 §5)— 本書の「将来」欄は issue へ
リンクする台帳であり、ここで管理はしない。

---

## §1 全体像(何ができたか、1 段落)

「インストール = 全権委任」だった拡張モデルを「**既定 = 構造的封じ込め(sandbox
opaque origin)、既定露出 = projection(index/統計)のみ、実体はユーザーの送付
ジェスチャでのみ流れ、書き戻しは host 検証付き、全権は宣言 + 毎起動の明示同意**」へ
転換した。North Star(方針正本 §4-2「ランチャー + PKC-Extensions に多機能を退避」)の
Extension host が**設計から実装まで完了**し、graph 拡張が第 1 実装として全面移行済み。

## §2 着地一覧(2026-06-10〜13、すべて main)

| 領域 | 内容 | PR | 正本 doc |
|---|---|---|---|
| transport 基盤 | onTraffic 観測 seam / fail-closed allowedOrigins / flood guards(#795 B-1/A-3/A-4) | #807–#809 | v1 spec §3.4/§3.5/§13 |
| offer 拡充 | correlation_id + record:ack/accept(#804)/ tags・color_tag(#805)/ mime_type・filename(SR-14) | #810/#811/#814 | v1 spec §7、capture profile §8.7-8.8 |
| targetOrigin 規律 | 全送信 `pinTargetOrigin`(#797 規則)、entry-window 含む | #803 ほか | v1 spec §3 |
| **host-push wire** | `pkc-ext` チャネル(hello/projection/deliver/selected/write/write-result/hint)+ deliver buffering | #815–#819, #820 | **v2 spec §3.8(normative)** |
| 送付導線 UI | 右クリック「拡張へ送る」/ 紐付け(右クリック + カード checkbox)/ 既定送り先(📌 + ⚙ Extensions section)/ 添付カード「🧩 ○○で開く」 | #820, #824 | manual §13.1.5-6 |
| **封じ込め(#796 PR-1〜4)** | Tier S sandbox 既定(opaque origin、identity+nonce gate)/ `extension_manifest`(tier/capabilities → トークン写像)/ Tier T 毎起動同意ダイアログ | #821, #822 | v2 spec §3.8、containment doc |
| graph 切替 | bespoke `pkc-graph-ext` v1 **削除**(互換切り捨て)、graph を pkc-ext + Tier S へ全面移植、ミニマップ修理 + viewport 矩形 | #821, #823 | `PKC2-Extensions/graph/src/protocol.ts`(child 参照実装)|
| 運用バグ修正 | handshake 前 deliver 黙殺 / 同意ダイアログ z-index 占有 / **window 閉鎖後に再起動不能** | #820/#822/#824 | — |
| doc / manual | マニュアル §10(グラフ拡張化)・§13(PKC-Extension / 送付導線)全面改訂、CI audit gate を prod deps に限定 | #823, #824 | manual、ci.yml 注記 |

**検証資産**(実ブラウザ parity smoke、Tier-B 回帰網):
`send-to-extension-parity`(右クリック送付 + カード「○○で開く」docx 再現)/
`extension-sandbox-parity`(opaque handshake / storage・IDB 遮断 / 再起動)/
`extension-trust-consent-parity`(全権 / 降格 / キャンセル)/
`graph-extension-pkc-ext-parity`(実物 graph の接続・描画・選択追従)。

## §3 信頼モデル(確定形の要約)

| tier | opt-in | 受け取る / できる |
|---|---|---|
| T0 起動 viewer | ユーザーが起動 | projection のみ(graph が該当)|
| T1 紐付け受信 | カード checkbox / 右クリックで紐付け | + 送付された実体(deliver)|
| T2 io権 | (現状 T1 と同一 gate)| + 検証付き write(update-body/move/relate)|
| Tier T trusted | manifest 宣言 + **毎起動の明示同意** | same-origin 全権 |

> 注: T1/T2 の分離(write 可否を紐付けと別 grant にする)は未実装 — 現状 write は
> channel を張れた拡張なら要求でき、host が op 検証 + readonly guard で守る。
> 分離の必要が立証されたら #826 で扱う。

## §4 将来(未実装、issue 台帳)

| 項目 | 状態 | 行き先 |
|---|---|---|
| capability 語彙拡充(現行 5 種)/ OQ-4 `extensionGrants` 永続 grant / Tier S 永続化 API(`pkc.kv.*`)/ `accepts` 宛先絞り込み / T1・T2 grant 分離 | 必要が立証されたら | **#826**(backlog)|
| vite 6→8 major bump(esbuild advisory の恒久対応。暫定 = audit gate `--omit=dev`)| 別 wave 判断 | **#827** |
| OPFS adapter / workspace 分離(North Star 残り)| 設計のみ・凍結継続 | #771 / #773 |
| 機能追加バックログ全般 | 凍結 | #776 |

## §5 関連 issue の処置(2026-06-13)

実装完了により close: **#791**(graph 統合 — pkc-ext 直接切替で達成、v2/JSON-RPC 統合
ではなく専用チャネル化に設計変更)/ **#796**(封じ込め PR-1〜4)/ **#804** / **#805** /
**#806**(host-push 体系として全着地 + 拡張側通達済)。

## §6 #830 host hook 申し送りの着地(2026-06-15)

拡張側からの追加申し送り #830(host 側 8 hook)を順次着地。いずれも既存
projection / write チャネル(v2 §3.8)への additive で、新 archetype / UI mode は
足していない。normative は v2 spec §3.8。

| 項目 | 内容 | PR |
|---|---|---|
| R1 | projection に todo 派生メタ(status/date/archived、description 非露出)| #831 |
| R2 | `set-todo-status` write op(host が description 保全)| #832 |
| R5 + R6 | `propose` で create 解禁(既存 record:offer 同意 banner 再利用)+ Tier S 境界に v1 record:offer が届かない gap の恒久解 | #833 |
| R3 / R7 | `rename` / `unfile` write op | #834 |
| R4 | 既存 soft-delete/restore trash を開放(新 trash 概念を作らず再利用、purge=hard delete は host-only)| #835 |
| R8 | 孤児アセット可視化(projection `orphanAssets`)+ `purge-orphan-assets`(既存 PURGE_ORPHAN_ASSETS 再利用、per-key hard delete は非新設)| #836 |

## 関連

- [`../spec/pkc-message-api-v2.md`](../spec/pkc-message-api-v2.md) §3.8(wire normative)
- [`pkc-extension-containment-design-2026-06.md`](./pkc-extension-containment-design-2026-06.md)(封じ込め設計、実装済注記あり)
- [`asset-access-and-consent-design-2026-06.md`](./asset-access-and-consent-design-2026-06.md)(host-push rev.2 設計)
- [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)(方針正本)
- INDEX: [`INDEX.md`](./INDEX.md)
