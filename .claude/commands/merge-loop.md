---
description: 指定 PR の CI を監視し、全 green で squash merge → main 同期まで回す
---

`.claude/skills/merge-on-green/SKILL.md` を読み、その手順に従って対象 PR を
着地させてください。対象: $ARGUMENTS(未指定なら現在の作業 branch の open PR)。

- CronCreate(*/3 分)で CI 監視ループを登録し、このターンは終了する
- 全 green(Tier-B の skipped は正常)で squash merge(commit title = PR title + " (#N)")
- merge 後: cron 削除 → local main を ff-only で同期 → user に日本語で報告
- CI fail 時は logs を調査し、修正を push してループ継続
- scope drift / 互換破壊 / 不可逆 / frozen 抵触を検知したら merge せず会話で確認
