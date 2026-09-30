# Messages from the board

Two voices can write to you during a mission:

- `[GOAL DIRECTOR · M-3 · HIGH · CT-2] …` is the reviewer. After a deep look at the record and the code, it saw a loop, drift, a full build, a task stuck on details, or a "done" without proof. The message includes what it saw and one instruction.
- `[OPERATOR · M-4] …` is the human, typed on the board.

A message arrives at the end of any Goally tool result. A message about one task goes to whoever calls a tool for that task. In Cursor it also rides on your other tool results and the operator's prompts, and if one is waiting when your turn ends, it arrives as a new turn in this chat. Either way, it outranks whatever you were about to do next.

Answer with `goally_ack`:

- `accepted`: you'll do it. Then do it.
- `resolved`: it's done, or it was already true.
- `rejected`: you disagree. The note must carry the concrete reason, such as evidence the reviewer didn't have or an operator instruction that conflicts. The operator reads it.

Unanswered messages keep the mission NO-GO and get resent. If a message concerns a running subagent, redirect or stop that agent rather than waiting for it to finish.
