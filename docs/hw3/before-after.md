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

`docs/PRD.md` and the nine fixtures stayed in both trees. Both sessions could read them, and the no-rules session did. The product prompts also differed: the no-rules prompt asked for a TypeScript function over an Anthropic request, while the with-rules prompt asked to implement issue #5 using `AGENTS.md`, `docs/PRD.md`, and the issue checklist. This compares two differently prompted sessions, one of which also had a rules file, not "no specification of any kind" versus a complete spec.

## Shared scorer

Both implementations score 9/9 on the nine fixtures.

| Check | Without rules | With rules |
| --- | --- | --- |
| Fixture pass rate | 9/9 | 9/9 |
| Categories sum to `input_tokens` | yes | yes |
| Retrieval tag honored | yes | yes |
| Commit | `ba339ea` | red `ef539bb`, green `b36353b` |

## Where the two runs differed

Do not treat every difference as caused by `AGENTS.md` alone. The with-rules prompt named the issue, the PRD, and the checklist; the no-rules prompt did not. The PRD and fixtures were readable in both trees.

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

The third argument is optional and may be either the provider name or the tokenizer. The with-rules signature matches `classify(request, usage, provider, countTokens)`. That shape is in `AGENTS.md` and was also in the issue checklist used in that prompt.

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

The nine fixtures do not separate "within 5 tokens" from "within 5%". The no-rules code treats a gap of 5 tokens as overhead. That choice is consistent with a looser reading of the PRD's older calibration sentence; it is not only the absence of `AGENTS.md`:

```typescript
/** Billed tokens within this distance of the local count stay put; the gap is overhead. */
const OVERHEAD_TOLERANCE = 5;

if (Math.abs(gap) <= OVERHEAD_TOLERANCE) {
  return { ...raw, overhead: gap, estimated: false };
}
```

The with-rules `calibrate` treats a gap as overhead only when the local sum is below the target by at most 5%. Anything over the target, or off by more than 5%, is scaled, and `estimated` is true only when the relative gap is over 5%. That matches `calibrate.ts` and the current `AGENTS.md` rule. It is stricter than the PRD sentence both sessions could read at the time.

Probe, not one of the nine fixtures: system text of 10 words, `input_tokens` 14. The gap is 4 tokens, which is 29% of 14.

| | `system` | `overhead` | `estimated` |
| --- | --- | --- | --- |
| Without rules | 10 | 4 | false |
| With rules | 14 | 0 | true |

## What this shows

On the prepared fixtures, both runs scored 9/9. Removing `AGENTS.md` did not lower that pass rate, because the fixtures and the PRD were still available and the sessions could follow them. Layout, signature, Vitest, red/green commits, and the 5% calibration rule differed across the two runs. Those differences line up with `AGENTS.md`, but they also line up with the with-rules issue prompt. Attribute the fixture score to the shared scorer; treat the other gaps as the combined effect of prompt, PRD, fixtures, and the rules file.
