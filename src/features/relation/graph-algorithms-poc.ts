/**
 * グラフアルゴリズム PoC(2026-07-27、user 要望
 * 「将来的に今のグラフエクステンションを cytoscape で描画したい野望もある」)。
 *
 * 🔑 **発見**: cytoscape.js は**既に bundle に入っている**。mermaid 11.16.0 が
 * `cytoscape: ^3.33.3` を直接依存に持つためで、`dist/bundle.js` を grep すると
 * pageRank / betweennessCentrality / dijkstra / floydWarshall / kruskal /
 * markovClustering など 13 種のアルゴリズムが**すでに焼き込まれている**
 * (2026-07-27 実測)。
 *
 * つまり「描画に cytoscape を使いたい」も「グラフ演算に cytoscape を使いたい」も、
 * **新しい依存を足す話ではない**。本 PoC はその追加コストを実測するためのもの。
 *
 * 現行の PKC2 にグラフ探索アルゴリズムは **1 つも無い**(2026-07-27 の実地調査):
 * あるのは到達可能性の Yes/No(`isDescendant`)、部分木の列挙
 * (`collectDescendantLids`)、次数カウント、連結の有無だけで、
 * 最短経路・中心性・コミュニティ検出・k-hop はどこにも実装されていない。
 *
 * ⚠ **これは PoC であり製品機能ではない**。呼び出しは debug hook からのみで、
 * UI からは到達しない。製品化の可否は user 裁定(プライム・ディレクティブ
 * 「機能を足さない」)。
 */
import type { Relation } from '../../core/model/relation';

export interface GraphPocResult {
  /** cytoscape が実際に読み込めたか。 */
  ok: boolean;
  nodes: number;
  edges: number;
  /** 次数中心性の上位(lid, 値)。 */
  degreeTop: Array<[string, number]>;
  /** 媒介中心性の上位 ── 現行 PKC2 に実装が無い問い。 */
  betweennessTop: Array<[string, number]>;
  /** PageRank 上位 ── 同上。 */
  pageRankTop: Array<[string, number]>;
  /** 連結成分の数 ── 同上。 */
  components: number;
  /** 2 点間の最短経路長(到達不能なら -1)── 同上。 */
  shortestPath: number;
  /** 各段の所要 ms。 */
  timings: Record<string, number>;
  error?: string;
}

/**
 * relations から cytoscape の headless インスタンスを作り、
 * **現行 PKC2 に実装が無いグラフ演算**を一通り走らせて時間を測る。
 *
 * headless: true なので DOM を作らない。**終わったら必ず `destroy()`**
 * (user 指示 2026-07-27「生成とライフサイクル後の速やかな破棄を徹底」)。
 */
export async function probeGraphAlgorithms(
  relations: readonly Relation[],
  lids: readonly string[],
): Promise<GraphPocResult> {
  const timings: Record<string, number> = {};
  const t = (k: string, f: () => void): void => {
    const t0 = performance.now();
    f();
    timings[k] = +(performance.now() - t0).toFixed(2);
  };
  try {
    const t0 = performance.now();
    const mod = await import('cytoscape');
    timings.import = +(performance.now() - t0).toFixed(2);
    const cytoscape = (mod as { default?: unknown }).default ?? mod;

    const elements = [
      ...lids.map((lid) => ({ data: { id: lid } })),
      ...relations.map((r) => ({ data: { id: r.id, source: r.from, target: r.to } })),
    ];

    interface CyLike {
      nodes: () => { length: number };
      edges: () => { length: number };
      elements: () => Record<string, unknown>;
      destroy: () => void;
      $id: (id: string) => unknown;
    }
    // ⚠ 生成をクロージャ(`t()`)の中でやると TS の制御フロー解析が
    //    代入を追えず、以降で `never` に狭まる。生成は直に書いて計時する。
    const tBuild = performance.now();
    const g = (cytoscape as (o: unknown) => CyLike)({ headless: true, elements });
    timings.build = +(performance.now() - tBuild).toFixed(2);
    if (!g) throw new Error('cytoscape instance を作れなかった');

    const top = (
      scoreOf: (lid: string) => number,
      n = 5,
    ): Array<[string, number]> =>
      lids
        .map((lid) => [lid, +scoreOf(lid).toFixed(4)] as [string, number])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, n);

    let degreeTop: Array<[string, number]> = [];
    let betweennessTop: Array<[string, number]> = [];
    let pageRankTop: Array<[string, number]> = [];
    let components = 0;
    let shortestPath = -1;

    const els = g.elements() as {
      degreeCentralityNormalized: (o: unknown) => { degree: (n: unknown) => number };
      betweennessCentrality: (o: unknown) => { betweenness: (n: unknown) => number };
      pageRank: (o: unknown) => { rank: (n: unknown) => number };
      components: () => { length: number };
      dijkstra: (o: unknown) => { distanceTo: (n: unknown) => number };
    };

    t('degree', () => {
      const dc = els.degreeCentralityNormalized({ directed: false });
      degreeTop = top((lid) => dc.degree(g.$id(lid)));
    });
    t('betweenness', () => {
      const bc = els.betweennessCentrality({ directed: false });
      betweennessTop = top((lid) => bc.betweenness(g.$id(lid)));
    });
    t('pageRank', () => {
      const pr = els.pageRank({ dampingFactor: 0.85 });
      pageRankTop = top((lid) => pr.rank(g.$id(lid)));
    });
    t('components', () => {
      components = els.components().length;
    });
    t('shortestPath', () => {
      const first = lids[0];
      const last = lids[lids.length - 1];
      if (!first || !last) return;
      const dj = els.dijkstra({ root: g.$id(first), directed: false });
      const d = dj.distanceTo(g.$id(last));
      shortestPath = Number.isFinite(d) ? d : -1;
    });

    const nodes = g.nodes().length;
    const edges = g.edges().length;
    g.destroy(); // 速やかな破棄(user 指示 2026-07-27)

    return { ok: true, nodes, edges, degreeTop, betweennessTop, pageRankTop, components, shortestPath, timings };
  } catch (err) {
    return {
      ok: false,
      nodes: 0,
      edges: 0,
      degreeTop: [],
      betweennessTop: [],
      pageRankTop: [],
      components: 0,
      shortestPath: -1,
      timings,
      error: String(err),
    };
  }
}
