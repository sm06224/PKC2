/**
 * 2026-07 split-sync rebuild — piecewise-linear scroll mapping の
 * visual parity(real OS wheel / 実測 rect / doctrine 準拠)。
 *
 * User 依頼:「レンダリング結果と元のマークダウンを紐づけて、編集画面で
 * 同期表示させる機能。今もあるけど、まともに動かない。作り直して」
 *
 * 旧実装で記録された故障モードを、それぞれ real event で regression 化:
 *   W1. editor wheel → preview が連続・単調に追従(旧: caret 移動時のみ)
 *       + 逆方向 wheel が **即座に** 効く(旧報告「逆方向 scroll が
 *       一度だけ効かない」= 80ms suppression timer race)
 *   W2. preview wheel → editor が追従(旧: 完全 no-op だった新機能)
 *   W3. アンカー精度: heading 行を editor の上端に置くと、preview の
 *       対応 block も上端に来る(旧: ブロック高÷行数の比例割りで
 *       「あっという間に表示ずれ」)
 *   W4. 幅変更(高さが変わる)後も写像が再構築され精度を保つ
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

// Heading ごとに本文量が異なる(= editor 行数と preview 高さの比が
// 一定でない)fixture。比例 mapping では precision が出ない構成を
// 意図的に作る。tall fence + 長 paragraph(wrap で高さが幅依存)入り。
const BODY = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    lines.push(`# Section ${i.toString().padStart(2, '0')}`);
    if (i % 3 === 0) {
      lines.push(`Long paragraph ${i}: ` + 'wrap-wrap '.repeat(40));
    } else {
      lines.push(`Short para ${i}.`);
    }
    if (i % 5 === 0) {
      lines.push('```');
      for (let j = 0; j < 6; j++) lines.push(`fence line ${j} of section ${i}`);
      lines.push('```');
    }
    lines.push('');
  }
  return lines.join('\n');
})();

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor();
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 10_000 });
  await page.evaluate((body) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    ta.value = body;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 両 pane を固定高に制約して確実に内部 scroll を発生させる
    // (wheel-then-reselect spec と同じ手法)。
    ta.style.height = '320px';
    ta.style.maxHeight = '320px';
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (pv) {
      pv.style.height = '320px';
      pv.style.maxHeight = '320px';
    }
  }, BODY);
  // 500ms input debounce の preview 再 render を待つ。
  await page.waitForTimeout(900);
  // seed 直後は caret が末尾(= 両 pane 最下部に整列)なので、テストの
  // 出発点を先頭に戻す。scrollTop 直接セットは echo filter 上 user
  // scroll として扱われ、preview も写像追従で 0 に戻る。
  await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
    ta.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForTimeout(200);
}

function paneState(page: Page) {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]')!;
    return {
      taScroll: ta.scrollTop,
      taMax: Math.max(0, ta.scrollHeight - ta.clientHeight),
      pvScroll: pv.scrollTop,
      pvMax: Math.max(0, pv.scrollHeight - pv.clientHeight),
    };
  });
}

async function wheelOn(page: Page, region: 'editor' | 'preview', deltaY: number, times: number): Promise<void> {
  const center = await page.evaluate((which: string) => {
    const el = which === 'editor'
      ? document.querySelector<HTMLElement>('textarea[data-pkc-field="body"]')
      : document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, region);
  if (!center) throw new Error(`${region} pane missing`);
  await page.mouse.move(center.x, center.y);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(35);
  }
  // rAF follow settle.
  await page.waitForTimeout(120);
}

test('W1. editor real wheel → preview 連続追従、逆方向は即座に効く', async ({ page }) => {
  await boot(page);
  const s0 = await paneState(page);
  expect(s0.taMax).toBeGreaterThan(300); // fixture is scrollable
  expect(s0.pvMax).toBeGreaterThan(300);

  // 下方向 wheel: preview が追従して単調増加。
  const samples: number[] = [s0.pvScroll];
  for (let step = 0; step < 4; step++) {
    await wheelOn(page, 'editor', 240, 2);
    samples.push((await paneState(page)).pvScroll);
  }
  for (let i = 1; i < samples.length; i++) {
    expect(
      samples[i]!,
      `preview must follow editor wheel monotonically (samples=${samples.join(',')})`,
    ).toBeGreaterThan(samples[i - 1]!);
  }

  // 逆方向 1 発目が即座に効く(旧「一度だけ効かない」の regression 弁)。
  const beforeReverse = await paneState(page);
  await wheelOn(page, 'editor', -240, 1);
  const afterReverse = await paneState(page);
  expect(
    afterReverse.taScroll,
    'first reverse wheel must move the editor immediately',
  ).toBeLessThan(beforeReverse.taScroll);
  expect(
    afterReverse.pvScroll,
    'preview must follow the FIRST reverse wheel (no swallowed swipe)',
  ).toBeLessThan(beforeReverse.pvScroll);
});

test('W2. preview real wheel → editor が追従(旧 no-op の新機能)', async ({ page }) => {
  await boot(page);
  const s0 = await paneState(page);
  await wheelOn(page, 'preview', 300, 4);
  const s1 = await paneState(page);
  expect(s1.pvScroll, 'preview itself scrolled').toBeGreaterThan(s0.pvScroll);
  expect(s1.taScroll, 'editor must follow preview wheel').toBeGreaterThan(s0.taScroll);

  // 逆方向も即応。
  await wheelOn(page, 'preview', -300, 2);
  const s2 = await paneState(page);
  expect(s2.taScroll, 'editor must follow reverse preview wheel').toBeLessThan(s1.taScroll);
});

/**
 * アンカー精度の実測。editor 側で `# Section 20` の行頭 Y(mirror 実測
 * ではなく、実際に scrollTop をその行に合わせる)へスクロールし、
 * preview 側の該当 block(data-pkc-source-line=その行)が pane 上端
 * 近傍に来ることを確認する。piecewise-linear はアンカー点で誤差 ~0。
 */
