// tests/setup-globals.ts
//
// vitest 4 migration shim. vitest 4 made `vi.spyOn(obj, key)` throw
// ("can only spy on a function") when the target property is `undefined`.
// happy-dom does not implement the window dialog primitives
// (`confirm` / `alert` / `prompt`), so tests that do
// `vi.spyOn(window, 'confirm')` regressed on the 3.x → 4.x bump.
//
// Defining them as no-op functions before each test restores the
// vitest 3.x behaviour (spy target exists) without changing any test code.
import { beforeEach } from 'vitest';

beforeEach(() => {
  if (typeof window === 'undefined') return;
  if (typeof window.confirm !== 'function') window.confirm = () => false;
  if (typeof window.alert !== 'function') window.alert = () => {};
  if (typeof window.prompt !== 'function') window.prompt = () => null;
});
