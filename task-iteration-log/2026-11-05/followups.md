# Follow-ups 2026-11-05

- [ ] Verify padel.annetta.dev resolves and serves the game (from 2026-11-04)
- [ ] Balance: aces 0%, wall returns 8% (15-25), volley share 20% (25-35), winners 41% (30), rally median 9 (11-12); try C plus react x0.8 / speed x1.15 (from 2026-11-04)
- [ ] Revisit the forced/unforced classifier (unforced stays near 6%) (from 2026-11-04)
- [ ] `node tools/build.js --check` ends with 'The "file" argument must be of type string' and flags offline at 3.3 MB (over the 3 MB target); cause not investigated (from 2026-11-04)
- [ ] Re-run the 40-match balance stats after the lob/vibora change; trim lobBase/lobNet if overall lobs should be back under 14%
- [ ] Check touch gestures and the Aim button on a real phone
- [ ] QTE: build the attack QTE (behind-the-player camera, hit ring, swipe, mishit on failure), then the defence QTE; add the Go for it moment to the dock (docs/QTE.md)
- [ ] Check the coach dock on a real phone (sheet height covers the court while open)
- [ ] Full regression suites and features_browser before the next release (skipped after the QTE and dock restyle by request)
- [ ] QTE: defence dive (extra reach) not built; real-phone feel of the swipe and the 2.8 s window; audio sting is a simple synth tone
- [ ] QTE telegraph cue before the freeze; more OST tracks; bigger trophy ceremony; clearer Play/Studio switch (playtest feedback)
- [ ] Full regression suites and features_browser before release (skipped by request); check Americano on a real phone
- [ ] i18n: fix the text-parsing couplings (commentary `/timeout/i`, LED banner compares, replay IN/OUT, `toneKind`) then wire `HPO.t` into the call sites; order in docs/I18N.md
- [ ] i18n: `AGENTS.md` still says "UI language: English"; update when Indonesian ships
- [ ] i18n: check speech with a real id-ID voice, and a phone pass of `?lang=id` (longer text in the dock, callouts and buttons at 390 px)
- [ ] i18n: language switch in the pause menu and Studio panel (sets `?lang=` and reloads); `AGENTS.md` still says "UI language: English"
- [ ] i18n: `scoreCall` for Blitz/Americano now says "{n} all" or the plain point count; the umpire's `Deuce` at 3-3 in point formats is still tennis wording
