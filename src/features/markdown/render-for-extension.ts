/**
 * PKC Render Service — features-layer seam (PR-RS-1).
 *
 * Design: `docs/development/extension-render-service-design-2026-06.md`.
 *
 * `renderForExtension()` is the **pure** core that the host lends to
 * sandboxed extensions over the `pkc-ext` render RPC (transport wiring
 * lands in PR-RS-2). It takes a PKC-Markdown `source` an extension already
 * owns and returns rendered HTML produced by the *same* engine the host's
 * own surfaces use (`resolveAssetReferences` → `renderMarkdown`), so an
 * extension never bundles — and never drifts from — the dialect engine
 * (design §3 "drift ゼロ", §10 slim-core seam).
 *
 * Two invariants distinguish this from a plain `renderMarkdown` call:
 *
 *   1. **Consent (design §6, MUST)** — asset references resolve ONLY
 *      against assets already *delivered* to the requesting extension.
 *      The caller passes a `deliveredAssets` map scoped to that channel;
 *      any `asset:KEY` not in it falls through to the existing broken-ref
 *      placeholder (`*[missing asset: KEY]*`), identical to the host's
 *      own "reference left broken" behavior. `render-request` therefore
 *      cannot become a pull side-channel for undelivered实体.
 *   2. **No throwing across the boundary (design §4/§12)** — a renderer
 *      fault returns `{ ok:false, reason }` instead of propagating, so
 *      the transport layer can forward a structured failure rather than
 *      crash the host on hostile input.
 *
 * This module is pure (features layer): no DOM, no browser APIs, no
 * adapter imports — it composes existing pure markdown helpers only.
 */
import { renderMarkdown } from './markdown-render';
import {
  resolveAssetReferences,
  hasAssetReferences,
  type AssetResolutionContext,
} from './asset-resolver';
import { stripDialect } from './strip-dialect';
import { parseFrontmatter, extractVars } from './frontmatter';
import { extractHeadingNumberConfig } from './document-globals';
import { extractHeadingsFromMarkdown, type TocHeading } from './markdown-toc';

/**
 * Render-service protocol version, surfaced as `render-result.engine_version`
 * for drift detection (design §4 — mirrors the `window.PKC.ast` versioning
 * convention). Bump on any change to the rendered-HTML contract.
 */
export const RENDER_SERVICE_VERSION = '1.0.0';

/**
 * Per-request render options (design §4 `RenderOpts`). All optional; unknown
 * keys are ignored by callers (forward-compatible). Field names mirror the
 * on-the-wire snake_case shape so the transport layer (PR-RS-2) can forward
 * the payload without remapping.
 */
export interface ExtensionRenderOpts {
  /**
   * Typographic profile hint (design §4). Currently advisory only — the
   * rendered *HTML* is identical for both surfaces; the visual difference
   * is carried by the borrowed CSS (design §7, PR-RS-2 `stylesheet`).
   * Accepted now so the wire contract is stable from the first cut.
   */
  readonly surface?: 'reader' | 'preview';
  /** Stamp `data-pkc-source-line` anchors (Split View parity, design §4). */
  readonly source_line_anchors?: boolean;
  /** Downgrade PKC dialect to CommonMark before render (lossy, design §4/§11). */
  readonly strip_dialect?: boolean;
  /** Also extract heading outline into `headings` (design §4 `toc`). */
  readonly toc?: boolean;
}

/**
 * Render context the host builds per requesting extension. The asset maps
 * MUST contain only entries already delivered to that extension's channel
 * (design §6) — this seam does not police delivery itself; it simply
 * resolves against whatever scoped maps the caller supplies, and anything
 * absent renders as a broken reference.
 */
export interface ExtensionRenderContext {
  /** asset_key → base64, delivered-only (design §6 MUST). */
  readonly deliveredAssets?: Record<string, string>;
  /** asset_key → MIME, delivered-only. */
  readonly deliveredMime?: Record<string, string>;
  /** asset_key → display name, delivered-only (optional fallback label). */
  readonly deliveredNames?: Record<string, string>;
}

/**
 * Result mirroring the `render-result` payload (design §4) minus the
 * transport-owned `css` / `correlation_id` fields, which PR-RS-2 attaches.
 * Failures are reported in-band (`ok:false`), never thrown.
 */
export interface ExtensionRenderResult {
  readonly ok: boolean;
  /** Rendered HTML (present when `ok`). Host is the sanitization authority. */
  readonly html?: string;
  /** Heading outline, present when `opts.toc` and `ok`. */
  readonly headings?: TocHeading[];
  /** Render-engine version for drift detection (always present). */
  readonly engine_version: string;
  /** Failure detail when `ok:false`. */
  readonly reason?: string;
}

const EMPTY_CTX: ExtensionRenderContext = {};

/**
 * Render a PKC-Markdown `source` on behalf of a sandboxed extension.
 *
 * Pipeline mirrors the host's own reader surface (detail-presenter):
 * frontmatter strip → delivered-only asset resolution → optional dialect
 * strip → `renderMarkdown` (vars + heading-number from the original body).
 * With a *full* asset context this produces byte-identical HTML to the
 * center-pane render of the same body — the parity guarantee of design §12.
 */
export function renderForExtension(
  source: string,
  opts: ExtensionRenderOpts = {},
  ctx: ExtensionRenderContext = EMPTY_CTX,
): ExtensionRenderResult {
  try {
    const raw = source ?? '';
    // Frontmatter is metadata, not body — strip it before render (mirrors
    // detail-presenter) so YAML never renders as a table, while `vars` /
    // heading-number are still read from the *original* source below.
    let md = parseFrontmatter(raw).body;

    // §6 consent: resolve against delivered-only assets. Undelivered keys
    // fall through to the existing broken-ref placeholder.
    if (hasAssetReferences(md)) {
      const assetCtx: AssetResolutionContext = {
        assets: ctx.deliveredAssets ?? {},
        mimeByKey: ctx.deliveredMime ?? {},
        nameByKey: ctx.deliveredNames,
      };
      md = resolveAssetReferences(md, assetCtx);
    }

    // §4/§11: lossy CommonMark downgrade, opt-in.
    if (opts.strip_dialect) {
      md = stripDialect(md);
    }

    const html = renderMarkdown(md, {
      vars: extractVars(raw),
      headingNumber: extractHeadingNumberConfig(raw),
      sourceLineAnchors: opts.source_line_anchors === true,
      // Never let dialect-hallucination warnings reach the host console on
      // untrusted extension input.
      silentHallucinationWarnings: true,
    });

    const headings = opts.toc ? extractHeadingsFromMarkdown(raw) : undefined;

    return {
      ok: true,
      html,
      ...(headings ? { headings } : {}),
      engine_version: RENDER_SERVICE_VERSION,
    };
  } catch (err) {
    // §4/§12: never throw across the boundary.
    return {
      ok: false,
      engine_version: RENDER_SERVICE_VERSION,
      reason: err instanceof Error ? err.message : 'render failed',
    };
  }
}
