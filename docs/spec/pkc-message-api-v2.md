# PKC-Message API v2 — Specification (Draft)

**Status**: Draft — **stage 1**(2026-06-10、#772 host 設計 doc §6 段階 1 / user 承認「spec のみ・コード不変」)
**本版で normative なのは §3(Host→Extension channel)のみ**。他章は decision doc の確定事項を骨子として予約し、PR-α(v2 spec 本起こし)で詳細化する。
**Audience**: PKC-Extension implementers(別リポジトリでの拡張研究を含む)、PKC2 contributors
**Normative cross-spec**:
- `docs/spec/pkc-message-api-v1.md`(v1 envelope。v2 と並列稼働)
- `docs/development/pkc-message-v2-open-questions-decisions-2026-05.md`(OQ-1〜5 decision、本 spec の根拠)
- `docs/development/pkc-extensions-host-design-2026-06.md`(host 設計、#772/#791)

**Source-of-truth implementation**:
- `src/core/model/message-v2.ts`(JSON-RPC 2.0 envelope 型 + `pkc.heartbeat`)
- `src/adapter/transport/envelope-v2.ts` / `heartbeat-handler-v2.ts` / `message-bridge.ts`(v1/v2 discriminate)
- `src/adapter/ui/graph-extension-launcher.ts` ↔ `PKC2-Extensions/graph/src/protocol.ts`(§3 の前例 = bespoke `pkc-graph-ext` v1)

---

## 1. Purpose / 章構成

PKC-Message v2 は wire を **JSON-RPC 2.0** に全面移行する(prior-art 調査の結論)。v1 独自 envelope は互換 fallback として並列稼働し、受信側は `jsonrpc: '2.0'` field の有無で discriminate する(実装済: `message-bridge.ts`)。

| 章 | 内容 | 本版の状態 |
|---|---|---|
| §2 | Envelope / handshake / heartbeat(v2.0 minimum) | 骨子のみ(decision doc 確定事項の写し)|
| §3 | **Host→Extension channel** | **normative(stage 1)** |
| §4 | Versioning / v1 互換 | normative(短) |
| §5 | Tasks / ACL / delta / Elicitation | 予約(v2.1+、decision doc 参照) |

## 2. Envelope / handshake / heartbeat(骨子、PR-α で詳細化)

- Envelope は JSON-RPC 2.0 の request / notification / response(success|error)4 形態(`src/core/model/message-v2.ts` の型が当面の正)。
- `source_id`: host が `initialize` 時に sender ごとに発行する UUID v4。以後 sender の全 message が carry し、host は `(source_id, id)` 複合 key で correlation / dedupe する(OQ-2)。sender 側 claim は不可(spoofing 防止)。
- heartbeat: sender は `serverCapabilities.heartbeat { intervalMs, toleranceMs }`(default 15000/5000)に従い `$/heartbeat` notification を送る義務。timeout で host は sender を inactive 扱い(OQ-1)。opt-out は無い。
- error code: JSON-RPC 標準 5 種 + PKC 固有 `-32000..-32099`(`-32099 sender_inactive` / `-32098 duplicate_id` 確定済、全表は PR-α)。
- method 命名は dot-separated(`record.offer` 形)。

## 3. Host→Extension channel(normative)

**PKC-Extension** = `container.assets` 内の単一 HTML(`AttachmentBody.pkc_extension === true`)として配布され、host PKC2 が起動して双方向通信する拡張。v1 spec が扱った「外部 sender → host」と逆向きの **host 起動・host 主導 push** を本章で定義する。前例実装は graph 拡張(#790)の bespoke channel `pkc-graph-ext` v1(§3.7)。

### 3.1 実行モデル

- 拡張本体は **classic IIFE の単一 HTML** でなければならない(MUST)。`type="module"` script は `document.write` 注入で動作しない browser があるため不可。
- host は次のいずれかで起動する:
  - **window モード**(user gesture 起点): `window.open('')` + `document.write`
  - **iframe overlay モード**(boot autostart、popup ブロック回避): about:blank iframe の `contentWindow.document` へ write
- どちらも child は **host と同一オリジン**になる。これが §3.3 の origin / window-identity 検証の前提(MUST)。
- autostart の popup がブロックされた場合、host は**画面を乗っ取る fallback をしてはならない**(MUST NOT)。retry prompt 等の非侵襲 UI のみ許す。`?pkc-safe-mode=1` で autostart を必ず無効化できること(MUST)。

### 3.2 Handshake(bespoke v1 → v2 写像)

| bespoke `pkc-graph-ext` v1 | v2 正式形 | 方向 |
|---|---|---|
| `hello` | `initialize` request | child→host |
| `welcome {nonce, projection}` | `initialize` response `{ source_id, serverCapabilities, …初期 payload }` | host→child |
| `select {nonce, lid}` | `pkc.entry.select` notification | child→host |
| `projection {nonce, …}` | `ext.projection.update` notification | host→child |

- per-launch **nonce の役割は `source_id` が兼ねる**: host が launch ごとに発行し、child は以後の全 message に carry、host は不一致を破棄する(MUST)。
- `initialize` の受理条件は §3.3 の検証 2 点(window identity + origin)を**すべて**満たすこと(MUST)。

### 3.3 セキュリティ不変条件(MUST、v1 bespoke から弱めない)

1. **Window identity バインド**: host は `event.source === childWin / iframe.contentWindow` の時のみ受理する。
2. **Origin 検証**: `event.origin === location.origin` を要求する。`file://`(origin `"null"`)では `postMessage` の targetOrigin に `'*'` fallback を許すが、その場合も 1 と 3 で担保する。
3. **Per-launch secret**: `source_id`(launch ごとに host 発行)を全 message で検証する。
4. **データ最小化**: host→child に送るのは **projection(必要最小限のメタ)のみ**。entry `body` / `assets`(base64)/ `revisions` を送ってはならない(MUST NOT)。前例: `src/features/graph-extension/projection.ts` の `GraphProjection`。

### 3.4 Method catalog(host↔extension v0)

| 方向 | method | 形態 | 意味 / host 側写像 |
|---|---|---|---|
| child→host | `initialize` | request | handshake(§3.2) |
| child→host | `$/heartbeat` | notification | §3.5 |
| child→host | `pkc.entry.select` | notification | `SELECT_ENTRY` |
| child→host | `pkc.entry.open` | notification | `SELECT_ENTRY {revealInSidebar}` + host 前面化 |
| child→host | `pkc.entry.moveToFolder` | request | 検証済み move(cycle guard 含む)。result = 成否 |
| child→host | `pkc.relation.create` | request | 検証済み relate。result = 成否 |
| host→child | `ext.projection.update` | notification | container 変化時の push |
| host→child | `ext.selected.update` | notification | host 側選択の追従 |

- **書き込み系は必ず request**(成否を返す。host は全入力を検証し、無効入力は安全な no-op + error response とする。MUST)。読み push は notification。
- 将来枠(凍結中、catalog 名のみ予約): `pkc.ast.*`(IR を拡張に渡す機構、roadmap 10-5)。

### 3.5 Heartbeat の適用

同一オリジン拡張にも `$/heartbeat` を適用する(OQ-1 の opt-out 不許可に従う)。導入は v2 移行(host 設計 doc §6 段階 2 以降)と同時でよい。child window close を host が検知できない問題への解を兼ねる。

> 注: D2(host 設計 doc §9)は実装 go まで保留中。本節は OQ-1 decision をそのまま適用した場合の normative 案であり、実装着手時に D2 の確認を要する。

### 3.6 Trust / ACL との関係

container 内 asset 由来・同一オリジンの拡張は、外部 origin の sender(v1 spec の主対象)と信頼レベルが異なる。`Container.meta.extensionGrants`(OQ-4、v2.2)への接続 — 特に asset 由来拡張への `granted_by:'auto'` 暗黙 grant の可否(D4)— は実装 go まで保留。本版では §3.4 の catalog を超える method を host が拒否すること(MUST)のみ定める。

### 3.7 Legacy: bespoke `pkc-graph-ext` v1(deprecated 予定)

- graph 拡張(#790)が使用中の bespoke channel。v2 ではない独自 message 形(`hello` / `welcome` / `select` / `projection` + `PKC_GRAPH_V = 1`)。
- **host は v1 bespoke と v2 envelope を両受理する**(`jsonrpc: '2.0'` の有無で discriminate)。§3.3 のセキュリティ検証は両経路共通の前段で行う(MUST)。
- 既に asset として配布済みの旧拡張 HTML は v1 経路で動作し続けなければならない(後方互換 invariant 5、MUST)。deprecation の期限は定めない(v2 拡張の普及後に別途判断)。

## 4. Versioning / v1 互換

- v1 envelope(7-fields 平坦)と v2(JSON-RPC 2.0)は**並列稼働**。受信側は `jsonrpc` field で discriminate する(実装済)。
- v2 内の変更は additive。breaking change は v3 bump。
- v1 の deprecation timeline は prior-art doc §7 の段階(v2.0 beta → v2.1 stable → v2.2 v1 deprecated → v3 retired)を踏襲するが、日付は確定しない。

## 5. 予約章(v2.1+、本版では定義しない)

| 機能 | phase | 根拠 decision |
|---|---|---|
| Tasks(memory-only、volatile 宣言) | v2.1 | OQ-3 |
| per-method ACL(`extensionGrants`、schema 2→3 migration) | v2.2 | OQ-4 |
| `record.offer.delta`(preview-only) | v2.2 | OQ-5 |
| Elicitation(reverse RPC)/ subscription registry | v2.x | prior-art doc |
| `record.live` / 永続 Tasks | v3+ | OQ-3/5 |

---

## 関連

- v1 spec: [`pkc-message-api-v1.md`](./pkc-message-api-v1.md)
- decision doc: [`../development/pkc-message-v2-open-questions-decisions-2026-05.md`](../development/pkc-message-v2-open-questions-decisions-2026-05.md)
- host 設計: [`../development/pkc-extensions-host-design-2026-06.md`](../development/pkc-extensions-host-design-2026-06.md)
- prior-art: [`../development/pkc-message-v2-prior-art-and-plan-2026-04-26.md`](../development/pkc-message-v2-prior-art-and-plan-2026-04-26.md)
