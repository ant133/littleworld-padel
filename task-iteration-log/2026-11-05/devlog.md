# Devlog 2026-11-05


## 12:38 · Version history at the bottom of Studio mode · claude · padel@main
- **Status:** done
- **Prompt:** List every version at the bottom of Studio mode, with the build date easy to read.
- **Plan:** One new module renders a details list into the panel footer; version = build date.
- **Done:** `src/23_versions.js` (newest-first list, summary "Version 2026.11.05.2 · built 5 Nov 2026"), CSS in `src/shell.css`, CLAUDE.md step 6 requires an entry per shipped change, CONTRACT 0.8.2. Checked in headless Chrome (Studio, 1280 px). Past versions reconstructed from git commit dates.
- **Files:** `src/23_versions.js`, `src/shell.css`, `CLAUDE.md`, `CONTRACT.md`
- **Decisions:** D-2026-11-05-1238
- **Follow-ups:** none
- **Links:** e814679

## 15:10 · Touch camera, Aim button, Eagle Eye camera restore, floodlight hide, lob and vibora tuning · claude · padel@main
- **Status:** done
- **Prompt:** Touch: 1 finger pans, 2 rotate, pinch zooms; Aim button with taps on the opponent's court; restore camera after Eagle Eye; hide blocking floodlights fully; remove the duplicate sound sliders in Play setup; more lobs vs net players, more vibora on chest-high balls near the net. Then "ship it".
- **Done:** See CONTRACT 0.8.3. Removed the duplicate audio block from the Play setup screen; the version list now has no notes. Checked in headless Chrome with synthetic touch events; coach bar narrowed so four buttons fit at 390 px. Regression suites pass; the 40-match balance table was not re-run (lob share 17.8%, above the 8-14% target by request).
- **Files:** `src/10_render_core.js`, `src/16_replay_ceremony.js`, `src/13_world_club.js`, `src/19_ui.js`, `src/21_game.js`, `src/07_ai.js`, `src/05_shots.js`, `src/23_versions.js`, `src/shell.css`, `tools/browser.js`, `CONTRACT.md`, `docs/TESTING.md`, `docs/VISUAL_CONTRACT.md`
- **Decisions:** none
- **Follow-ups:** re-run the 40-match balance stats; check touch and the Aim button on a real phone; trim lob share if 14% is wanted
- **Links:** e814679

## 16:00 · Coach dock redesign and QTE spec · claude · padel@main
- **Status:** done
- **Prompt:** Replace the Play-mode coach dropdowns with a floating icon dock (defend/attack dial, one exclusive plan, spin/flat, moments, smart hint); then QTE shots (attack and defence) with a behind-the-player camera.
- **Plan:** Spec (docs/QTE.md + CONTRACT) first, then the dock, then attack QTE, then defence QTE.
- **Done so far:** `docs/QTE.md` spec; coach dock (mindset dial, six exclusive plans, spin/mix/flat, Aim/Timeout/Challenge, smart hint, phone Coach sheet); AI orders `mindset`, `plan`, `style` in `ai.mods`; tests and docs updated. Version 2026.11.05.4. Uncommitted.
- **Files:** `docs/QTE.md`, `src/07_ai.js`, `src/21_game.js`, `src/shell.css`, `src/23_versions.js`, `tools/features_browser.js`, `docs/PLAY_MODE.md`, `docs/TESTING.md`, `CONTRACT.md`
- **Done (later):** QTE built (`src/24_qte.js`, camera mode `qte`, attack and defence, mishit on failure, 2.8 s / 2.4 s windows, Go for it, Off/Occasional/On setting); dock restyled to the annetta.dev card style, closed by default behind a Strategy toggle on small screens; CLAUDE.md and AGENTS.md now say not to run the full suites or the browser journey after each change. Not run by request: full regression suites, features_browser. Version 2026.11.05.5. Uncommitted.
- **Files (added):** `src/24_qte.js`, `tools/qte_tests.js`, `tools/browser.js`
- **Later still:** QTE windows 4.2 s / 3.6 s (+50%); Middle balls (Auto / You / Annetta) is now the fourth group of the Strategy sheet instead of a hidden `...` menu; the dock is wider and folds behind Strategy under 1100 px.

