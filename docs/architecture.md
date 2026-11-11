# Architecture

One Next.js app on Vercel serves pages and APIs. Data lives in Neon PostgreSQL.

```mermaid
flowchart LR
    B["Browser"] -- "session cookie" --> APP["Next.js<br/>pages and API routes"]
    A["AI agent"] -- "reporting key" --> APP
    APP --> S["Services<br/>validation, permissions"]
    S --> C["Classifier"]
    S --> DB[("Neon PostgreSQL")]
```

## Pipeline

```mermaid
flowchart LR
    PR["Pull request"] --> CI["Lint, unit, integration, build"]
    PR --> SEC["CodeQL, npm audit, gitleaks"]
    PR --> V["Vercel preview"] --> E2E["Playwright E2E"]
    CI --> M["Merge to main"]
    SEC --> M
    E2E --> M
    M --> P["Production"]
```

| Environment | Database |
| --- | --- |
| Local | Local PostgreSQL |
| CI | PostgreSQL 17 container |
| Preview | Neon branch per pull request |
| Production | Neon main branch |
