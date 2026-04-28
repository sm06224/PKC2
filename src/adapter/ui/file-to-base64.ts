/**
 * File → base64 conversion for the attachment / paste pipeline.
 *
 * Why this helper exists
 * ──────────────────────
 * The four FileReader sites in the codebase (drop, edit-drop, paste,
 * dedupe-drop) historically did:
 *
 *     reader.readAsArrayBuffer(file);
 *     // ... in onload ...
 *     const buf = reader.result as ArrayBuffer;          // N bytes
 *     const bytes = new Uint8Array(buf);
 *     let binary = '';
 *     for (let i = 0; i < bytes.length; i++) {
 *       binary += String.fromCharCode(bytes[i]!);        // 2N bytes (UTF-16)
 *     }
 *     const base64 = btoa(binary);                       // ~1.33N bytes
 *
 * For an N-byte file the transient JS heap peaks at roughly 4-5N
 * (ArrayBuffer + Uint8Array view + binary string + base64). On a
 * burst-drop of 10 × 5 MB images that's 200-300 MB before any GC.
 * Some Android / iOS browsers hard-OOM well below that.
 *
 * `readAsDataURL` does the base64 conversion in C++ inside the
 * browser. From JS we see only one allocation: the `data:...,base64`
 * string (~1.33N). That's a 3-4× peak-memory reduction on the hot
 * path with no behaviour change for downstream consumers.
 *
 * `prepareOptimizedIntake(file, base64, surface)` — the only consumer
 * — already takes both `file` and `base64`. The optimizer reads the
 * `File` directly when it actually decodes; the base64 is only used
 * for the pass-through (no-optimize) branch. So skipping the
 * ArrayBuffer step is purely a memory win.
 */

/**
 * Read a `File` and return its contents base64-encoded WITHOUT the
 * `data:<mime>;base64,` prefix.
 *
 * Throws on read errors (FileReader.error). Callers should catch and
 * surface a user-visible toast — the historical sites all did so.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      if (typeof url !== 'string') {
        reject(new Error('FileReader.result was not a data URL string'));
        return;
      }
      // `data:<mime>;base64,<payload>` — slice off everything up to
      // and including the comma. If the prefix is missing for some
      // reason, fall back to returning the whole string.
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : url);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader failed'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Yield to the event loop so the browser can run a frame, run GC,
 * and process pending input. Used between files in batch attach
 * loops so a 10-file drop doesn't tie up the main thread for the
 * entire intake. `setTimeout(0)` is intentional here (not
 * requestAnimationFrame): we want to yield even when the tab is
 * backgrounded, since most users start a drop and immediately Cmd-Tab
 * away.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
