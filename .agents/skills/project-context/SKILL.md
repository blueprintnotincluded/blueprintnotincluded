---
name: project-context
description: Guidelines to access the project's ongoing state, session notes, and core instructions originally set up for Claude.
---

# Project Context and Instructions

This project maintains important state, rules, and guidelines from a previous AI workflow (Claude Code). As an Antigravity agent, you MUST consult these files to maintain continuity:

1. `CLAUDE.md` (root directory): Contains critical architecture details, development commands, Docker setup, and strict coding constraints (e.g., do not introduce Jest, respect Node v20 requirement for Canvas).
2. `agent/TODO.md`: The improvement roadmap and remaining work for the project.
3. `agent/SESSION_NOTES.md`: Ongoing session-by-session progress.
4. `agent/CI_IMPROVEMENTS.md`: GitHub actions status and history.

**Instructions for Antigravity:**
- When attempting a new overarching task, execute `view_file` on `CLAUDE.md` to understand the rules.
- Review `agent/TODO.md` and `agent/SESSION_NOTES.md` if the user asks you to continue prior work or check project health.
- Workflows for this project (like `/spec-init`, `/steering`) are located in `.agents/workflows/` and can be utilized natively.
