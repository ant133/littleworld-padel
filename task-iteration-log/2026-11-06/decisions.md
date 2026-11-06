# Decisions 2026-11-06


## D-2026-11-06-1023 · Remove the challenge feature from the sim, not just the UI
- **Context:** Feedback said Eagle Eye / challenge does not apply to padel. Hiding the button would leave the rules API, AI auto-challenges and replay kind as dead code.
- **Options:** A) hide the UI only; B) remove the rules API but keep the bounce log and `lineErrorCm`; C) remove all of it.
- **Choice:** C. Calls are now exact; `lineErrorCm` (2 cm default in a real match) only made sense with a review to undo wrong calls, so keeping it would make bad calls that stand.
- **Why:** No review in padel; less code to carry. Revisit if a line-call mistake mechanic is ever wanted without review.

## D-2026-11-06-1131 · Reuse fatigue and confidence for energy and concentration; moods are timed buffs
- **Context:** The sim already had `fatigue` (refunded at breaks) and `confidence` (tiny swings). A new mechanic needed energy that only drains, concentration that fluctuates, and moods the player can see.
- **Options:** A new state object per player; reuse the two fields and add only `mood`; per-point mood decay vs a timer.
- **Choice:** Reuse the fields (energy = 1 - fatigue), one new module `mind`, moods as timed buffs (seconds of match time) so a countdown ring is honest.
- **Why:** No change to the data model or the tests that read the old fields; the ring needs a clock, not a point count. Revisit if the 40-match balance run shows the mood multipliers moving the rally or error stats too far.
