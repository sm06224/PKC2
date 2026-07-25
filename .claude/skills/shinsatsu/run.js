#!/usr/bin/env node
// 動的視覚動作テスト — runner(.claude スキル同梱・依存パッケージゼロ)
//
//   node .claude/skills/shinsatsu/run.js            全スペック
//   node .claude/skills/shinsatsu/run.js han nami   名前で絞る
//
// リポジトリのルート(= カレントディレクトリ)を静的サーバで配り、
// マウス・キーボード・ホイールを人間のように動かしてページに触り、
// 「よくない動き」(dead click / dead scroll / 例外 / 画面の嘘)を
// before/after の画像比較と画面観測点で取り立てる。
// スキルディレクトリごと他リポジトリへコピーすれば、そのまま動く。

import { readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveStatic } from './lib/server.js';
import { launchChrome } from './lib/browser.js';
import { VisualPage } from './lib/page.js';
import { Human } from './lib/human.js';
import { diffPng } from './lib/png.js';
import { buildReport } from './lib/report.js';
import { mulberry32, hashSeed, slugify, sleep } from './lib/util.js';
import { decodePcm16, wavEncode, analyzePcm, waveformPng, spectrogramPng } from './lib/audio.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd(); // 配るのは「いまいるリポジトリ」— スキルはどこに置かれても動く
const OUT = join(ROOT, 'test-results', 'visual');
const SPEC_TIMEOUT_MS = 120000;

// どのページでも咎めない雑音(ブラウザが勝手に取りに行く favicon 等)
const GLOBAL_ALLOW = [/favicon\.ico/];

function makeCtx({ page, human, origin, outDir, slug }) {
  const steps = [];
  const findings = [];
  let shotN = 0;

  async function saveArtifact(label, ext, buf) {
    const file = `${slug}-${String(++shotN).padStart(2, '0')}-${slugify(label)}.${ext}`;
    await writeFile(join(outDir, file), buf);
    return file;
  }
  const saveImage = (label, buf) => saveArtifact(label, 'png', buf);

  async function snap(sel) {
    let clip;
    if (sel) {
      const r = await page.pageRect(sel);
      if (r && r.width >= 1 && r.height >= 1) {
        clip = { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 12, height: r.height + 12 };
      }
    }
    return await page.screenshot({ clip });
  }

  const t = {
    page,
    human,
    origin,
    findings,
    steps,

    note(text) {
      steps.push({ type: 'note', text });
    },
    pass(text) {
      steps.push({ type: 'expect', ok: true, text });
    },
    fail(message, kind = 'assert') {
      findings.push({ severity: 'fail', kind, message });
      steps.push({ type: 'expect', ok: false, text: message });
    },
    warn(message, kind = 'warn') {
      findings.push({ severity: 'warn', kind, message });
    },
    expect(cond, text) {
      if (cond) t.pass(text);
      else t.fail(text);
      return !!cond;
    },

    async goto(route) {
      t.note(`→ ${route}`);
      await page.goto(origin + route);
    },

    /** スクショを撮って記録する。sel を渡すとその要素の領域だけ。 */
    async shot(label, { sel } = {}) {
      const buf = await snap(sel);
      const file = await saveImage(label, buf);
      steps.push({ type: 'shot', label, file, b64: buf.toString('base64') });
      return { label, file, buf };
    },

    /** 2 枚のショットを比べて記録する。 */
    async diff(label, a, b, { threshold } = {}) {
      const d = diffPng(a.buf, b.buf, threshold ? { threshold } : {});
      const step = {
        type: 'diff', label, ratio: d.ratio, sizeMismatch: d.sizeMismatch,
        a: a.buf.toString('base64'), b: b.buf.toString('base64'),
        d: d.png ? d.png.toString('base64') : null,
      };
      if (d.png) await saveImage(`${label}-diff`, d.png);
      steps.push(step);
      return d;
    },

    /**
     * 操作を 1 幕として記録する: 操作前後を撮り、画像差分で判定する。
     *   expect: 'change' — 画面が変わらなければ dead interaction として FAIL
     *   expect: 'none'   — 変わってしまったら FAIL
     *   expect: 省略     — 記録のみ
     * 判定前にマウスを隅へ「置きにいく」(hover の残り香で差分を汚さない)。
     */
    async act(label, opts, fn) {
      const { expect: expectation, sel, ratio: minRatio = 0.0015, settle = 250, park = true } = opts || {};
      if (park) await human.moveTo(6, page.size.height - 6);
      const before = await snap(sel);
      await fn();
      await page.settle(settle);
      if (park) await human.moveTo(6, page.size.height - 6);
      await page.settle(60);
      const after = await snap(sel);
      const d = diffPng(before, after);
      let verdict = null;
      if (expectation === 'change') {
        if (d.ratio >= minRatio) {
          verdict = 'pass';
          t.pass(`${label} — 画面が応えた(差分 ${(d.ratio * 100).toFixed(3)}%)`);
        } else {
          verdict = 'fail';
          t.fail(`${label} — 操作しても画面が変わらない(dead interaction, 差分 ${(d.ratio * 100).toFixed(3)}%)`, 'dead-interaction');
        }
      } else if (expectation === 'none') {
        if (d.ratio <= minRatio) {
          verdict = 'pass';
          t.pass(`${label} — 画面は静かなまま(差分 ${(d.ratio * 100).toFixed(3)}%)`);
        } else {
          verdict = 'fail';
          t.fail(`${label} — 変わらないはずの画面が変わった(差分 ${(d.ratio * 100).toFixed(2)}%${d.sizeMismatch ? `, 寸法不一致 ${d.sizeMismatch}` : ''})`, 'unexpected-change');
        }
      }
      const step = {
        type: 'act', label, ratio: d.ratio, verdict,
        before: before.toString('base64'), after: after.toString('base64'),
        diff: d.png ? d.png.toString('base64') : null,
      };
      if (d.png) await saveImage(`${label}-act-diff`, d.png);
      steps.push(step);
      return d;
    },

    /**
     * 耳 — action の間に鳴った音を録って解析する。
     * ページが AudioContext を作っていなければ null(音の機構が無い/未起動)。
     * 返り値: { rmsDb, peakDb, clipRatio, peaks, pentaRoot, … } + 証跡として
     * .wav(user が耳で官能評価する原音)/ 波形 PNG / スペクトログラム PNG。
     */
    listen: {
      state: () => page.eval('window.__earState ? __earState() : []').catch(() => []),
      async record(label, action, { ctx = 0, settle = 250 } = {}) {
        const st0 = await t.listen.state();
        const from = st0[ctx] ? st0[ctx].samples : 0;
        if (typeof action === 'function') await action();
        else await sleep(action);
        await page.settle(settle);
        const pulled = await page.eval(`window.__earPull ? __earPull(${ctx}, ${from}) : null`).catch(() => null);
        if (!pulled || !pulled.samples) {
          steps.push({ type: 'note', text: `🔇 ${label} — 録れる音が無い(AudioContext 不在 or 無音長ゼロ)` });
          return null;
        }
        const pcm = decodePcm16(pulled.b64);
        const a = analyzePcm(pcm, pulled.sampleRate);
        const wave = waveformPng(pcm);
        const spec = spectrogramPng(pcm, pulled.sampleRate);
        const wavFile = await saveArtifact(label, 'wav', wavEncode(pulled.b64, pulled.sampleRate));
        await saveArtifact(`${label}-波形`, 'png', wave);
        await saveArtifact(`${label}-スペクトログラム`, 'png', spec);
        steps.push({
          type: 'audio', label, summary: a.summary, wavFile,
          wave: wave.toString('base64'), spec: spec.toString('base64'),
        });
        return a;
      },
    },
  };
  return t;
}

