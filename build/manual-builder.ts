/**
 * manual-builder: Stage 3 of the PKC2 build pipeline.
 *
 * Reads `docs/manual/*.md` and `docs/manual/images/*.png`, synthesizes a
 * populated PKC2 Container (with sample entries for each archetype),
 * injects it into `dist/pkc2.html` as pkc-data, and writes the result
 * to `PKC2-Extensions/pkc2-manual.html`.
 *
 * The output is a readonly-full PKC2 HTML artifact that:
 * - Opens standalone in a browser as the manual
 * - Can be imported or rehydrated into a user's workspace
 * - Can be embedded in iframes as an extension HTML
 *
 * Run with: `npm run build:manual` (after `npm run build`).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';

import type { Container, ContainerMeta } from '../src/core/model/container';
import type { Entry, ArchetypeId } from '../src/core/model/record';
import type { Relation } from '../src/core/model/relation';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DIST = resolve(ROOT, 'dist');
const MANUAL_DIR = resolve(ROOT, 'docs/manual');
const IMAGES_DIR = resolve(MANUAL_DIR, 'images');
const PLANNING_18 = resolve(ROOT, 'docs/planning/18_運用ガイド_export_import_rehydrate.md');
const EXTENSIONS_DIR = resolve(ROOT, 'PKC2-Extensions');
const OUTPUT = resolve(EXTENSIONS_DIR, 'pkc2-manual.html');
const TEMPLATE = resolve(DIST, 'pkc2.html');

// Fixed timestamp for reproducible builds.
const BUILD_TIMESTAMP = '2026-04-09T00:00:00.000Z';

/**
 * Folder groups that organize the manual entries in the sidebar tree.
 */
interface FolderGroup {
  lid: string;
  title: string;
  description: string;
}

const FOLDERS: FolderGroup[] = [
  { lid: 'manual-folder-intro', title: 'はじめに', description: 'PKC2 の紹介とクイックスタート' },
  { lid: 'manual-folder-basics', title: '基本操作', description: '画面・エントリ種別・日常操作・ショートカット' },
  { lid: 'manual-folder-export', title: '保存と持ち出し', description: 'IndexedDB と Export / Import / Rehydrate' },
  { lid: 'manual-folder-appendix', title: '付録', description: 'トラブルシューティングと用語集' },
  { lid: 'manual-folder-samples', title: '見本', description: '各 archetype の見本エントリ' },
];

/**
 * Mapping from manual markdown file numbers to their parent folder.
 * Chapter 00 (index) sits at the root, not inside any folder.
 */
const CHAPTER_TO_FOLDER: Record<string, string | null> = {
  '00': null, // root
  '01': 'manual-folder-intro',
  '02': 'manual-folder-intro',
  '03': 'manual-folder-basics',
  '04': 'manual-folder-basics',
  '05': 'manual-folder-basics',
  '06': 'manual-folder-basics',
  '07': 'manual-folder-export',
  '08': 'manual-folder-export',
  '09': 'manual-folder-appendix',
};

/**
 * Marker string used in the 08 placeholder to request body substitution
 * from `docs/planning/18_...md` at build time.
 */
const PLACEHOLDER_MARKER = 'このページの実体は';

