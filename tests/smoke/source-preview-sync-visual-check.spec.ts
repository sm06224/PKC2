/**
 * Visual verification harness — REAL user markdown
 * (2026-05-05 user direction: 「テストに使用するマークダウンは
 *  以下を使用しなさい。わたしが MacOS+Firefox or Chrome で使用
 *  しているマークダウンです。一番効果がある。私のモニタは
 *  1680x1050です」).
 *
 * Reproduces the user's actual environment:
 *   - viewport 1680×1050 (the user's monitor)
 *   - long ChatGPT→Claude migration log markdown (~250 lines,
 *     7+ tables, CSV fence, Mermaid block, deep heading tree,
 *     blockquote, checklist, code blocks)
 *
 * Scenarios produce screenshots under
 * `test-results/visual-check/L<n>-*.png`. **No assertions** — this
 * is a deliberate eyes-on artefact harness.
 *
 * 2026-05-05 hotfix-7 follow-up-2 user feedback:
 *   - 「中途半端に飛んだり飛ばなかったり」 → scroll continuity
 *     restored via caret-row rect targeting (L3 / L4 / L7 should
 *     show smooth preview tracking)
 *   - 「caret 位置を目立たせる別の視覚効果を機能の ON/OFF に
 *     関わらず表示」 → V0 covers this (sync OFF + caret indicator
 *     visible)
 */

import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT_DIR = 'test-results/visual-check';
mkdirSync(OUT_DIR, { recursive: true });

// User's monitor resolution — they specifically asked us to use this.
test.use({ viewport: { width: 1680, height: 1050 } });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
}

/** User-provided fixture: ChatGPT→Claude migration conversation log.
 * Verbatim per the user's 2026-05-05 message. Long, structured,
 * realistic — exactly the workload PKC2 must handle gracefully. */
