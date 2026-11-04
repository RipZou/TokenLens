# TokenLens

TokenLens helps AI-agent teams understand token usage by source and monitor spending.

**Team:** [Eileenyuan1](https://github.com/Eileenyuan1) · [RipZou](https://github.com/RipZou)

## Current scope

Implemented: an Anthropic input classifier, nine fixtures, a shared scorer and unit tests, a Next.js app skeleton with CI, and email/password sign-in. Accounts are stored in the `users` table. Set `DATABASE_URL` and `JWT_SECRET`, then apply `prisma/migrations`. The rest of the full-stack application is still planned.

## Run checks

Use the Node.js version in `.nvmrc`.

```bash
npm ci
npm run lint
npm run typecheck
npm test
node scripts/score-anthropic.mjs --check-fixtures
npm run build
```

Fixtures use a deterministic word counter to test classification, not exact provider tokenization. No model API key is required.

## Documentation

- [PRD](docs/PRD.md)
- [Prototype](docs/mockups/tokenlens-prototype.html) — download and open in a browser
- [Agent instructions](AGENTS.md)
- [HW3 comparison](docs/hw3/before-after.md)
- [HW3 reflection](docs/hw3/reflection.md)

## Planning

[Issues](https://github.com/RipZou/TokenLens/issues) · [Milestones](https://github.com/RipZou/TokenLens/milestones) · [Projects](https://github.com/RipZou/TokenLens/projects)

Board statuses: Backlog, Sprint Todo, In Progress, In Review, Done.