function main(): void {
  if (!existsSync(TEMPLATE)) {
    console.error(`ERROR: ${TEMPLATE} not found.`);
    console.error('Run `npm run build` first to produce dist/pkc2.html.');
    process.exit(1);
  }

  if (!existsSync(MANUAL_DIR)) {
    console.error(`ERROR: ${MANUAL_DIR} not found.`);
    process.exit(1);
  }

  const entries: Entry[] = [];
  const relations: Relation[] = [];
  const assets: Record<string, string> = {};

  // 1. Folder entries
  for (const folder of FOLDERS) {
    entries.push({
      lid: folder.lid,
      title: folder.title,
      body: folder.description,
      archetype: 'folder',
      created_at: BUILD_TIMESTAMP,
      updated_at: BUILD_TIMESTAMP,
    });
  }

  // 2. Markdown chapter entries
  const chapterFiles = listChapterFiles(MANUAL_DIR);
  for (const { number, file } of chapterFiles) {
    const fullPath = resolve(MANUAL_DIR, file);
    let body = readFileSync(fullPath, 'utf8');

    // Substitute 08 placeholder body from docs/planning/18_...md
    if (number === '08' && body.includes(PLACEHOLDER_MARKER)) {
      if (!existsSync(PLANNING_18)) {
        console.error(`ERROR: ${PLANNING_18} not found (needed for chapter 08).`);
        process.exit(1);
      }
      body = readFileSync(PLANNING_18, 'utf8');
    }

    const title = extractTitle(body) ?? stripMdExtension(file);
    const lid = `manual-text-${number}`;
    entries.push({
      lid,
      title,
      body,
      archetype: 'text',
      created_at: BUILD_TIMESTAMP,
      updated_at: BUILD_TIMESTAMP,
    });

    const folderLid = CHAPTER_TO_FOLDER[number];
    if (folderLid) {
      relations.push(makeStructuralRelation(folderLid, lid, `rel-folder-${number}`));
    }
  }

  // 3. Image assets (PNG) + attachment entries for display
  if (existsSync(IMAGES_DIR)) {
    const pngFiles = readdirSync(IMAGES_DIR)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort();
    for (const file of pngFiles) {
      const fullPath = resolve(IMAGES_DIR, file);
      const bytes = readFileSync(fullPath);
      const base64 = bytes.toString('base64');
      const assetKey = basename(file, '.png');
      assets[assetKey] = base64;
      // We intentionally do NOT add a visible attachment entry for every
      // screenshot — the images are referenced inline from markdown via
      // `![alt](asset:key)`. Only the assets map needs to contain them,
      // plus a single attachment entry per image so asset-resolver can
      // look up the MIME type via `container.entries`.
      const attachmentBody = JSON.stringify({
        name: file,
        mime: 'image/png',
        size: bytes.length,
        asset_key: assetKey,
      });
      entries.push({
        lid: `manual-img-${assetKey}`,
        title: file,
        body: attachmentBody,
        archetype: 'attachment',
        created_at: BUILD_TIMESTAMP,
        updated_at: BUILD_TIMESTAMP,
      });
    }
  }

  // 4. Sample entries for each archetype (見本 folder)
  const sampleEntries = buildSampleEntries(assets);
  for (const entry of sampleEntries) {
    entries.push(entry);
    relations.push(
      makeStructuralRelation('manual-folder-samples', entry.lid, `rel-sample-${entry.lid}`),
    );
  }

  // 5. Container meta
  const meta: ContainerMeta = {
    container_id: 'pkc2-manual-v1',
    title: 'PKC2 ユーザーマニュアル',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
    schema_version: 1,
  };

  const container: Container = {
    meta,
    entries,
    relations,
    revisions: [],
    assets,
  };

  // 6. Serialize pkc-data JSON
  const exportMeta = {
    mode: 'full' as const,
    mutability: 'readonly' as const,
    asset_encoding: 'base64' as const,
  };
  const pkcDataJson = JSON.stringify({ container, export_meta: exportMeta }, null, 2)
    // Escape </script> within JSON to prevent premature script tag closure
    .replace(/<\/(script)/gi, '<\\/$1');

  // 7. Inject into template
  const template = readFileSync(TEMPLATE, 'utf8');
  let output = template.replace(
    /<script id="pkc-data" type="application\/json">[\s\S]*?<\/script>/,
    `<script id="pkc-data" type="application/json">${pkcDataJson}</script>`,
  );

  // 8. Update <title> to the manual title
  output = output.replace(
    /<title>[^<]*<\/title>/,
    '<title>PKC2 ユーザーマニュアル</title>',
  );

  // 9. Write output
  if (!existsSync(EXTENSIONS_DIR)) {
    mkdirSync(EXTENSIONS_DIR, { recursive: true });
  }
  writeFileSync(OUTPUT, output, 'utf8');

  const sizeKB = (output.length / 1024).toFixed(1);
  console.log(`✓ ${OUTPUT} (${sizeKB} KB)`);
  console.log(`  entries:  ${entries.length}`);
  console.log(`  relations:${relations.length}`);
  console.log(`  assets:   ${Object.keys(assets).length}`);
  console.log(`  mode:     full / readonly`);
}

// ── Helpers ────────────────────────

interface ChapterFile {
  number: string;
  file: string;
}

function listChapterFiles(dir: string): ChapterFile[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && /^\d{2}_/.test(f));
  return files
    .map((f): ChapterFile => ({ number: f.slice(0, 2), file: f }))
    .sort((a, b) => a.number.localeCompare(b.number));
}

