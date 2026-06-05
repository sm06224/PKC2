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
 *   4. heading ── target が `<h1>`〜`<h6>` ancestor を持つ
 *   5. no object detected ── pgc-83 region fallback に渡す
 */

export type ObjectKind = 'selection' | 'link' | 'image' | 'heading' | null;

export interface ObjectContext {
  readonly kind: Exclude<ObjectKind, null>;
  readonly target: Element;
  /** kind 別の payload(ad-hoc) */
  readonly payload: {
    readonly text?: string;     // selection / heading
    readonly url?: string;      // link / image
    readonly anchorId?: string; // heading の id 属性
    readonly altText?: string;  // image
  };
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
  // 4. heading(rendered markdown body の見出しのみ ── `<h1>`〜`<h6>`)
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
export function renderObjectContextMenu(ctx: ObjectContext, x: number, y: number): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'pkc-context-menu';
  menu.setAttribute('data-pkc-region', 'context-menu');
  menu.setAttribute('data-pkc-context-object', ctx.kind);
  menu.style.position = 'absolute';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '999';

  const items = itemsForObject(ctx);
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

function itemsForObject(ctx: ObjectContext): ObjectMenuItem[] {
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
    case 'heading': {
      const text = ctx.payload.text ?? '';
      const anchor = ctx.payload.anchorId ?? '';
      return [
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
