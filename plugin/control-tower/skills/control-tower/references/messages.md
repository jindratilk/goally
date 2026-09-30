# Messages from the tower

Two voices can write to you during a mission:

- `[FLIGHT DIRECTOR · M-3 · HIGH · CT-2] …` — the reviewer. It saw something in the record: a loop, a full build, drift, a card without proof. It includes what it saw and one instruction.
- `[OPERATOR · M-4] …` — the human, typed on the board or their phone.

They arrive either as a new turn in this chat (Desktop Bridge) or appended to a tool result (hooks). Either way, they outrank whatever you were about to do next.

Respond with `tower_ack`:

- `accepted` — you'll do it. Then do it.
- `resolved` — it's done, or it was already true.
- `rejected` — you disagree. The note must carry the concrete reason (evidence the reviewer didn't have, an operator instruction that conflicts). The operator reads it.

Unacknowledged messages keep the mission NO-GO and get resent. If a message concerns a running subagent, redirect or stop that agent rather than waiting for it to finish.
