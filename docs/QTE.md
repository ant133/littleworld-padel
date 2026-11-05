# Coach dock and QTE shots (Play mode)

Status: the dock (section 1) and the QTE (sections 2-4) are built. Not built yet: the defence "dive" (the down swipe is a safe scramble lob instead).

## 1. Coach dock

Replaces the old coach bar (tactic dropdown, middle-ball dropdown, three text buttons). A floating dock sits at the bottom of the match view. Studio keeps the full preset grid, serve/return direction, aim-click and focus controls.

| Group | Control | Orders key | Effect |
| --- | --- | --- | --- |
| Mindset | 5-stop dial, shield (defend) to sword (attack): Fortress, Safe, Balanced, Pressure, All-in | `mindset` -2..2 | multipliers for smash, vibora, flat, lob, wallDef, risk and `netBias` (`MINDSET` in `07_ai.js`) |
| Plan | one of six icon toggles, exclusive; tapping the active one clears it | `plan` | `PLANS` in `07_ai.js` |
| Style | Spin / Mix / Flat | `style` | `STYLES` in `07_ai.js` |
| Moments | Go for it (arms the next QTE chance), Aim, Timeout, Challenge (badges show what is left) | - | `qte.arm()` and existing actions |
| Middle balls | Auto / You / Annetta, the fourth group of the sheet | `middlePriority` | existing |
| Hint | one-line suggestion chip with Apply | - | UI only |

Plans: **Wear them down** (`exhaust`: aim at the more tired opponent, corner to corner, more lobs, drops and slices, fewer smashes), **Hunt the weak one** (`hunt`: focus the weaker defender), **Take the net** (`net`: `netBias` 2, more volleys and bandejas), **Break the net** (`breakNet`: lobs deep to the back glass when an opponent is at the net), **Use the glass** (`glass`), **Down the middle** (`middle`).

The orders compose: `mods(team)` multiplies the preset, mindset, plan and style tables (numbers multiply, `netBias` adds, flags OR). Studio's `preset` still works alone.

Smart hint: every 1.5 s the UI samples the opponents. It suggests a plan when (a) one opponent's fatigue is 0.12 or more and 0.04 above the partner's (`exhaust`), (b) both opponents were within 4 m of the net for 60% of the last 8 s (`breakNet`), (c) both were deeper than 6 m for 60% (`net`), or (d) one has 10 or more points less defense (`hunt`). The chip shows for 9 s, at most once every 30 s, never for the plan already set.

Style: annetta.dev cards (cream, ink hairline, hard offset shadow, square corners); buttons are cream with an ink outline, a hard shadow and one coloured lip per function, and push in when pressed; the chosen plan, step or style goes ink. The hint is a yellow sticker.

Collapsed layout (under 1100 px wide or under 640 px tall): the sheet is closed by default and the moment row shows a **Strategy** button with a chevron above the label that opens and closes it. Desktop shows the sheet always.

## 2. QTE: shared rules

- Play mode only, for the visitor's player (`G.player`); never in headless tests.
- Setting: QTE shots On / Occasional / Off (default Occasional).
- One shared budget for attack and defence QTEs: about 1 per game, at least 3 points between them. The dock's **Go for it** moment (added with the QTE) arms the next attack chance on demand.
- The sim freezes while the QTE is open, at the moment the shot would be committed (0.34 s before contact). The window is 4.2 s of real time for an attack and 3.6 s for a defence. The AI's shot decision still happens afterwards: the QTE only writes an order (`qte.take()`, read by `ai.decideShot`) that the decision honours if the solver says it can fly it.
- Camera: a `qte` camera mode behind the player, facing the opponent, about 60 degrees elevation, zoomed to the whole court; restored afterwards with the replay camera save/restore.
- The hit circle: a ring projected onto the racket, shrinking = time left, flashing pulse and radial burst, rest of the screen desaturated with a vignette, audio sting, `navigator.vibrate`, "NOW!" callout.
- Input: drag from the ring (touch or mouse); on desktop a plain click/tap on the court plays a medium-power shot at that spot.
- Failure (no swipe, or the drag does not start on the ring): a mild mishit, meaning the AI's shot with pace capped at 0.4 effort and 1.6 times the execution error. Swipe quality changes the error only a little (0.6 to 1.4 times), so the QTE helps more than it punishes.
- Execution still goes through player accuracy and the physics: the swipe chooses the target and power, not the outcome.

## 3. Attack QTE

Trigger: the visitor's player is about to hit and the AI sees a winning chance: a short or high ball near the net (smash or vibora), opponents out of position (both deeper than 6.5 m, or wrong-footed), or a floating volley with an open court.

Swipe, arcade style: the angle sets the direction; length and speed set the power (faster is harder and flatter with less safety margin, slower is safer). A live landing marker follows the finger. Release inside the opponent's court.

## 4. Defence QTE

Trigger: the visitor's player is stretched (reach slack under 0.15 m, or stretch above 0.6) and the ball is still reachable; the usual case is an opponent's smash aimed at them. Ring tinted red.

The swipe picks the type of save:

| Swipe | Save |
| --- | --- |
| up, slow | deep defensive lob |
| up, fast | counter-drive (risky) |
| up-left / up-right, short | block cross-court to the feet |
| toward the back or side glass | wall rebound (bajada / wall defence) |
| down / flick back | last-ditch dive: about 0.3 m more reach |

Power works in reverse: gentle is safe, hard is a gamble. A good swipe lowers the stretch error (`stretchK`); a perfect swipe cannot save an impossible ball. A clean save shows "SAVED!" and a short slow-motion; a save that turns into a counter-attack gets a bigger callout.
