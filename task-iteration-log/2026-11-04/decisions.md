# Decisions 2026-11-04


## D-2026-11-04-1500 · Where to require the log skill
- **Context:** User asked that Claude always use task-iteration-log.
- **Options:** A) global ~/.claude/CLAUDE.md, B) this repo's CLAUDE.md, C) memory only
- **Choice:** B
- **Why:** The log is per-repo and committed, and CLAUDE.md is already the agent rules file here. Move to global if wanted in every repo.
