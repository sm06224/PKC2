# Issue #10: PKC-Message Transport — message contract の最小骨格

## 目的

PKC-Message の最小 transport を実装し、
単一 HTML 内または埋め込み先との message 送受信の最小骨格を作る。
フル機能の通信ではなく、message contract / handler / bridge の責務境界を一度閉じること。

## 設計方針

### transport の位置づけ

```
src/adapter/transport/
├── envelope.ts        # envelope 検証（pure、browser API 不要）
└── message-bridge.ts  # postMessage bridge（browser API 使用）
```

- **adapter 層に配置**: browser API (postMessage, window event) を使用するため
- **core 汚染禁止維持**: MessageEnvelope 型定義は core/model に既存、transport は adapter
- envelope.ts は pure function（テスト容易）
- message-bridge.ts は DOM/window 依存

### MessageEnvelope と internal action の関係

```
外部 postMessage
  ↓
window 'message' event
  ↓
isPkcMessage() — quick filter (非PKCメッセージはスキップ)
  ↓
validateEnvelope() — full validation (reject reasons 付き)
  ↓
target_id filter — 自分宛てまたは broadcast のみ受信
  ↓
┌── ping → auto-respond with pong (bridge-internal)
└── other → onMessage callback (将来: SystemCommand dispatch)
```

**重要**: MessageEnvelope は UserAction / SystemCommand / DomainEvent のいずれでもない。
外部プロトコルであり、内部システムとは Message Handler を介して接続する。

### transport の最小 API

```typescript
// Mount
const handle = mountMessageBridge({
  containerId: 'container-id',
  allowedOrigins: ['http://trusted.example'],  // optional
  onMessage: (envelope, origin) => { ... },    // validated messages
  onReject: (data, reason) => { ... },         // rejected messages
});

// Send
handle.sender.send(targetWindow, 'ping', null, targetId, targetOrigin);

// Cleanup
handle.destroy();
```

## envelope 検証項目

| 項目 | 検証内容 | Reject code |
|------|---------|-------------|
| Data shape | object であること | `NOT_OBJECT` |
| Protocol | `'pkc-message'` であること | `WRONG_PROTOCOL` |
| Version | `1` であること | `WRONG_VERSION` |
| Type 存在 | string であること | `MISSING_TYPE` |
| Type 値 | 既知の MessageType であること | `INVALID_TYPE` |
| Timestamp | string であること | `MISSING_TIMESTAMP` |
| Origin | allowedOrigins に含まれること（設定時） | bridge-level reject |
| Target | target_id が local container_id と一致、または null | bridge-level skip |

## MessageEnvelope → SystemCommand 変換方針

### 今回実装済み

| Message type | 処理 | SystemCommand |
|-------------|------|---------------|
| `ping` | bridge が自動で pong を返す | なし（bridge-internal） |
| `pong` | onMessage callback に委譲 | なし（informational） |

### 今回は未実装（将来の対応表）

| Message type | 想定する SystemCommand | 備考 |
|-------------|----------------------|------|
| `export:request` | `BEGIN_EXPORT` → export → `export:result` 送信 | export フロー統合が必要 |
| `record:offer` | `SYS_IMPORT_COMPLETE` | import フロー統合が必要 |
| `record:accept` | informational | 送信側の確認 |
| `navigate` | 将来の画面遷移命令 | UI routing が必要 |
| `custom` | onMessage callback | アプリ固有の拡張 |

## reject / error handling 方針

- 非PKCメッセージ: 無視（reject callback も呼ばない）
- 不正なPKCメッセージ: `onReject` callback + `console.warn`
- 他コンテナ宛: 無視（reject callback も呼ばない）
- origin 不正: `onReject` callback
- 全 reject に reason 文字列付き

## source_id / target_id / correlation_id の最小運用

| 項目 | 今回の運用 |
|------|----------|
| source_id | 送信時に local container_id を自動設定 |
| target_id | 送信時に指定可能、null = broadcast |
| target_id filter | 受信時に local container_id と一致チェック |
| correlation_id | 未実装（将来: request/response ペアリング用） |

## 追加/変更ファイル一覧

### 新規
| ファイル | 役割 |
|---------|------|
| `src/adapter/transport/envelope.ts` | envelope 検証 |
| `src/adapter/transport/message-bridge.ts` | postMessage bridge + sender |
| `tests/adapter/transport/envelope.test.ts` | envelope 検証テスト |
| `tests/adapter/transport/message-bridge.test.ts` | bridge テスト |
| `docs/planning/24_message_transport.md` | 本設計ドキュメント |

