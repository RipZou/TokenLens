# Sprint 2 — 11/5 to 11/10

| Issue | Owner | Result |
| --- | --- | --- |
| #6 Ingest API | RipZou | Done |
| #7 E2E | Eileenyuan1 | Done. The issue is still open because the pull requests did not say `Closes #7`. |
| #8 Live calls | RipZou | Done |
| #9 Chart and call detail | RipZou | Done |
| #10 OpenAI requests | RipZou | Done. Failing test commit `3d1c412`, then implementation `572bd38`. |
| #11 Budgets | RipZou | Done. Failing test commit `dfdbac5`, then implementation `acbe5a5`. |
| #12 API docs | RipZou | Done. No separate red commit. |
| #13 Security scanning | Eileenyuan1 | Done |
| #14 Hints and SDK | RipZou | Done. No separate red commit. |
| #15 Topic tags | RipZou | Done. No separate red commit. |
| #16 Docs | Eileenyuan1 | Done. The issue is still open because the pull request did not say `Closes #16`. |

## Retrospective

**Went well**

- Code review went smoothly.
- OpenAI classification (#10), budgets (#11), and the live call stream (#8) show the failing test commit before the implementation.

**To improve**

- First time with Vercel: we hit many unfamiliar setup problems. Preview deploys failed when the Neon free plan reached its 10-branch limit. We deleted merged preview branches and redeployed.
- #12, #14, and #15 do not have a red commit. The tests and the implementation landed in one commit each: `1cbd177` (#12, pull request #38), `b73d03b` (#14, pull request #39), and `7f13d04` (#15, pull request #40). The course asks for a failing test commit before the implementation. These three are already on `main`, so we did not rewrite that history.
