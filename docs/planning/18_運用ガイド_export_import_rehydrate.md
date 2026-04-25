# PKC2 運用ガイド — Export / Import / Rehydrate

本文書は PKC2 の保存・可搬機能の**利用手順と判断基準**を整理するものです。

- 設計の根拠 → `17_保存再水和可搬モデル.md`（設計文書）
- 操作の仕方 → **本文書**（利用ガイド）

この2つは役割が異なります。設計を変えたい場合は 17 番文書を参照し、
使い方を知りたい場合は本文書を参照してください。

---

## 1. PKC2 の基本的な使い方

### 日常作業（Workspace）

PKC2 をブラウザで開くと、Workspace として動作します。

1. エントリを作成する（Note / Todo / Form / File）
2. 編集する（タイトル・本文・添付ファイル）
3. 自動保存される（IndexedDB に 300ms debounce で保存）
4. ブラウザを閉じても、次回開いたときにデータが残っている

Workspace はブラウザの IndexedDB に依存するため、**ブラウザを変えたり、
ストレージをクリアするとデータが失われます**。
データを持ち出す・配布する・バックアップするには、Export を使います。

---

## 2. Export の種類と使い分け

PKC2 には3系統の Export があります。

### 一覧

| 形式 | 特徴 | 向いている場面 |
|------|------|---------------|
| **HTML Light** | テキストのみ。添付ファイル実体なし。軽量 | メール添付、軽量共有、テキスト中心の配布 |
| **HTML Full** | 全データ含む。gzip 圧縮。自己完結 | 完全アーカイブ、オフライン利用 |
| **ZIP Package** | 添付ファイルを生バイナリ保存。完全再現 | バックアップ、マシン間移行、Git 管理 |

さらに HTML には Editable / Readonly の選択があります。

| モード | 意味 |
|--------|------|
| **Editable** | 開いてそのまま編集できる |
| **Readonly** | 閲覧専用。Rehydrate ボタンで Workspace に昇格可能 |

### 判断フローチャート

```
添付ファイルを含む？
├── No → HTML Light で十分
│         ├── 相手に編集させたい → Editable Light
│         └── 配布のみ → Readonly Light
│
└── Yes → 添付も持ち出したい？
          ├── No → HTML Light（添付は除外される旨を理解の上）
          ├── Yes → 容量が大きい（数 MB 以上）？
          │         ├── Yes → ZIP Package を推奨
          │         └── No → HTML Full で OK
          │                   ├── 相手に編集させたい → Editable Full
          │                   └── 配布のみ → Readonly Full
          └── バックアップ目的 → ZIP Package
```

---

## 3. 各 Export の詳細

### HTML Light

- **含まれるもの**: エントリ（テキスト本文）、リレーション、リビジョン
- **含まれないもの**: 添付ファイルの実体データ（メタデータは残る）
- **サイズ目安**: テキスト中心なら数十 KB
- **開き方**: ブラウザでそのまま開く

添付ファイルがある場合、Light export では「同梱対象外」として除外されます。
これは欠落ではなく、設計上の選択です。
添付エントリのファイル名・MIME 型・サイズ情報は残りますが、
ファイル実体にはアクセスできません。

### HTML Full

- **含まれるもの**: 全エントリ + 全添付ファイル（gzip+base64 圧縮）
- **サイズ目安**: 添付量に比例（数 MB〜数十 MB）
- **開き方**: ブラウザでそのまま開く

完全自己完結の HTML です。ネットワーク接続なしで全データにアクセスできます。
添付ファイルが多い場合、ファイルサイズが大きくなります。
Export 前に、UI に推定サイズが表示されます。

### Backup ZIP（旧 ZIP PKC2 Package）

- **含まれるもの**: manifest.json + container.json + assets/（生バイナリ）
- **サイズ目安**: 添付ファイルのサイズとほぼ同等（base64 膨張なし）
- **開き方**: PKC2 の Import 機能で読み込む（直接ブラウザでは開けない）

添付ファイルは base64 ではなく生バイナリで保存されるため、
ZIP 標準ツール（OS のファイルマネージャ等）で個別にアクセスできます。
Import 時には新しい Container ID が発行されます（元の Workspace とは独立）。

