# File-based Issue Ledger（レビュー指摘の切り出し台帳）

**Status**: 2026-04-17 初版、2026-05-03 第 1 回 archive sweep(7 件 → archived/)。ユーザーから共有されたレビュー指摘一覧を、今後の minimum-scope → contract → implementation → audit → manual pipeline に載せやすいよう、**1 件 1 ファイル**の単位で切り出した。

**Source**: 2026-04-17 supervisor prompt 内に記載されたレビュー指摘一覧（色味 / ファイルエントリ / 表示 / 検索 / 編集 / その他の 6 群）。

**Scope**: 本ディレクトリは「未解消の file-based issue」集合。docs-only、実装はしない。**RESOLVED な issue は `archived/` 配下に移動し、`archived/SUMMARY.md` で結果サマリ化**(2026-05-03 reform-2026-05 wave 拡張、`docs/development/doc-archival-discipline.md` 規約)。

**上位導線**: `docs/planning/USER_REQUEST_LEDGER.md` の §3（待機候補）と並列で読む。昇格した時点で LEDGER §1 への移設と本ディレクトリからの退場を行う。

## 運用ルール

1. **1 issue = 1 file**。小さく保ち、必要なら子ディレクトリに分割する
2. 各ファイルは Title / Status / Priority / Problem / User value・risk / Scope boundary / Expected pipeline / Dependencies / Notes を含む
3. **着手**は supervisor が本 index 上で 1 件選んで minimum scope 化を宣言することで始まる
4. **完了**した issue は: (a) USER_REQUEST_LEDGER §1 に移設、(b) **本 ディレクトリ → `archived/` に物理移動**、(c) `archived/SUMMARY.md` に 1 行サマリ追加。再燃 trigger(spec breaking change / invariant 違反 / user 同種要望再持込)で live に戻すまで触らない
5. **優先順位の原則**:
   - P0: データ損失・上書き消失・誤保存・貼付先誤り
   - P1: 性能劣化・無言で遅くなる問題
   - P2: 日常作業の手数削減 / 検索・表示改善 / 入力操作自然化 / テーマ見た目
   - P3: 後段機能（拡張ランチャ等）

## live 一覧(計 6 件、推奨着手順)

| ID | Title | Priority | Status | Depends on | 概要 |
|----|-------|----------|--------|-----------|------|
| [FI-02](02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md) | 編集安全性: TEXTLOG 貼付先ズレ / FOLDER Ctrl+S 不可 | **P0** | PARTIAL | — | A 部分着地 / B 部分(FOLDER Ctrl+S)は実ブラウザ再現未確定 |
| [FI-06](06_editor-input-assist-tab-and-indent-width.md) | 入力操作: TAB キー半角化 / markdown-it インデント幅設定 | **P2** | OPEN | — | TAB → 半角スペース × N（デフォ 2）、インデント幅設定化 |
| [FI-07](07_editor-textlog-alternative-edit-trigger.md) | TEXTLOG ログ編集トリガをダブルクリック以外に割当 | **P2** | OPEN | — | OS 標準のワード / 段落選択を取り戻す |
| [FI-10](10_display-csv2table-code-block-lang-alias.md) | `csv2table` fenced block 表変換（B-1 alias 整備 or 周知） | **P3** | OPEN | B-1（実装済み） | B-1 の確認 → alias 追加 or 周知のみ |
| [FI-11](11_display-entry-window-responsive-tab-swap.md) | 別ウィンドウ編集 UI とセンターペインの UX 乖離解消 | **P2** | OPEN | FI-01(完了), A-2（完了） | 画面幅で tab ↔ 2-pane 切替 |
| [FI-13](13_launcher-tab-customizable-for-extensions.md) | センターペイン タブとしての拡張ツールランチャ | **P3** | OPEN | — | PKC2-Extensions 起動動線、PKC-Message v2 ACL 完了後に再評価 |

## archived(計 7 件、RESOLVED)

詳細は [`archived/SUMMARY.md`](./archived/SUMMARY.md) を参照。FI-01 / FI-03 / FI-04 / FI-05 / FI-08 / FI-09 / FI-12 がすべて spec + src + audit 完了で archive 済み(2026-05-03 第 1 回 sweep)。

## 依存グラフ（ざっくり）

```
FI-01 (P0) ────┐
               ├─► FI-11 (P2, entry-window の UX 刷新)
A-2 (完了) ────┘

FI-02 (P0) ──┬─► FI-04 (P2, 添付基盤)
             └─► FI-05 (P2, 貼付経路統一)
                      └─── FI-04 の常設 DnD と整合

FI-03 (P1) 独立
FI-06 (P2) 独立（ただし B-3 Slice α と同経路）
FI-07 (P2) 独立
FI-08 (P2) S-25 の補強（ほぼ独立）
FI-09 (P2) 独立（S-18 と非干渉）
FI-10 (P3) B-1 の確認作業のみ、独立
FI-12 (P2) 独立（ただし B-2 の CSS tier と分離設計）
FI-13 (P3) 最後
```

## grouping / 境界の判断理由

- **FI-01**: データ損失経路なので他 UI 改善と混ぜず単独 P0 にした
- **FI-02**: TEXTLOG 貼付先ズレ + FOLDER Ctrl+S は **grouping 許可の「編集安全性」**（supervisor 規則）に合致、1 issue 内で閉じる
- **FI-04**: 添付系 3 要素（まとめ追加 / dedupe / 常設 DnD）は **grouping 許可の「添付基盤」** 規則に合致、1 issue 内で閉じる
- **FI-06**: TAB / markdown インデント幅は **grouping 許可の「入力操作」** 規則に合致、1 issue 内で閉じる
- **FI-12**: テーマ設定 / ハイライト / スキャンラインは **grouping 許可の「UIテーマ」** 規則に合致、1 issue 内で閉じる
- **FI-05** は添付基盤（FI-04）ではなく「編集中の経路補正」として分離: paste / DnD / ボタンで本文挿入する**挙動対称化**は編集 UI の問題であり、添付ストレージ問題と責務が違う
- **FI-08** は S-25 の補強に該当するため、「新機能」ではなく「既存機能の拡張 / 確認」として独立
- **FI-11** は FI-01 とファイル領域が重なるが、**編集 UI の見た目** と **状態同期の正しさ** は責務が違うため分離
- **FI-13** は最後段機能として独立

## 次のアクション

supervisor は本 index を見て **1 件を minimum-scope 化** する。以後は 1 テーマ 1 セッションで回す。

---

## 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-17 | 初版。レビュー指摘 18 点を 13 件の file-based issue に切り出し（grouping 5 件 + 独立 8 件）。全て proposed |
