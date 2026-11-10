# Delegating to subagents

Use whatever subagents your harness has, such as the Task tool in Cursor and Claude Code or spawned agents in Codex. Goally doesn't launch agents. It gives them a shared board.

**Briefing.** A subagent needs its task ID and the instruction to claim it. `goally_claim_task` returns the goal, the task, the acceptance, the verify command, and the results of tasks it depends on, so you don't have to restate the board. Add what only this chat knows, like an operator preference, a file you already found, or a decision you made. Ask the subagent to reply with a short summary and anything you need to integrate.

A QA or review task reports every problem it can prove, not only the first. A worker that returns no result is a gap, never a pass: rerun it once, then put the gap on the board.

**Models.** By default, use your harness's subagents on their default model; don't choose models yourself. When the operator assigns models to tasks, set `model` on those tasks and run each one on its model. In T3 Code, look up the available models with `orchestrator_capabilities` and start each task with `delegate_task` on its model. Elsewhere, use the harness's own subagents if they can run that model. If an assigned model isn't available, tell the operator instead of substituting another. A worker on another provider can claim its task only if that harness has the Goally MCP server; if it doesn't, say so.

**Parallelism.** Run independent tasks at the same time. The board enforces the operator's limit on tasks in progress, and a claim over the limit is refused. When that happens, wait for one to finish rather than queueing blindly. Tasks with unmet dependencies wait too.

**Pace.**

- Always work in parallel. An empty slot while ready work exists is a mistake. Never wait for a thread to finish while doing nothing else.
- Watch RAM and CPU. Add agents while the machine is busy and still keeping up. Once it starts swapping or stalling, do not start another.
- Codex only: subagents stay within the limit (max 3). Above that, use threads.
- The main agent splits the work, holds the state, does the final integration, and keeps looking for what is slowing the mission down.
- Unblock the task that is holding the others back first. Then the rest.
- Do a small fix yourself. Start a thread only for larger independent work.
- The owner fixes P0 and P1 immediately, without waiting for approval.
- One review after a coherent batch. Ongoing small reviews are hardening that does not move the goal. The same applies to tests: run the broad suite that covers everything only after a coherent batch, so most of the waiting is not on test results and testing stays efficient.
- Update the tracker at the moment of proof, not in an extra round.
- Codex only: the main chat does not get worker noise: every partial test, hashes, "worker continues", reviews with no findings.
- Do not end a turn with a status message. Keep working until the goal is done.
- Maximize speed with consistent quality.

**Doing it yourself.** If briefing a task costs more than doing it, do it. Claim it under your own name (for example `manager`) so the board stays true.

**Integrating.** When a subagent returns, read what it changed. Make sure its task is really closed with proof. If it isn't, finish the proof yourself or send it back with the NO-GO reason. Watch for two agents touching the same files. If you redirect or stop a subagent because of a Goal Director message, update its task (`goally_update_task`) so the board shows why.

**Racing a stuck task.** When a task has failed twice, or its design is genuinely uncertain, you may race it. Never by default: every candidate costs a full attempt. Add two or three candidates with `goally_add_task`, each with the original's acceptance and verify, and make the original depend on them; it becomes the merge task. Decide the winner rule before starting: first to pass, or best against the acceptance. Give each candidate its own worktree, and have it prove itself there. Then read every candidate, pick the winner by the acceptance, port the one or two strong parts of the others into it by hand, and drop each loser with the reason (`lost to CT-6: …`). Prove the merge task with a normal check. If the candidates diverge wildly, the task was underspecified: rewrite it instead of averaging them.

**Worktrees.** A subagent in a separate worktree passes `cwd` to `goally_check`, so the check runs where its changes are.
