---
description: ユーザーマニュアルの更新(md 正本 → 生成物再生成 → 検証)を定型手順で行う
---

`.claude/skills/manual-maintenance/SKILL.md` を読み、その手順に従ってマニュアルを
更新してください。対象・内容: $ARGUMENTS

必ず守ること:
- 画像は `images/KEY.png` 相対パスで書く(`asset:` を md に直接書かない)
- 触った章の陳腐化確認をついでに行う(実装と食い違う記述を直す)
- `npm run build && npm run build:manual && npm run check:manual` を通し、
  生成物 `PKC2-Extensions/pkc2-manual.html` も同じ commit に含める
- user-facing の内容変更なら STARTUP_NOTICES に 1 行追記
- 仕上げは merge-on-green skill の手順で PR → merge まで
