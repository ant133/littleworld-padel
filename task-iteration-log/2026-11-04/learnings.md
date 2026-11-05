# Learnings 2026-11-04

- **macOS `sed -i`**: `sed -i 's/a/b/'` fails silently in a chained command on macOS -> needs `-i ''`; check the diff after scripted edits.
- **Unforced errors don't respond to error knobs**: more execution error turns winners into forced errors, so the 25-40% unforced target is a classification question.
