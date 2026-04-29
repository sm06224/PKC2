/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enhanceTable,
  sortColumn,
  toggleFilterRow,
  applyFilters,
  cycleSortDirection,
  resetOtherSortButtons,
} from '@adapter/ui/table-interactive';

/**
 * PR #204 — markdown table interactivity.
 *
 * Tests cover the pure DOM helpers: `enhanceTable` injects row
 * numbers + handles idempotently, `sortColumn` reorders bodyrows,
 * `toggleFilterRow` shows / hides the filter input row,
 * `applyFilters` masks rows by substring-AND, `cycleSortDirection`
 * walks the asc/desc/none cycle, `resetOtherSortButtons` clears
 * sibling buttons.
 */

function makeTable(headers: string[], rows: string[][]): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('enhanceTable — row numbers + handles', () => {
  it('prepends a # header cell and 1..N body cells', () => {
    const table = makeTable(['Name', 'Score'], [['A', '10'], ['B', '20'], ['C', '30']]);
    document.body.appendChild(table);
    enhanceTable(table);

    const headerCells = table.querySelectorAll('thead th');
    expect(headerCells.length).toBe(3); // # + Name + Score
    expect(headerCells[0]!.textContent).toBe('#');
    expect(headerCells[0]!.classList.contains('pkc-md-table-rownum')).toBe(true);

    const firstBodyRow = table.querySelectorAll<HTMLTableRowElement>('tbody tr')[0]!;
    expect(firstBodyRow.cells[0]!.textContent).toBe('1');
    expect(firstBodyRow.cells[0]!.classList.contains('pkc-md-table-rownum')).toBe(true);

    const lastBodyRow = table.querySelectorAll<HTMLTableRowElement>('tbody tr')[2]!;
    expect(lastBodyRow.cells[0]!.textContent).toBe('3');
  });

  it('adds sort + filter buttons to non-rownum header cells', () => {
    const table = makeTable(['Name', 'Score'], [['A', '10']]);
    document.body.appendChild(table);
    enhanceTable(table);

    const sortBtns = table.querySelectorAll('[data-pkc-action="md-table-sort"]');
    expect(sortBtns.length).toBe(2); // Name + Score, NOT row-number col
    const filterBtns = table.querySelectorAll('[data-pkc-action="md-table-filter-toggle"]');
    expect(filterBtns.length).toBe(2);
    // Initial sort direction is "none"
    expect(sortBtns[0]!.getAttribute('data-pkc-sort-dir')).toBe('none');
  });

  it('marks the table data-pkc-table-enhanced=1 and is idempotent', () => {
    const table = makeTable(['A'], [['x']]);
    document.body.appendChild(table);
    enhanceTable(table);
    expect(table.getAttribute('data-pkc-table-enhanced')).toBe('1');
    const headerCellsBefore = table.querySelectorAll('thead th').length;
    enhanceTable(table); // second call should be no-op
    expect(table.querySelectorAll('thead th').length).toBe(headerCellsBefore);
    expect(table.querySelectorAll('[data-pkc-action="md-table-sort"]').length).toBe(1);
  });

  it('skips tables without thead (raw HTML, not markdown-rendered)', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'foo';
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    document.body.appendChild(table);

    enhanceTable(table);
    expect(table.getAttribute('data-pkc-table-enhanced')).toBeNull();
    expect(table.querySelector('.pkc-md-table-rownum')).toBeNull();
  });
});

describe('sortColumn — string + numeric sort', () => {
  it('sorts by numeric column ascending', () => {
    const table = makeTable(['Name', 'Score'], [['A', '30'], ['B', '10'], ['C', '20']]);
    document.body.appendChild(table);
    enhanceTable(table);

    sortColumn(table, 2, 'asc'); // Score column = index 2 after row-number prepend

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.cells[1]!.textContent).toBe('B'); // Name where Score=10
    expect(rows[1]!.cells[1]!.textContent).toBe('C'); // 20
    expect(rows[2]!.cells[1]!.textContent).toBe('A'); // 30
  });

  it('sorts by numeric column descending', () => {
    const table = makeTable(['Name', 'Score'], [['A', '30'], ['B', '10'], ['C', '20']]);
    document.body.appendChild(table);
    enhanceTable(table);

    sortColumn(table, 2, 'desc');

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.cells[1]!.textContent).toBe('A');
    expect(rows[1]!.cells[1]!.textContent).toBe('C');
    expect(rows[2]!.cells[1]!.textContent).toBe('B');
  });

  it('sorts by string column locale-aware', () => {
    const table = makeTable(['Name'], [['cherry'], ['apple'], ['banana']]);
    document.body.appendChild(table);
    enhanceTable(table);

    sortColumn(table, 1, 'asc');

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.cells[1]!.textContent).toBe('apple');
    expect(rows[1]!.cells[1]!.textContent).toBe('banana');
    expect(rows[2]!.cells[1]!.textContent).toBe('cherry');
  });

  it('null direction restores original row order', () => {
    const table = makeTable(['N'], [['c'], ['a'], ['b']]);
    document.body.appendChild(table);
    enhanceTable(table);

    sortColumn(table, 1, 'asc');
    sortColumn(table, 1, null);

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.cells[1]!.textContent).toBe('c');
    expect(rows[1]!.cells[1]!.textContent).toBe('a');
    expect(rows[2]!.cells[1]!.textContent).toBe('b');
  });

  it('updates row-number cells to match new visual order', () => {
    const table = makeTable(['N'], [['c'], ['a'], ['b']]);
    document.body.appendChild(table);
    enhanceTable(table);

    sortColumn(table, 1, 'asc');

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.cells[0]!.textContent).toBe('1');
    expect(rows[1]!.cells[0]!.textContent).toBe('2');
    expect(rows[2]!.cells[0]!.textContent).toBe('3');
  });
});

