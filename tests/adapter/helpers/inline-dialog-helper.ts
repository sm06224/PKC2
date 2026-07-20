/**
 * R7(#938)inline dialog のテスト操作 helper。
 *
 * native prompt/confirm の stub に代わり、action click 後に document に
 * 出現する `[data-pkc-region="inline-dialog"]` へ入力して OK / cancel を
 * click する。dialog の resolve → 呼び出し側 .then の dispatch は
 * microtask なので、click 後に 1 tick 待ってから返す。
 */

export function getInlineDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="inline-dialog"]');
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * dialog に値を入れて OK を click する。
 * - `values` が string → 単一 field(prompt 互換、key='value')
 * - `values` が object → key ごとに `[data-pkc-field="dialog-<key>"]`
 * - `values` 省略 → 入力なしで OK(confirm 互換)
 */
export async function submitInlineDialog(
  values?: Record<string, string> | string,
): Promise<void> {
  const dialog = getInlineDialog();
  if (!dialog) throw new Error('inline dialog not found');
  if (typeof values === 'string') {
    const input = dialog.querySelector<HTMLInputElement>('[data-pkc-field="dialog-value"]');
    if (!input) throw new Error('inline dialog single input not found');
    input.value = values;
  } else if (values) {
    for (const [key, val] of Object.entries(values)) {
      const input = dialog.querySelector<HTMLInputElement>(`[data-pkc-field="dialog-${key}"]`);
      if (!input) throw new Error(`inline dialog input not found: ${key}`);
      input.value = val;
    }
  }
  dialog.querySelector<HTMLButtonElement>('[data-pkc-action="dialog-ok"]')!.click();
  await tick();
}

/** dialog を cancel で閉じる(prompt null / confirm false 互換)。 */
export async function cancelInlineDialog(): Promise<void> {
  const dialog = getInlineDialog();
  if (!dialog) throw new Error('inline dialog not found');
  dialog.querySelector<HTMLButtonElement>('[data-pkc-action="dialog-cancel"]')!.click();
  await tick();
}
