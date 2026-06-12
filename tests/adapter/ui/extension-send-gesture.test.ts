// @vitest-environment happy-dom
/**
 * #806 host-push 送付導線: 右クリック「拡張へ送る」+ 紐付け toggle +
 * 既定送り先(shell menu Extensions section で可視・取消 = G3)。
 * ExtensionHost は fake 注入(bindActions deps)。menu DOM は実 renderer。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter, serializeAttachmentBody } from '@adapter/ui/attachment-presenter';
import {
  isExtensionBound,
  bindExtension,
  setDefaultTarget,
  getDefaultTarget,
  __resetExtensionBindingsCacheForTest,
} from '@adapter/platform/extension-bindings';
import type { ExtensionHost } from '@adapter/ui/extension-host-runtime';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);

const T = '2026-06-12T00:00:00Z';

function extBody(name: string): string {
  return serializeAttachmentBody({
    name, mime: 'text/html', asset_key: `${name}-key`, pkc_extension: true,
  } as never);
}

function container(): Container {
  return {
    meta: { container_id: 'c', title: 'C', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'ext1', title: 'Graph Ext', body: extBody('graph.html'), archetype: 'attachment', created_at: T, updated_at: T },
      { lid: 'ext2', title: 'Pdf Ext', body: extBody('pdfv.html'), archetype: 'attachment', created_at: T, updated_at: T },
      { lid: 'e1', title: 'Text One', body: 'send me', archetype: 'text', created_at: T, updated_at: T },
      {
        lid: 'pdf1', title: 'Report', archetype: 'attachment', created_at: T, updated_at: T,
        body: serializeAttachmentBody({ name: 'r.pdf', mime: 'application/pdf', asset_key: 'pdf-key' } as never),
      },
    ],
    relations: [],
    revisions: [],
    assets: { 'graph.html-key': btoa('<html>G</html>'), 'pdfv.html-key': btoa('<html>P</html>'), 'pdf-key': btoa('PDF') },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function fakeHost(): ExtensionHost & { sendToExtension: ReturnType<typeof vi.fn> } {
  return {
    openExtension: vi.fn(() => null),
    sendToExtension: vi.fn(() => true),
    openLids: () => [],
    closeAll: vi.fn(),
  };
}

/** app を mount して fake host 注入済みの binder を張る。 */
function mount(host: ExtensionHost): ReturnType<typeof createDispatcher> {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
  render(d.getState(), root);
  cleanup = bindActions(root, d, { extensionHost: host });
  return d;
}

function rightClickSidebarEntry(lid: string): HTMLElement {
  const item = root.querySelector<HTMLElement>(
    `[data-pkc-region="sidebar"] [data-pkc-action="select-entry"][data-pkc-lid="${lid}"]`,
  );
  expect(item, `sidebar entry ${lid}`).not.toBeNull();
  item!.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }),
  );
  const menu = root.querySelector<HTMLElement>('[data-pkc-region="context-menu"]');
  expect(menu, 'context menu').not.toBeNull();
  return menu!;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  __resetExtensionBindingsCacheForTest();
  localStorage.clear();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('「拡張へ送る」 sub-menu', () => {
  it('紐付け済み拡張が宛先に出て、クリックで host.sendToExtension(ext, entry)', () => {
    bindExtension('ext1');
    const host = fakeHost();
    mount(host);
    const menu = rightClickSidebarEntry('e1');
    expect(menu.querySelector('[data-pkc-region="context-menu-send-extension"]')).not.toBeNull();
    const btn = menu.querySelector<HTMLElement>(
      '[data-pkc-action="ctx-send-to-extension"][data-pkc-ext-lid="ext1"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Graph Ext');
    click(btn!);
    expect(host.sendToExtension).toHaveBeenCalledWith('ext1', 'e1');
  });

  it('紐付けゼロなら send section は出ない', () => {
    mount(fakeHost());
    const menu = rightClickSidebarEntry('e1');
    expect(menu.querySelector('[data-pkc-region="context-menu-send-extension"]')).toBeNull();
  });

  it('自分自身は宛先に出ない(拡張 entry を別の拡張へは送れる)', () => {
    bindExtension('ext1');
    bindExtension('ext2');
    mount(fakeHost());
    const menu = rightClickSidebarEntry('ext1');
    const targets = [...menu.querySelectorAll('[data-pkc-action="ctx-send-to-extension"]')]
      .map((b) => b.getAttribute('data-pkc-ext-lid'));
    expect(targets).toEqual(['ext2']);
  });

  it('既定送り先は ★ 付きで先頭、非既定には「既定にして送る」 row が付く', () => {
    bindExtension('ext1');
    bindExtension('ext2');
    setDefaultTarget('archetype:text', 'ext2');
    mount(fakeHost());
    const menu = rightClickSidebarEntry('e1');
    const sendBtns = [...menu.querySelectorAll('[data-pkc-action="ctx-send-to-extension"]')];
    expect(sendBtns.map((b) => b.getAttribute('data-pkc-ext-lid'))).toEqual(['ext2', 'ext1']);
    expect(sendBtns[0]!.textContent).toContain('★');
    expect(sendBtns[0]!.textContent).toContain('既定');
    const defBtns = [...menu.querySelectorAll('[data-pkc-action="ctx-send-to-extension-default"]')]
      .map((b) => b.getAttribute('data-pkc-ext-lid'));
    expect(defBtns).toEqual(['ext1']); // 既定の ext2 には出ない
  });

  it('「既定にして送る」= matchKey に既定登録してから送る(attachment は mime key)', () => {
    bindExtension('ext1');
    const host = fakeHost();
    mount(host);
    const menu = rightClickSidebarEntry('pdf1');
    const btn = menu.querySelector<HTMLElement>(
      '[data-pkc-action="ctx-send-to-extension-default"][data-pkc-ext-lid="ext1"]',
    );
    expect(btn).not.toBeNull();
    click(btn!);
    expect(getDefaultTarget('mime:application/pdf')).toBe('ext1');
    expect(host.sendToExtension).toHaveBeenCalledWith('ext1', 'pdf1');
  });
});

