/**
 * Interactive enhancements for markdown tables (PR #204, 2026-04-29).
 *
 * Three additions, all subtle and opt-out friendly:
 *
 *   1. **Row numbers** — a leading column showing `#` in the header
 *      and `1, 2, 3, …` in body rows. Dimmed so it doesn't compete
 *      with content; useful for "look at row 12 in the second
 *      column" style references.
 *
 *   2. **Sort handle** — a small `↕ / ↑ / ↓` button on every header
 *      cell. Tap to cycle `unsorted → asc → desc → unsorted`. Sorts
 *      the underlying `<tbody>` rows in place; numeric values sort
 *      numerically, otherwise locale string compare. Multiple
 *      columns can't be combined (single-column sort, last click
 *      wins) — keeping it predictable, not a power tool.
 *
 *   3. **Filter handle** — a small `⌕` icon on every header cell.
 *      Tap to toggle a row of inputs below the header; type a
 *      substring per column to AND-filter visible rows. Empty
 *      input clears that column's filter.
 *
 * The enhancement is **idempotent** — `enhanceTable` short-circuits
 * if the table already carries `data-pkc-table-enhanced="1"`. The
 * action binder enhances on first hover / focus to avoid touching
 * the DOM during render passes.
 *
 * Targets `.pkc-md-rendered table` only (TEXT body + TEXTLOG entries
 * — both render markdown). Other table sources are untouched.
 *
 * Pure DOM helpers — no dispatcher / state coupling.
 */

const ROW_NUMBER_CLASS = 'pkc-md-table-rownum';
const SORT_BTN_CLASS = 'pkc-md-table-sort';
const FILTER_TOGGLE_CLASS = 'pkc-md-table-filter-toggle';
const FILTER_ROW_CLASS = 'pkc-md-table-filter-row';
const FILTER_INPUT_CLASS = 'pkc-md-table-filter-input';

export type SortDirection = 'asc' | 'desc' | null;

/**
 * Walk a markdown-rendered `<table>` and inject the row-number
 * column + sort / filter handles. Idempotent.
 */
export function enhanceTable(table: HTMLTableElement): void {
  if (table.getAttribute('data-pkc-table-enhanced') === '1') return;

  const headerRow = table.querySelector<HTMLTableRowElement>('thead tr');
  const bodyRows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
  if (!headerRow) {
    // Tables without a thead aren't markdown-rendered (markdown-it
    // always emits thead for `|---|` syntax). Skip silently.
    return;
  }

  // 1. Prepend `#` row-number cell to header.
  const rownumHeader = document.createElement('th');
  rownumHeader.className = ROW_NUMBER_CLASS;
  rownumHeader.textContent = '#';
  headerRow.insertBefore(rownumHeader, headerRow.firstChild);

  // 2. Prepend numeric cell to each body row.
  bodyRows.forEach((row, idx) => {
    const cell = document.createElement('td');
    cell.className = ROW_NUMBER_CLASS;
    cell.textContent = String(idx + 1);
    row.insertBefore(cell, row.firstChild);
  });

  // 3. Add sort + filter handles to the original (non-rownum) header
  //    cells. We iterate from index 1 because the rownum cell we just
  //    inserted sits at index 0.
  const headerCells = headerRow.querySelectorAll<HTMLTableCellElement>('th');
  for (let i = 1; i < headerCells.length; i++) {
    const th = headerCells[i]!;
    th.classList.add('pkc-md-table-th-enhanced');
    th.setAttribute('data-pkc-table-col', String(i));

    // Wrap original content so we can place the handles next to it.
    const wrap = document.createElement('span');
    wrap.className = 'pkc-md-table-th-content';
    while (th.firstChild) wrap.appendChild(th.firstChild);
    th.appendChild(wrap);

    const sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = SORT_BTN_CLASS;
    sortBtn.setAttribute('data-pkc-action', 'md-table-sort');
    sortBtn.setAttribute('data-pkc-table-col', String(i));
    sortBtn.setAttribute('data-pkc-sort-dir', 'none');
    sortBtn.setAttribute('aria-label', 'Sort column');
    sortBtn.setAttribute('title', 'Sort column (asc → desc → off)');
    sortBtn.textContent = '↕';
    th.appendChild(sortBtn);

    const filterBtn = document.createElement('button');
    filterBtn.type = 'button';
    filterBtn.className = FILTER_TOGGLE_CLASS;
    filterBtn.setAttribute('data-pkc-action', 'md-table-filter-toggle');
    filterBtn.setAttribute('aria-label', 'Filter column');
    filterBtn.setAttribute('title', 'Toggle column filters');
    filterBtn.textContent = '⌕';
    th.appendChild(filterBtn);
  }

  table.setAttribute('data-pkc-table-enhanced', '1');
}

/**
 * Stable in-place sort of `<tbody>` rows by the column at `colIdx`
 * (0-based, inclusive of the row-number column). Direction `null`
 * restores original order(uses `data-pkc-original-order` stamped on
 * first sort).
 */
