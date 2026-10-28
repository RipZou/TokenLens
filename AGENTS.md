# TokenLens — Agent Instructions

TokenLens helps small AI-agent teams track reported model calls, understand which parts of the input context use tokens, and monitor spending.

## Tech stack and versions
- **Runtime and framework:** Node.js 24.22.2, Next.js 16.4.3 (App Router), React/React DOM 19.2, TypeScript 5.9, Tailwind CSS 4.3.3.
- **Data:** PostgreSQL 17 on Neon, Prisma CLI/Client 7.10.1 with the matching Prisma 7 PostgreSQL adapter.
- **Libraries:** Zod 4 (validation), jose 6 (JWT), bcrypt 6 (passwords), Recharts 3 (charts), Vitest 4 and Playwright 1 (tests).
- **Tooling:** npm with committed `package-lock.json`, exact versions (no `^`/`~`), Node version in `.nvmrc`. Deploy on Vercel; CI on GitHub Actions.
- `package.json` and the lockfile define installed versions. Do not upgrade or replace the stack without approval.

## Architecture and folders
| Path | Responsibility |
| --- | --- |
| `src/app/` | Pages/layouts; Server Components by default |
| `src/app/api/v1/` | Route Handlers: parse, authenticate, authorize, call services, return HTTP |
| `src/components/` | Reusable UI; Client Components only when interaction requires it |
| `src/lib/classifier/` | Pure provider parsers, category allocation and calibration |
| `src/lib/services/` | Organizations, projects, ingestion, analytics and budgets |
| `src/lib/db/` | Prisma setup and organization-scoped repositories |
| `src/lib/auth/`, `src/lib/schemas/` | Shared permission helpers and Zod schemas |
| `prisma/` | Prisma schema, migrations and configuration |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Vitest unit/integration tests and Playwright E2E tests |
| `fixtures/anthropic/`, `fixtures/openai/` | Fixed request/usage examples for tests |
| `docs/` | PRD and prototype |

- Route Handlers validate input with Zod, then call services. Services call repositories. Database access stays server-side inside `src/lib/db/`.
- Live updates use Server-Sent Events (SSE), one stream per project.

## Naming and coding standards
- Strict TypeScript. Avoid `any`; narrow `unknown` at external boundaries.
- Filenames in kebab-case; components and types in PascalCase; functions and variables in camelCase; SQL tables in plural snake_case, mapped through Prisma.
- Import from `src/` with `@/`. Use native `fetch`, named constants, small typed functions and shared Zod schemas.
- Follow the repository's ESLint/Prettier configuration.
- Store timestamps in UTC. Calculate costs with decimal-safe arithmetic; do not round each event to cents.

## Testing strategy
- **Framework:** Vitest for unit and integration tests, Playwright for E2E.
- **Pattern:** test-driven development. Commit a failing test (red), make the smallest change that passes (green), then refactor.
- **Unit:** classifier fixtures, calibration, cost arithmetic and budget transitions.
- **Integration (isolated test PostgreSQL, never production):** role denial, tenant isolation, revoked keys, duplicate event IDs and budget boundaries.
- **E2E:** registration → project/key creation → report a call → call list/detail.
- **Coverage goal:** at least 80% statement and branch coverage in `src/lib/`; always cover security and money edge cases.
- Mock model APIs. Never change expected fixture results to make an implementation pass. Report test results honestly, including tests you did not run.

## PRD and design references
- **PRD:** `docs/PRD.md` defines requirements. Each GitHub Issue's acceptance checklist defines task scope.
- **Prototype:** `docs/mockups/tokenlens-prototype.html` defines layout and interactions. It uses simulated data, a fake login and a demo role selector; do not copy these into production code.
- If the PRD, prototype and Issue conflict, ask before implementing.
- **Visual style:** light-gray background, white cards, blue actions, amber warnings, responsive layout.

## Key UI components and behavior
- **Sign-in:** labeled email/password fields, registration link, validation, pending and error states, real server authentication.
- **App shell:** navigation to Dashboard, Call detail, Budgets and API keys; project selector; live status; sign-out.
- **Dashboard:** KPIs for input tokens, output tokens, daily cost and monthly budget usage; category chart (24h/7d/30d); source breakdown; recent calls. Filters for project, agent, model and time. New calls appear at the top within 2 seconds; selecting a row opens its detail.
- **Call detail:** model, agent, time, input/output totals, cache metadata, category bar and table with percentages, cost estimate, and an "estimated" badge when the classifier sets it.
- **Budgets:** daily/monthly limits, progress bar, 80% and 100% thresholds, banner, toast and alert history. Send one alert per budget, period and threshold.
- **API keys:** show the full key once with Copy/dismiss, then only its prefix and metadata. Revoked keys fail ingestion.
- Every data view has loading, empty and error states; live views also show connection/reconnection status.
- Registration, organization/invitation and project-creation screens are not designed in the prototype. Ask before inventing their UI.

