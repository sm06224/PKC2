# OneNote 送信拡張 — 設計(2026-07、設計のみ・実装は別途 go)

> user 要望(2026-07-16)「onenote に変換可能な方法をリサーチしてほしい。
> onenote をうまく作ってそれを使ってさらに copilot を回すみたいな使い方
> したいよね」→ リサーチ提示(2026-07-17)→ user「続けて」で設計 doc 化。
> **実装はしない**(CLAUDE.md 許可作業⑥)。着手には user の明示 go が要る。

## 0. 目的とゴール像

PKC2 の会議メモ(本文 + 録音添付 #922/#923)を **OneNote ページ**として
書き出し、**Microsoft 365 Copilot Notebooks の参照**に加えて Copilot に
要約・展開させる、という運用を成立させる。

```
PKC2(記録・録音)──送付ジェスチャ──▶ OneNote ページ ──参照追加──▶ Copilot Notebook
```

## 1. 経路の選定(リサーチ結論)

| 経路 | 評価 |
|---|---|
| **Microsoft Graph OneNote API**(`POST …/onenote/sections/{id}/pages`、XHTML + multipart) | ✅ **本命**。標準・安定・メディア同送可 |
| .one ファイル生成 | ❌ プロプライエタリ形式、非公開仕様 |
| docx export → OneDrive → Copilot 参照 | ○ **近道**(実装ゼロで今日できる)。OneNote を経由しない分、ページ体験は落ちる |
| Power Automate(OneDrive 監視 → ページ化) | △ ノーコード代替。ユーザー側セットアップが重い |

## 2. アーキテクチャ — Tier T PKC-Extension(コアは変更しない)

Graph は OAuth(scope `Notes.Create` / `Notes.ReadWrite`)が必須。
**コアに OAuth / 外部通信を入れない**(#772 core-thin、AI 整理プラン連携
#914 と同じ境界)ため、送信本体は **PKC2-Extensions 側の Tier T 拡張**
「OneNote へ送る」とする:

- **起動 / 授受**: 既存 host-push 体系そのまま。ユーザーが拡張を紐付け →
  entry 右クリック「🧩 送る ▸」で **deliver**(本文 + 添付実体)を受ける。
  **コア側の新規 API はゼロ**(deliver payload で足りる)
- **Tier T の理由**: `fetch`(Graph API)と MSAL(OAuth popup)が要る。
  Tier S(opaque sandbox)では外部通信不可。毎起動の全権同意ダイアログ
  (#796 PR-4)がそのまま安全装置になる
- **render**: 拡張は markdown を自前 render せず、**`renderForExtension`
  seam(#855)** で PKC2 のレンダリングコアを借りて HTML を得る

## 3. 変換仕様(HTML → OneNote XHTML)

OneNote API の入力は **well-formed XHTML(UTF-8)+ 限定要素集合**。
script / style / form は API 側で除去される。拡張内の simplifier で:

| PKC2 render 出力 | OneNote 入力 |
|---|---|
| 見出し / 段落 / リスト / 表 / 引用 / リンク / 強調 | そのまま(サポート内) |
| コードブロック | `<pre>`(等幅で残る) |
| 画像(data URI) | `<img data-render-src="name:partN">` + multipart binary part(**上限 5 枚 / POST**) |
| **音声・動画添付(録音)** | `<object data-attachment="rec.webm" data="name:fileN" type="…">` + binary part(**上限 1 個 / POST**)。ネイティブ `<audio>` は非対応 |
| mermaid / chart | hydrate 済み SVG → PNG 化して img part(v1 は SVG 素通し不可のため。要検証) |
| PKC 方言装飾(format block 等) | class を捨てて素の構造に縮約(lossy、と明記) |
| TEXTLOG | ログ 1 件 = 見出し付き段落(タイムスタンプ)で時系列リスト化 |

**1 POST = 1 ページ**。会議メモの典型(本文 + 録音 1 + 画像 ≤5)は
1 リクエストに収まる。超過分(画像 6 枚目〜 / 添付 2 個目〜)は
`PATCH pages/{id}/content` で追記するか、省略して警告を出す(v1 は警告)。

## 4. 認証・宛先 UX

- **MSAL Browser**(PKC2-Extensions 側の dep。コアの bundle には入らない)
  で OAuth。トークンは拡張 window 内メモリのみ(localStorage 保存は
  Tier T なので技術的に可能だが、v1 はセッション内のみ = 毎回サインイン)
- 宛先: 初回にノートブック / セクション一覧(`GET onenote/notebooks` /
  `sections`)を取得して選択、拡張内に記憶
- 送信結果: 成功時に OneNote ページの `links.oneNoteWebUrl` を表示
  (ワンクリックで開いて Copilot Notebook に参照追加できる)

## 5. Copilot の回し方(運用)

1. 拡張で会議メモを OneNote ページ化(録音はページ内添付になる)
2. OneNote / M365 Copilot アプリの **Copilot Notebooks** で該当ページを
   参照に追加(M365 Copilot: 最大 300 参照 / Copilot Chat: 50)
3. Notebook 上で要約・アクションアイテム抽出・横断質問

※ Notebook への参照追加を自動化する公開 Graph API は現状無い(手動)。
※ **今日から使える近道**: PKC2 の 📝 Word(docx)出力を OneDrive に置き、
   Notebook の参照に追加するだけでも Copilot の grounding は効く。

## 6. 実装スコープ見積り(go 後)

| PR | 内容 |
|---|---|
| O1 | 拡張スケルトン(Tier T manifest + deliver 受信 + MSAL サインイン + セクション選択) |
| O2 | XHTML simplifier + multipart builder + POST pages(本文のみ) |
| O3 | メディア同送(img ≤5 / object 1、超過警告)+ TEXTLOG 整形 |
| — | コア変更: **ゼロ**(必要になった場合のみ deliver payload の不足を #826 台帳経由で検討) |

## 7. Open questions(go 前に決める)

1. Graph リクエストサイズの実上限(multipart 合計。録音 数十 MB が 1 POST
   で通るか — 公式上限の明記が薄く**実測が要る**。NG なら「録音は OneDrive
   へ置き、ページにはリンク」の fallback)
2. Entra アプリ登録の持ち方(ユーザー自身のテナントで app 登録してもらう
   か、マルチテナント公開 client id を配るか)
3. mermaid SVG → PNG 化の実装位置(拡張内 canvas で足りる見込み)

## 参照(リサーチ出典)

- Create OneNote pages: https://learn.microsoft.com/en-us/graph/onenote-create-page
- Input/output HTML: https://learn.microsoft.com/en-us/graph/onenote-input-output-html
- Images/videos/files(要素と part 上限): https://learn.microsoft.com/en-us/graph/onenote-images-files
- Copilot Notebooks: https://support.microsoft.com/en-us/microsoft-365-copilot/what-are-microsoft-365-copilot-notebooks-in-onenote
- 関連: `ai-structure-automation-design-2026-07.md`(拡張連携の先例)/ v2 spec §3.8 / #826(deferred 台帳)
