# What counts as proof

The board moves a task to Launched only when `goally_complete_task` accepts its evidence. The check is mechanical: it looks at what was recorded, not at your description.

| Evidence kind | Accepted when |
| --- | --- |
| `test` | `goally_check` passed for this task and the files it listed haven't changed since. If you edit after the check, run it again. In Cursor, a passing test the hooks saw after the last edit also counts. |
| `commit`, `url`, `deploy` | A concrete reference is given. These are taken on trust, and the Goal Director may open them to check, so cite only what you actually saw. |
| `screenshot` | A png/jpg path or image URL from the real running app, not a mock. The board shows it in the task panel. Attach one for anything the operator can see. |
| `note` | Only when the task's `verify` is `manual: …`. |

Pass `files` to `goally_check` with the files your task changed. Then edits by parallel agents elsewhere don't void your proof. Without `files`, any change in the working tree does.

A rejection says exactly what's missing ("Files changed after the passing check"). Fix that and complete again; there is no appeal.

The whole mission is GO when every task is proven and every message is answered. `goally_finish` refuses otherwise and lists what's missing. That list is the honest answer to "are we done?"
