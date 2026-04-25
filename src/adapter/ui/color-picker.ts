/**
 * Color tag picker — Slice 3 popover presenter.
 *
 * A small inline popover anchored to the trigger button rendered in
 * the detail title row. The picker shows the eight v1 palette
 * swatches in canonical palette order plus a `なし / None`
 * affordance, all carrying the action attributes that
 * `action-binder.ts` dispatches on.
 *
 * Design notes:
 *   - Markup-only. Open/close lifecycle, outside-click handling, and
 *     focus restoration live in `action-binder.ts`.
 *   - The trigger button is rendered separately (see
 *     `renderColorPickerTrigger`) so the renderer can compose it into
 *     whatever meta row makes sense — currently the detail title row.
 *   - Popover positioning uses CSS-only flow: the popover follows the
 *     trigger as a sibling element and is positioned via absolute
 *     coordinates set by the caller, so this module does not need to
 *     know about layout details.
 */

import { COLOR_TAG_IDS, isColorTagId } from '../../features/color/color-palette';

/**
 * Localized labels for tooltips / aria-label. Keys are palette IDs.
 *
 * Spec: `docs/spec/color-palette-v1.md` §3 vocabulary table — the
 * Japanese label is the picker / tooltip surface. Adding a new ID
 * means adding both a HEX value (in CSS) and a label here.
 */
const COLOR_LABELS: Record<string, string> = {
  red: '赤',
  orange: 'オレンジ',
  yellow: '黄',
  green: '緑',
  blue: '青',
  purple: '紫',
  pink: 'ピンク',
  gray: 'グレー',
};

/**
 * Render the trigger button that opens the popover. The current color
 * (if any known palette ID) is shown as a small dot inside the button;
 * an unknown / missing color renders as a neutral icon.
 *
 * - `data-pkc-action="open-color-picker"` → action-binder opens the
 *   popover for the entry whose lid is on the surrounding row.
 * - `data-pkc-color-tag-current` carries the current color so the
 *   picker can highlight the active swatch on open.
 */
export function renderColorPickerTrigger(
  currentColor: string | null | undefined,
  options: { disabled?: boolean } = {},
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-color-picker-trigger';
  btn.setAttribute('data-pkc-action', 'open-color-picker');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const isKnown =
    typeof currentColor === 'string' && isColorTagId(currentColor);
  const isUnknown =
    typeof currentColor === 'string' &&
    currentColor !== '' &&
    !isKnown;

  if (isKnown) {
    btn.setAttribute('data-pkc-color-tag-current', currentColor);
    btn.setAttribute('title', `カラー: ${COLOR_LABELS[currentColor!] ?? currentColor!}`);
    btn.setAttribute('aria-label', `カラー: ${COLOR_LABELS[currentColor!] ?? currentColor!}`);
  } else if (isUnknown) {
    // Carry the unknown ID through the attribute so a round-trip via
    // copy / paste / re-render does not lose data, but render the dot
    // as neutral — the user has no UI to act on it.
    btn.setAttribute('data-pkc-color-tag-current', currentColor!);
    btn.setAttribute('title', `カラー(palette 外): ${currentColor}`);
    btn.setAttribute('aria-label', `カラー (未知の palette ID): ${currentColor}`);
  } else {
    btn.setAttribute('title', 'カラーを設定');
    btn.setAttribute('aria-label', 'カラーを設定');
  }

  if (options.disabled) {
    btn.disabled = true;
  }

  // Visual content: a small dot. Known IDs get the shared
  // `pkc-color-<id>` hue class so the same CSS rule themes the
  // sidebar band, the trigger dot, and every picker swatch.
  // Unknown / missing render with a neutral fallback class.
  const dot = document.createElement('span');
  dot.className = 'pkc-color-picker-trigger-dot';
  if (isKnown) {
    dot.setAttribute('data-pkc-color', currentColor!);
    dot.classList.add(`pkc-color-${currentColor!}`);
  } else {
    dot.classList.add('pkc-color-picker-trigger-dot-empty');
  }
  btn.appendChild(dot);

  return btn;
}

/**
 * Render the popover panel itself. The renderer calls this after the
 * trigger button is clicked; positioning is handled by the caller.
 *
 * The panel exposes:
 *   - 8 swatch buttons, each with `data-pkc-action="apply-color-tag"`
 *     and `data-pkc-color="<id>"`.
 *   - A "なし" affordance with `data-pkc-action="clear-color-tag"`.
 *   - A close affordance with `data-pkc-action="close-color-picker"`.
 *
 * Selected state (if `currentColor` is a known ID) is reflected via a
 * `data-pkc-active` attribute on the matching swatch.
 */
export function renderColorPickerPopover(
  currentColor: string | null | undefined,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pkc-color-picker-popover';
  panel.setAttribute('data-pkc-region', 'color-picker-popover');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'カラー選択');

  const row = document.createElement('div');
  row.className = 'pkc-color-picker-row';

  const knownActive =
    typeof currentColor === 'string' && isColorTagId(currentColor)
      ? currentColor
      : null;
  // "no color" is only when the field is genuinely absent. An unknown
  // string (e.g. `'teal'` from a future palette) is its own state —
  // the picker shows no swatch as active AND keeps the clear
  // affordance inactive, since clicking either would change the value.
  const noColor =
    currentColor === null ||
    currentColor === undefined ||
    currentColor === '';

  for (const id of COLOR_TAG_IDS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `pkc-color-picker-swatch pkc-color-${id}`;
    swatch.setAttribute('data-pkc-action', 'apply-color-tag');
    swatch.setAttribute('data-pkc-color', id);
    swatch.setAttribute('title', COLOR_LABELS[id] ?? id);
    swatch.setAttribute('aria-label', COLOR_LABELS[id] ?? id);
    if (knownActive === id) {
      swatch.setAttribute('data-pkc-active', 'true');
      swatch.setAttribute('aria-pressed', 'true');
    } else {
      swatch.setAttribute('aria-pressed', 'false');
    }
    row.appendChild(swatch);
  }

  // "なし" affordance — clear the color.
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'pkc-color-picker-clear';
  clearBtn.setAttribute('data-pkc-action', 'clear-color-tag');
  clearBtn.setAttribute('title', '色なし');
  clearBtn.setAttribute('aria-label', '色なし');
  clearBtn.textContent = '⊘';
  if (noColor) {
    clearBtn.setAttribute('data-pkc-active', 'true');
    clearBtn.setAttribute('aria-pressed', 'true');
  } else {
    clearBtn.setAttribute('aria-pressed', 'false');
  }
  row.appendChild(clearBtn);

  panel.appendChild(row);

  return panel;
}
