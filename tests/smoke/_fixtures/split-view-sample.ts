/**
 * Generic markdown fixture for split-view sync visual / parity tests.
 *
 * Synthetic content — no personal information, no real names, no
 * references to actual people, places, services, or business
 * details. Constructed only to exercise the markdown surface area
 * the editor needs to handle (headings, paragraphs, tables, fence
 * blocks including CSV, blockquotes, checklists, code).
 *
 * 2026-05-05 user direction: 「テスト用のマークダウンは確実に削除
 * してください」(personal content removed; this generic replacement
 * remains the standing fixture for split-view sync specs).
 */

/* eslint-disable no-irregular-whitespace -- intentional whitespace patterns
   in the synthetic fixture: full-width space variants, trailing spaces in
   table cells, etc. — reproduce the kinds of input that show up in
   real Markdown editing without using personal content. */

export const SPLIT_VIEW_FIXTURE = String.raw`# Split View Sync — Synthetic Sample

## 0. Meta

- **Purpose**: exercise heading / paragraph / table / fence
- **Status**: synthetic, no personal content
- **Lines**: ~250

## 1. Tabular CSV fence

` + '```csv' + `
id,kind,size,priority,owner,status,due,note
1,task,small,high,team-a,open,2026-06-01,initial scope draft
2,task,medium,medium,team-b,open,2026-06-15,depends on item 1
3,bug,large,high,team-a,open,2026-05-20,regression observed
4,note,small,low,team-c,closed,2026-04-10,reference reading
5,task,medium,high,team-b,open,2026-07-01,new feature scope
6,note,small,low,team-a,closed,2026-04-22,closing comment
7,task,large,medium,team-c,open,2026-06-30,investigation phase
8,bug,small,high,team-b,open,2026-05-25,reproducible
` + '```' + `

## 2. Action items

### 2.1 Items (checklist) — 15 entries

- [x] item-01 — define data shape, archetype-friendly schema
- [x] item-02 — boundary contracts, downstream signature checks
- [x] item-03 — error model classification, recoverable vs. fatal
- [x] item-04 — observability hooks, log schema versioned
- [x] item-05 — security review, privilege separation invariant
- [x] item-06 — output type taxonomy, append/transform/replace
- [x] item-07 — bidirectional edge channel, no diode assumption
- [x] item-08 — packaging policy, low-overhead local-first
- [x] item-09 — device profiles, primary + secondary platforms
- [x] item-10 — vehicle profile (sample row), spec column repro
- [x] item-11 — process model, hybrid (waterfall + AI integration)
- [x] item-12 — response style, direct, terse, no padding
- [x] item-13 — language convention, mixed JP/EN per role
- [x] item-14 — report format, decisive + bullets + sober tone
- [x] item-15 — partnership stance, "go ahead" with assumptions

### 2.2 User Preferences (final)

- [x] response style (lead-with-conclusion / no drip / fact-vs-guess)
- [x] markdown output (PKC2 conventions / heading + list + table)
- [x] emoji policy (semantic only / no decoration / explicit criteria)
- [x] language (JP main, EN allowed for meta directives)
- [x] implementation report (summary / files / tests / invariants)
- [x] analysis stance (sober / "unknown" allowed / falsifiable)
- [x] copy-into Personalization

### 2.3 Extension concept — pending

- [ ] use case clarification (decision vs. monitor vs. learn)
- [ ] data source narrowing (private vs. commercial vs. open)
- [ ] schema confirmation for OBSERVATION_SNAPSHOT archetype
- [ ] snapshot-builder design
- [ ] credential management design
- [ ] phase-1 prototype (RSS ingestion adapter)
- [ ] phase-2 (delayed-data adapter)
- [ ] phase-3 (snapshot-builder + agent)
- [ ] phase-4 (realtime adapter, online-only flag)
- [ ] phase-5 (notification / alert mechanism)

### 2.4 Migration tasks — pending

- [x] retention sweep, no rollback path required
- [ ] container project setup
- [ ] mode preset library

## 3. Topic detail

### 3.1 Memory triage

A 83-item input was reduced to 14. Decision axes:

| class | count | action |
|---|---|---|
| A. already known to the receiver | ~20 | drop (avoid stale-info hazard) |
| B. behaviour directives | 3 | port to preferences |
| C. background context | 5 | port to memory |
| D. design philosophy | 3 | port to memory |
| E. noise / one-off / preferences | 50+ | discard |

**Observation**: input granularity was uneven; ~90% noise.

### 3.2 Style iteration log

Three iterations to convergence:

- **v1**: target was over-empathy / verbose preamble / empty follow-up
- **v2**: pivoted to PKC2 markdown / table / checklist / tone switch
- **v3 (final)**: emoji as semantic markers (drop test = function vs. decoration)

### 3.3 Emoji policy

| use | OK? | example |
|---|---|---|
| category leading marker | yes | (icon-form) "category: alpha", "context: review" |
| state / outcome glyph | yes | OK / FAIL / WARN / IN-PROGRESS |
| input/output contrast | yes | INPUT / OUTPUT, PRIVATE / PUBLIC |
| sentence-tail decoration | no | "done" with feeling marker |
| scattered emphasis | no | "this is *very* important" |
| header decoration | no | "## summary" with festive glyph |

**Drop test**: removing the glyph — does information drop with it?

### 3.4 Style differences (assistant A vs. B)

| facet | assistant A | assistant B |
|---|---|---|
| default verbosity | high, decorative | medium, structural |
| concession tolerance | weak | strong, evidence-backed |
| guess insertion | frequent | "unknown" allowed |
| long-form structure | heading + glyph + bold | prose, decoration on demand |
| directive adherence | overwriteable | persistent |
| coding stance | works but review-light | invariant + test minded |
| ethics judgment | over-refusal | contextual, fewer false positives |

### 3.5 Strengths and weaknesses

**Strengths**

- long context retention
- structured reasoning (design / trade-off layout)
- careful coding (invariants / dependency direction / tests)
- directive consistency (preferences / projects span sessions)
- low refusal threshold given clear context

**Weaknesses**

- knowledge cutoff (web search needed for fresh info)
- no native image generation (SVG / Mermaid / code as workaround)
- output truncation in long form (chunk hint helps)
- iterative interpreter loop is smoother elsewhere
- fine-grained image recognition trade-offs

### 3.6 Dialog style fit

"Conversational, sparse instructions, drill down" + "go-ahead with reasonable assumption".

**Conclusion: keep that style.**

- conversation-deepening style fits assistant B
- spoken-language fidelity is high
- low-cost upstream phase by design

**Caveats**

- before code, scope the work
- 10–20+ turn threads need explicit checkpoints
- "no need to confirm — proceed on assumption" suppresses pre-flight prompting

### 3.7 Areas where confirmation should remain

- destructive / irreversible operations (delete / force-push / production deploy)
- design philosophy choices (5-layer break, browser API in core)
- large-scale pivots (interpretive refactor)
- finance / contract / career-impacting real-life calls

## 4. Reference

### 4.1 OBSERVATION_SNAPSHOT archetype schema (sample)

` + '```json' + `
{
  "archetype": "OBSERVATION_SNAPSHOT",
  "schema_version": 1,
  "subject": "sample-id-001",
  "as_of": "2026-04-25T14:30:00+09:00",
  "scope": "swing_3m",
  "summary": {
    "stance": "neutral",
    "confidence": 0.6,
    "thesis": "..."
  },
  "evidence": [
    { "kind": "news", "url": "...", "tone": "negative", "weight": 0.3, "extract": "..." }
  ],
  "scenarios": {
    "bull": { "trigger": "...", "target": "...", "probability": 0.25 },
    "base": { "trigger": "...", "target": "...", "probability": 0.55 },
    "bear": { "trigger": "...", "target": "...", "probability": 0.20 }
  },
  "uncertainties": ["..."],
  "next_check_in": "2026-05-02"
}
` + '```' + `

### 4.2 Phase plan

| phase | content | realtime degree | difficulty |
|---|---|---|---|
| 1 | RSS ingestion (open feeds) | minute-level | low |
| 2 | delayed-data adapter | 20-minute lag | medium |
| 3 | snapshot-builder + agent | n/a | medium |
| 4 | realtime adapter | realtime | high |
| 5 | notification / alert | realtime | high |

**Boundary**: phase 1–3 surpass the prior aggregator. Phase 4+ is realtime-decision support, scoped separately.
`;
