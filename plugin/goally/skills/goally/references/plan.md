# Cutting a mission into tasks and lanes

A task is the unit the operator reads on the board and the unit the Goal Director judges. It should make sense to someone who only sees the board.

**Lanes** group tasks the way this repo and goal naturally split, such as `backend`, `ui`, `qa` and `release`, or `api`, `ios` and `docs`. Pick them from the work, in the order the operator would read it. Every task gets one lane. Three to five lanes is typical; one lane per task defeats the point.

A good task has:

- **title**: the outcome, imperative. "Export endpoint returns CSV", not "Backend work".
- **description**: what to change and where, written for a subagent that never saw this chat.
- **acceptance**: something observable. If you can't say how you'd notice it's true, the task isn't ready.
- **verify**: the smallest check that proves it. That can be one test file, a URL, a command against a preview, or `manual: <what to look at>`. `goally_check` runs this command. A whole-project build costs the mission minutes, and the Goal Director will flag it.
- **depends**: only when a task genuinely needs another task's output. False dependencies serialize work that could run in parallel. A subagent can't claim a task until its dependencies are done.

Sizing: one agent, one sitting. If a task needs a paragraph to explain, split it. If three tasks touch the same file for the same reason, merge them, because two agents editing one file shows up as a collision.

If the goal is user-facing, one task should prove the real flow end to end, usually in a `release` or `qa` lane with a screenshot.

Scope is the operator's, not yours. Work the goal doesn't need doesn't get a task, even if it would be nice. If you discover required work mid-mission, `goally_add_task` puts it on the board where the operator can see it. `goally_update_task` fixes a task that turned out wrong, and `goally_set_lanes` fixes the lanes.
