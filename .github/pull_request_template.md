<!--
Thanks for contributing! Short PRs need only short answers — don't pad.
If you (or your agent) used AI to write this change, please keep the
disclosure note below; otherwise delete it.
-->

> [!NOTE]
> **AI-assisted change.** Written with the help of AI (<model / tool>).
> Please review it as you would any other change.

## What shipped

<!-- What does this PR do, and why? If it fixes a bug, describe how the bug
is reached — reproduction beats speculation. -->

## Design decisions

<!-- Anything you decided that a reviewer might question: alternatives
rejected, deviations from existing patterns, scope deliberately left out.
Delete the section if there were none. -->

## Verification

<!--
What was actually run and what happened. Be explicit about what was NOT
verified — an honest gap is easy to check at review time; a hidden one isn't.
-->

- [ ] Backend: `npm run tsc` and `npm run test` (if backend/lib changed)
- [ ] Frontend: `cd frontend && npm run lint` and `cd frontend && npm test` (if frontend changed)
- [ ] New/changed behaviour covered by a test that fails without the change
- [ ] Manually exercised (say where: local dev server, real game, browser…)
