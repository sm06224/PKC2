/**
 * Object-aware context menu(wave-α PR pgc-84、MASTER.md §4.7)。
 *
 * pgc-83 region fallback の **前段** に挿入される、右クリック対象の **具体的
 * object**(リンク / 見出し / 画像 / 選択範囲)に基づく menu を生成する。
 *
 * 観察:VSCode / Notion / Obsidian の context menu は object に応じて
 * 出る item set が変わる ── PKC2 もここに寄せる。Tier 0 flag
 * `shell.context_menu_universal_enabled` を pgc-83 と **共有**(同 flag で
 * universal context menu の全機能を統合 gate)。
 *
 * Item handler は **inline closure**(`navigator.clipboard.writeText` 等の
 * browser API を target text と共に capture)── pgc-80 command-palette
 * registry には登録しない(context-dependent な動作のため)。
 *
 * 検出 priority(handleContextMenu 経由で本 module の API を呼ぶ caller が
 * 順序を担う):
 *   1. selection ── selected text が non-empty(textarea / input 上以外)
 *   2. link ── target が `<a href>` ancestor を持つ
 *   3. image ── target が `<img>` ancestor を持つ(asset / inline)
 *   4. table ── target が `.pkc-md-rendered` 内の `<table>` ancestor を持つ
 *      (#902、2026-07-12 user 要望:各種形式でのコピー / エクスポート)
 *   5. heading ── target が `<h1>`〜`<h6>` ancestor を持つ
 *   6. no object detected ── pgc-83 region fallback に渡す
 */

import { extractTableRows, rowsToTsv, rowsToCsv, rowsToMarkdown } from '../../features/markdown/table-export';

export type ObjectKind = 'selection' | 'link' | 'image' | 'table' | 'heading' | null;

export interface ObjectContext {
  readonly kind: Exclude<ObjectKind, null>;
  readonly target: Element;
  /** kind 別の payload(ad-hoc) */
  readonly payload: {
    readonly text?: string;     // selection / heading
    readonly url?: string;      // link / image
    readonly anchorId?: string; // heading の id 属性 / TOC slug
    readonly altText?: string;  // image
  };
}

/**
 * #869(A): adapter-supplied hooks for object-menu items that need app
 * state / windowing (which this pure menu builder cannot reach). Passed
 * by `action-binder` into `renderObjectContextMenu`.
 */
export interface ObjectMenuHooks {
  /**
   * Open the chapter/section identified by a heading slug (= rendered
   * heading `id` / TOC `data-pkc-toc-slug`) in a separate edit window.
   * When provided, a「この章を編集」item is added to the heading menu.
   */
  readonly onEditHeadingSection?: (anchorId: string, headingText: string) => void;
}

/**
 * 右クリック target + 現 selection から ObjectContext を抽出する。
 * 該当オブジェクトが無ければ `null`(caller が region fallback に行く)。
 *
 * textarea / input 内では selection を **検出しない**(native context menu
 * を尊重するため caller 側で early return される、本 helper は呼ばれない
 * はず ── ただし defensive に null 返却)。
 */
export function detectObjectContext(target: Element | null, selection: Selection | null): ObjectContext | null {
  if (!target) return null;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return null;

  // 1. selection
  if (selection && !selection.isCollapsed) {
    const text = selection.toString().trim();
    if (text) {
      return {
        kind: 'selection',
        target,
        payload: { text },
      };
    }
  }
  // 2. link
  const link = target.closest<HTMLAnchorElement>('a[href]');
  if (link) {
    const url = link.getAttribute('href') ?? '';
    if (url) {
      return {
        kind: 'link',
        target: link,
        payload: { url, text: link.textContent?.trim() ?? '' },
      };
    }
  }
  // 3. image
  const img = target.closest<HTMLImageElement>('img');
  if (img) {
    const url = img.getAttribute('src') ?? '';
    const alt = img.getAttribute('alt') ?? '';
    if (url) {
      return {
        kind: 'image',
        target: img,
        payload: { url, altText: alt },
      };
    }
  }
  // 4. table(#902): rendered markdown 内の表 → 各種形式コピー/エクスポート。
  //    `.pkc-md-rendered` scope に限定(spreadsheet presenter 等の UI table を
  //    誤検出しない)。セル内 link / image / selection は上の分岐が先に勝つ。
  const table = target.closest<HTMLTableElement>('.pkc-md-rendered table');
  if (table) {
    return {
      kind: 'table',
      target: table,
      payload: {},
    };
  }
  // 5. TOC entry(#869A): 目次の見出しリンクを右クリック → heading object
  //    として扱う(別ウィンドウ章編集の入口)。slug は rendered 見出しの
  //    `id` と一致(makeSlugCounter 共有)。
  const tocLink = target.closest<HTMLElement>('[data-pkc-toc-slug]');
  if (tocLink) {
    const slug = tocLink.getAttribute('data-pkc-toc-slug') ?? '';
    if (slug) {
      return {
        kind: 'heading',
        target: tocLink,
        payload: { text: tocLink.textContent?.trim() ?? '', anchorId: slug },
      };
    }
  }
  // 6. heading(rendered markdown body の見出しのみ ── `<h1>`〜`<h6>`)
  const heading = target.closest<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
  if (heading) {
    return {
      kind: 'heading',
      target: heading,
      payload: {
        text: heading.textContent?.trim() ?? '',
        anchorId: heading.id ?? '',
      },
    };
  }
  return null;
}

/**
 * Object-aware context menu DOM を生成する。
 * 既存 `.pkc-context-menu` CSS を再利用、`data-pkc-context-object` attribute
 * で kind を露出(test / debug 用)。
 */
