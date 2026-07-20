/**
 * Inline dialog(popover)utility — R7(#938 洗練化 backlog)。
 *
 * native `prompt()` / `confirm()` / `alert()` の置き換え先。toast.ts と
 * 同じ「state-driven render の外側」カテゴリ:runtime の一時 UI であり
 * reducer は関知しない。
 *
 * 設計:
 *   - Promise ベース(prompt → string|null、confirm → boolean、
 *     form → Record<string,string>|null)。呼び出し側は continuation
 *     style(`void showInlinePrompt(...).then(...)`)で従来の同期
 *     分岐をそのまま移せる
 *   - anchor(クリック元 element か座標)近傍に fixed 配置、viewport
 *     に clamp。anchor 不在・rect 0 なら中央上寄せ fallback
 *   - Enter = OK / Esc = cancel / 外側 click = cancel
 *   - 同時に 1 つだけ:新しい dialog を開くと前のは cancel 扱いで閉じる
 *   - `validate` が error 文字列を返すと dialog 内に表示して開いたまま
 *     (destructive wipe の「RESET」typed confirmation 用)
 *   - danger: OK button を破壊的操作向けの赤系にし、初期 focus を
 *     cancel 側へ置く(Enter 誤爆で破壊しない)
 *
 * DOM 契約(tests / smoke 用):
 *   - dialog root: `[data-pkc-region="inline-dialog"]`
 *   - 各 input:   `[data-pkc-field="dialog-<key>"]`
 *   - buttons:     `[data-pkc-action="dialog-ok"]` / `"dialog-cancel"`
 *   - error 表示:  `[data-pkc-region="inline-dialog-error"]`
 *
 * button click は直接 listener + stopPropagation で処理する(dialog は
 * root の外(document.body)に住むが、防御的に伝播も止めて action-binder
 * の delegation と衝突しないようにする)。
 */

export interface InlineDialogField {
  key: string;
  /** input 上に表示する小 label。省略で input のみ。 */
  label?: string;
  initial?: string;
  placeholder?: string;
}

export type InlineDialogAnchor = HTMLElement | { x: number; y: number } | null;

export interface InlineFormOptions {
  title: string;
  /** title 下の補足(複数行は \n、pre-line で描画)。 */
  detail?: string;
  fields: InlineDialogField[];
  okLabel?: string;
  cancelLabel?: string;
  /** OK を破壊的操作スタイル(赤)にし、初期 focus を cancel に置く。 */
  danger?: boolean;
  anchor?: InlineDialogAnchor;
  host?: HTMLElement;
  /** error 文字列を返すと dialog 内に表示して閉じない。null で通過。 */
  validate?: (values: Record<string, string>) => string | null;
}

export interface InlinePromptOptions {
  title: string;
  detail?: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  anchor?: InlineDialogAnchor;
  host?: HTMLElement;
  validate?: (value: string) => string | null;
}

export interface InlineConfirmOptions {
  title: string;
  detail?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  anchor?: InlineDialogAnchor;
  host?: HTMLElement;
}

interface ActiveDialog {
  el: HTMLElement;
  cancel: () => void;
}

let active: ActiveDialog | null = null;

/** 開いている dialog を cancel 扱いで即閉じる(tests / cleanup 用)。 */
export function dismissActiveInlineDialog(): void {
  active?.cancel();
}

/** 単一 input の prompt 置き換え。cancel は null、OK は入力値(空可)。 */
export function showInlinePrompt(opts: InlinePromptOptions): Promise<string | null> {
  return showInlineForm({
    title: opts.title,
    detail: opts.detail,
    fields: [{ key: 'value', initial: opts.initial, placeholder: opts.placeholder }],
    okLabel: opts.okLabel,
    cancelLabel: opts.cancelLabel,
    anchor: opts.anchor,
    host: opts.host,
    validate: opts.validate ? (v) => opts.validate!(v['value'] ?? '') : undefined,
  }).then((r) => (r === null ? null : (r['value'] ?? '')));
}

/** confirm 置き換え。OK = true、cancel / Esc / 外側 click = false。 */
export function showInlineConfirm(opts: InlineConfirmOptions): Promise<boolean> {
  return showInlineForm({
    title: opts.title,
    detail: opts.detail,
    fields: [],
    okLabel: opts.okLabel ?? 'OK',
    cancelLabel: opts.cancelLabel,
    danger: opts.danger,
    anchor: opts.anchor,
    host: opts.host,
  }).then((r) => r !== null);
}

