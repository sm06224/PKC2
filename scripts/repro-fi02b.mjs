/**
 * FI-02B browser repro script — FOLDER Ctrl+S
 * Playwright/Chromium headless. Usage: node scripts/repro-fi02b.mjs
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = `file://${resolve(__dirname, '../dist/pkc2.html')}`;

// ── helpers ────────────────────────────────────────────────────────────────

async function waitForReady(page) {
  await page.waitForSelector('[data-pkc-action="create-entry"][data-pkc-archetype="text"]', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function getPhase(page) {
  return await page.evaluate(() => {
    return document.querySelector('[data-pkc-mode="edit"]') ? 'editing' : 'ready';
  });
}

async function getEditingArchetype(page) {
  return await page.evaluate(() => {
    return document.querySelector('[data-pkc-mode="edit"]')?.getAttribute('data-pkc-archetype') ?? null;
  });
}

async function getEditorSelectors(page) {
  return await page.evaluate(() => {
    const editor = document.querySelector('[data-pkc-mode="edit"]');
    if (!editor) return null;
    return {
      archetype: editor.getAttribute('data-pkc-archetype'),
      hasBodyTextarea: !!editor.querySelector('textarea[data-pkc-field="body"]'),
      hasTitleInput: !!editor.querySelector('[data-pkc-field="title"]'),
      bodyTextareaIsDirectChild: editor.firstElementChild?.getAttribute?.('data-pkc-field') === 'body',
      activeElementTag: document.activeElement?.tagName,
      activeElementField: document.activeElement?.getAttribute?.('data-pkc-field'),
    };
  });
}

// ── test harness ───────────────────────────────────────────────────────────

const results = [];

async function runCase(browser, label, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`${msg.type()}: ${msg.text()}`));
  let dialogAppeared = false;
  page.on('dialog', async (dialog) => {
    dialogAppeared = true;
    console.log(`  ⚠ dialog: ${dialog.message().slice(0, 60)}`);
    await dialog.dismiss();
  });

  try {
    await page.goto(HTML, { waitUntil: 'networkidle' });
    await waitForReady(page);
    const result = await fn(page);
    results.push({ label, ...result, dialogAppeared, error: null, consoleLogs });
  } catch (err) {
    results.push({ label, error: err.message.slice(0, 200), dialogAppeared, consoleLogs });
  } finally {
    await ctx.close();
  }
}

// ── Case 1: FOLDER / enter edit via button / focus body textarea / Ctrl+S ─
const browser = await chromium.launch({ headless: true });

await runCase(browser, 'FOLDER / edit button / textarea focus / Ctrl+S', async (page) => {
  // Create folder entry (goes directly into edit mode)
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="folder"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="folder"]', { timeout: 5_000 });
  const archBefore = await getEditingArchetype(page);
  const selectorsBefore = await getEditorSelectors(page);

  // Focus body textarea
  const ta = page.locator('textarea[data-pkc-field="body"]');
  await ta.click();
  await ta.fill('test description');
  const activeAfterFill = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    field: document.activeElement?.getAttribute?.('data-pkc-field'),
  }));

  const phaseBefore = await getPhase(page);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return {
    archBefore, selectorsBefore, activeAfterFill,
    phaseBefore, phaseAfter,
    saved: phaseAfter === 'ready',
  };
});

// ── Case 2: FOLDER / title input focus / Ctrl+S ───────────────────────────
await runCase(browser, 'FOLDER / edit button / title input focus / Ctrl+S', async (page) => {
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="folder"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="folder"]', { timeout: 5_000 });

  // Focus title input
  const titleInput = page.locator('[data-pkc-field="title"]');
  await titleInput.click();

  const phaseBefore = await getPhase(page);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return { phaseBefore, phaseAfter, saved: phaseAfter === 'ready' };
});

// ── Case 3: FOLDER / no explicit focus / Ctrl+S ───────────────────────────
await runCase(browser, 'FOLDER / edit button / no explicit focus / Ctrl+S', async (page) => {
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="folder"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="folder"]', { timeout: 5_000 });

  const phaseBefore = await getPhase(page);
  // Don't focus anything — press from page context
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return { phaseBefore, phaseAfter, saved: phaseAfter === 'ready' };
});

// ── Case 4: TEXT baseline / textarea focus / Ctrl+S ───────────────────────
await runCase(browser, 'TEXT / edit button / textarea focus / Ctrl+S (baseline)', async (page) => {
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="text"]', { timeout: 5_000 });

  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.click();
  await ta.fill('text content');

  const phaseBefore = await getPhase(page);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return { phaseBefore, phaseAfter, saved: phaseAfter === 'ready' };
});

// ── Case 5: FOLDER / save button click (confirm edit mode works at all) ───
await runCase(browser, 'FOLDER / edit button / save-button click (sanity check)', async (page) => {
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="folder"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="folder"]', { timeout: 5_000 });

  const ta = page.locator('textarea[data-pkc-field="body"]');
  await ta.click();
  await ta.fill('save via button');

  const phaseBefore = await getPhase(page);
  // Click commit-edit button (data-pkc-action="commit-edit")
  await page.click('[data-pkc-action="commit-edit"]');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return { phaseBefore, phaseAfter, saved: phaseAfter === 'ready' };
});

// ── Case 6: FOLDER / Escape cancel (confirm editing state / cancel) ────────
await runCase(browser, 'FOLDER / edit button / Escape cancel (state check)', async (page) => {
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="folder"]');
  await page.waitForSelector('[data-pkc-mode="edit"][data-pkc-archetype="folder"]', { timeout: 5_000 });

  const ta = page.locator('textarea[data-pkc-field="body"]');
  await ta.click();
  await ta.fill('some text');

  const phaseBefore = await getPhase(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const phaseAfter = await getPhase(page);

  return { phaseBefore, phaseAfter, saved: phaseAfter === 'ready', note: 'Escape should cancel' };
});

await browser.close();

// ── Report ─────────────────────────────────────────────────────────────────

console.log('\n=== FI-02B Repro Matrix Results ===\n');
for (const r of results) {
  const status = r.error ? '❌ ERROR'
    : r.saved ? '✅ SAVED (phase→ready)'
    : '🔴 NOT SAVED (phase stayed editing)';
  console.log(`${status}`);
  console.log(`  label: ${r.label}`);
  if (r.error) {
    console.log(`  error: ${r.error}`);
  } else {
    console.log(`  phase: ${r.phaseBefore} → ${r.phaseAfter}`);
    if (r.selectorsBefore) console.log(`  editor selectors: ${JSON.stringify(r.selectorsBefore)}`);
    if (r.activeAfterFill) console.log(`  activeElement after fill: ${JSON.stringify(r.activeAfterFill)}`);
    if (r.note) console.log(`  note: ${r.note}`);
    if (r.dialogAppeared) console.log('  ⚠ browser dialog appeared');
  }
  console.log('');
}