const REAL_MD = String.raw`# ChatGPT→Claude移行とPKC-Extension構想 対話記録

## 0. メタ情報

- **日付**: 2026-04-26
- **対話相手**: Claude Opus 4.7 ([claude.ai](http://claude.ai))
- **目的**: ChatGPT→Claude移行アシスタント、メモリ評価、スタイル指示策定、PKC-Extension構想の棚卸し
- **保存意図**: 将来のPKC-Extensionにおける「Claudeの手足を作る」案の出発点
- **総ターン数**: 18

## 1. 対話サマリー

` + '```csv' + `
回数,時刻,私の指示,君の回答
1,,ChatGPT→Claudeへ完全移行のアシスタント依頼,"移行領域を5点整理(データ引上げ/資産移植/Claude側受け皿/ワークフロー置換/解約タイミング)。現状棚卸しを提案"
2,,"ほぼチャット使いで移植不要。メモリ評価したい。ChatGPTは勝手に記憶していた","作業は軽い。メモリ抽出評価とClaude側受け皿構築の2点に絞る"
3,,ChatGPTメモリ全83件を提示し使えるもの判定依頼,"A:既知約20件、B:行動指針、C:背景情報、D:設計哲学、E:ノイズ50件超に分類。B群から着手提案"
4,,"A,B,Cを再整理してメモリに入れる形に","memory_user_editsで14件コミット(役割5/設計観3/環境3/対話スタイル3)。#2の自己認識ずれを確認"
5,,#2の現状はどう書いてある?,現行文を提示してA/B/C案を提案
6,,A案採用,#2を置換完了。User Preferences策定とChatGPT解約を残タスクに整理
7,,スタイル指示まとめ案を要求。ChatGPTのデフォはひどかった,素案v1(応答スタイル/言語/実装報告/分析姿勢)を提示
8,,"絵文字使いすぎがクソブログ的。PKC2マークダウン重視。チェックリスト/対照表/ウィット可",素案v2に再構成(絵文字NG/対照表活用/トーン切替)
` + '```' + `

## 2. 確定したアクションアイテム

### 2.1 メモリ(memory_user_edits)コミット済み 15件

- [x] #1 制御系システムの開発・保守を担当、設計哲学を担う立場
- [x] #2 電力系組織の発注側、仕様調整・運用保守・データ抽出担当
- [x] #3 セキスペ合格・未登録、転職時はセキスペ対象求人に関心
- [x] #4 IEC 61850・SDS・Linux Foundation系グリッドOSS動向に精通
- [x] #5 セキュリティ・基盤設計観: 権限分離・データオーナーシップ・第三正規形重視
- [x] #6 関数設計観: 出力三分類(付加型/変換型/変容型)、構造体不要論
- [x] #7 OT設計観: データダイオード盲信への懸念、エッジ通信の双方向性必要
- [x] #8 パッケージング志向: ローカル実行・低オーバーヘッド、Servo等の軽量エンジン検討
- [x] #9 デバイス環境: Mac/iPhone/Apple Watch中心、Parallels Windows併用
- [x] #10 車: 初代CX-3、MT・4WD・ディーゼル
- [x] #11 組織プロセス経験: ウォーターフォール型、AI統合ハイブリッドプロセス関心
- [x] #12 応答スタイル: 情報小出し戦術を嫌う、直接的・完結を求める
- [x] #13 プロンプト言語規約: メタ指示英語可、内容部分日本語、推論英語/出力日本語スタイル
- [x] #14 報告フォーマット: 短く決定的・Good/Bad箇条書き・sober分析・次アクション明示
- [x] #15 対話姿勢: ふんわり理解でgo ahead型、合理的仮定を明示して進めて良い

### 2.2 User Preferences策定 (確定版)

- [x] 応答スタイル(結論先出し/小出し禁止/推測事実分離/媚びなし/トーン切替)
- [x] マークダウン出力(PKC2前提/見出し・リスト・表使い分け/対照表・チェックリスト活用)
- [x] 絵文字方針(意味あれば使用/装飾NG/判定基準明示)
- [x] 言語(基本日本語/メタ指示英語可/推論英語+出力日本語指定対応)
- [x] 実装報告(実装サマリー/変更ファイル/テスト/不変条件/整合性棚卸し/次アクション)
- [x] 分析姿勢(sober/不明と言える/反証可能性検討)
- [x] Settings → Personalization にコピペ反映 (Mi Su側で実施)

### 2.3 PKC-Extension構想 残タスク

- [ ] 用途整理(投資判断 vs 市場ウォッチ vs 学習)
- [ ] データソース絞り込み(個人口座API vs 商用API vs 無料系)
- [ ] STOCK_ANALYSIS Archetype スキーマ確定
- [ ] Snapshot Builder設計
- [ ] APIキー管理設計
- [ ] Phase 1: RSS news収集Extensionプロトタイプ
- [ ] Phase 2: J-Quants Adapter
- [ ] Phase 3: Snapshot Builder + Claude連携
- [ ] Phase 4: kabuST/MarketSpeed Adapter (online-only flag)
- [ ] Phase 5: 通知・アラート機構

### 2.4 移行作業 残タスク

- [x] ChatGPT解約(過去会話に戻る必要が出ないことを確認後)
- [ ] PKC2用Project作成検討
- [ ] Styles機能でモード別プリセット作成検討

## 3. 主要トピック詳細

### 3.1 ChatGPTメモリの分類判定

83件→14件への絞り込み。判定軸は以下:

| 分類 | 件数 | 扱い |
|---|---|---|
| A. Claudeが既に把握 | 約20件 | 移植不要(古い情報混入リスク) |
| B. 行動指針(User Preferences向け) | 3件 | 最優先で移植 |
| C. 背景情報 | 5件 | メモリへ |
| D. 設計哲学 | 3件 | メモリへ |
| E. ノイズ・単発タスク・嗜好品 | 50件超 | 廃棄 |

**重要な気づき**: ChatGPTメモリは粒度がバラバラで「最高の一杯はタリスカー、響、ダークホース赤、ニッカシードル」レベルまで細かく記憶していた。9割がノイズ。

### 3.2 スタイル指示の策定経緯

3回のイテレーションで確定:

- **v1**: ChatGPTの過剰共感・冗長前置き・無意味フォローアップを潰す方向
- **v2**: PKC2マークダウン重視・対照表/チェックリスト活用・トーン切替・絵文字NG
- **v3 (確定)**: 絵文字は意味あれば積極使用に方針転換

### 3.3 絵文字方針

| 用途 | 可否 | 例 |
|---|---|---|
| カテゴリ識別の先頭マーカー | OK | ✈️ 出張、🏥 通院、💻 リモート会議 |
| 状態・結果の即時識別 | OK | ✅ 成功 / ❌ 失敗 / ⚠️ 警告 / 🚧 進行中 |
| 種別の対比を一目で示す | OK | 📥 Input / 📤 Output、🔒 Private / 🔓 Public |
| 文末の感情装飾 | NG | できました😊 / 頑張ります🔥 |
| 強調目的の散発挿入 | NG | これは🌟重要🌟です |

**判定基準**: その絵文字を消すと情報が落ちるか? 落ちるなら機能、落ちないなら装飾。

### 3.4 ChatGPTとClaudeの差

| 観点 | ChatGPT(GPT-4o系) | Claude(Opus 4.7) |
|---|---|---|
| デフォルトの饒舌さ | 高い、装飾的 | 中程度、構造的 |
| 同調圧力への耐性 | 弱い | 強い、根拠があれば押し返す |
| 推測の混入 | 多い | 「不明」と言える |
| 長文の構造 | 見出し・絵文字・太字を多用 | 散文寄り、必要時のみ装飾 |
| 指示への忠実度 | 上書きされやすい | 一貫性が高い |
| コーディング | 動くがレビュー軽視 | 不変条件・テスト・整合性を意識 |

### 3.9 PKC-Extension構想の核

**役割分担の再定義** (これが構想の肝)

| レイヤー | 役割 | 主体 |
|---|---|---|
| データ取得 | 株価・板・ニュースのfetch | **PKC-Extension** |
| データ正規化 | API各社の差異吸収 | PKC-Extension |
| 永続化 | tick/news/fundamentals蓄積 | PKC IndexedDB |
| 分析 | 文脈解釈・シナリオ立て・論調分析 | **Claude** |
| 可視化 | チャート・対照表・履歴差分 | PKC Presenter |
| ユーザー操作 | 銘柄追加・watchlist管理 | PKC UI |

## 4. 参考資料

### 4.1 STOCK_ANALYSIS Archetype スキーマ案

` + '```json' + `
{
  "archetype": "STOCK_ANALYSIS",
  "schema_version": 1,
  "ticker": "5570",
  "as_of": "2026-04-25T14:30:00+09:00",
  "scope": "swing_3m",
  "summary": {
    "stance": "neutral",
    "confidence": 0.6,
    "thesis": "..."
  },
  "evidence": [
    {
      "kind": "news",
      "url": "...",
      "tone": "negative",
      "weight": 0.3,
      "extract": "..."
    }
  ],
  "scenarios": {
    "bull": { "trigger": "...", "target": "...", "probability": 0.25 },
    "base": { "trigger": "...", "target": "...", "probability": 0.55 },
    "bear": { "trigger": "...", "target": "...", "probability": 0.20 }
  },
  "uncertainties": ["..."],
  "next_check_in": "2026-05-02"
}
` + '```' + `

### 4.3 段階的着手案

| Phase | 内容 | リアルタイム度 | 実装難度 |
|---|---|---|---|
| 1 | RSS news収集Extension | 即時(分単位) | 低 |
| 2 | J-Quants遅延データ Adapter | 20分遅延 | 中 |
| 3 | Snapshot Builder + Claude連携 | - | 中 |
| 4 | kabuST/MarketSpeed Adapter | リアルタイム | 高 |
| 5 | 通知・アラート機構 | リアルタイム | 高 |

**境界**: Phase 1-3で「ChatGPTでやっていた総合分析」を完全に超える。Phase 4以降はリアルタイム取引判断支援で別物として扱う領域。
`;

