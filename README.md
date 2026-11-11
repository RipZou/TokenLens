# TokenLens

TokenLens helps AI-agent teams understand token usage by source and monitor spending.

**Team:** [Eileenyuan1](https://github.com/Eileenyuan1) · [RipZou](https://github.com/RipZou)

**Production:** https://token-lens-chi.vercel.app

## Local setup

Requires the Node.js version in `.nvmrc` and PostgreSQL.

```bash
npm ci
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/tokenlens"
export JWT_SECRET="a-long-random-string"
npx prisma migrate deploy
npm run dev
```

## Checks

```bash
npm run lint
npm run typecheck
npm test
INTEGRATION_DATABASE_URL="postgresql://…/tokenlens_test" npm run test:integration
E2E_BASE_URL="http://localhost:3000" npm run test:e2e
```

## Deployment

Vercel deploys a preview for each pull request and production on merge to `main`. Neon gives each preview its own database branch, and `vercel-build` applies migrations before building. Set `JWT_SECRET` in Vercel.

## Documentation

- [PRD](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Database schema](docs/database.md)
- [Contribution log](docs/contributions.md)
- [Sprint 1](docs/process/sprint-1.md) · [Sprint 2](docs/process/sprint-2.md) · [Standups](docs/process/standups.md)
- [Agent instructions](AGENTS.md)
- [Prototype](docs/mockups/tokenlens-prototype.html)
- [HW3 comparison](docs/hw3/before-after.md) · [HW3 reflection](docs/hw3/reflection.md)

## Planning

[Issues](https://github.com/RipZou/TokenLens/issues) · [Milestones](https://github.com/RipZou/TokenLens/milestones) · [Projects](https://github.com/RipZou/TokenLens/projects)
