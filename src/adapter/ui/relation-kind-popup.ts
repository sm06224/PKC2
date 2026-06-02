// graph relation wire editor の kind selector popup(Phase γ-B2-3)。
// wire drag の drop 点付近に出て relation kind を選ぶ。spec §2.2 / §2.5。

import type { RelationKind } from '../../core/model/relation';

// provenance は system 生成のため選択肢に出さない(spec §2.5)。
const KIND_OPTIONS: ReadonlyArray<{ kind: RelationKind; label: string }> = [
  { kind: 'structural', label: 'Structural' },
  { kind: 'categorical', label: 'Categorical' },
  { kind: 'semantic', label: 'Semantic' },
  { kind: 'temporal', label: 'Temporal' },
];

let activePopup: HTMLElement | null = null;

/** 開いている kind popup を閉じる(idempotent)。 */
export function closeRelationKindPopup(): void {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

/**
 * relation kind selector popup を (x, y) に開く。kind 選択で onPick を呼んで
 * 閉じ、cancel / 再オープンでも閉じる。
 */
export function openRelationKindPopup(opts: {
  x: number;
  y: number;
  onPick: (kind: RelationKind) => void;
}): HTMLElement {
  closeRelationKindPopup();
  const popup = document.createElement('div');
  popup.className = 'pkc-relation-kind-popup';
  popup.setAttribute('data-pkc-region', 'relation-kind-popup');
  popup.setAttribute('role', 'menu');
  popup.style.left = `${opts.x}px`;
  popup.style.top = `${opts.y}px`;

  for (const opt of KIND_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-relation-kind-popup-btn';
    btn.setAttribute('data-pkc-relation-kind', opt.kind);
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      opts.onPick(opt.kind);
      closeRelationKindPopup();
    });
    popup.appendChild(btn);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'pkc-relation-kind-popup-cancel';
  cancel.setAttribute('data-pkc-relation-kind', 'cancel');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => closeRelationKindPopup());
  popup.appendChild(cancel);

  document.body.appendChild(popup);
  activePopup = popup;
  return popup;
}