export function renderObjectContextMenu(
  ctx: ObjectContext,
  x: number,
  y: number,
  hooks?: ObjectMenuHooks,
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'pkc-context-menu';
  menu.setAttribute('data-pkc-region', 'context-menu');
  menu.setAttribute('data-pkc-context-object', ctx.kind);
  menu.style.position = 'absolute';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '999';

  const items = itemsForObject(ctx, hooks);
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'pkc-context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-context-menu-item';
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-pkc-cmd-id', item.id);
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      menu.remove();
      item.handler();
    });
    menu.appendChild(btn);
  }
  return menu;
}

interface ObjectMenuItem {
  readonly id: string;
  readonly label: string;
  readonly handler: () => void;
  readonly separator?: boolean;
}

function itemsForObject(ctx: ObjectContext, hooks?: ObjectMenuHooks): ObjectMenuItem[] {
  switch (ctx.kind) {
    case 'selection': {
      const text = ctx.payload.text ?? '';
      return [
        {
          id: 'object.copy-selection',
          label: '📋 選択範囲をコピー',
          handler: () => copyToClipboard(text),
        },
        {
          id: 'object.copy-as-quote',
          label: '💬 引用としてコピー(> 行頭)',
          handler: () => {
            const quoted = text.split('\n').map((l) => `> ${l}`).join('\n');
            copyToClipboard(quoted);
          },
        },
      ];
    }
    case 'link': {
      const url = ctx.payload.url ?? '';
      const text = ctx.payload.text ?? '';
      return [
        {
          id: 'object.open-link',
          label: '🔗 リンクを開く',
          handler: () => {
            if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
          },
        },
        {
          id: 'object.copy-link-url',
          label: '📋 URL をコピー',
          handler: () => copyToClipboard(url),
        },
        {
          id: 'object.copy-link-markdown',
          label: '📋 Markdown リンクとしてコピー([title](url))',
          handler: () => copyToClipboard(`[${text || url}](${url})`),
        },
      ];
    }
    case 'image': {
      const url = ctx.payload.url ?? '';
      const alt = ctx.payload.altText ?? '';
      return [
        {
          id: 'object.open-image',
          label: '🖼 別タブで開く',
          handler: () => {
            if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
          },
        },
        {
          id: 'object.copy-image-url',
          label: '📋 画像 URL をコピー',
          handler: () => copyToClipboard(url),
        },
        {
          id: 'object.copy-image-markdown',
          label: '📋 Markdown 画像としてコピー(![alt](url))',
          handler: () => copyToClipboard(`![${alt}](${url})`),
        },
      ];
    }
    case 'table': {
      // #902:表の各種形式コピー / エクスポート。抽出は click 時に行う
      // (menu 表示時点で固定すると sort / filter 適用後の変化を取りこぼす)。
      // xlsx ネイティブは exceljs 同梱で bundle が size budget を超えるため
      // 見送り(TSV 貼り付け + BOM 付き CSV で Excel ユースケースを充足)。
      const tableEl = ctx.target as HTMLTableElement;
      const rows = (): ReturnType<typeof extractTableRows> => extractTableRows(tableEl);
      return [
        {
          id: 'object.copy-table-tsv',
          label: '📋 表をコピー(Excel / Sheets 貼り付け用)',
          handler: () => copyToClipboard(rowsToTsv(rows())),
        },
        {
          id: 'object.copy-table-csv',
          label: '📋 CSV としてコピー',
          handler: () => copyToClipboard(rowsToCsv(rows())),
        },
        {
          id: 'object.copy-table-markdown',
          label: '📋 Markdown 表としてコピー',
          handler: () => copyToClipboard(rowsToMarkdown(rows())),
        },
        { id: 'sep', label: '', handler: () => {}, separator: true },
        {
          id: 'object.download-table-csv',
          label: '💾 CSV をダウンロード(Excel 対応・BOM 付き)',
          handler: () => downloadText('table.csv', '\uFEFF' + rowsToCsv(rows()), 'text/csv;charset=utf-8'),
        },
        {
          id: 'object.download-table-tsv',
          label: '💾 TSV をダウンロード',
          handler: () => downloadText('table.tsv', rowsToTsv(rows()), 'text/tab-separated-values;charset=utf-8'),
        },
      ];
    }
    case 'heading': {
      const text = ctx.payload.text ?? '';
      const anchor = ctx.payload.anchorId ?? '';
      return [
        // #869(A): 別ウィンドウで当該章だけ編集(adapter が hook を供給した
        // 場合のみ + slug が解決できる場合のみ)。menu 先頭に置く。
        ...(anchor && hooks?.onEditHeadingSection
          ? [{
              id: 'object.edit-heading-section',
              label: '✎ この章を編集(別ウィンドウ)',
              handler: () => hooks.onEditHeadingSection!(anchor, text),
            }]
          : []),
        {
          id: 'object.copy-heading-text',
          label: '📋 見出しテキストをコピー',
          handler: () => copyToClipboard(text),
        },
        ...(anchor
          ? [{
              id: 'object.copy-heading-anchor',
              label: '🔗 アンカー URL をコピー(#id)',
              handler: () => {
                if (typeof window === 'undefined') return;
                const href = `${window.location.origin}${window.location.pathname}#${anchor}`;
                copyToClipboard(href);
              },
            }]
          : []),
      ];
    }
  }
}

function copyToClipboard(text: string): void {
  if (typeof navigator === 'undefined') return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback:execCommand(deprecated but works in older / restricted browsers)
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  if (typeof document === 'undefined') return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // give up silently
  }
  ta.remove();
}

/** #902:テキストを file としてダウンロード(blob + a[download]、即 revoke)。 */
function downloadText(filename: string, text: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
