# PKC Multi-Window Architecture

Status: VISION
Created: 2026-04-12
Category: D. Long-Term Vision

---

## 1. 短い結論

PKC2 を「複数 window（tab / popup / frame）が協調動作する system」として再設計する方向性。
現在の entry window 機構を土台に、任意数の window が同じ container を共有・同期できる model に拡張する。

---

## 2. 背景 / 問題

現状：

- main window が source of truth
- entry window（dblclick 起動）は document.write injection による limited child
- 複数 window 間での state sync 機構は最小限

長期的には「1 つの PKC2 を複数 window で同時に使う」が自然な使い方になる：

- main window: container overview
- entry window A: 特定 entry 編集
- entry window B: 別 entry の preview
- monitor window: log / search / TOC 専用

---

## 3. ユーザ価値

- マルチディスプレイで作業を並列化できる
- 特定 view を常時表示できる（TOC / calendar / search）
- 編集と参照を物理的に分離できる
- 作業コンテキストを window 単位で保持できる

---

## 4. 最小スコープ（vision 段階）

- window 間通信の protocol を定義（postMessage 経由）
- 各 window が同じ container state を subscribe できる
- 変更は main / shared dispatcher 経由で一本化
- window 種別（editor / viewer / monitor）の role 分離
- window が閉じても container に影響しない isolation

---

## 5. やらないこと

- 独立プロセス / worker 化（browser 制約）
- 別 container を跨ぐ synchronization
- OS-native window management
- 書き込み競合の楽観的 merge（conflict-free データ構造まで踏み込まない）
- 真の multi-user 同期（D-3 WebRTC 側の責務）

---

## 6. 設計の方向性

- dispatcher を window 間 shared にするか、main dispatcher に proxy する
- state snapshot は structured clone 経由で broadcast
- window role は query string / init message で指定
- adapter 層に `WindowBus` 抽象を新設（postMessage を wrap）
- core / features は変更なし（pure のため）

---

## 7. リスク / 未確定事項

- sandbox policy との整合（strict / relaxed の切り分け）
- ブラウザ tab 間同期の信頼性（BroadcastChannel vs postMessage）
- state の partial update / conflict resolution
- window の race condition（起動順序依存）
- memory overhead（複数 window が同じ container を保持）

---

## 8. 将来拡張の余地

- D-1 message externalization の transport 共通化
- D-3 WebRTC P2P の local window 層として活用
- window role の拡張（plugin / devtools window）
- window layout の保存 / 復元
- session 毎の multi-window preset