function extractTitle(markdown: string): string | null {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

function stripMdExtension(file: string): string {
  return file.replace(/\.md$/i, '');
}

function makeStructuralRelation(from: string, to: string, id: string): Relation {
  return {
    id,
    from,
    to,
    kind: 'structural',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  };
}

/**
 * Synthesize one sample entry per archetype so the reader can see each
 * presenter in action. Attachment samples reuse the first available
 * image asset if any; otherwise a minimal text attachment is created.
 */
function buildSampleEntries(assets: Record<string, string>): Entry[] {
  const result: Entry[] = [];

  // Two todo samples: one overdue/open with a date, one done without a date.
  result.push({
    lid: 'sample-todo-1',
    title: '期日あり Todo（見本）',
    body: JSON.stringify({
      status: 'open',
      description: '期日付きの未完了タスク。Calendar ビューで該当日に表示されます。',
      date: '2026-04-15',
    }),
    archetype: 'todo',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });
  result.push({
    lid: 'sample-todo-2',
    title: '完了済み Todo（見本）',
    body: JSON.stringify({
      status: 'done',
      description: '完了済みのタスク。Kanban ビューで Done 列に表示されます。',
    }),
    archetype: 'todo',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });

  // TextLog sample: 3 timestamped entries in one textlog body.
  const textlogBody = [
    '[2026-04-01 09:00:00] プロジェクトを開始。',
    '[2026-04-03 14:30:12] 仕様書をレビュー。いくつか疑問点を洗い出した。',
    '[2026-04-09 11:15:45] 疑問点が解決。実装に入れる状態になった。',
  ].join('\n');
  result.push({
    lid: 'sample-textlog-1',
    title: '日誌（見本）',
    body: textlogBody,
    archetype: 'textlog',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });

  // Form sample
  result.push({
    lid: 'sample-form-1',
    title: 'フォーム入力（見本）',
    body: JSON.stringify({
      name: '田中 太郎',
      note: 'これは form archetype の見本です。name / note / checked の固定 3 フィールドです。',
      checked: true,
    }),
    archetype: 'form',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });

  // Nested folder sample with a child text entry
  result.push({
    lid: 'sample-folder-1',
    title: '見本フォルダ',
    body: '見本の子エントリを持つフォルダ。ツリー表示の例です。',
    archetype: 'folder',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });
  result.push({
    lid: 'sample-folder-child-1',
    title: '見本フォルダの子ノート',
    body: '## これは見本フォルダ内のテキストノート\n\nフォルダに属するエントリは、左サイドバーのツリーで親フォルダ配下に表示されます。',
    archetype: 'text',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });

  // Attachment samples: one image (reuses existing asset if any), one text file.
  const firstImageKey = Object.keys(assets)[0];
  const firstImageBase64 = firstImageKey !== undefined ? assets[firstImageKey] : undefined;
  if (firstImageKey !== undefined && firstImageBase64 !== undefined) {
    result.push({
      lid: 'sample-attachment-image',
      title: '画像添付（見本）',
      body: JSON.stringify({
        name: `${firstImageKey}.png`,
        mime: 'image/png',
        size: Math.floor((firstImageBase64.length * 3) / 4),
        asset_key: firstImageKey,
      }),
      archetype: 'attachment',
      created_at: BUILD_TIMESTAMP,
      updated_at: BUILD_TIMESTAMP,
    });
  }

  // Text attachment: create a small inline asset.
  const textAssetKey = 'sample-text-attachment';
  const textContent = 'PKC2 attachment sample\n\nThis is a tiny text file embedded as an attachment asset.\n';
  assets[textAssetKey] = Buffer.from(textContent, 'utf8').toString('base64');
  result.push({
    lid: 'sample-attachment-text',
    title: 'テキスト添付（見本）',
    body: JSON.stringify({
      name: 'sample.txt',
      mime: 'text/plain',
      size: textContent.length,
      asset_key: textAssetKey,
    }),
    archetype: 'attachment',
    created_at: BUILD_TIMESTAMP,
    updated_at: BUILD_TIMESTAMP,
  });

  // Keep TypeScript happy about unused ArchetypeId import.
  const _check: ArchetypeId = 'text';
  void _check;

  return result;
}

main();