async function bootEdit(page: Page, syncOn: boolean): Promise<void> {
  if (syncOn) {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
    });
  } else {
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('pkc2.split-sync-enabled'); } catch { /* noop */ }
    });
  }
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor({ timeout: 15_000 });
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 5_000 });
  await page.evaluate((body) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    ta.value = body;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, REAL_MD);
  await page.waitForTimeout(900);
}

async function caretToLine(page: Page, line: number): Promise<void> {
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    let pos = 0, seen = 0;
    if (targetLine > 0) {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) { pos = i + 1; break; }
        }
      }
    }
    ta.focus();
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(220);
}

async function readScroll(page: Page): Promise<{ ed: number; pv: number; edMax: number; pvMax: number }> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    return {
      ed: ta?.scrollTop ?? -1,
      pv: pv?.scrollTop ?? -1,
      edMax: (ta?.scrollHeight ?? 0) - (ta?.clientHeight ?? 0),
      pvMax: (pv?.scrollHeight ?? 0) - (pv?.clientHeight ?? 0),
    };
  });
}

test.describe.configure({ mode: 'serial' });

test('V0 sync OFF: caret-position indicator が ON/OFF 不依存で表示される', async ({ page }) => {
  await bootEdit(page, false);
  await caretToLine(page, 30);
  // eslint-disable-next-line no-console
  console.log('V0 sync OFF, caret line 30');
  await shot(page, 'V0-sync-OFF-caret-indicator-visible');
});