> 用語整理: 旧 doc では **「ZIP Package」** と呼ばれていた形式です。
> 2026-04-25 のマニュアル整理で、UI / manual / 用語集すべてで
> **Backup ZIP** に呼称を統一しました。実体・拡張子（`.pkc2.zip`）・
> 互換性は不変です。

**Backup ZIP を選ぶべき場面**:
- 添付ファイルが大きい（1 MB 以上）
- バックアップ目的
- マシン間移行
- Git でバージョン管理したい

### Readonly モード（HTML Light / Full 共通）

Readonly は**セキュリティ機能ではありません**。
HTML を直接編集すれば bypass 可能です。

Readonly は artifact 上の **UI ポリシー**です。
開いた時に編集ボタンが表示されず、閲覧のみのインターフェースになります。
Rehydrate ボタンを押すと、Workspace として昇格できます。

**Readonly を使う場面**:
- レポートやプレゼンテーション資料として配布
- 「まず見てもらい、必要なら手元に取り込む」という使い方
- 誤操作による編集を防ぎたい（ただし保護ではない）

---

## 4. Import

PKC2 は以下の2種類の Import に対応しています。

| 入力 | 処理 |
|------|------|
| `.html` ファイル | DOMParser で解析 → pkc-data を抽出 → Container として読み込み |
| `.zip` ファイル | ZIP 解凍 → container.json + assets/ → Container として読み込み |

### Import の挙動: Replace と Merge

Import preview のラジオで **Replace**（既定: 現在の Workspace を完全に置換）か
**Merge**（既存データを保持して追加取り込み、同名 entry の衝突は conflict 解決
UI で個別に判断）を選べます。Merge は schema version が一致するときのみ有効です。

> **2026-04-25 整合化メモ**: 本節の旧版は「マージ（merge）機能はありません」と
> 書いていましたが、実装は v2.1.0 以降で Merge mode を提供しています。詳細は
> [`07_保存と持ち出し.md` Merge mode と conflict 解決 UI](../manual/07_保存と持ち出し.md)
> を参照してください。

### Import の操作手順

1. 「Import」ボタンを押す
2. ファイル選択ダイアログで .html または `.pkc2.zip`（Backup ZIP）を選ぶ
3. プレビュー画面で **Replace / Merge** を選び、内容を確認
4. **Confirm Import**（Replace）または **Confirm merge**（Merge）で確定、
   または **Cancel** で中止
5. 確定すると、選んだモードに応じて Workspace が置換または追加取り込みされる

---

## 5. Rehydrate

Rehydrate は「Readonly HTML artifact を Workspace に昇格させる」操作です。

### いつ使うか

- 他の人から Readonly HTML を受け取った
- 内容を確認した上で、自分の作業環境に取り込みたい
- 「Rehydrate to Workspace」ボタンを押す

### 何が起きるか

1. HTML 内の pkc-data が読み取られる
2. 新しい Container ID が発行される
3. IndexedDB に保存される
4. Editable モードで再レンダリングされる
5. 以降は通常の Workspace として利用可能

### Rehydrate と Import の違い

| | Rehydrate | Import |
|---|-----------|--------|
| **起点** | Readonly HTML を直接開いている状態 | Workspace で Import ボタンを押す |
| **入力** | 現在開いている HTML 自身 | 外部の .html / .zip ファイル |
| **操作** | ボタン1つ | ファイル選択 + 確認 |
| **結果** | 現在の artifact が Workspace になる | ファイルの内容で Workspace を置換 |

---

## 6. Attachment の運用注意

### サイズ警告

ファイル添付時に、サイズに応じた警告が表示されます。

| サイズ | 警告レベル | 内容 |
|--------|-----------|------|
| 1 MB 未満 | なし | そのまま利用 |
| 1 MB 以上 | Soft warning | Export サイズが増加する旨を通知 |
| 5 MB 以上 | Heavy warning | 外部ストレージの検討を推奨 |

これらは**制限ではなく警告**です。操作はブロックされません。

### Export 時の注意

