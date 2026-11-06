# Devlog 2026-11-06

## 10:23 · Playtest feedback pass: strategy hotkeys, dock tooltips, locked formats, match centre expand, no Eagle Eye, vibora callout, camera tutorial · claude · padel@main
- **Status:** done
- **Done:** Seven feedback items. Hotkeys (`game.hotkey`: `[ ]` mindset, `W H T B G D` plans, `P` shots, `V` middle, `F` go for it, `O` timeout), one custom dock tooltip with key, Blitz/Americano only on setup (others disabled), expand icon in the scoreboard's bottom-right corner replaces the left tab, challenge/Eagle Eye removed end to end (rules API, state, bounce log, `lineErrorCm`, replay kind, AI challenge, commentary, UI, key, tests, docs, id dictionary), `VIBORA!` callout, tutorial now one step per plan/moment button plus camera steps (rotate, zoom, pan, top-down) and camera restore. Also fixed the shared dock button CSS rule that had lost its `{`. CONTRACT 0.11.0, version 2026.11.06. Checked in headless Chrome at 1280x800 and 390x844 (setup, dock tooltip, hotkeys, match centre, a scripted run through all 26 tutorial steps, no errors); dupcheck, i18n_tests, commentary_tests, qte_tests, scoring_tests --quick, sim_cli --n 3 pass. Not run: physics/player_ai/matrix/reflex suites, features_browser, e2e, visual_matrix, a real phone.
- **Files:** `src/08_rules.js`, `src/09_match.js`, `src/16_replay_ceremony.js`, `src/18_commentary.js`, `src/19_ui.js`, `src/21_game.js`, `src/22_callouts.js`, `src/25_tutorial.js`, `src/shell.css`, `src/00_lang_id*.js`, `tools/scoring_tests.js`, `tools/commentary_tests.js`, `tools/features_browser.js`, docs
- **Decisions:** D-2026-11-06-1023
- **Follow-ups:** see followups.md
- **Links:** none (not committed)
## 11:40 · Camera stuck after QTE · claude · padel@main
- **Status:** done
- **Done:** Reproduced in headless Chrome by forcing a QTE under close, follow, top and free cameras: only the free camera (any drag in Play mode) stayed at the QTE yaw (1.57 vs 0.7). `camSnapshot` now stores `yawT`/`yawK` and `camRestore` puts them back (`src/10_render_core.js`). Re-ran the same check: yaw 0.7 before and after. CONTRACT 0.11.1, version 2026.11.06.2. Not run: other suites, real phone.
- **Files:** `src/10_render_core.js`, `src/23_versions.js`, `CONTRACT.md`
- **Decisions:** none
- **Follow-ups:** none
- **Links:** none (not committed)
## 10:52 · Energy, concentration and 10 moods for players · claude · padel@main
- **Status:** done
- **Prompt:** Add concentration (fluctuates) and energy (drain only) meters plus 10 moods (angry at partner, self-blame, fired up, cocky, nervous, flow, defeated, vengeful, supportive, irritated) that change play; make all of it visible in play (health-bar energy, mood buff with timer ring that flashes before it ends), a toast naming the stats moved, custom pixel-art mood faces, two-row toast with short green/red stat tags.
- **Done:** New `src/06_mind.js` (`HPO.mod.mind`): energy = `1 - fatigue`, drain only (movement + per-shot lumps, scaled per format so a Blitz drains like a long match, `rest()` no longer refunds it); concentration = `confidence` around a per-player baseline, capped by energy; 10 timed moods with triggers, effects (error, pace, shot weights, speed, read time, serve, who takes a ball) and partner mix-ups (`mind.contest`: angry = both go, blaming = neither). Hooks in players, match, AI, rules-event feed. New `src/26_moodui.js`: bars over all four players, 12x12 pixel-art faces drawn to canvas, countdown ring that flashes, two-row toast (`Name: Mood` / ACC PWR... green and red), MINE!/YOURS?! callouts. Studio cards show FOCUS, ENERGY and the mood. `tools/mind_tests.js`, CONTRACT 0.12.0 (10.3), PLAY_MODE, TESTING, version 2026.11.06.4, Indonesian strings. Checked in headless Chrome (1280x800, 390x844) with forced moods; dupcheck, i18n_tests, player_ai_tests, commentary_tests (1635), mind_tests pass; sim_cli 6 matches clean. Not run: physics/scoring/matrix/reflex suites, features_browser, e2e, visual_matrix, a real phone; the 40-match balance table was not re-run. Follow-ups in the same task: cooldown sweep over the mood face, all toasts on one left edge, a toast's clock stops during a replay (it expired while the toasts were hidden); checked in headless Chrome at 390x844 with a forced replay.
- **Files:** `src/06_mind.js`, `src/26_moodui.js`, `src/06_players.js`, `src/07_ai.js`, `src/09_match.js`, `src/00_core.js`, `src/19_ui.js`, `src/22_callouts.js`, `src/21_game.js`, `src/shell.css`, `src/00_lang_id_*.js`, `src/23_versions.js`, `tools/mind_tests.js`, `tools/browser.js`, `CONTRACT.md`, `CLAUDE.md`, docs
- **Decisions:** D-2026-11-06-1131
- **Follow-ups:** see followups.md
- **Links:** none (not committed)
## 13:05 · Visible Skip replay button · claude · padel@main
- **Status:** done
- **Done:** Replays had no on-screen skip (only pause/Esc). The `#gm-skip` button now becomes `Skip replay ▸` while a replay plays and stops it; otherwise it stays `Skip intro ▸`. The "Paused / Space to resume" banner is hidden during a replay (the replay pauses the match, and the banner sat on the REPLAY badge). `src/21_game.js`, `src/shell.css`, id dictionary, PLAY_MODE.md, version 2026.11.06.6. Checked in headless Chrome at 1280x800 and 390x844: button shows with the label, a click stops the replay and resumes the match.
- **Files:** `src/21_game.js`, `src/shell.css`, `src/00_lang_id_play.js`, `docs/PLAY_MODE.md`, `src/23_versions.js`
- **Decisions:** none
- **Follow-ups:** none
- **Links:** none (not committed)
## 12:35 · Game instructions sheet, keyboard button, tutorial mood steps · claude · padel@main
- **Status:** done
- **Done:** The top-right `?` now opens Game instructions (`src/27_guide.js`): How to play cards, the nine player stats, energy and concentration, all ten moods with pixel faces, triggers, effects and green/red tags, a Watch the tutorial button and a Keyboard shortcuts button; it pauses the match while open. Shortcuts got their own keyboard-icon button and the `K` key (`?` key now opens the instructions). Two new tutorial steps (energy and concentration, mood) spotlight the player bars; tutorial is 28 steps. Indonesian strings for all of it. CONTRACT 0.12.1, version 2026.11.06.7, docs/TUTORIAL.md and PLAY_MODE.md. Checked in headless Chrome at 1280x800 and 390x844 (top bar, sheet scrolled through, Esc closes and resumes, keyboard sheet, tutorial reaches the new step); dupcheck, i18n_tests, mind_tests pass. Not run: other suites, features_browser, real phone.
- **Files:** `src/27_guide.js`, `src/19_ui.js`, `src/21_game.js`, `src/25_tutorial.js`, `src/shell.html`, `src/shell.css`, `src/00_lang_id_play.js`, `src/23_versions.js`, `CONTRACT.md`, `docs/TUTORIAL.md`, `docs/PLAY_MODE.md`
- **Decisions:** none
- **Follow-ups:** none
- **Links:** none (not committed)
