# What counts as proof

The board shows GO for a card only when `tower_complete_task` accepts its evidence. The check is mechanical and uses the hook record, not your description.

| Evidence kind | Accepted when |
| --- | --- |
| `test` | The hooks saw a test command pass **after the last file edit** in the mission. Run the card's targeted check in the terminal right before completing; a pass from before a later edit doesn't count. |
| `commit`, `url`, `deploy`, `screenshot` | A concrete reference is given. These are taken on trust, and the Flight Director may open them to check — only cite what you actually saw. |
| `note` | Only when the card's `verify` is `manual: …`. |

When a card is rejected, the reason is specific ("tests ran before the last edit to src/api/export.ts"). Fix that and resubmit; there is no appeal.

The whole mission is GO when every card is proven and every Flight Director or operator message is acknowledged. `tower_finish` refuses otherwise and lists what's missing. That list is the honest answer to "are we done?".
