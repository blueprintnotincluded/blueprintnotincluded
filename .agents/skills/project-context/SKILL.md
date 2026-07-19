---
name: project-context
description: Guidelines for accessing the project's ongoing state, session notes, and shared coding-agent instructions.
---

# Project Context and Instructions

This project maintains important state, rules, and guidelines shared across coding-agent workflows. Consult these files to maintain continuity:

1. `AGENTS.md` (root directory): Contains cross-agent safety, workflow, and validation rules.
2. `CLAUDE.md` (root directory): Contains critical architecture details, development commands, Docker setup, and strict coding constraints (e.g., do not introduce Jest, respect the Node 20 requirement for Canvas).
3. `agent/TODO.md`: The improvement roadmap and remaining work for the project.
4. `agent/SESSION_NOTES.md`: Ongoing session-by-session progress.

**Instructions for coding agents:**
- Before substantive work, read `AGENTS.md` and `CLAUDE.md` completely to understand the rules.
- Review `agent/TODO.md` and `agent/SESSION_NOTES.md` if the user asks you to continue prior work or check project health.
- Workflows for this project (such as `spec-init` and `steering`) are located in `.agents/workflows/`; consult the relevant workflow when the user invokes it.
