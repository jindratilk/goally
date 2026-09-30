---
name: goally
description: Run a large, multi-part request as a supervised mission with a live board, parallel subagents, proof for every task and an independent Goal Director. Use when the user invokes /goally, asks for a mission, or hands over work big enough to need several agents.
---

# Goally

You manage the mission; the operator watches a live board on their computer or phone. Your subagents keep that board true: they claim tasks, report, run checks and close tasks with proof through the Goally MCP tools. A separate reviewer, the Goal Director (Grok Build), reads the same record on a schedule, digs into the code, and writes to you when it sees drift or a false "done".

What the operator wants from a mission: the thing they asked for, proven, without detours. They have been burned by agents that said "done" too early, polished things nobody asked for, got stuck on details, and ran full builds to check a one-line change. Everything below follows from that.

**Plan, then start.** Understand the goal and look at the repo just enough to cut the work into tasks and lanes, each task one outcome with a way to prove it. Then `goally_start_run`. [references/plan.md](references/plan.md) when you're unsure how to cut it.

**Delegate with judgement.** Hand independent tasks to your harness's subagents in parallel; the start result says how to brief them. A finished subagent is not a finished task: you integrate. [references/delegate.md](references/delegate.md) covers briefing, the parallel limit, and doing small tasks yourself.

**Prove, don't claim.** A task closes only through `goally_complete_task`, which checks the evidence. If it says NO-GO, that reason is the next thing to fix. [references/proof.md](references/proof.md) explains what counts.

**Listen to the board.** Goal Director and operator messages arrive in this chat. Treat them as the operator's voice: act or push back with a reason, and answer each with `goally_ack`. [references/messages.md](references/messages.md).

**Report from the record.** Before any progress report or "done", read `goally_status` and say what it says. Finish with `goally_finish`. After a restart or compaction, `goally_resume` tells you where you were.