- **HTML Light**: 添付ファイル実体は除外される
- **HTML Full**: 添付ファイルは gzip+base64 圧縮されて埋め込まれる（サイズ見積もりが表示される）
- **ZIP Package**: 添付ファイルは生バイナリで保存される（最もサイズ効率がよい）

大きな添付ファイルがある場合、Export パネルに
「ZIP Package export preserves files as raw binary and is recommended for large data」
というメッセージが表示されます。

---

## 7. 典型的な操作シナリオ

### シナリオ 1: テキストノートを共有したい

1. Workspace でノートを作成・編集
2. Export パネル → HTML Export → Editable → **Light**
3. 生成された HTML ファイルをメールや共有ドライブで送る
4. 受け取った人はブラウザで開いてそのまま使える

### シナリオ 2: 完全なバックアップを取りたい

1. Export パネル → ZIP Package → **Export ZIP**
2. .pkc2.zip ファイルをバックアップストレージに保存
3. 復元するとき: PKC2 を開く → Import → .zip を選択 → Confirm

### シナリオ 3: 配布用レポートを作りたい

1. Workspace でコンテンツを作成
2. Export パネル → HTML Export → Readonly → **Full**（添付も含めたい場合）
3. 受け取った人は閲覧のみ
4. 手元に取り込みたい場合は「Rehydrate to Workspace」

### シナリオ 4: 別の PC で作業を続けたい

1. 元の PC: Export パネル → ZIP Package → Export ZIP
2. 新しい PC: PKC2 を開く → Import → .zip を選択 → Confirm
3. 新しい Workspace として作業を続行

### シナリオ 5: 添付ファイル付きコンテナを軽量共有したい

1. Export パネル → HTML Export → Editable → **Light**
2. 添付ファイルの実体は含まれない（メタデータは残る）
3. UI に「Light export excludes N attachment(s)」と表示される
4. 受け取った人は添付のファイル名・サイズ情報は見られるが、ダウンロードはできない

---

## 8. よくある疑問

### Q: Light と Full のどちらを使うべき？

- テキスト中心で添付がない/少ない → **Light**
- 添付ファイルも含めて完全に自己完結させたい → **Full**
- 迷ったら Light を試す。必要なら Full に切り替える

### Q: Readonly は本当に安全？

いいえ。Readonly はセキュリティ機能ではなく UI ポリシーです。
HTML ソースを編集すれば bypass できます。
「うっかり編集してしまうのを防ぐ」程度のガードです。

### Q: Backup ZIP と HTML Full の違いは？

| | HTML Full | Backup ZIP |
|---|-----------|------------|
| ブラウザで直接開ける | Yes | No（Import が必要） |
| 添付ファイルの格納 | gzip+base64（膨張あり） | 生バイナリ（膨張なし） |
| 個別ファイルアクセス | 不可 | ZIP ツールで可能 |
| Git 管理 | 差分が大きい | 差分が分かりやすい |
| 用途 | 配布・閲覧 | バックアップ・移行 |

### Q: Import すると前のデータはどうなる？

プレビュー上部のラジオで **Replace**（既定 / 全置換）か **Merge**（追加取り込み）を
選びます。Replace を選ぶと既存データは置き換えられるので、重要なデータがある場合は
先に Export でバックアップを取ることをおすすめします。Merge を選べば既存データは
保持され、同名衝突は conflict 解決 UI で 1 件ずつ判断します。

### Q: Rehydrate するとどうなる？

Readonly HTML が Editable Workspace になります。
新しい Container ID が発行されるので、元の artifact とは独立です。
元の HTML ファイルは変更されません。

---

## 本文書の位置づけ

| 文書 | 役割 | 読者 |
|------|------|------|
| `17_保存再水和可搬モデル.md` | 設計文書 — 4系統モデル、body-assets分離、IDB進化、圧縮方針 | 開発者 |
| **本文書** | 利用ガイド — 操作手順、判断基準、シナリオ | 利用者・開発者 |
| `HANDOVER.md` | セッション引き継ぎ — 完了Issue、不変条件、次の一手 | Claude |

設計を変更する場合は 17 番文書を先に更新してください。
本文書は設計の結果としての「使い方」を記述しています。
