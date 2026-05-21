/**
 * 領域 6:見出し折りたたみ。
 *
 * render 済み markdown body の **top-level 見出し**(`<h1>`〜`<h6>`)を、
 * それぞれの section content と共に native `<details>` で畳めるよう
 * 再構成する。`<summary>` に見出しを移動し、次の同レベル以上の見出し
 * までの content を `<details>` body へまとめる(見出しレベルで nest)。
 *
 * - **記法ゼロ拡張** ── markdown source は標準 `# X` のまま不変。
 *   strippable / forward-compat は自動成立(見出しは元々 CommonMark)。
 * - 開閉は native `<details>` ── JS 不要、全 render surface で動作。
 * - 既定は展開(`open`)── 描画は従来と同じ見た目、見出しが畳める
 *   ようになるだけ。畳み状態は runtime のみ(再 render でリセット)。
 * - `expandTransclusions` と同じ features 層 DOM 操作。detail-presenter
 *   と rendered-viewer の両方から呼ぶ(CLAUDE.md §9 の 3 surface 規約)。
 *
 * scope:`container` の **直下** 見出しのみ対象。`:::section` 等の中に
 * ネストした見出しは対象外(v1。文書構造上 見出しは通常 top-level)。
 */

interface FoldFrame {
  level: number;
  details: HTMLDetailsElement;
}

/** `<h1>`〜`<h6>` なら 1〜6、それ以外は 0。 */
function headingLevel(el: Element): number {
  const m = /^H([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
}

/**
 * render 済み markdown container の top-level 見出しを native `<details>`
 * へ再構成する。見出しが 1 つも無ければ no-op。
 */
export function applyHeadingFold(container: HTMLElement): void {
  const children = Array.from(container.children);
  if (children.length === 0) return;
  if (!children.some((c) => headingLevel(c) > 0)) return;

  const doc = container.ownerDocument;
  // 現在 open な見出し section の stack(浅い→深い)。
  const stack: FoldFrame[] = [];
  for (const child of children) {
    const lvl = headingLevel(child);
    if (lvl > 0) {
      // 同レベル以上の section を閉じる(レベルで nest)。
      while (stack.length > 0 && stack[stack.length - 1]!.level >= lvl) {
        stack.pop();
      }
      const details = doc.createElement('details');
      details.className = 'pkc-heading-fold';
      details.open = true;
      const summary = doc.createElement('summary');
      summary.className = 'pkc-heading-fold-summary';
      summary.appendChild(child); // 見出しを summary へ移動
      details.appendChild(summary);
      const parent = stack.length > 0 ? stack[stack.length - 1]!.details : container;
      parent.appendChild(details);
      stack.push({ level: lvl, details });
    } else {
      // 非見出し content は現在の section(無ければ container 直下)へ。
      const parent = stack.length > 0 ? stack[stack.length - 1]!.details : container;
      parent.appendChild(child);
    }
  }
}
