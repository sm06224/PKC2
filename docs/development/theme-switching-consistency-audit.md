# Theme 切替整合 audit — Phase 3 PR-2S

**Status**: 設計確定(2026-05-12)
**実装 PR**: PR-2S
**user 報告**: 2026-05-10「System dark↔light の切替で文字色がおかしくなる時がある。逆パターンあり。iOS だけじゃない、Windows もなる。顕著なのは graph の galaxy と右ペインの TOC」+ 「textlog に貼付した表をクリックすると PIP で開くけど、固定でダーク」

---

## 1. 問題の分析

### 1.1 発生サイト 3 件

| Site | 症状 | 原因仮説 |
|------|------|---------|
| **(a) mermaid graph(galaxy theme)** | system theme 切替で graph 色が固定 | mermaid `theme: 'dark'` を初期化時に固定指定、`prefers-color-scheme` 動的 listen していない |
| **(b) 右ペイン TOC** | TOC 内文字色が前 theme のまま | `--c-fg` CSS variable が `:root` 1 段で定義、`@media (prefers-color-scheme: dark)` 切替時に CSS class 切替が走らない / CSS variable 更新タイミングで dirty paint |
| **(c) PIP popup(textlog 表 click)| dark で固定 | PIP popup 内 inline `<style>` が `color: #222` 固定、`@media (prefers-color-scheme)` 未対応 |

### 1.2 user 環境

- iOS / Windows 両方発生(Mac は未確認)
- system theme 切替時 → 即時不整合
- iOS Safari + PWA Add to Home Screen mode で特に顕著(cache 問題と複合)

---

## 2. 設計アプローチ

### 2.1 共通方針

CSS variable system が PKC2 の theme の正規(`:root` で `--c-bg` / `--c-fg` 等を定義、CSS は variable 参照)。問題は **CSS variable が `prefers-color-scheme` 連動で再評価されないサイト** にある。

修正方針:
1. **CSS variable の dual-track**:`:root` で light default、`@media (prefers-color-scheme: dark)` で override
2. **JS subscription**:`window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` で theme 変更通知 → mermaid render 等を再 trigger
3. **PIP popup**:opener から theme 状態を継承 + popup 内で matchMedia listen

### 2.2 (a) mermaid galaxy 修正

`src/features/markdown/markdown-render.ts` 内の mermaid 描画経路:

```ts
function renderMermaidBlock(code: string): string {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = isDark ? 'dark' : 'default';  // 動的決定
  // ... mermaid.initialize({ theme }) → mermaid.render(code)
}
```

加えて `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  // re-render all mermaid blocks
  document.querySelectorAll('.mermaid').forEach(re-init);
})` を boot 時に install。

### 2.3 (b) 右ペイン TOC 修正

`docs/manual` の TOC sidebar style を base.css で確認:

```css
.pkc-toc-sidebar {
  background: var(--c-panel-bg);
  color: var(--c-fg);
}

:root {
  --c-panel-bg: #f9fafb;
  --c-fg: #1f2937;
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-panel-bg: #1f2937;
    --c-fg: #f3f4f6;
  }
}
```

問題は **PKC2 が `color-scheme: light` を CSS でハードコード** している箇所がある可能性。base.css 全件確認 + `color-scheme: light dark` に変更。

### 2.4 (c) PIP popup theme 継承

`src/adapter/ui/rendered-viewer.ts` の inline `<style>` で:

```css
:root { color-scheme: light; }     /* ← 問題:light 固定 */
body { background: #fafafa; color: #222; }
```

修正:

```css
:root { color-scheme: light dark; }  /* OS theme 受容 */
body {
  background: #fafafa;
  color: #222;
}
@media (prefers-color-scheme: dark) {
  body { background: #1f2937; color: #f3f4f6; }
  /* article body / TOC sidebar / table border 等も dark variant */
}
```

加えて opener から theme 状態を継承(必要なら postMessage で):

```ts
// rendered-viewer popup 内 inline script
window.addEventListener('message', (ev) => {
  if (ev.data?.type === 'pkc-theme-changed') {
    document.documentElement.setAttribute('data-theme', ev.data.theme);
  }
});
```

---

## 3. visual parity test

`tests/smoke/theme-switching-parity.spec.ts`(NEW):

| scenario | 操作 | 期待 |
|---------|-----|------|
| S1 light → dark 切替 | `page.emulateMedia({ colorScheme: 'dark' })` | 右ペイン TOC が dark theme、mermaid graph も dark theme |
| S2 dark → light | 逆 | 全 site が light theme に追従 |
| S3 PIP popup | textlog 表 click + dark mode | popup も dark で render |
| S4 PIP popup theme follow | popup 開いた後 system を切替 | popup も追従 |

`getComputedStyle(el).color` / `.backgroundColor` で computed value を assert。screenshot も全 scenario で残す。

---

## 4. 実装規模

| ファイル | 内容 | 規模 |
|---------|-----|------|
| `src/styles/base.css` | `:root` `color-scheme: light dark` + `@media (prefers-color-scheme: dark)` で variable override | ~50 行追加 |
| `src/features/markdown/markdown-render.ts` | mermaid 動的 theme + matchMedia listen | ~30 行 |
| `src/adapter/ui/rendered-viewer.ts` | popup inline `<style>` の theme awareness | ~40 行 |
| `src/main.ts` | matchMedia listener boot install | ~20 行 |
| tests | smoke parity 4 scenario | ~150 行 |

合計 ~300 行、bundle.css +~1.5 KB / bundle.js +~1 KB 想定。

---

## 5. 開放問題

| OQ | 内容 |
|----|-----|
| OQ-THEME-1 | user-explicit theme(将来:Flag `theme.mode = 'light' | 'dark' | 'system'`)を追加するか?| 現状 system 追従のみ |
| OQ-THEME-2 | mermaid 以外の external lib(highlight.js / KaTeX 等)も theme 連動か? | 現状 highlight は 1 種、KaTeX 未使用、ad-hoc 対応 |

---

## 6. 関連 doc

- iOS Safari hard reload(2026-05-10、Add to Home Screen cache 問題):`docs/development/ios-safari-hard-reload.md`(参照)
- CSS architecture audit(theme.scale 連動):`docs/development/css-architecture-audit-2026-05.md`
- Phase 3 stack plan:`docs/development/phase3-stack-execution-plan-2026-05.md`