async function runSpec({ browser, origin, mod, file }) {
  const slug = file.replace(/\.visual\.js$/, '');
  const page = await VisualPage.open(browser.cdp);
  const human = new Human(page, mulberry32(hashSeed(file)));
  const t = makeCtx({ page, human, origin, outDir: OUT, slug });
  const started = Date.now();
  try {
    await Promise.race([
      mod.run(t),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`スペックが ${SPEC_TIMEOUT_MS / 1000} 秒で終わらない`)), SPEC_TIMEOUT_MS)),
    ]);
  } catch (e) {
    t.fail(`スペック実行中の失敗: ${e.message}`, 'spec-error');
    // 倒れた瞬間の画面を証跡に残す
    await t.shot('失敗時の画面').catch(() => {});
  }

  // ページが漏らした悲鳴(例外 / console.error / リソース読込失敗)を取り立てる
  const allow = [...GLOBAL_ALLOW, ...(mod.allow || [])];
  for (const issue of page.issues) {
    if (allow.some((re) => re.test(issue.message))) continue;
    t.fail(`ページ内の異常: ${issue.message}`, issue.kind);
  }

  await page.close().catch(() => {});
  const status = t.findings.some((f) => f.severity === 'fail') ? 'fail' : 'pass';
  return { name: mod.name || slug, status, steps: t.steps, findings: t.findings, durationMs: Date.now() - started };
}

async function main() {
  const filters = process.argv.slice(2);
  const specDir = join(HERE, 'specs');
  let files = (await readdir(specDir)).filter((f) => f.endsWith('.visual.js')).sort();
  if (filters.length) files = files.filter((f) => filters.some((q) => f.includes(q)));
  if (!files.length) {
    console.error('該当するスペックがない:', filters.join(' '));
    process.exit(2);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const srv = await serveStatic(ROOT);
  const browser = await launchChrome();
  console.log(`ブラウザ: ${browser.bin}`);
  console.log(`配信元:   ${srv.origin} (repo root)`);

  const results = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(specDir, file)))).default;
    process.stdout.write(`\n■ ${mod.name || file}\n`);
    const res = await runSpec({ browser, origin: srv.origin, mod, file });
    for (const s of res.steps) {
      if (s.type === 'expect') console.log(`  ${s.ok ? '✓' : '✗'} ${s.text}`);
    }
    console.log(`  → ${res.status.toUpperCase()} (${(res.durationMs / 1000).toFixed(1)}s)`);
    results.push(res);
  }

  // 報告書を先に書き上げる(片付けで転んでも証跡は残す)
  const html = buildReport({
    results,
    meta: { browser: browser.bin, startedAt: new Date().toISOString() },
  });
  const reportPath = join(OUT, 'report.html');
  await writeFile(reportPath, html);

  await browser.close().catch(() => {});
  await srv.close().catch(() => {});

  const fails = results.filter((r) => r.status === 'fail');
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`結果: ${results.length - fails.length} PASS / ${fails.length} FAIL`);
  console.log(`報告: ${reportPath}`);
  if (fails.length) {
    for (const r of fails) {
      console.log(`\nFAIL: ${r.name}`);
      for (const f of r.findings.filter((x) => x.severity === 'fail')) console.log(`  - [${f.kind}] ${f.message}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
