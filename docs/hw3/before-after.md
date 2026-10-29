# HW3 before/after: issue #5, Anthropic classifier

Same feature, two fresh sessions. The shared measuring stick was committed on `main` before either session started (`1696b64`): nine fixtures in `fixtures/anthropic/` and `scripts/score-anthropic.mjs`. The scorer calls `classify(request, usage, "anthropic", wordCount)` and checks category totals, the sum invariant, and retrieval tags. Neither session was given a follow-up prompt after the first request.

## Method

| | Without rules | With rules |
| --- | --- | --- |
| Branch | `experiment/no-rules` | `experiment/with-rules` |
| Rules file | `AGENTS.md` removed in `4b9a314` before the session | `AGENTS.md` present |
| Session | One fresh agent. It was told the directory and asked not to leave it. | One fresh agent. It was told the directory and asked not to read the other experiment. |
| Product prompt | "Write a TypeScript function that takes an Anthropic Messages API request and its usage object and returns how many input tokens belong to system prompt, tools, history, tool results and user input." | "Implement issue #5 following AGENTS.md and docs/PRD.md." The issue checklist was included in that same prompt, because the issue body is not stored in the repo. |
| Follow-up prompts | 0 | 0 |

`docs/PRD.md` and the nine fixtures stayed in the no-rules tree. The session used them. This run therefore compares "no rules file" with "rules file", not "no specification of any kind".

## Shared scorer

Both implementations score 9/9 on the nine fixtures.

| Check | Without rules | With rules |
| --- | --- | --- |
| Fixture pass rate | 9/9 | 9/9 |
| Categories sum to `input_tokens` | yes | yes |
| Retrieval tag honored | yes | yes |
| Commit | `ba339ea` | red `ef539bb`, green `b36353b` |

## Where the rules file changed the result

| Check | Without rules | With rules |
| --- | --- | --- |
| File location | `src/classify.ts` | `src/lib/classifier/classify.ts`, plus `parse-anthropic.ts`, `calibrate.ts`, `types.ts` |
| Matches `AGENTS.md` layout | no | yes |
| Tests | `src/classify.test.ts`, 12 tests, `node:test` | `tests/unit/classify.test.ts`, 45 tests, Vitest 4.1.12. `npm test` reports 45 passed. |
| Failing test committed first | no. Tests and implementation are one commit. | yes. `ef539bb` adds the test file and does not add `src/`. `b36353b` adds the implementation. |
| Function signature | `classify(request, usage, providerOrTokenizer?: string \| Tokenizer, tokenize?: Tokenizer)` | `classify(request, usage, provider, countTokens): Breakdown` |
| Return shape | Flat counts plus `estimated` | `{ input, output, cache, estimated, raw, usage }` |
| New dependencies | none | devDependencies only: `typescript` 5.9.3, `vitest` 4.1.12, `@types/node` 24.19.2. These are the versions named in `AGENTS.md`. No runtime dependency. |
| Typecheck | no `tsconfig.json` | `tsc --noEmit` passes |

### Signature without rules

```typescript
export function classify(
  request: AnthropicMessagesRequest,
  usage: AnthropicUsage,
  providerOrTokenizer?: string | Tokenizer,
  tokenize?: Tokenizer,
): InputTokenBreakdown
```

The third argument is optional and may be either the provider name or the tokenizer. `AGENTS.md` requires `classify(request, usage, provider, countTokens)`.

### Signature with rules

```typescript
export function classify(
  request: unknown,
  usage: unknown,
  provider: string,
  countTokens: CountTokens,
): Breakdown
```

### Calibration

The nine fixtures do not separate "within 5 tokens" from "within 5%". The no-rules code treats a gap of 5 tokens as overhead:

```typescript
/** Billed tokens within this distance of the local count stay put; the gap is overhead. */
const OVERHEAD_TOLERANCE = 5;

if (Math.abs(gap) <= OVERHEAD_TOLERANCE) {
  return { ...raw, overhead: gap, estimated: false };
}
```

`AGENTS.md` says a gap is overhead only when the local sum is below the target by at most 5%. Anything over the target, or off by more than 5%, is scaled, and `estimated` is true only when the relative gap is over 5%. The with-rules `calibrate` follows that rule.

Probe, not one of the nine fixtures: system text of 10 words, `input_tokens` 14. The gap is 4 tokens, which is 29% of 14.

| | `system` | `overhead` | `estimated` |
| --- | --- | --- | --- |
| Without rules | 10 | 4 | false |
| With rules | 14 | 0 | true |

## What this shows

On the prepared fixtures, removing `AGENTS.md` did not lower the pass rate, because the fixtures and the PRD were still in the tree and the session followed them. The rules file changed the parts the fixtures do not score: the directory, the required signature, Vitest under `tests/unit/`, a red commit before the implementation, and the 5% calibration rule.
