import { describe, it, expect } from 'vitest';
import {
  validateFolderGraph,
  buildBatchImportPlan,
  classifyFolderRestore,
  type PlannerInput,
  type PlannerFolderInfo,
  type PlannerEntry,
} from '@features/batch-import/import-planner';

// ── Helpers ────────────────────────────────────────────

function makeEntry(overrides: Partial<PlannerEntry> = {}): PlannerEntry {
  return {
    archetype: 'text',
    title: 'Note',
    body: 'body',
    attachments: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    entries: [makeEntry()],
    source: 'test.zip',
    format: 'pkc2-texts-container-bundle',
    ...overrides,
  };
}

// ── validateFolderGraph ────────────────────────────────

describe('validateFolderGraph', () => {
  it('accepts valid flat folder list', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'A', parentLid: null },
      { lid: 'f2', title: 'B', parentLid: null },
    ];
    const result = validateFolderGraph(folders, []);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('accepts valid nested hierarchy', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'root', title: 'Root', parentLid: null },
      { lid: 'child', title: 'Child', parentLid: 'root' },
      { lid: 'grandchild', title: 'GC', parentLid: 'child' },
    ];
    const result = validateFolderGraph(folders, [{ parentFolderLid: 'grandchild' }]);
    expect(result.valid).toBe(true);
  });

  it('rejects duplicate folder LID', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'dup', title: 'A', parentLid: null },
      { lid: 'dup', title: 'B', parentLid: null },
    ];
    const result = validateFolderGraph(folders, []);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Duplicate folder LID');
  });

  it('rejects self-parent', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'A', parentLid: 'f1' },
    ];
    const result = validateFolderGraph(folders, []);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Self-parent');
  });

  it('rejects missing parent LID', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'A', parentLid: 'nonexistent' },
    ];
    const result = validateFolderGraph(folders, []);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Missing parent folder');
  });

  it('rejects cycle (A→B→A)', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'a', title: 'A', parentLid: 'b' },
      { lid: 'b', title: 'B', parentLid: 'a' },
    ];
    const result = validateFolderGraph(folders, []);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Cycle detected');
  });

  it('rejects entry referencing unknown folder', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'A', parentLid: null },
    ];
    const entries = [{ parentFolderLid: 'unknown' }];
    const result = validateFolderGraph(folders, entries);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('unknown folder');
  });

  it('accepts empty folder array', () => {
    const result = validateFolderGraph([], []);
    expect(result.valid).toBe(true);
  });
});

// ── buildBatchImportPlan ───────────────────────────────

describe('buildBatchImportPlan', () => {
  it('produces flat plan when no folders present (ok: true)', () => {
    const input = makeInput({
      entries: [makeEntry({ title: 'A' }), makeEntry({ title: 'B' })],
    });
    const result = buildBatchImportPlan(input, new Set([0, 1]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.restoreStructure).toBe(false);
    expect(result.plan.folders).toHaveLength(0);
    expect(result.plan.entries).toHaveLength(2);
    expect(result.plan.entries[0]!.title).toBe('A');
    expect(result.plan.entries[1]!.title).toBe('B');
  });

  it('filters by selectedIndices', () => {
    const input = makeInput({
      entries: [makeEntry({ title: 'A' }), makeEntry({ title: 'B' }), makeEntry({ title: 'C' })],
    });
    const result = buildBatchImportPlan(input, new Set([0, 2]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.entries).toHaveLength(2);
    expect(result.plan.entries[0]!.title).toBe('A');
    expect(result.plan.entries[1]!.title).toBe('C');
  });

  it('produces folder restore plan with valid hierarchy', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'root', title: 'Root', parentLid: null },
      { lid: 'sub', title: 'Sub', parentLid: 'root' },
    ];
    const input = makeInput({
      entries: [makeEntry({ title: 'Note', parentFolderLid: 'sub' })],
      folders,
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.restoreStructure).toBe(true);
    expect(result.plan.folders).toHaveLength(2);
    // Parent before child (topological order)
    expect(result.plan.folders[0]!.originalLid).toBe('root');
    expect(result.plan.folders[1]!.originalLid).toBe('sub');
    expect(result.plan.entries[0]!.parentFolderOriginalLid).toBe('sub');
  });

  it('includes only ancestor folders needed by selected entries', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'root', title: 'Root', parentLid: null },
      { lid: 'a', title: 'A', parentLid: 'root' },
      { lid: 'b', title: 'B', parentLid: 'root' },
    ];
    const input = makeInput({
      entries: [
        makeEntry({ title: 'In A', parentFolderLid: 'a' }),
        makeEntry({ title: 'In B', parentFolderLid: 'b' }),
      ],
      folders,
    });
    // Select only the entry in folder A
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only root + a should be included (not b)
    expect(result.plan.folders).toHaveLength(2);
    const folderLids = result.plan.folders.map((f) => f.originalLid);
    expect(folderLids).toContain('root');
    expect(folderLids).toContain('a');
    expect(folderLids).not.toContain('b');
  });

  it('falls back to flat import on malformed folder graph (ok: false)', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'F1', parentLid: 'f1' }, // self-parent
    ];
    const input = makeInput({
      entries: [makeEntry({ title: 'Note', parentFolderLid: 'f1' })],
      folders,
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Self-parent');
    expect(result.fallbackPlan.restoreStructure).toBe(false);
    expect(result.fallbackPlan.folders).toHaveLength(0);
    // Content entries are preserved in fallback
    expect(result.fallbackPlan.entries).toHaveLength(1);
    expect(result.fallbackPlan.entries[0]!.title).toBe('Note');
    // parentFolderOriginalLid is cleared in flat fallback
    expect(result.fallbackPlan.entries[0]!.parentFolderOriginalLid).toBeUndefined();
  });

  it('falls back on cycle', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'a', title: 'A', parentLid: 'b' },
      { lid: 'b', title: 'B', parentLid: 'a' },
    ];
    const input = makeInput({
      entries: [makeEntry({ parentFolderLid: 'a' })],
      folders,
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(false);
  });

  it('falls back on duplicate folder LID', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'dup', title: 'A', parentLid: null },
      { lid: 'dup', title: 'B', parentLid: null },
    ];
    const input = makeInput({
      entries: [makeEntry({ parentFolderLid: 'dup' })],
      folders,
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fallbackPlan.entries).toHaveLength(1);
  });

  it('falls back on missing parent LID', () => {
    const folders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'F1', parentLid: 'ghost' },
    ];
    const input = makeInput({
      entries: [makeEntry({ parentFolderLid: 'f1' })],
      folders,
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(false);
  });

  it('maps attachments into plan entries', () => {
    const input = makeInput({
      entries: [makeEntry({
        title: 'With Att',
        attachments: [{
          assetKey: 'k1',
          data: 'base64data',
          name: 'file.png',
          mime: 'image/png',
          size: 1234,
        }],
      })],
    });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.plan.entries[0]!;
    expect(entry.attachments).toHaveLength(1);
    expect(entry.attachments[0]!.assetKey).toBe('k1');
    expect(entry.attachments[0]!.assetData).toBe('base64data');
    expect(entry.assets['k1']).toBe('base64data');
  });

  it('preserves source and format in plan', () => {
    const input = makeInput({ source: 'my.zip', format: 'pkc2-folder-export-bundle' });
    const result = buildBatchImportPlan(input, new Set([0]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source).toBe('my.zip');
    expect(result.plan.format).toBe('pkc2-folder-export-bundle');
  });
});

