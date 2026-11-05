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
