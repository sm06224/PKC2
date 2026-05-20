// Tier 0 flag for the meta pane frontmatter graphical editor (Phase γ-B1).
// Spec: docs/development/phase-beta-group-b-meta-pane-spec-2026-05.md §5.

import { defineFlag } from '@core/flags';

export const metaPaneYamlGraphicalEnabled = defineFlag<boolean>(
  'meta_pane.yaml_graphical_enabled',
  false,
  {
    category: 'meta_pane',
    description:
      'meta pane の frontmatter section を編集可能な graphical editor にする。OFF で従来の read-only 表示',
  },
);