describe('toggleFilterRow / applyFilters — substring AND filter', () => {
  it('toggleFilterRow inserts a filter input row on first toggle', () => {
    const table = makeTable(['Name', 'City'], [['Alice', 'Tokyo'], ['Bob', 'Osaka']]);
    document.body.appendChild(table);
    enhanceTable(table);

    expect(table.querySelector('tr.pkc-md-table-filter-row')).toBeNull();
    toggleFilterRow(table);
    const filterRow = table.querySelector('tr.pkc-md-table-filter-row');
    expect(filterRow).toBeTruthy();
    // Inputs only on data columns (skip row-number column)
    expect(filterRow!.querySelectorAll('input').length).toBe(2);
  });

  it('toggleFilterRow hides/unhides on subsequent calls', () => {
    const table = makeTable(['A'], [['x']]);
    document.body.appendChild(table);
    enhanceTable(table);

    toggleFilterRow(table); // create
    const filterRow = table.querySelector<HTMLTableRowElement>('tr.pkc-md-table-filter-row')!;
    expect(filterRow.hidden).toBe(false);

    toggleFilterRow(table); // hide
    expect(filterRow.hidden).toBe(true);

    toggleFilterRow(table); // show again
    expect(filterRow.hidden).toBe(false);
  });

  it('applyFilters AND-filters rows by substring (case-insensitive)', () => {
    const table = makeTable(
      ['Name', 'City'],
      [
        ['Alice', 'Tokyo'],
        ['Bob', 'Osaka'],
        ['Charlie', 'Tokyo'],
      ],
    );
    document.body.appendChild(table);
    enhanceTable(table);
    toggleFilterRow(table);

    const inputs = table.querySelectorAll<HTMLInputElement>('.pkc-md-table-filter-input');
    inputs[1]!.value = 'TOKYO';
    applyFilters(table);

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.hidden).toBe(false); // Alice / Tokyo
    expect(rows[1]!.hidden).toBe(true);  // Bob / Osaka
    expect(rows[2]!.hidden).toBe(false); // Charlie / Tokyo
  });

  it('combines multiple filters with AND', () => {
    const table = makeTable(
      ['Name', 'City'],
      [
        ['Alice', 'Tokyo'],
        ['Alex', 'Osaka'],
        ['Bob', 'Tokyo'],
      ],
    );
    document.body.appendChild(table);
    enhanceTable(table);
    toggleFilterRow(table);

    const inputs = table.querySelectorAll<HTMLInputElement>('.pkc-md-table-filter-input');
    inputs[0]!.value = 'al';
    inputs[1]!.value = 'tokyo';
    applyFilters(table);

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.hidden).toBe(false); // Alice / Tokyo
    expect(rows[1]!.hidden).toBe(true);  // Alex / Osaka (city mismatch)
    expect(rows[2]!.hidden).toBe(true);  // Bob / Tokyo (name mismatch)
  });

  it('empty input does not filter', () => {
    const table = makeTable(['N'], [['a'], ['b']]);
    document.body.appendChild(table);
    enhanceTable(table);
    toggleFilterRow(table);
    applyFilters(table);

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(rows[0]!.hidden).toBe(false);
    expect(rows[1]!.hidden).toBe(false);
  });

  it('renumbers visible row-numbers contiguously when rows are filtered', () => {
    const table = makeTable(['Name'], [['Alice'], ['Bob'], ['Charlie']]);
    document.body.appendChild(table);
    enhanceTable(table);
    toggleFilterRow(table);

    const inputs = table.querySelectorAll<HTMLInputElement>('.pkc-md-table-filter-input');
    inputs[0]!.value = 'b'; // matches "Bob" only(Alice / Charlie don't contain 'b')
    applyFilters(table);

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const visible = Array.from(rows).filter((r) => !r.hidden);
    expect(visible.length).toBe(1);
    expect(visible[0]!.cells[0]!.textContent).toBe('1');
  });
});

describe('cycleSortDirection / resetOtherSortButtons', () => {
  function makeButton(): HTMLElement {
    const b = document.createElement('button');
    b.setAttribute('data-pkc-sort-dir', 'none');
    b.textContent = '↕';
    b.className = 'pkc-md-table-sort';
    return b;
  }

  it('cycles none → asc → desc → none', () => {
    const btn = makeButton();
    expect(cycleSortDirection(btn)).toBe('asc');
    expect(btn.getAttribute('data-pkc-sort-dir')).toBe('asc');
    expect(btn.textContent).toBe('↑');

    expect(cycleSortDirection(btn)).toBe('desc');
    expect(btn.textContent).toBe('↓');

    expect(cycleSortDirection(btn)).toBe(null);
    expect(btn.textContent).toBe('↕');
  });

  it('resetOtherSortButtons clears every sibling but the active one', () => {
    const table = makeTable(['A', 'B', 'C'], [['x', 'y', 'z']]);
    document.body.appendChild(table);
    enhanceTable(table);

    const buttons = table.querySelectorAll<HTMLElement>('.pkc-md-table-sort');
    cycleSortDirection(buttons[0]!); // asc
    cycleSortDirection(buttons[1]!); // asc (we'll keep buttons[1] as the active one)
    cycleSortDirection(buttons[2]!); // asc

    resetOtherSortButtons(table, buttons[1]!);
    expect(buttons[0]!.getAttribute('data-pkc-sort-dir')).toBe('none');
    expect(buttons[1]!.getAttribute('data-pkc-sort-dir')).toBe('asc');
    expect(buttons[2]!.getAttribute('data-pkc-sort-dir')).toBe('none');
  });
});
