# Delegating to subagents

Use whatever subagents your harness has, such as the Task tool in Cursor and Claude Code or spawned agents in Codex. Goally doesn't launch agents. It gives them a shared board.

**Briefing.** A subagent needs its task ID and the instruction to claim it. `goally_claim_task` returns the goal, the task, the acceptance, the verify command, and the results of tasks it depends on, so you don't have to restate the board. Add what only this chat knows, like an operator preference, a file you already found, or a decision you made. Ask the subagent to reply with a short summary and anything you need to integrate.

**Parallelism.** Run independent tasks at the same time. The board enforces the operator's limit on tasks in progress, and a claim over the limit is refused. When that happens, wait for one to finish rather than queueing blindly. Tasks with unmet dependencies wait too.

**Doing it yourself.** If briefing a task costs more than doing it, do it. Claim it under your own name (for example `manager`) so the board stays true.

**Integrating.** When a subagent returns, read what it changed. Make sure its task is really closed with proof. If it isn't, finish the proof yourself or send it back with the NO-GO reason. Watch for two agents touching the same files. If you redirect or stop a subagent because of a Goal Director message, update its task (`goally_update_task`) so the board shows why.

**Worktrees.** A subagent in a separate worktree passes `cwd` to `goally_check`, so the check runs where its changes are.
