# Decisions 2026-11-05


## D-2026-11-05-1238 · Version label scheme
- **Context:** Versions needed to show their build date at a glance; CONTRACT uses 0.x numbers.
- **Options:** A) keep 0.x and add a date, B) date-based version YYYY.MM.DD(.N), C) inject the real build timestamp in build.js
- **Choice:** B
- **Why:** The date is the version, so nothing can drift; no build-step change. Revisit if a stamped build time is wanted (C).
