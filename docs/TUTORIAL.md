# Tutorial (guided first match)

A new player's first match is a guided one. `src/25_tutorial.js` (module `tutorial`) starts it when the match reaches the play phase; `game.js` sets `G.tutorialPending` after the first save and skips the ceremony so it begins at once. The pause menu has a Tutorial button to replay it, and every step can be skipped ("Skip tutorial", or "Skip this step" on steps that wait).

How it works: the sim is paused (`match.pause`) while a step shows. A spotlight cuts a hole in a dimmed overlay around the thing being explained and four transparent blockers stop taps everywhere else, so on steps that wait the player can only press the highlighted control. Annetta's bubble sits on whichever side has room. A step may wait for a real action: the poll (every 150 ms) checks `ai.orders('A')` for a mindset or plan, or the Strategy sheet opening.

| # | Step | Waits for |
| --- | --- | --- |
| 1 | You are the coach | Next |
| 2 | Scoreboard, and how the chosen format is scored (`rules.describeFormat`) | Next |
| 3 | The expand icon in the scoreboard corner (match centre) | Next |
| 4 | Open Strategy (collapsed layout only) | the sheet opening |
| 5 | Mindset (keys `1`-`5`) | a non-balanced mindset |
| 6-11 | Plans, one step per button (name, what it does, key; text from `game.tipText`) | Next, six times |
| 12 | Pick any plan | any plan |
| 13 | Shots (key `P`) | Next |
| 14 | Middle balls (key `V`) | Next |
| 15 | The strategy tag (only where it is visible) | Next |
| 16 | Energy and concentration: spotlight on your own player's bars (`moodui.els`; skipped if the overlay is not showing) | Next |
| 17 | Mood: spotlight on whoever has a mood now, else your own bars; points to the ? button | Next |
| 18 | Aim: tap the button | Aim mode switching on |
| 19 | The opponent's half flashes; tap it (no dimming, so the court is clickable) | Aim being set or cancelled |
| 20 | Go for it (key `F`) | Next |
| 21 | Timeout (key `O`) | Next |
| 22 | Camera: rotate (drag, or `←` `→`; two fingers on touch) | the yaw changing |
| 23 | Camera: zoom (wheel, `+` `-`, pinch) | the zoom changing |
| 24 | Camera: pan (right-drag or Shift-drag; one finger on touch) | the free camera moving 0.8 m |
| 25 | Camera: top-down (CAM button or `C`) | camera mode `top` |
| 26 | Camera put back (`render.resetView`, then the player's camera; key `0`) | Next |
| 27 | Practice QTE: the sim resumes with `qte.force = 'attack'` in relaxed mode | the QTE opening and closing (40 s limit, then it moves on) |
| 28 | Done | Next |

The Game instructions sheet (top-right `?`, docs/PLAY_MODE.md) has a Watch the tutorial button: in a Play-mode match it starts this tutorial; from the title or setup screens it sets `G.tutorialPending` so the next match starts with it.

The QTE overlay hides the tutorial while it is open. Leaving the playing state (title, pause to title, Studio) stops the tutorial and un-pauses the match if the tutorial had paused it.
