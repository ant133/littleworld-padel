# Devlog 2026-11-05


## 12:38 · Version history at the bottom of Studio mode · claude · padel@main
- **Status:** done
- **Prompt:** List every version at the bottom of Studio mode, with the build date easy to read.
- **Plan:** One new module renders a details list into the panel footer; version = build date.
- **Done:** `src/23_versions.js` (newest-first list, summary "Version 2026.11.05.2 · built 5 Nov 2026"), CSS in `src/shell.css`, CLAUDE.md step 6 requires an entry per shipped change, CONTRACT 0.8.2. Checked in headless Chrome (Studio, 1280 px). Past versions reconstructed from git commit dates.
- **Files:** `src/23_versions.js`, `src/shell.css`, `CLAUDE.md`, `CONTRACT.md`
- **Decisions:** D-2026-11-05-1238
- **Follow-ups:** none
- **Links:** none (uncommitted)

## 15:10 · Touch camera, Aim button, Eagle Eye camera restore, floodlight hide, lob and vibora tuning · claude · padel@main
- **Status:** done
- **Prompt:** Touch: 1 finger pans, 2 rotate, pinch zooms; Aim button with taps on the opponent's court; restore camera after Eagle Eye; hide blocking floodlights fully; remove the duplicate sound sliders in Play setup; more lobs vs net players, more vibora on chest-high balls near the net. Then "ship it".
- **Done:** See CONTRACT 0.8.3. Removed the duplicate audio block from the Play setup screen; the version list now has no notes. Checked in headless Chrome with synthetic touch events; coach bar narrowed so four buttons fit at 390 px. Regression suites pass; the 40-match balance table was not re-run (lob share 17.8%, above the 8-14% target by request).
- **Files:** `src/10_render_core.js`, `src/16_replay_ceremony.js`, `src/13_world_club.js`, `src/19_ui.js`, `src/21_game.js`, `src/07_ai.js`, `src/05_shots.js`, `src/23_versions.js`, `src/shell.css`, `tools/browser.js`, `CONTRACT.md`, `docs/TESTING.md`, `docs/VISUAL_CONTRACT.md`
- **Decisions:** none
- **Follow-ups:** re-run the 40-match balance stats; check touch and the Aim button on a real phone; trim lob share if 14% is wanted
- **Links:** see changes.md