describe('紐付け toggle(拡張 entry 自身の menu)', () => {
  it('未紐付け → 「拡張として紐付け」、クリックで bound に', () => {
    mount(fakeHost());
    const menu = rightClickSidebarEntry('ext1');
    expect(menu.querySelector('[data-pkc-action="ctx-unbind-extension"]')).toBeNull();
    const bindBtn = menu.querySelector<HTMLElement>('[data-pkc-action="ctx-bind-extension"]');
    expect(bindBtn).not.toBeNull();
    click(bindBtn!);
    expect(isExtensionBound('ext1')).toBe(true);
  });

  it('紐付け済み → 「紐付けを解除」、クリックで unbound に', () => {
    bindExtension('ext1');
    mount(fakeHost());
    const menu = rightClickSidebarEntry('ext1');
    expect(menu.querySelector('[data-pkc-action="ctx-bind-extension"]')).toBeNull();
    const unbindBtn = menu.querySelector<HTMLElement>('[data-pkc-action="ctx-unbind-extension"]');
    expect(unbindBtn).not.toBeNull();
    click(unbindBtn!);
    expect(isExtensionBound('ext1')).toBe(false);
  });

  it('非拡張 entry には紐付け toggle が出ない', () => {
    mount(fakeHost());
    const menu = rightClickSidebarEntry('e1');
    expect(menu.querySelector('[data-pkc-action="ctx-bind-extension"]')).toBeNull();
    expect(menu.querySelector('[data-pkc-action="ctx-unbind-extension"]')).toBeNull();
  });
});

describe('shell menu Extensions section(G3: 可視・取消)', () => {
  function openShellMenu(d: ReturnType<typeof createDispatcher>): HTMLElement {
    d.dispatch({ type: 'TOGGLE_MENU' });
    render(d.getState(), root);
    const section = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu-extensions"]');
    expect(section, 'extensions section').not.toBeNull();
    return section!;
  }

  it('紐付け・既定が一覧表示され、解除で registry と行が消える(既定も道連れ)', () => {
    bindExtension('ext1');
    setDefaultTarget('mime:application/pdf', 'ext1');
    const d = mount(fakeHost());
    const section = openShellMenu(d);
    expect(section.querySelector('[data-pkc-ext-binding-row="ext1"]')!.textContent).toContain('Graph Ext');
    expect(section.querySelector('[data-pkc-ext-default-row="mime:application/pdf"]')!.textContent)
      .toContain('mime:application/pdf');

    const unbindBtn = section.querySelector<HTMLElement>(
      '[data-pkc-action="unbind-extension"][data-pkc-ext-lid="ext1"]',
    );
    click(unbindBtn!);
    expect(isExtensionBound('ext1')).toBe(false);
    expect(getDefaultTarget('mime:application/pdf')).toBeNull();
    expect(root.querySelector('[data-pkc-ext-binding-row="ext1"]')).toBeNull();
    expect(root.querySelector('[data-pkc-ext-default-row]')).toBeNull();
  });

  it('既定送り先の ✕ で取消(紐付けは残る)', () => {
    bindExtension('ext1');
    setDefaultTarget('archetype:text', 'ext1');
    const d = mount(fakeHost());
    const section = openShellMenu(d);
    const clearBtn = section.querySelector<HTMLElement>(
      '[data-pkc-action="clear-default-extension"][data-pkc-match-key="archetype:text"]',
    );
    expect(clearBtn).not.toBeNull();
    click(clearBtn!);
    expect(getDefaultTarget('archetype:text')).toBeNull();
    expect(isExtensionBound('ext1')).toBe(true);
    expect(root.querySelector('[data-pkc-ext-default-row]')).toBeNull();
  });

  it('紐付けも既定も無ければ section ごと出ない', () => {
    const d = mount(fakeHost());
    d.dispatch({ type: 'TOGGLE_MENU' });
    render(d.getState(), root);
    expect(root.querySelector('[data-pkc-region="shell-menu-extensions"]')).toBeNull();
  });
});