## Token classifier
The classifier splits one model call's input tokens into source categories.

- **Function:** `classify(request, usage, provider, countTokens): Breakdown`. It is pure: no model API calls, no database access, no input mutation. `countTokens` is injected; tests use a deterministic fixture counter.
- **Categories, in this order:** `system`, `tool_definitions`, `history`, `tool_results`, `retrieval`, `user_input`, `attachments`, `overhead`.
- **Assignment (each segment counted once):**
  1. System prompt → `system`; tool definitions → `tool_definitions`.
  2. Content marked `tl_category: retrieval` → `retrieval`, even inside another message.
  3. Tool-result blocks → `tool_results`; attachment blocks → `attachments`.
  4. Remaining text in the current user turn → `user_input`; earlier conversation → `history`.
- Output categories (`text`, `thinking`, `tool_use`) and cache metadata are separate from input categories.
- **Calibration target:** the provider's `input_tokens`. Keep the provider's original numbers and the raw local counts separately.
  - Local sum below target by ≤ 5%: add the difference to `overhead`.
  - Local sum above target, or off by > 5%: scale every category proportionally, using largest-remainder rounding (ties follow the category order).
  - Final counts are nonnegative integers that sum exactly to the target.
- **`estimated` flag:** true when |local sum − target| / target > 5%. If target > 0 and local sum = 0, put everything in `overhead` and mark estimated. If target = 0, return all zeros and mark estimated when local counts were positive. Reject negative or invalid usage.
- **Cost:** use documented model prices, including output and cache pricing. Show "unavailable" for unknown prices, never zero.

## User flows
1. Register/sign in → create/join an organization → Admin invites members and assigns roles.
2. Select/create a project → generate/copy a reporting key → report a call → see a live update → open its detail.
3. Admin sets a budget → spending crosses a threshold → members see the banner, toast and alert history.

## Do's and Don'ts

**Do**
- Keep edits within the assigned Issue.
- Reuse existing Zod schemas, Prisma repositories and auth helpers.
- Prefer the libraries listed in the tech stack and native platform features.
- Enforce permissions on the server.
- Implement loading, empty and error states.

**Don't**
- Copy the prototype's fake login, demo role selector or random key generator.
- Store plaintext reporting keys, or log prompts or credentials.
- Rely on client-only authorization.
- Count one input segment in two categories.
- Fake live data or test results.
- Add new dependencies without approval.
- Invent missing requirements; ask instead.

## Security requirements
- **Roles (enforced on the server):**

| Action | Admin | Developer | Viewer |
| --- | --- | --- | --- |
| Read projects, dashboards, call details, budgets and alerts | Yes | Yes | Yes |
| Create projects and create/revoke reporting keys | Yes | Yes | No |
| Configure budgets | Yes | No | No |
| Invite members and manage roles | Yes | No | No |

- Logged in but not allowed → **403**. Missing/invalid login or invalid/revoked reporting key → **401**. Non-members cannot read organization data.
- Hash passwords with bcrypt. Verify JWT signature, algorithm and expiry. Use httpOnly, SameSite cookies (Secure in production) and clear the cookie on sign-out.
- Generate reporting keys with a cryptographic RNG; store only the SHA-256 hash and prefix.
- Scope every query by authorized organization/project; never trust client-supplied roles.
- Ingestion: max 1 MB body (413), 600 requests/minute per key (429), invalid schema (400), accepted event (201), unique event ID per project.
- Do not store raw prompts or tool content; keep only counts and metadata. Keep secrets out of code, logs, client bundles and `.env.example`.

## Accessibility requirements
- Semantic buttons, links and labeled inputs.
- Full keyboard navigation with visible focus.
- Errors and status changes announced to screen readers.
- Body-text contrast of at least 4.5:1.
- Text or table alternatives for every chart; color alone never carries meaning.

## GitHub workflow
- **Branches (one per Issue):** `feature/<number>-description`, `fix/<number>-description`, `chore/<number>-description`, `docs/<number>-description`.
- **Commits:** `type(scope): summary (#number)`.
  - Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`.
  - Scopes: `app`, `auth`, `orgs`, `projects`, `keys`, `classifier`, `ingest`, `dashboard`, `budgets`, `api`, `db`, `ci`, `docs`.
  - Example: `test(classifier): add retrieval case (#5)`, then `feat(classifier): handle retrieval (#5)`.
- **Issue references in code:** `// TODO(#number): description`.
- **Pull requests:** the title references the Issue; the body lists what changed and how it was tested. Use `Closes #number` when the PR completes the Issue and `Refs #number` for partial work.
- **Review:** merge only after partner approval and passing CI.
