# Pane State Persistence (H-7 / USER_REQUEST_LEDGER S-19)

**Status**: COMPLETED — 2026-04-14
**Category**: H (HANDOVER §6.2 decline → resolved)
**Session mode**: 自主運転モード第 1 号

---

## 1. 要件

sidebar（左ペイン）と meta（右ペイン）の collapsed / expanded 状態を、
リロード後・再描画後も維持する。

- ブラウザリロードで復元される
- どんな dispatch が走っても collapsed 状態が消えない（= 再描画ごとに
  読み直される）
- `Ctrl+\` / `Ctrl+Shift+\` / tray bar クリックのどれを経由しても
  同じように保存される
- localStorage 不可な環境（プライベートモード / quota 超過 / SSR）でも
  fallback して例外を投げない
- 保存値が壊れていても安全にデフォルトに戻る

---

## 2. 解きたかった問題

実装前の実害:

1. sidebar 折り畳み → 検索入力（SET_SEARCH_QUERY）→ 再描画 → sidebar
   が勝手に expand に戻る
2. リロードすると必ず両ペイン expand に戻る

§6.2 の note にも「永続化されない」が記録されていたが、**任意の
dispatch で消える** というのは note 以上の体感痛で、自主運転モード
第 1 号として優先度を上げた。

---

## 3. 設計サマリ

reducer / AppState / user-action には一切触らず、**新 UI action や
新 state field を追加せずに** 永続化を成立させた。

### 3.1 storage helper — `src/adapter/platform/pane-prefs.ts`

```ts
PANE_PREFS_STORAGE_KEY = 'pkc2.panePrefs'
PanePrefs = { sidebar: boolean; meta: boolean }  // true = collapsed
loadPanePrefs(): PanePrefs
setPaneCollapsed(pane, collapsed): PanePrefs
__resetPanePrefsCacheForTest()
```

- in-memory cache で render hot path の localStorage アクセスを 1 回に
  収束
- JSON parse 失敗 / shape drift / `localStorage` 不在は全て
  `DEFAULT_PANE_PREFS` にフォールバック（例外を外に漏らさない）
- `setPaneCollapsed` は同値時 no-op（冗長な write を避ける）

### 3.2 DOM apply — `src/adapter/ui/pane-apply.ts`

```ts
applyPaneCollapsedToDOM(root, prefs)
applyOnePaneCollapsedToDOM(root, pane, collapsed)
```

collapsed 属性 / tray bar display / resize handle collapsed 属性を
1 ヶ所で管理。旧 `togglePane` のインライン分岐と同じ契約を共有。

### 3.3 renderer 連携 — `src/adapter/ui/renderer.ts`

`renderShell` 内で sidebar / meta / tray-left / tray-right / left-handle /
right-handle を生成する直前に `loadPanePrefs()` を呼び、prefs に従って
初期 `data-pkc-collapsed` 属性と `display` を注入する。

**flash が発生しない**: 再描画直後でも DOM が prefs と一致した状態で
マウントされる。

### 3.4 togglePane 連携 — `src/adapter/ui/action-binder.ts`

```ts
function togglePane(root, pane) {
  const paneEl = root.querySelector(...);
  if (!paneEl) return;
  const next = !isCollapsed(paneEl);
  setPaneCollapsed(pane, next);         // persist
  applyOnePaneCollapsedToDOM(root, pane, next);  // DOM
}
```

`Ctrl+\` / `Ctrl+Shift+\` / tray bar クリックは全て `togglePane` を通る
ので、分岐を問わず保存される。

### 3.5 意図的に触らなかったもの

- `reducer` / `AppState` / `UserAction`
- `pane 幅`（resize handle の drag 結果、これは別課題）
- `TOC pane` などの未実装 pane
- multi-window / per-cid 設計
- layout preset / settings UI framework

spec で明示的に禁止された範囲を全て守った。

---

## 4. テスト（+27）

| Layer | File | Count | 範囲 |
|-------|------|-------|------|
| Storage | `tests/adapter/platform/pane-prefs.test.ts` | 12 | default / valid load / malformed JSON / wrong shape / cache / throwing storage / setPaneCollapsed 永続化・no-op・throw safe |
| DOM helper | `tests/adapter/pane-apply.test.ts` | 6 | collapsed セット・クリア / 非対称 prefs / 欠如 pane で no-throw / one-pane 版 |
| End-to-end | `tests/adapter/pane-persistence.test.ts` | 9 | default / 復元（sidebar / meta）/ entry 未選択時の右 tray 挙動 / 壊れた JSON fallback / shortcut で collapse + persist / 再描画で保持 / meta の Ctrl+Shift+\\ / 往復 toggle |
| 既存 regression | `tests/adapter/action-binder-pane-toggle-shortcut.test.ts` | 9 | beforeEach で prefs cache + localStorage を clear する fixture 調整（内容変更なし） |

合計 3742 → 3769（+27）、既存 regression 0。

---

## 5. 変更ファイル

### 新規（4）
- `src/adapter/platform/pane-prefs.ts`
- `src/adapter/ui/pane-apply.ts`
- `tests/adapter/platform/pane-prefs.test.ts`
- `tests/adapter/pane-apply.test.ts`
- `tests/adapter/pane-persistence.test.ts`

### 変更（3）
- `src/adapter/ui/renderer.ts` — `loadPanePrefs()` import + shell 初期
  描画で collapsed 属性注入
- `src/adapter/ui/action-binder.ts` — `togglePane` を `setPaneCollapsed`
  + `applyOnePaneCollapsedToDOM` 経由に書き換え、imports 追加
- `tests/adapter/action-binder-pane-toggle-shortcut.test.ts` — beforeEach
  の cache/localStorage clear のみ

---

## 6. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版 — 自主運転モードで H-7 を昇格・実装 |
