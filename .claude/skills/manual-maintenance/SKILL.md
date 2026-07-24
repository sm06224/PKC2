---
name: manual-maintenance
description: >
  PKC2 ユーザーマニュアル(docs/manual/*.md → PKC2-Extensions/pkc2-manual.html)を
  更新・検証・再生成するワークフロー。マニュアルの章を書く / 直す / 画像を足す /
  「マニュアルに掲載して」「生成物がおかしい」という文脈で必ず使う。user-facing 変更を
  した PR は原則マニュアル反映 + お知らせ掲載がセット(CLAUDE.md PR 運用 6)。
---

# マニュアル整備ワークフロー

## 構成

- **正本**: `docs/manual/00〜15_*.md` + `docs/manual/images/*.png`
- **生成物**: `PKC2-Extensions/pkc2-manual.html`(readonly-full な単一 HTML。
  `build/manual-builder.ts` が md + 画像 + 見本エントリを container 化して
  `dist/pkc2.html` に注入)
- 章 08 の本文は build 時に `docs/planning/18_...md` から差し込まれる(placeholder)

## 画像の書き方(2026-07-24 一元化 — 必ず守る)

- **md 正本では相対パス**: `![alt](images/KEY.png)`(GitHub でそのまま表示される)
- **`](asset:KEY)` を md に直接書かない**(GitHub で壊れ画像になる)。builder の
  `transcodeImageRefs` が build 時に `images/KEY.png` → `asset:KEY` へ変換する
- asset キー = PNG の basename(拡張子なし)。新画像は `docs/manual/images/` に
  置くだけで自動で assets に同梱される
- 未変換の `](images/` が生成物に残ると `npm run check:manual` が FAIL する(再発防止)

## mermaid 図解

- md に ` ```mermaid ` fence で書ける。GitHub ではそのまま描画。アプリ内は flag
  `editor.mermaid_render_enabled`(既定 OFF)を ON で SVG 描画、OFF ではコード表示
- 図の直下に「GitHub では図として表示 / アプリ内は flag ON で描画」の注記を置く

## 更新手順

1. 章 md を編集(新章を作ったら `build/manual-builder.ts` の `CHAPTER_TO_FOLDER` に
   登録 + `00_index.md` の目次表を更新)
2. **陳腐化確認をついでに行う**: 触った章の周辺で、現在の実装と食い違う記述
   (flag の既定値・実装済み/未実装・UI 導線)を grep して直す。過去の実例:
   12 章が mermaid を「未実装」と書いていたが実際は実装済みだった
3. ビルドと検証:
   ```bash
   npm run build          # 生成物は dist/pkc2.html を template にするので先に
   npm run build:manual   # → PKC2-Extensions/pkc2-manual.html
   npm run check:manual   # pkc-data 整合 + .md リンク / images/ パス残存検査
   ```
4. **生成物も同じ commit に含める**(陳腐化させない。#992 の教訓: 生成物が数日前の
   まま放置され、user が壊れた状態を踏んだ)
5. user-facing の内容変更なら `STARTUP_NOTICES` に 1 行(マニュアル刷新の告知)
6. 実機確認(必要時): Chromium で `PKC2-Extensions/pkc2-manual.html` を開き、
   対象章 entry(lid `manual-text-NN`)をクリック → 画像は `img.decode()` 後の
   `naturalWidth > 0` で判定(`/opt/pw-browsers/chromium` を executablePath 指定)

## 執筆スタイル

- 読者は非開発者。結論先出し(おすすめ・使い分け表を長い説明の前に置く)
- 概念が交差する時は比較表 + 図解(07 章「保存のかたちは 2 種類ある」方式)
- 章間リンクは相対 md リンク(builder が entry: リンクへ transcode する)
