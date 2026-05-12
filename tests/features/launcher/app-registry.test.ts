/**
 * PR-2FF(2026-05-12):アプリランチャー app-registry の test。
 */
import { describe, it, expect } from 'vitest';
import {
  LAUNCHER_APPS,
  findLauncherApp,
  parseAppQueryParam,
  isLauncherRequested,
} from '@features/launcher/app-registry';

describe('PR-2FF launcher app-registry', () => {
  describe('LAUNCHER_APPS registry', () => {
    it('Phase 1 で 7 app 登録', () => {
      expect(LAUNCHER_APPS.length).toBe(7);
    });

    it('全 app は unique id を持つ', () => {
      const ids = LAUNCHER_APPS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('全 app は label / icon / description / target を持つ', () => {
      for (const app of LAUNCHER_APPS) {
        expect(app.label).toBeTruthy();
        expect(app.icon).toBeTruthy();
        expect(app.description).toBeTruthy();
        expect(app.target).toBeDefined();
      }
    });

    it('detail / calendar / kanban / filer / graph は view-mode kind', () => {
      const viewModeIds = ['detail', 'calendar', 'kanban', 'filer', 'graph'];
      for (const id of viewModeIds) {
        const app = findLauncherApp(id);
        expect(app?.target.kind).toBe('view-mode');
      }
    });

    it('flags は overlay kind', () => {
      const app = findLauncherApp('flags');
      expect(app?.target.kind).toBe('overlay');
      if (app?.target.kind === 'overlay') {
        expect(app.target.overlay).toBe('flags-inspector');
      }
    });

    it('album は auto-filer-album kind', () => {
      const app = findLauncherApp('album');
      expect(app?.target.kind).toBe('auto-filer-album');
    });
  });

  describe('findLauncherApp', () => {
    it('既知 id → app', () => {
      const app = findLauncherApp('calendar');
      expect(app?.id).toBe('calendar');
      expect(app?.label).toBe('Calendar');
    });

    it('未知 id → undefined', () => {
      expect(findLauncherApp('unknown')).toBeUndefined();
    });
  });

  describe('parseAppQueryParam', () => {
    it('`?app=calendar` → calendar app', () => {
      expect(parseAppQueryParam('?app=calendar')?.id).toBe('calendar');
    });

    it('`app=kanban`(? 無し)も受理', () => {
      expect(parseAppQueryParam('app=kanban')?.id).toBe('kanban');
    });

    it('複数 param mix `?foo=1&app=filer&bar=2`', () => {
      expect(parseAppQueryParam('?foo=1&app=filer&bar=2')?.id).toBe('filer');
    });

    it('`?app=` 無し → null', () => {
      expect(parseAppQueryParam('?foo=1')).toBeNull();
    });

    it('`?app=` 空 → null', () => {
      expect(parseAppQueryParam('?app=')).toBeNull();
    });

    it('`?app=unknown` 不正 id → null', () => {
      expect(parseAppQueryParam('?app=unknown')).toBeNull();
    });

    it('`?app=launcher` → null(launcher 自体を表示する別 flag)', () => {
      expect(parseAppQueryParam('?app=launcher')).toBeNull();
    });

    it('空 search → null', () => {
      expect(parseAppQueryParam('')).toBeNull();
    });
  });

  describe('isLauncherRequested', () => {
    it('`?app=launcher` → true', () => {
      expect(isLauncherRequested('?app=launcher')).toBe(true);
    });

    it('`?app=calendar` → false(個別 app jump)', () => {
      expect(isLauncherRequested('?app=calendar')).toBe(false);
    });

    it('`?app=` 無し → false', () => {
      expect(isLauncherRequested('?foo=1')).toBe(false);
    });

    it('空 search → false', () => {
      expect(isLauncherRequested('')).toBe(false);
    });

    it('複数 param mix で `app=launcher`', () => {
      expect(isLauncherRequested('?debug=1&app=launcher')).toBe(true);
    });
  });
});