### 変更
| ファイル | 変更内容 |
|---------|---------|
| `src/main.ts` | bridge mount wiring |
| `docs/planning/00_index.md` | 目次追加 |

## テスト内容

### envelope.test.ts (15 tests)
- 有効な ping envelope の受理
- 全既知 message type の受理
- null / 非 object の拒否
- 不正 protocol の拒否
- 不正 version の拒否
- type 欠落の拒否
- unknown type の拒否
- timestamp 欠落の拒否
- 複数エラーの収集
- payload 付き envelope の受理
- target_id 付き envelope の受理
- isPkcMessage の判定
- formatRejectReasons のフォーマット

### message-bridge.test.ts (15 tests)
- buildEnvelope の生成
- bridge の mount/destroy
- 非PKCメッセージの無視
- 不正PKCメッセージの reject
- ping → pong 自動応答
- ping が onMessage に渡らないこと
- non-ping メッセージの onMessage 委譲
- pong の onMessage 委譲
- target_id filter（他コンテナ宛を無視）
- target_id filter（自コンテナ宛を受理）
- broadcast (target_id = null) の受理
- origin 制限での拒否
- origin 制限での受理
- destroy 後のメッセージ無視
- sender の send API

## 今回あえて入れなかったもの

| 項目 | 理由 | 将来の優先度 |
|------|------|------------|
| export:request/result | export フローとの統合が必要 | 高 |
| record:offer/accept | import フローとの統合が必要 | 高 |
| navigate | UI routing が未実装 | 中 |
| capability negotiation | ping/pong の上位プロトコル | 中 |
| correlation_id | request/response ペアリング | 中 |
| rate limiting | DoS 防御 | 低（Phase 2+） |
| payload size limit | メモリ防御 | 低（Phase 2+） |
| embed/sandbox detection | `isEmbedded()` 判定 | 中 |
| message queue / retry | 信頼性 | 低 |
| cross-origin restriction | production security | 中 |

## 次セッションで引き継ぐべき残課題

### 最優先
1. **export:request / export:result** — 親ページからの export 指令を message で受け取り、結果を返す
2. **record:offer / record:accept** — Container 間のレコード転送
3. **embed detection** — `isEmbedded()` による standalone/embedded の判定と挙動分岐

### 中優先
4. **capability negotiation** — ping/pong の拡張として、capabilities 交換
5. **correlation_id** — request/response ペアリング
6. **navigate handler** — メッセージによる画面遷移指令

### 低優先
7. **rate limiting / size limit** — 防御的制約
8. **message queue / retry** — 信頼性向上

### アーキテクチャ上の注意点
- MessageEnvelope → SystemCommand の変換は、message handler 層で行う
- bridge は transport のみ、business logic は handler に委譲
- handler は dispatcher.dispatch() を呼ぶことで reducer に接続
- 将来 handler が増えた場合、handler registry パターンを検討

## 現在の PKC2 全体到達点

Issue #1〜#10 の完了により、以下が成立:

| 層 | 到達状態 |
|---|---------|
| core | model + action contract + pure operations |
| adapter/state | AppPhase 状態機械 + pure reducer + dispatcher |
| adapter/ui | renderer + action-binder + event-log |
| adapter/platform | IDB persistence + exporter + importer |
| adapter/transport | message bridge + envelope validation |
| runtime | release metadata + meta reader + SLOT contract |
| builder | Stage 2 release builder |
| build | Stage 1 (Vite) + Stage 2 分離 |
| tests | 170+ tests, typecheck, lint 全通過 |
| docs | 24 planning documents |

**不変条件**（次セッション必読）:
- Stage 1 / Stage 2 build 分離
- 5層構造 (core/adapter/feature/runtime/builder)
- core 汚染禁止
- AppPhase 状態機械
- fixed ID contract (pkc-root, pkc-data, pkc-meta, pkc-core, pkc-styles, pkc-theme)
- `data-pkc-*` minify-safe DOM 契約
- Renderer / ActionBinder / EventLog の責務分離
- container-ops は pure core operation
- persistence は passive DomainEvent listener
- release meta は builder 生成 / runtime 読取
- export は runtime exporter (DOM 読取 + Blob download)
- import は DOMParser + strict validation + full replace
- MessageEnvelope は外部プロトコル（内部 action と混同しない）