async function measureAnchorError(page: Page, sectionIndex: number): Promise<number> {
  return page.evaluate((idx: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]')!;
    // Source line of `# Section <idx>`.
    const lines = ta.value.split('\n');
    const marker = `# Section ${String(idx).padStart(2, '0')}`;
    const line = lines.findIndex((l) => l === marker);
    if (line < 0) throw new Error('marker line missing');
    const block = pv.querySelector<HTMLElement>(`[data-pkc-source-line="${line}"]`);
    if (!block) throw new Error(`anchor block for line ${line} missing`);
    const pr = pv.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    // Error = block top vs preview pane top(px)。
    return Math.abs(br.top - (pr.top + pv.clientTop));
  }, sectionIndex);
}

async function scrollEditorToSection(page: Page, sectionIndex: number): Promise<void> {
  // Real wheel まで再現する必要はない(scroll イベント経路は W1 で検証
  // 済)。ここでは「editor scrollTop = 行頭 Y」を直接設定し(user scroll
  // として echo filter を通過する)、写像の精度だけを測る。
  await page.evaluate((idx: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const lines = ta.value.split('\n');
    const marker = `# Section ${String(idx).padStart(2, '0')}`;
    const line = lines.findIndex((l) => l === marker);
    if (line < 0) throw new Error('marker line missing');
    // caret を行頭に置いて caret 座標実測ヘルパーと同じ経路で行 Y を得る
    // 代わりに、単純に「行番号×行高」ではなく textarea 自身に測らせる:
    // selectionStart を行頭にして blur せず scroll だけ動かすため、
    // ここは line-metrics と同じ mirror を使わず、いったん大きく scroll
    // してから微調整する簡便法は取らない。素直に mirror で測る。
    const computed = window.getComputedStyle(ta);
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:absolute;visibility:hidden;top:0;left:-9999px;overflow:hidden;height:auto';
    for (const p of ['boxSizing','width','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','paddingTop','paddingRight','paddingBottom','paddingLeft','fontStyle','fontWeight','fontSize','lineHeight','fontFamily','letterSpacing','tabSize','whiteSpace','wordWrap','overflowWrap'] as const) {
      (mirror.style as unknown as Record<string, string>)[p] = (computed as unknown as Record<string, string>)[p] ?? '';
    }
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    const gutter = Math.max(0, ta.offsetWidth - ta.clientWidth
      - (parseFloat(computed.borderLeftWidth) || 0) - (parseFloat(computed.borderRightWidth) || 0));
    if (gutter > 0) {
      const w = parseFloat(mirror.style.width) || 0;
      if (w > 0) mirror.style.width = `${w - gutter}px`;
    }
    mirror.textContent = lines.slice(0, line).map((l) => `${l}\n`).join('');
    const markerSpan = document.createElement('span');
    markerSpan.textContent = '​';
    mirror.appendChild(markerSpan);
    document.body.appendChild(mirror);
    const y = markerSpan.getBoundingClientRect().top - mirror.getBoundingClientRect().top
      - (parseFloat(computed.borderTopWidth) || 0);
    document.body.removeChild(mirror);
    ta.scrollTop = Math.max(0, Math.round(y));
    ta.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, sectionIndex);
  await page.waitForTimeout(150); // rAF follow + settle
}

test('W3. アンカー精度: heading 行 = editor 上端 → preview の対応 block も上端近傍', async ({ page }) => {
  await boot(page);
  for (const idx of [10, 20]) {
    await scrollEditorToSection(page, idx);
    const err = await measureAnchorError(page, idx);
    // アンカー点上では写像誤差 ≈ 0。実測は sub-px + 丸め + margin で
    // 数 px。24px(約 1 行)以内を要求。
    expect(err, `Section ${idx}: anchor alignment error ${err.toFixed(1)}px`).toBeLessThanOrEqual(24);
  }
});

test('W4. 幅変更で高さが変わっても写像が再構築され精度を保つ(旧: 即ズレ)', async ({ page }) => {
  await boot(page);
  await scrollEditorToSection(page, 20);
  const errBefore = await measureAnchorError(page, 20);
  expect(errBefore).toBeLessThanOrEqual(24);

  // 幅を変える → wrap 変化で両 pane の高さ地図が変わる(旧実装の
  // 「画面幅によって縦幅を変えるオブジェクトがあると、あっという間に
  // 表示ずれている」条件)。
  await page.setViewportSize({ width: 900, height: 720 });
  await page.waitForTimeout(300);

  await scrollEditorToSection(page, 20);
  const errAfter = await measureAnchorError(page, 20);
  expect(
    errAfter,
    `after resize, mapping must rebuild (error ${errAfter.toFixed(1)}px)`,
  ).toBeLessThanOrEqual(24);
});
