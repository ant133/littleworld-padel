# Learnings 2026-11-05

- **Replay camera "restore" was a no-op for a free camera**: stuck at the Eagle Eye spot -> setCameraMode(same mode) returns early -> restore position and zoom by hand for free mode.
- **A silent build failure hides every later check**: `node tools/build.js >/dev/null` printed 'built' while the build threw a syntax error (a line comment in the middle of a call) -> dist stayed stale -> screenshots showed old UI. Always look at the build output tail.
- **Dictionary file order**: `tools/load.js` only loads files starting `00_`..`09_`, `18_`; a dictionary named `00b_...` would silently be missing in headless tests → name the i18n files `00_i18n.js` / `00_lang_id.js` so they sort after `00_core.js` and are loaded everywhere.