// ── classifyFolderRestore ─────────────────────────────

describe('classifyFolderRestore', () => {
  const folders: PlannerFolderInfo[] = [
    { lid: 'root', title: 'Root', parentLid: null },
    { lid: 'a', title: 'A', parentLid: 'root' },
    { lid: 'b', title: 'B', parentLid: 'root' },
  ];

  const entryRefs = [
    { parentFolderLid: 'a' },       // 0: in folder A
    { parentFolderLid: 'b' },       // 1: in folder B
    { parentFolderLid: undefined },  // 2: no folder ref
  ];

  it('returns flat when no folders present', () => {
    const result = classifyFolderRestore([], entryRefs, [0, 1]);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.folderCount).toBe(0);
    expect(result.malformedFolderMetadata).toBeUndefined();
  });

  it('returns restore-available for valid selection with folder refs', () => {
    const result = classifyFolderRestore(folders, entryRefs, [0, 1]);
    expect(result.canRestoreFolderStructure).toBe(true);
    // root + a + b = 3 needed folders
    expect(result.folderCount).toBe(3);
    expect(result.malformedFolderMetadata).toBeUndefined();
  });

  it('folder count shrinks when selection narrows', () => {
    // Only entry 0 (folder A) selected → needs root + a = 2
    const result = classifyFolderRestore(folders, entryRefs, [0]);
    expect(result.canRestoreFolderStructure).toBe(true);
    expect(result.folderCount).toBe(2);
  });

  it('returns flat when selected entries have no folder refs', () => {
    // Only entry 2 (no folder ref) selected
    const result = classifyFolderRestore(folders, entryRefs, [2]);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.folderCount).toBe(0);
    expect(result.malformedFolderMetadata).toBeUndefined();
  });

  it('returns malformed when selected subset references unknown folder', () => {
    const refsWithBad = [
      { parentFolderLid: 'a' },
      { parentFolderLid: 'nonexistent' },
    ];
    // Select only entry 1 (bad ref)
    const result = classifyFolderRestore(folders, refsWithBad, [1]);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.malformedFolderMetadata).toBe(true);
    expect(result.folderGraphWarning).toContain('unknown folder');
  });

  it('valid subset recovers when malformed entry is deselected', () => {
    const refsWithBad = [
      { parentFolderLid: 'a' },
      { parentFolderLid: 'nonexistent' },
    ];
    // Select only entry 0 (valid ref) — malformed entry 1 excluded
    const result = classifyFolderRestore(folders, refsWithBad, [0]);
    expect(result.canRestoreFolderStructure).toBe(true);
    expect(result.malformedFolderMetadata).toBeUndefined();
    expect(result.folderCount).toBe(2); // root + a
  });

  it('detects malformed folder graph (self-parent) regardless of selection', () => {
    const badFolders: PlannerFolderInfo[] = [
      { lid: 'f1', title: 'F1', parentLid: 'f1' },
    ];
    const result = classifyFolderRestore(badFolders, [{ parentFolderLid: 'f1' }], [0]);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.malformedFolderMetadata).toBe(true);
    expect(result.folderGraphWarning).toContain('Self-parent');
  });

  it('handles empty selection gracefully', () => {
    const result = classifyFolderRestore(folders, entryRefs, []);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.folderCount).toBe(0);
  });

  it('ignores out-of-range indices', () => {
    const result = classifyFolderRestore(folders, entryRefs, [99, -1]);
    expect(result.canRestoreFolderStructure).toBe(false);
    expect(result.folderCount).toBe(0);
  });

  it('whole-bundle behavior unchanged when all entries selected', () => {
    // All selected → should match what whole-bundle validation would give
    const result = classifyFolderRestore(folders, entryRefs, [0, 1, 2]);
    expect(result.canRestoreFolderStructure).toBe(true);
    expect(result.folderCount).toBe(3);
  });
});
