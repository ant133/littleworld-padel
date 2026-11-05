# Tutorial (guided first match)

A new player's first match is a guided one. `src/25_tutorial.js` (module `tutorial`) starts it when the match reaches the play phase; `game.js` sets `G.tutorialPending` after the first save and skips the ceremony so it begins at once. The pause menu has a Tutorial button to replay it, and every step can be skipped ("Skip tutorial", or "Skip this step" on steps that wait).

How it works: the sim is paused (`match.pause`) while a step shows. A spotlight cuts a hole in a dimmed overlay around the thing being explained and four transparent blockers stop taps everywhere else, so on steps that wait the player can only press the highlighted control. Annetta's bubble sits on whichever side has room. A step may wait for a real action: the poll (every 150 ms) checks `ai.orders('A')` for a mindset or plan, or the Strategy sheet opening.

| # | Step | Waits for |
| --- | --- | --- |
| 1 | You are the coach | Next |
| 2 | Scoreboard, and how the chosen format is scored (`rules.describeFormat`: points formats, Quick, One set, Best of 3, Golden Point or Advantage) | Next |
| 3 | Open Strategy (collapsed layout only) | the sheet opening |
| 4 | Mindset | a non-balanced mindset |
| 5 | Plan | any plan |
| 6 | Shots and Middle balls | Next |
| 7 | The strategy tag (only where it is visible) | Next |
| 8 | Aim: tap the button | Aim mode switching on |
| 9 | The opponent's half flashes; tap it (no dimming, so the court is clickable) | Aim being set or cancelled |
| 10 | Go for it, Timeout, Challenge | Next |
| 11 | Practice QTE: the sim resumes with `qte.force = 'attack'` in relaxed mode | the QTE opening and closing (40 s limit, then it moves on) |
| 12 | Done | Next |

The QTE overlay hides the tutorial while it is open. Leaving the playing state (title, pause to title, Studio) stops the tutorial and un-pauses the match if the tutorial had paused it.
