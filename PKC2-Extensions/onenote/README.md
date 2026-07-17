# PKC2 → OneNote 送信拡張

PKC2 の会議メモ(本文 + 録音・画像添付)を **OneNote ページ**として作成する
PKC-Extension。作成したページを **Microsoft 365 Copilot Notebooks** の参照に
追加すれば、Copilot にメモを要約・展開させる運用が成立する。

設計正本: host repo `docs/development/onenote-export-extension-design-2026-07.md`

## セットアップ(1 回だけ)

1. `pkc2-onenote.html` を PKC2 に添付(ドラッグ&ドロップ)
2. 添付カードで「**PKC-Extension として扱う**」を ON、「**「拡張へ送る」の宛先にする**」を ON

## 使い方

1. 会議メモ(TEXT / TEXTLOG)を右クリック →「🧩 送る ▸」→ 本拡張
   - 本文が参照する録音・画像(attachment entry)も、それぞれ「送る ▸」で本拡張へ(未受領分は拡張内に警告が出る)
2. 拡張ウィンドウで **アクセストークン**を貼り付け
   - 取得: [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) にサインイン → 右上の Access token タブからコピー(scope に `Notes.ReadWrite` の同意が必要。無ければ Graph Explorer の Modify permissions から consent)
   - トークンは**保存されない**(ウィンドウ内メモリのみ・約 1 時間有効)
3. 「セクション読込」→ 送信先セクションを選択 → 「📤 OneNote ページを作成」
4. 表示されたリンクからページを開き、OneNote / M365 Copilot の **Copilot Notebooks** で参照に追加 → Copilot に要約・アクション抽出などを依頼

## 変換仕様と制約

- markdown は**会議メモ向けサブセット**(見出し / 段落 / リスト / フェンスコード / 引用 / パイプ表 / リンク / 強調 / インラインコード)。PKC 方言装飾(`:::format` 等)は素のテキストに落ちる(lossy)
- 画像 `![..](asset:k)` → ページ内画像(**1 ページ 5 枚まで**、超過は省略 + 警告)
- 録音等 `[..](asset:k)` → ページ内添付ファイル(**1 ページ 1 個まで**)— OneNote はネイティブ audio 要素非対応のため添付形式になる
- 大きな録音(数十 MB 超)は Graph 側のリクエスト上限で失敗する可能性あり(設計 doc Open Question 1)。失敗時は録音を除いて再送し、録音は OneDrive 等へ

## 認証について(v0)

v0 は手貼りトークン方式。恒久的なサインイン(Entra アプリ登録 + OAuth)は
設計 doc の Open Question 2(アプリ登録を誰が持つか)の決定後に実装する。

## ビルド

```bash
cd PKC2-Extensions/onenote
npm run build   # vite build → build-singlefile.mjs → pkc2-onenote.html
```

runtime 依存ゼロ(vite / tsc は host repo の devDependency を利用)。
payload builder(`src/onenote-payload.ts`)は host repo の
`tests/extensions/onenote-payload.test.ts` で unit test される。
