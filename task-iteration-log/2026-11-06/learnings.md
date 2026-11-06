# Learnings 2026-11-06

- **macOS `sed -i` eats the next argument**: `sed -i 's/a/b/' f` fails with "unterminated/bad flag" → BSD sed treats the script as the backup suffix → use `sed -i '' ...` or the Edit tool.
- **Broken CSS rule in the dock**: `.gm-plan,.gm-mo,.gm-sty,.gm-step,  box-shadow:...}` had no `{` and swallowed the next rule's selector, so the shared button style and the hover rule were dead since 2026-11-05 → rewrote it with the base declarations.
- **Moods never triggered on the partner's errors**: `angry_partner` stayed at 0 → each player's recent-error count was updated inside the same loop that read the partner's count, so the partner's current mistake was never visible → update everyone's counts in a first pass.
- **tools/load.js only loads `NN_` prefixes**: `06b_mind.js` was skipped in headless runs → `match.start` threw on `HPO.mod.mind` → name new sim modules `06_*.js`.