## 19:00 · Playtest feedback pass: Americano formats and fixes · claude · padel@main
- **Status:** done
- **Prompt:** Nine playtesters' feedback: strategy changes not felt, confusing/too many buttons/no tutorial, QTE jump scare, matches too long, gender preview, camera and audio issues. Agreed plan A-E plus two new formats: Blitz Americano (9 points) and Americano (21 points).
- **Done:** Points formats in `rules` (CONTRACT 8.1) with TV/LED scoreboards, Play setup picker (Blitz default); QTE Relaxed mode (no timer) and Let it play; strategy effect toasts, plan tag and plan-shot labels; first-run How to play; calmer HUD (speed and studio moved to pause menu); gender-coded hair, proportional wheel zoom, top-down camera 74 degrees, music x0.4, brighter dusk/night, no pixel slider, pause skips a replay. Version 2026.11.05.6.
- **Files:** `src/08_rules.js`, `src/13_world_club.js`, `src/17_audio.js`, `src/19_ui.js`, `src/21_game.js`, `src/24_qte.js`, `src/07_ai.js`, `src/10_render_core.js`, `src/06_players.js`, `src/shell.css`, `tools/americano_tests.js`, docs, CLAUDE.md
- **Decisions:** none
- **Follow-ups:** QTE telegraph cue before the freeze (needs an earlier lookahead); more OST; bigger ceremony; Studio/Play switch clarity; real-phone checks
- **Links:** 7130d47
- **Later:** interactive tutorial (`src/25_tutorial.js`, docs/TUTORIAL.md) replaces the first-run card set as the first match; version 2026.11.05.7.

## 20:40 · Dictionary module for Bahasa Indonesia and text-impact map · claude · padel@main
- **Status:** done
- **Prompt:** Prepare a dictionary module where Bahasa Indonesia can be loaded; inspect the codebase for every place the dictionary will change text.
- **Done:** `src/00_i18n.js` (`HPO.mod.i18n`, `HPO.t`; English text is the key, fallback to English, `?lang=id` opt-in) and an empty `src/00_lang_id.js`; `tools/i18n_tests.js` (10 checks, plus token and pool parity for any registered language); `docs/I18N.md` with the surface-by-surface map, coupling list and layout risks; CONTRACT 0.10.3; version 2026.11.05.9. No call site uses `HPO.t` yet, so game text is unchanged. Checked: i18n_tests, dupcheck, commentary_tests (1652 pass), headless Chrome with and without `?lang=id` (no errors, `<html lang>` follows). Not run: physics/scoring/player_ai/matrix/reflex suites and the browser journey.
- **Files:** `src/00_i18n.js`, `src/00_lang_id.js`, `tools/i18n_tests.js`, `docs/I18N.md`, `docs/TESTING.md`, `CONTRACT.md`, `src/23_versions.js`
- **Decisions:** D-2026-11-05-2040
- **Follow-ups:** wire `t()` into the call sites (docs/I18N.md order of work); fix the text-parsing couplings first
- **Links:** none
- **Later (same day):** the user asked for the full Indonesian dictionary and words. Wired `HPO.t` into 19_ui, 21_game, 22_callouts, 24_qte, 25_tutorial, 23_versions, 08_rules.describeFormat, 06_players/09_match errors, 18_commentary (pools, umpire templates, salim), 16_replay_ceremony say/banner, 17_audio (voices by language, tone chimes) with four parallel forks; dictionary split in `src/00_lang_id*.js` (657 keys, 272 pool lines). In-world texts and padel terms stay English by the user's decision; Pause, Resume, Team, Auto, On, Off, None and the footer line kept English by the user's edit. Fixed `scoreCall` throwing in Blitz/Americano. Checked: i18n_tests 971, commentary_tests 1653, scoring --quick 119, americano_tests, qte_tests, dupcheck; headless Chrome with `?lang=id` (title, setup, tutorial, dock, match, pause, drawer, stats, Studio): no errors, `missing()` empty. Not run: physics, player_ai, matrix, reflex_stats, features_browser, a real phone, speech with an id-ID voice.
- **Later still:** the user reviewed the full list and changed 62 entries (more English loanwords kept: swipe, tap, stat abbreviations, mute; "salim" explanation dropped from the scoring text). Applied to `src/00_lang_id*.js`, rebuilt. Committed and pushed on request.
