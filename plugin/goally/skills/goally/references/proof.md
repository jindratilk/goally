# What counts as proof

The board shows GO for a task only when `goally_complete_task` accepts its evidence. The check is mechanical and uses the hook record, not your description.

| Evidence kind | Accepted when |
| --- | --- |
| `test` | The hooks saw a test command pass **after the last file edit** in the mission. Run the task's targeted check in the terminal right before completing; a pass from before a later edit doesn't count. |
| `commit`, `url`, `deploy`, `screenshot` | A concrete reference is given. These are taken on trust, and the Goal Director may open them to check — only cite what you actually saw. |
| `note` | Only when the task's `verify` is `manual: …`. |

When a task is rejected, the reason is specific ("tests ran before the last edit to src/api/export.ts"). Fix that and resubmit; there is no appeal.

The whole mission is GO when every task is proven and every Goal Director or operator message is acknowledged. `goally_finish` refuses otherwise and lists what's missing. That list is the honest answer to "are we done?".
