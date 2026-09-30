# Cutting a mission into tasks

A task is the unit the operator reads on the board and the unit the Flight Director judges. It should make sense to someone who only sees the board.

A good task has:

- **title**: the outcome, imperative. "Export endpoint returns CSV", not "Backend work".
- **acceptance**: something observable. If you can't say how you'd notice it's true, the task isn't ready.
- **verify**: the smallest check that proves it — a specific test file, a URL, a command against a preview, or `manual: <what to look at>`. The hooks classify commands; a whole-project build reads as a full build and costs the mission time and a flag.
- **depends**: only when a task genuinely needs another task's output. False dependencies serialize work that could run in parallel.
- **lane** (optional): a short grouping the board can filter by, like `backend`, `ui`, `qa`.

Sizing: one agent, one sitting. If a task needs a paragraph to explain, split it. If three tasks touch the same file for the same reason, merge them — two agents editing one file shows up as a collision.

Scope is the operator's, not yours. Work that isn't needed for the goal doesn't get a task, even if it would be nice. If you discover required work mid-mission, `goally_add_task` puts it on the board where the operator can see it.

## Example shape

```
title: CSV escaping handles commas, quotes and newlines
acceptance: fields with , " and \n round-trip through the export unchanged
verify: npx vitest run src/lib/csv.test.ts
lane: backend
```

This shows the level of concreteness, not a template to copy — your tasks should read like your repo.
