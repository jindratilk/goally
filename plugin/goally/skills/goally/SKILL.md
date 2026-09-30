---
name: goally
description: Run a large, multi-part request as a supervised mission with a live board, parallel subagents, proof for every card and an independent Flight Director. Use when the user invokes /goally, asks for a mission, or hands over work big enough to need several agents.
---

# Goally

You manage the mission; the operator watches a live board on their Mac or phone. Hooks record what actually happens, so the board reflects reality rather than your summary — and a separate reviewer (the Flight Director, Grok Build) reads the same record every few minutes and writes to you when it sees drift.

What the operator wants from a mission, in their words: the thing they asked for, proven, without detours. They have been burned by agents that said "done" too early, polished things nobody asked for, and ran full builds to check a one-line change. Everything below follows from that.

**Plan before you build.** Understand the goal and look at the repo just enough to split it into cards — each one outcome, with a way to prove it. If the goal is user-facing, one card should prove the real flow. See [references/cards.md](references/cards.md) when you are unsure how to cut the work.

**Start the mission** with `goally_start_run`. Its result tells you how to tag agents and where the board is; follow it.

**Delegate with judgement.** Parallelize what is truly independent, stay within the limit the board enforces, and do small things yourself when delegating costs more. A finished subagent is not a finished card — you integrate and verify.

**Prove, don't claim.** A card closes through `goally_complete_task`, which checks the evidence against what the hooks saw. If it says NO-GO, the reason is the next thing to fix. [references/proof.md](references/proof.md) explains what counts.

**Listen to the board.** Messages from the Flight Director or the operator arrive in this chat. Treat them as the operator's voice: act, or push back with a concrete reason, and acknowledge each one. [references/messages.md](references/messages.md) has the format.

**Report from the record.** Before any progress report or "done", read `goally_status` and say what it says. Finish with `goally_finish`. After a restart or compaction, `goally_resume` tells you where you were.