/** 複数 field のインラインフォーム(+URL タイルの 2 連 prompt 統合用)。 */
export function showInlineForm(
  opts: InlineFormOptions,
): Promise<Record<string, string> | null> {
  // 同時 1 つ:既存を cancel してから開く。
  active?.cancel();

  const host = opts.host ?? document.body;
  const el = document.createElement('div');
  el.className = 'pkc-inline-dialog';
  el.setAttribute('data-pkc-region', 'inline-dialog');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', opts.title);

  const titleEl = document.createElement('div');
  titleEl.className = 'pkc-inline-dialog-title';
  titleEl.textContent = opts.title;
  el.appendChild(titleEl);

  if (opts.detail) {
    const detailEl = document.createElement('div');
    detailEl.className = 'pkc-inline-dialog-detail';
    detailEl.textContent = opts.detail;
    el.appendChild(detailEl);
  }

  const inputs = new Map<string, HTMLInputElement>();
  for (const field of opts.fields) {
    const wrap = document.createElement('label');
    wrap.className = 'pkc-inline-dialog-field';
    if (field.label) {
      const lab = document.createElement('span');
      lab.className = 'pkc-inline-dialog-label';
      lab.textContent = field.label;
      wrap.appendChild(lab);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pkc-inline-dialog-input';
    input.setAttribute('data-pkc-field', `dialog-${field.key}`);
    if (field.initial !== undefined) input.value = field.initial;
    if (field.placeholder) input.placeholder = field.placeholder;
    wrap.appendChild(input);
    el.appendChild(wrap);
    inputs.set(field.key, input);
  }

  const errorEl = document.createElement('div');
  errorEl.className = 'pkc-inline-dialog-error';
  errorEl.setAttribute('data-pkc-region', 'inline-dialog-error');
  errorEl.hidden = true;
  el.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'pkc-inline-dialog-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'pkc-inline-dialog-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'dialog-cancel');
  cancelBtn.textContent = opts.cancelLabel ?? 'キャンセル';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = opts.danger
    ? 'pkc-inline-dialog-ok pkc-inline-dialog-ok--danger'
    : 'pkc-inline-dialog-ok';
  okBtn.setAttribute('data-pkc-action', 'dialog-ok');
  okBtn.textContent = opts.okLabel ?? 'OK';
  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  el.appendChild(actions);

  // anchor rect は「呼び出し時点」で確定させる(context menu 経由だと
  // anchor element が直後に DOM から外れるため)。
  const anchorPoint = resolveAnchorPoint(opts.anchor);

  return new Promise<Record<string, string> | null>((resolve) => {
    let settled = false;

    const settle = (result: Record<string, string> | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onDocKeydown, true);
      document.removeEventListener('pointerdown', onDocPointerdown, true);
      el.remove();
      if (active?.el === el) active = null;
      resolve(result);
    };

    const cancel = (): void => settle(null);

    const submit = (): void => {
      const values: Record<string, string> = {};
      for (const [key, input] of inputs) values[key] = input.value;
      const err = opts.validate ? opts.validate(values) : null;
      if (err) {
        errorEl.textContent = err;
        errorEl.hidden = false;
        return;
      }
      settle(values);
    };

    const onDocKeydown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        cancel();
      }
    };
    const onDocPointerdown = (ev: PointerEvent): void => {
      if (!el.contains(ev.target as Node)) cancel();
    };

    okBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      submit();
    });
    cancelBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      cancel();
    });
    // input 上の Enter = OK(button 上の Enter は native click に任せる)。
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target instanceof HTMLInputElement) {
        ev.preventDefault();
        submit();
      }
    });
    // dialog 内 click は外へ伝播させない(action-binder delegation 防御)。
    el.addEventListener('click', (ev) => ev.stopPropagation());

    document.addEventListener('keydown', onDocKeydown, true);
    // 開いた click 自身で即閉じないよう、外側 click 検出は次 tick から。
    setTimeout(() => {
      if (!settled) document.addEventListener('pointerdown', onDocPointerdown, true);
    }, 0);

    host.appendChild(el);
    positionDialog(el, anchorPoint);
    active = { el, cancel };

    // 初期 focus:input 優先(全選択)、なければ danger は cancel、他は OK。
    const first = opts.fields.length > 0 ? inputs.get(opts.fields[0]!.key) : undefined;
    if (first) {
      first.focus();
      first.select();
    } else if (opts.danger) {
      cancelBtn.focus();
    } else {
      okBtn.focus();
    }
  });
}

function resolveAnchorPoint(anchor: InlineDialogAnchor | undefined): { x: number; y: number } | null {
  if (!anchor) return null;
  if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    // 切断済み element は rect が全 0 → 中央 fallback。
    if (r.width === 0 && r.height === 0 && r.x === 0 && r.y === 0) return null;
    return { x: r.left, y: r.bottom + 4 };
  }
  return { x: anchor.x, y: anchor.y };
}

function positionDialog(el: HTMLElement, point: { x: number; y: number } | null): void {
  el.style.position = 'fixed';
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const rect = el.getBoundingClientRect();
  const w = rect.width || 280;
  const h = rect.height || 120;
  let x: number;
  let y: number;
  if (point) {
    x = point.x;
    y = point.y;
  } else {
    x = Math.max(8, (vw - w) / 2);
    y = Math.max(8, vh * 0.3);
  }
  if (x + w > vw - 8) x = Math.max(8, vw - w - 8);
  if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
