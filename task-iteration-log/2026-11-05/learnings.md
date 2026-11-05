# Learnings 2026-11-05

- **Replay camera "restore" was a no-op for a free camera**: stuck at the Eagle Eye spot -> setCameraMode(same mode) returns early -> restore position and zoom by hand for free mode.