test('V1 sync OFF + wheel scroll: overlay 出ない、caret indicator は出る', async ({ page }) => {
  await bootEdit(page, false);
  await page.locator('textarea[data-pkc-field="body"]').first().click();
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(50);
  }
  await shot(page, 'V1-sync-OFF-after-wheel');
});

test('V2 sync ON, caret line 0', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  await shot(page, 'V2-line-0-h1');
});

test('V3 sync ON, caret line 30 (mid-doc CSV/table area)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 30);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V3 caret 30: ed=${sc.ed}/${sc.edMax}  pv=${sc.pv}/${sc.pvMax}`);
  await shot(page, 'V3-line-30-csv-area');
});

test('V4 sync ON, caret line 100 (table 比較)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 100);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V4 caret 100: ed=${sc.ed}/${sc.edMax}  pv=${sc.pv}/${sc.pvMax}`);
  await shot(page, 'V4-line-100');
});

test('V5 sync ON: caret 0 → 50 → 100 → 50 (連続 sync 追従、scroll 連続性)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  const a = await readScroll(page);
  await shot(page, 'V5a-line-0');
  await caretToLine(page, 50);
  const b = await readScroll(page);
  await shot(page, 'V5b-line-50');
  await caretToLine(page, 100);
  const c = await readScroll(page);
  await shot(page, 'V5c-line-100');
  await caretToLine(page, 50);
  const d = await readScroll(page);
  await shot(page, 'V5d-line-50-back');
  // eslint-disable-next-line no-console
  console.log(`V5 sequence pv: 0→50=${a.pv}→${b.pv}, 50→100=${b.pv}→${c.pv}, 100→50=${c.pv}→${d.pv}`);
});

test('V6 sync ON: caret 内同 block 微小移動で preview no-op', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 30);
  const a = await readScroll(page);
  await caretToLine(page, 31);
  const b = await readScroll(page);
  await caretToLine(page, 32);
  const c = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V6 micro-move pv: 30=${a.pv} 31=${b.pv} 32=${c.pv}`);
  await shot(page, 'V6-micro-move-pv-stable');
});

test('V7 sync ON: caret 移動で長文 fence の中段 → preview がスムーズに追従', async ({ page }) => {
  await bootEdit(page, true);
  // line 50 あたり = csv fence 中段あたり
  await caretToLine(page, 12);
  const a = await readScroll(page);
  await shot(page, 'V7a-fence-top');
  await caretToLine(page, 16);
  const b = await readScroll(page);
  await shot(page, 'V7b-fence-mid');
  await caretToLine(page, 20);
  const c = await readScroll(page);
  await shot(page, 'V7c-fence-bottom');
  // eslint-disable-next-line no-console
  console.log(`V7 in-fence pv: top=${a.pv} mid=${b.pv} bot=${c.pv} (expect monotonic)`);
});

test('V8 sync ON: preview の table を click → caret jump、modal 開かず、cursor: text', async ({
  page,
}) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  // Find a table data row in preview (絵文字方針 table or similar)
  const center = await page.evaluate(() => {
    const tables = document.querySelectorAll<HTMLTableElement>(
      '[data-pkc-region="text-edit-preview"] table',
    );
    // Pick a table somewhere in the middle
    const t = tables[Math.min(2, tables.length - 1)];
    if (!t) return null;
    t.scrollIntoView({ block: 'center' });
    const rows = t.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const row = rows[Math.min(2, rows.length - 1)];
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!center) return;
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  const modalOpen = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
    return !!b && b.hidden === false;
  });
  // eslint-disable-next-line no-console
  console.log(`V8 table row click: modalOpen=${modalOpen}`);
  await shot(page, 'V8-table-click-no-modal');
});
