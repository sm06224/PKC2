# 14. 基盤方針追補 — clone / embed / sandbox / message contract

単一HTMLの複製・埋め込み・通信に関する契約を定義する。

---

## 14.1 clone 契約

### 14.1.1 clone の種類（requirements Ch.14 より）

| 種類 | 複製対象 | 用途 |
|------|---------|------|
| **完全 clone** | records + relations + revisions + assets + meta | バックアップ、アーカイブ |
| **構造 clone** | フォルダ構造 + タグ構造 + 空テンプレートrecords | 類似案件の立ち上げ |
| **空 clone** | コードのみ。データは空コンテナ | 新規コンテナ作成 |

### 14.1.2 clone 生成の手順

```
1. 現在の HTML document を取得
2. pkc-core / pkc-styles / pkc-theme をそのまま複製
3. pkc-meta を複製 + clone メタデータ追記
4. pkc-data を clone 種別に応じて生成
   - 完全: 全データをシリアライズ
   - 構造: structural/categorical relations + folder/tag records のみ
   - 空:   空コンテナ JSON
5. 新しい container_id を発行
6. HTML 文字列を組み立て、Blob URL 経由でダウンロード
```

### 14.1.3 clone 同型性の保証

clone 後の HTML は以下を満たす:

- **コード同一性**: `pkc-core` が clone 元と byte-identical
- **契約同一性**: `pkc-meta.schema` が同一 → 同じ rehydrate で動作
- **独立性**: 新しい `container_id` を持ち、元とは独立したコンテナ
- **integrity 検証可能**: `pkc-meta.code_integrity` で元との一致を確認可能

---

## 14.2 embed 契約（iframe 埋め込み）

### 14.2.1 埋め込みモデル

PKC2 HTML は別の HTML から iframe で埋め込み可能:

```html
<!-- 親ページ -->
<iframe
  id="pkc-embed"
  src="pkc2.html"
  sandbox="allow-scripts allow-same-origin"
  style="width:100%;height:600px;border:none;">
</iframe>
```

### 14.2.2 sandbox 主権原則

> **PKC2 は自身のサンドボックス内で完全に自己完結して動作する。**
> **親ページの JS / CSS / DOM は PKC2 に影響を与えない。**

これを実現するための設計:

1. **CSS スコープ**: PKC2 の全 CSS は `#pkc-root` 配下にスコープ（`:where(#pkc-root)` 等）
2. **JS スコープ**: IIFE で閉じる。グローバル変数を作らない
3. **iframe sandbox**: `allow-scripts allow-same-origin` のみ。`allow-top-navigation` なし
4. **データアクセス**: 親ページは PKC2 の IDB / localStorage に直接アクセスしない

### 14.2.3 standalone / embedded の検出

PKC2 はランタイムで自身が standalone か embedded かを検出する:

```typescript
// src/runtime/sandbox.ts
export function isEmbedded(): boolean {
  try { return window.self !== window.top; }
  catch { return true; } // cross-origin iframe
}
```

embedded 時の挙動差:
- ファイルダウンロード → 親に postMessage で通知（親がダウンロード処理）
- フルスクリーン → 無効化
- PKC-Message → 親との通信を有効化

---

## 14.3 PKC-Message 契約

### 14.3.1 目的

PKC2 HTML 同士、または PKC2 と親ページが非同期メッセージングを行うための
最小プロトコルを定義する。

### 14.3.2 最小 envelope

```typescript
// src/core/model/message.ts  ← core に置く（プロトコル定義は外部依存なし）
interface PKCMessage {
  /** プロトコル識別子。固定値 */
  protocol: 'pkc-message';
  /** プロトコルバージョン */
  version: 1;
  /** メッセージ種別 */
  type: PKCMessageType;
  /** 送信元 container_id（null = 非PKCの親ページ） */
  source_id: string | null;
  /** 宛先 container_id（null = broadcast） */
  target_id: string | null;
  /** メッセージ固有のペイロード */
  payload: unknown;
  /** 送信時刻 ISO 8601 */
  timestamp: string;
}

type PKCMessageType =
  | 'ping'           // 生存確認
  | 'pong'           // 生存応答
  | 'record:offer'   // Record の提供（import 提案）
  | 'record:accept'  // Record の受理通知
  | 'export:request' // export 要求（親→PKC）
  | 'export:result'  // export 結果（PKC→親）
  | 'navigate'       // 画面遷移指示
  | 'custom';        // 拡張用
```

### 14.3.3 通信経路

```
[PKC2-A (iframe)] ←→ [Parent Page] ←→ [PKC2-B (iframe)]
         ↑                  ↑                  ↑
     postMessage        postMessage        postMessage
```

- iframe ↔ 親: `window.parent.postMessage()` / `iframe.contentWindow.postMessage()`
- PKC2 ↔ PKC2: 親ページが中継する（直接通信は same-origin 制約で不可能な場合がある）

### 14.3.4 セキュリティ

- `origin` 検証: メッセージ受信時に `event.origin` を検証
- `protocol` 検証: `event.data.protocol === 'pkc-message'` でフィルタ
- ペイロードサイズ上限: 受信側で制限（初期値: 1MB）
- レート制限: 受信側で制限（初期値: 100msg/秒）

### 14.3.5 初期実装スコープ

Phase 1 では PKC-Message は **型定義のみ**。
実装は Phase 2 以降で、以下の順序:

1. `ping` / `pong`（生存確認）
2. `export:request` / `export:result`（親からの export 指示）
3. `record:offer` / `record:accept`（Record の移送）

---

## 14.4 各契約の Phase 対応

| 契約 | Phase 0 | Phase 1 | Phase 2 |
|------|---------|---------|---------|
| clone（空） | — | ✅ 実装 | — |
| clone（完全） | — | — | ✅ 実装 |
| clone（構造） | — | — | ✅ 実装 |
| embed（iframe） | — | — | ✅ 実装 |
| sandbox 検出 | — | ✅ 実装 | — |
| PKC-Message | ✅ 型定義 | — | ✅ 実装 |
