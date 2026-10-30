# TokenLens — Agent Instructions

TokenLens helps small AI-agent teams track reported model calls, understand which parts of the input context use tokens, and monitor spending.

This file describes two layers. Do not treat planned app work as present in the repo.

## Current classifier and tests

The repo currently implements the Anthropic input classifier, its unit tests, and fixtures.

- **Runtime:** Node.js 24.22.2 (`.nvmrc`).
- **Installed packages:** TypeScript 5.9.3, Vitest 4.1.12, `@types/node` 24.19.2. `package.json` and the lockfile define installed versions. Do not add, upgrade, or replace packages without approval.
- **Commands available now** (`package.json`): `npm test` (`vitest run`) and `npm run typecheck` (`tsc --noEmit`). Do not invent lint, build, or e2e scripts until they exist.

### Existing directories

| Path | Responsibility |
| --- | --- |
| `src/lib/classifier/` | Pure Anthropic parser, category allocation, and calibration |
| `tests/unit/` | Vitest classifier tests |
| `fixtures/anthropic/` | Fixed Anthropic request/usage examples |
| `scripts/` | Shared Anthropic fixture scorer |
| `docs/` | PRD, prototype, and homework notes |

### Naming and coding standards (current)

- Strict TypeScript. Avoid `any`; narrow `unknown` at external boundaries.
- Filenames in kebab-case; components and types in PascalCase; functions and variables in camelCase.
- Import from `src/` with `@/`. Use native `fetch`, named constants, and small typed functions.
- Store timestamps in UTC.

### Testing (current)

- Vitest for unit tests. Pattern: test-driven development. Commit a failing test (red), make the smallest change that passes (green), then refactor.
- Mock model APIs. Never change expected fixture results to make an implementation pass. Report test results honestly, including tests you did not run.

## Planned full-stack app

The items below are the target product. Implement them only when the assigned Issue asks for them. Do not create empty scaffolding for unused folders.

- **Target runtime and framework:** Next.js 16.4.3 (App Router), React/React DOM 19.2, Tailwind CSS 4.3.3.
- **Target data:** PostgreSQL 17 on Neon, Prisma CLI/Client 7.10.1 with the matching Prisma 7 PostgreSQL adapter. SQL tables in plural snake_case, mapped through Prisma.
- **Target libraries:** Zod 4 (validation), jose 6 (JWT), bcrypt 6 (passwords), Recharts 3 (charts), Playwright 1 (E2E).
- **Target tooling:** exact versions (no `^`/`~`). Deploy on Vercel; CI on GitHub Actions. Add ESLint/Prettier with the Issue that introduces them, then follow that config.
- Route Handlers validate input with Zod, then call services. Services call repositories. Database access stays server-side inside `src/lib/db/`.
- Live updates use Server-Sent Events (SSE), one stream per project.
- Calculate costs with decimal-safe arithmetic; do not round each event to cents.
- Shared Zod schemas live under `src/lib/schemas/` once that directory exists.

### Planned directories

| Path | Responsibility |
| --- | --- |
| `src/app/` | Pages/layouts; Server Components by default |
| `src/app/api/v1/` | Route Handlers: parse, authenticate, authorize, call services, return HTTP |
| `src/components/` | Reusable UI; Client Components only when interaction requires it |
| `src/lib/services/` | Organizations, projects, ingestion, analytics and budgets |
| `src/lib/db/` | Prisma setup and organization-scoped repositories |
| `src/lib/auth/`, `src/lib/schemas/` | Shared permission helpers and Zod schemas |
| `prisma/` | Prisma schema, migrations and configuration |
| `tests/integration/` | Isolated test PostgreSQL (never production) |
| `tests/e2e/` | Playwright E2E tests |
| `fixtures/openai/` | Fixed OpenAI request/usage examples |

### Planned testing

- **Unit:** classifier fixtures, calibration, cost arithmetic and budget transitions.
- **Integration:** role denial, tenant isolation, revoked keys, duplicate event IDs and budget boundaries.
- **E2E:** registration → project/key creation → report a call → call list/detail.
- **Coverage goal:** at least 80% statement and branch coverage in `src/lib/`; always cover security and money edge cases.

## PRD and design references

- **PRD:** `docs/PRD.md` defines requirements. Each GitHub Issue's acceptance checklist defines task scope.
- **Prototype:** `docs/mockups/tokenlens-prototype.html` defines layout and interactions. It uses simulated data, a fake login and a demo role selector; do not copy these into production code.
- If the PRD, prototype and Issue conflict, ask before implementing.
- **Visual style:** light-gray background, white cards, blue actions, amber warnings, responsive layout.

## Key UI components and behavior (planned)

- **Sign-in:** labeled email/password fields, registration link, validation, pending and error states, real server authentication.
- **App shell:** navigation to Dashboard, Call detail, Budgets and API keys; project selector; live status; sign-out.
- **Dashboard:** KPIs for input tokens, output tokens, daily cost and monthly budget usage; category chart (24h/7d/30d); source breakdown; recent calls. Filters for project, agent, model and time. New calls appear at the top within 2 seconds; selecting a row opens its detail.
- **Call detail:** model, agent, time, input/output totals, cache metadata, category bar and table with percentages, cost estimate, and an "estimated" badge when the classifier sets it.
- **Budgets:** daily/monthly limits, progress bar, 80% and 100% thresholds, banner, toast and alert history. Send one alert per budget, period and threshold.
- **API keys:** show the full key once with Copy/dismiss, then only its prefix and metadata. Revoked keys fail ingestion.
- Every data view has loading, empty and error states; live views also show connection/reconnection status.
- Registration, organization/invitation and project-creation screens are not designed in the prototype. Ask before inventing their UI.

