# claude.md — PKC2 AI Execution Contract (Project Memory Edition)

## 0. Purpose

This document defines the execution contract for Claude Code working on PKC2.

This includes:
- Architecture invariants
- Implementation constraints
- Operational safety rules (CRITICAL)

This is NOT guidance. This is enforceable behavior.

---

## 1. Language Policy

- Internal reasoning MUST be in American English
- DO NOT output internal reasoning
- Final output MUST be in Japanese

---

## 2. Architecture Invariants (ABSOLUTE)

(unchanged — 略)

---

## 3. Data Integrity Rules

(unchanged — 略)

---

## 4. Implementation Principles

(unchanged — 略)

---

## 5. ⚠️ File Handling Strategy (CRITICAL)

Claude MUST assume:

- Large files are ERROR-PRONE
- Full-file rewrite is DANGEROUS

### Rules:

1. NEVER blindly load entire large file

2. If file > ~500 lines:
   → Split reading into logical sections

3. Perform edits as:
   - localized patch
   - NOT full rewrite

4. When multiple edits:
   → operate per section
   → merge explicitly

5. Preserve:
   - ordering
   - formatting
   - unrelated code

6. If safe edit is not possible:
   → STOP and report

---

## 6. ⚠️ Build Integrity Rule (MANDATORY)

PKC is a **single HTML product**.

Therefore:

### BEFORE commit:

1. Build MUST be executed
2. Output HTML MUST be generated
3. No build errors allowed

### AFTER build:

4. Verify:
   - HTML loads
   - no runtime error

5. dist file MUST be updated

### Violation:

→ Implementation is INVALID

---

## 7. ⚠️ Change Scope Control

Claude MUST:

- Avoid cross-file ripple changes
- Avoid "cleanup" outside scope
- Avoid refactoring unless required

Allowed:

- Minimal patch
- Explicit extension

Forbidden:

- Implicit redesign
- Hidden behavior change

---

## 8. ⚠️ Failure Handling

If any of the following occurs:

- unclear architecture impact
- large-scale modification needed
- risk of state inconsistency

Claude MUST:

1. STOP implementation
2. Explain risk
3. Propose alternative

---

## 9. ⚠️ AI Error Patterns (Known Issues)

Claude tends to:

- rewrite entire files
- forget build step
- break unrelated logic
- introduce hidden state

Therefore:

Claude MUST actively prevent:

- unintended overwrite
- skipped build
- silent behavior change

---

## 10. Testing Requirements

(unchanged)

---

## 11. Documentation Requirements

(unchanged)

---

## 12. UX Principles

(unchanged)

---

## 13. Priority Order

1. Data integrity
2. Build integrity
3. Architecture invariants
4. UX consistency
5. Code simplicity

---

## 14. Final Rule

If unsure:
→ DO NOT implement blindly

Instead:
→ ask OR propose opt
