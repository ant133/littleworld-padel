# Decisions 2026-11-05


## D-2026-11-05-1238 · Version label scheme
- **Context:** Versions needed to show their build date at a glance; CONTRACT uses 0.x numbers.
- **Options:** A) keep 0.x and add a date, B) date-based version YYYY.MM.DD(.N), C) inject the real build timestamp in build.js
- **Choice:** B
- **Why:** The date is the version, so nothing can drift; no build-step change. Revisit if a stamped build time is wanted (C).

## D-2026-11-05-1500 · QTE freezes the sim instead of slow motion
- **Context:** The spec said 10% slow motion while the swipe is open.
- **Options:** A) slow motion, B) full pause
- **Choice:** B
- **Why:** The shot is chosen 0.34 s before contact; slow motion would eat that window and make the swing late. A freeze is deterministic and the camera and ring still animate. Revisit if it feels static.

## D-2026-11-05-2040 · i18n shape: English-as-key dictionary, opt-in by query
- **Context:** Bahasa Indonesia is wanted; about 1,300 strings are scattered across UI, commentary, canvas textures and speech, and the build is one HTML file with no network assets.
- **Options:** A) key IDs (`ui.pause`) with a JSON file per language; B) English text as the key, dictionary registered from a `src/*.js` file; C) runtime fetch of a language file.
- **Choice:** B, language only from `?lang=`, dictionary files named `00_lang_<code>.js`.
- **Why:** No edit to the English source to start, untranslated text falls back to English so it can be filled in gradually, and files in `src/` are bundled by `build.js` and `devpage.js` without changes. C breaks the single-file rule. Revisit if keys collide or a translator needs a spreadsheet (then generate `00_lang_id.js` from a CSV).

## D-2026-11-05-2210 · What stays English in Bahasa Indonesia
- **Context:** The user wants a complete Indonesian dictionary, but padel terms and cosmetic text should not change.
- **Options:** A) translate everything including in-world textures; B) translate only text players need to read to play; keep padel terms and common words English.
- **Choice:** B. 15-15 is "Salim" (sama lima). User kept Pause, Resume, Team, Auto, On, Off, None and the footer line in English.
- **Why:** In-world signs, LED and scoreboards are decoration; padel and tennis terms are what Indonesian players say anyway. Revisit if playtesters find the English terms confusing.