## Token classifier

The classifier splits one model call's input tokens into source categories. Keep the existing signature and calibration behavior.

- **Function:** `classify(request, usage, provider, countTokens): Breakdown`. It is pure: no model API calls, no database access, no input mutation. `countTokens` is injected; tests use a deterministic fixture counter. `Breakdown` is the object in `src/lib/classifier/types.ts`, not a flat map of category counts. It has `input` (the eight calibrated category counts), `output` (`text`, `thinking`, `tool_use`), `cache` (`cache_read_tokens`, `cache_write_tokens`), `estimated`, `raw` (the pre-calibration input counts), and `usage` (the provider totals). Do not drop `raw`; calibration must stay reversible.
- **Categories, in this order:** `system`, `tool_definitions`, `history`, `tool_results`, `retrieval`, `user_input`, `attachments`, `overhead`.
- **Assignment (each segment counted once):**
  1. System prompt → `system`; tool definitions → `tool_definitions`.
  2. Content marked `tl_category: retrieval` → `retrieval`, even inside another message.
  3. Tool-result blocks → `tool_results`; attachment blocks → `attachments`.
  4. Remaining text in the current user turn → `user_input`; earlier conversation → `history`.
- **What reaches `countTokens`:** only content strings. Skip the structural keys `type`, `id`, `tool_use_id`, and `tl_category`; count every other string value in the assigned segment. A message `role` chooses the category and is not itself counted. When a `tool_result` block's `content` is a string, count that string only. Do not invent an internal tokenizer: the caller must pass `countTokens`. Fixture tests trim each string and split it on whitespace.
- Output categories (`text`, `thinking`, `tool_use`) and cache metadata are separate from input categories.
- **Calibration target:** the provider's `input_tokens`. Keep the provider's original numbers and the raw local counts separately. Follow `src/lib/classifier/calibrate.ts`:
  - Local sum below target by ≤ 5%: add the difference to `overhead`.
  - Local sum above target, or off by > 5%: scale every category proportionally, using largest-remainder rounding (ties follow the category order).
  - Final counts are nonnegative integers that sum exactly to the target.
- **`estimated` flag:** true when |local sum − target| / target > 5%. If target > 0 and local sum = 0, put everything in `overhead` and mark estimated. If target = 0, return all zeros and mark estimated when local counts were positive. Reject negative or invalid usage.
- **5% is relative, not a flat token gap.** Example: ten local words and `input_tokens` of 14. The absolute gap is 4, but |10 − 14| / 14 is about 29%, which is over 5%. Scale the counts so they sum to 14 and set `estimated` to true. Do not store overhead 4 with `estimated` false. The nine shared fixtures do not catch this mistake.
- **Cost (planned):** read unit prices from `model_prices`, including output and cache pricing. Only Admins may edit prices. Show "unavailable" for unknown prices, never zero.

## User flows (planned)

1. Register/sign in → create/join an organization → Admin invites members and assigns roles.
2. Select/create a project → generate/copy a reporting key → report a call → see a live update → open its detail.
3. Admin sets a budget → spending crosses a threshold → members see the banner, toast and alert history.

## Do's and Don'ts

**Do**
- Keep edits within the assigned Issue.
- Reuse existing Zod schemas, Prisma repositories and auth helpers when those exist.
- Prefer the libraries listed for the current repo or the planned app, and native platform features.
- Enforce permissions on the server.
- Implement loading, empty and error states for UI work.

**Don't**
- Copy the prototype's fake login, demo role selector or random key generator.
- Store plaintext reporting keys, or log prompts or credentials.
- Rely on client-only authorization.
- Count one input segment in two categories.
- Fake live data or test results.
- Add new dependencies without approval.
- Invent missing requirements; ask instead.

## Security requirements

- **Roles (enforced on the server when auth exists):**

| Action | Admin | Developer | Viewer |
| --- | --- | --- | --- |
| Read projects, dashboards, call details, budgets and alerts | Yes | Yes | Yes |
| Create projects | Yes | Yes | No |
| Create/revoke reporting keys | Yes | Own projects only | No |
| Read `model_prices` | Yes | Yes | Yes |
| Edit `model_prices` | Yes | No | No |
| Configure budgets | Yes | No | No |
| Invite members and manage roles | Yes | No | No |

- Logged in but not allowed → **403**. Missing/invalid login or invalid/revoked reporting key → **401**. Non-members cannot read organization data.
- Hash passwords with bcrypt. Verify JWT signature, algorithm and expiry. Use httpOnly, SameSite cookies (Secure in production) and clear the cookie on sign-out.
- Generate reporting keys with a cryptographic RNG; store only the SHA-256 hash and prefix.
- Scope every query by authorized organization/project; never trust client-supplied roles.
- Ingestion: max 1 MB body (413), 600 requests/minute per key (429), invalid schema (400), accepted event (201), unique event ID per project.
- Keep raw content storage disabled by default. Do not store raw prompts or tool content; keep only counts and metadata. Sample retention requires a separate Issue that defines access, retention, and deletion.
- Keep secrets out of code, logs, client bundles and `.env.example`.

## Accessibility requirements (planned UI)

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
- **Issue labels:** documentation Issues may use the existing `documentation` label.
- **Issue references in code:** `// TODO(#number): description`.
- **Pull requests:** the title references the Issue; the body lists what changed and how it was tested. Use `Closes #number` when the PR completes the Issue and `Refs #number` for partial work.
- **Review:** merge only after partner approval and passing CI.