export function sortColumn(
  table: HTMLTableElement,
  colIdx: number,
  direction: SortDirection,
): void {
  const tbody = table.querySelector<HTMLTableSectionElement>('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'));

  // Stamp original positions on first sort so `null` (unsorted) can
  // restore them without recording the index in any other reducer.
  if (rows.length > 0 && rows[0]!.getAttribute('data-pkc-original-order') === null) {
    rows.forEach((r, i) => r.setAttribute('data-pkc-original-order', String(i)));
  }

  if (direction === null) {
    rows.sort((a, b) => {
      const ai = parseInt(a.getAttribute('data-pkc-original-order') ?? '0', 10);
      const bi = parseInt(b.getAttribute('data-pkc-original-order') ?? '0', 10);
      return ai - bi;
    });
  } else {
    const sign = direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => sign * compareRows(a, b, colIdx));
  }

  // Re-attach in new order. `appendChild` moves an existing node, no
  // duplication.
  for (const row of rows) tbody.appendChild(row);

  // Re-stamp visible row numbers (column 0).
  rows.forEach((row, idx) => {
    const cell = row.cells[0];
    if (cell && cell.classList.contains(ROW_NUMBER_CLASS)) {
      cell.textContent = String(idx + 1);
    }
  });
}

function compareRows(
  a: HTMLTableRowElement,
  b: HTMLTableRowElement,
  colIdx: number,
): number {
  const av = (a.cells[colIdx]?.textContent ?? '').trim();
  const bv = (b.cells[colIdx]?.textContent ?? '').trim();
  // Numeric branch: both parse cleanly to finite numbers.
  const an = Number(av);
  const bn = Number(bv);
  if (Number.isFinite(an) && Number.isFinite(bn) && av !== '' && bv !== '') {
    return an - bn;
  }
  return av.localeCompare(bv);
}

/**
 * Show / hide the per-column filter input row. Inserted just below
 * the header row on first toggle; preserved across subsequent
 * toggles.
 */
export function toggleFilterRow(table: HTMLTableElement): void {
  const thead = table.querySelector<HTMLTableSectionElement>('thead');
  if (!thead) return;
  const headerRow = thead.querySelector<HTMLTableRowElement>('tr:not(.' + FILTER_ROW_CLASS + ')');
  if (!headerRow) return;
  let filterRow = thead.querySelector<HTMLTableRowElement>('tr.' + FILTER_ROW_CLASS);

  if (!filterRow) {
    filterRow = document.createElement('tr');
    filterRow.className = FILTER_ROW_CLASS;
    const cellCount = headerRow.cells.length;
    for (let i = 0; i < cellCount; i++) {
      const cell = document.createElement('th');
      cell.className = 'pkc-md-table-filter-cell';
      // Skip the row-number column (index 0) — no filter for it.
      if (i > 0) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = FILTER_INPUT_CLASS;
        input.setAttribute('data-pkc-table-col', String(i));
        input.setAttribute('placeholder', '⌕');
        input.setAttribute('aria-label', 'Filter column ' + i);
        cell.appendChild(input);
      }
      filterRow.appendChild(cell);
    }
    thead.appendChild(filterRow);
    return;
  }

  filterRow.hidden = !filterRow.hidden;
  if (filterRow.hidden) {
    // Hidden = filters cleared, restore visibility.
    applyFilters(table);
  }
}

/**
 * Read the current filter inputs and toggle row visibility.
 * Substring-contains match, case-insensitive. Empty inputs are
 * ignored. All non-empty filters AND together.
 */
export function applyFilters(table: HTMLTableElement): void {
  const inputs = table.querySelectorAll<HTMLInputElement>('.' + FILTER_INPUT_CLASS);
  const filters: { col: number; needle: string }[] = [];
  for (const inp of inputs) {
    const v = inp.value.trim().toLowerCase();
    if (!v) continue;
    const col = parseInt(inp.getAttribute('data-pkc-table-col') ?? '-1', 10);
    if (col >= 0) filters.push({ col, needle: v });
  }

  // Filter row itself is hidden = no filtering active.
  const filterRow = table.querySelector<HTMLTableRowElement>('tr.' + FILTER_ROW_CLASS);
  const filterDisabled = !!filterRow && filterRow.hidden;

  const tbody = table.querySelector<HTMLTableSectionElement>('tbody');
  if (!tbody) return;
  for (const row of Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'))) {
    if (filterDisabled || filters.length === 0) {
      row.hidden = false;
      continue;
    }
    const matchAll = filters.every(({ col, needle }) => {
      const text = (row.cells[col]?.textContent ?? '').toLowerCase();
      return text.includes(needle);
    });
    row.hidden = !matchAll;
  }

  // Re-stamp visible row numbers so they're contiguous.
  let n = 1;
  for (const row of Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'))) {
    if (row.hidden) continue;
    const cell = row.cells[0];
    if (cell && cell.classList.contains(ROW_NUMBER_CLASS)) {
      cell.textContent = String(n);
      n++;
    }
  }
}

/**
 * Cycle the sort direction button through `none → asc → desc → none`,
 * updating the visual indicator. Returns the new direction.
 */
export function cycleSortDirection(button: HTMLElement): SortDirection {
  const current = button.getAttribute('data-pkc-sort-dir') ?? 'none';
  const next: 'none' | 'asc' | 'desc' =
    current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none';
  button.setAttribute('data-pkc-sort-dir', next);
  button.textContent = next === 'asc' ? '↑' : next === 'desc' ? '↓' : '↕';
  return next === 'none' ? null : next;
}

/**
 * Reset every other sort button in the same table back to `none`,
 * so the visual indicator only shows on the active column. Multi-
 * column sort is intentionally not supported.
 */
export function resetOtherSortButtons(table: HTMLTableElement, active: HTMLElement): void {
  const buttons = table.querySelectorAll<HTMLElement>('.' + SORT_BTN_CLASS);
  for (const btn of buttons) {
    if (btn === active) continue;
    btn.setAttribute('data-pkc-sort-dir', 'none');
    btn.textContent = '↕';
  }
}
