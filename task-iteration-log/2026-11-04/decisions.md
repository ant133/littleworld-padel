# Decisions 2026-11-04


## D-2026-11-04-1500 · Where to require the log skill
- **Context:** User asked that Claude always use task-iteration-log.
- **Options:** A) global ~/.claude/CLAUDE.md, B) this repo's CLAUDE.md, C) memory only
- **Choice:** B
- **Why:** The log is per-repo and committed, and CLAUDE.md is already the agent rules file here. Move to global if wanted in every repo.

## D-2026-11-04-1842 · Balance defaults: candidate C
- **Context:** Position-driven play made smashes too deadly (smash winners 38.9% of points, rally median 6).
- **Options:** A) smash/error retune only, B) A plus faster/more reactive players, C) A plus calmer volley duels, D) A plus fewer lobs
- **Choice:** C
- **Why:** Only C reached 3+ volley chains at 9.5% (target 10%) while keeping smashes deadly (18% untouched) and defendable (56% continue). B reached rally median 11 but made smashes too weak and cut deuce games to 23%. Revisit with B's react/speed on top of C if longer rallies are wanted.
