# P2 reflection — Peixin

TokenLens started as an input-token classifier and grew into a web app for tracking AI token usage and managing budgets. I used Cursor for HW3 and early development, then switched to Claude Code for P2 integration because I already used it in my day-to-day workflow.

The biggest change in how I worked with AI was moving recurring instructions into `AGENTS.md`. It gave both tools a shared description of the project and made expectations explicit, such as asking before adding dependencies and committing a failing test before implementing a fix. I also told the assistant to wait for my confirmation before pushing. As TokenLens grew beyond the classifier, the file needed to evolve with the code. Some instructions still needed feedback. “Keep the documentation minimal” was open to interpretation, so I revised the first drafts around what users needed to set up and use the app.

I also learned to turn AI review comments into something I could verify. In my partner’s PR #31, Claude Code flagged that an invalid UUID could reach PostgreSQL and cause a database error. We reproduced the failure in a test (`3c0a0ee`), then ran the same test after the fix (`36ff3d8`). That sequence gave me a way to evaluate the AI’s finding and verify that the proposed change addressed it.

The same habit mattered during integration. I asked the assistant to run tests against local PostgreSQL and use Playwright against the Vercel preview. A local pass only covered the local setup. Before PR #25, the preview database had no tables. My partner and I had to inspect the Vercel and Neon settings ourselves. That experience made me pay attention to which environment the assistant had actually tested and what it could observe there.

Next time, I would set up `AGENTS.md` and a working preview before writing any feature code. For each task, I would specify how the assistant should verify its work and ask it to report what it ran and what it observed. That would make it easier for me to review the evidence, check anything outside the assistant’s access, and decide when a change is ready to merge.
