# Empire Command Center — Recommendations

_Review date: 2026-06-05_

A scene-based AI video generation platform (Next.js orchestrator + Supabase +
RunPod WAN 2.2 worker + R2/S3 storage). Overall this is a **well-structured
codebase**: strict TypeScript, clean separation of concerns (worker /
orchestrator / storage), early env validation, structured worker error codes,
and a sound database schema. The recommendations below are about hardening a
solid foundation, not rescuing it.

## Snapshot

| Area | State |
|------|-------|
| Architecture | Clean, layered, idempotent job polling |
| TypeScript | `strict: true`, well-typed |
| DB schema | UUID keys, FKs w/ cascade, indexes, RLS enabled |
| Tests | Minimal — only `wan22-runpod-worker/test_local.py` |
| CI/CD | None |
| Auth | None (single-operator by design) |

---

## P0 — Correctness & data integrity

1. **Orphaned RunPod jobs on partial failure**
   `web/lib/orchestrator.ts:66-88`. If `submitJob()` succeeds but the
   subsequent `jobs` update (or a later failure) throws, the local job is
   marked `failed` while the GPU job keeps running — burning credits with no
   record of `runpod_job_id`. Persist the RunPod id immediately after submit
   (before any other DB write), and add a reconciliation pass in `syncJob()`
   that detects `queued` jobs with no `runpod_job_id` and either re-submits or
   cancels.

2. **Assembly doesn't validate asset ownership / liveness**
   `web/app/api/projects/[projectId]/assemble/route.ts:53-56`. Assembly assumes
   every approved asset still exists and belongs to the project. Validate that
   approved assets are still present and `project_id` matches before
   downloading; fail with a clear, actionable error otherwise.

3. **Signed-URL expiry during multi-day projects**
   `web/lib/orchestrator.ts:199` generates signed URLs once at finalize time.
   If the operator approves takes days later (TTL default 7d), links can be
   dead by assembly time. Regenerate signed URLs on read (in the job/asset poll
   path) rather than persisting them, or refresh them in `SceneCard`.

---

## P1 — Security & robustness

4. **`S3_SIGNED_URL_TTL` silently coerces to 0**
   `web/lib/env.ts:28` — `Number(optional(...))` of a malformed value yields
   `NaN`/`0`, producing immediately-expired URLs. Validate as a positive
   integer and throw on bad input. Same pattern for `MAX_GENERATION_ATTEMPTS`
   (`env.ts:31`).

5. **No URL validation on `S3_ENDPOINT_URL` (SSRF surface)**
   `web/lib/storage.ts`. A malicious/misconfigured endpoint receives your S3
   credentials. Parse and allowlist the host (or at least require https + known
   provider domains).

6. **`S3_REGION` defaults to `"auto"`** (`env.ts:26`) — valid only for
   Cloudflare R2. With other S3 providers this fails opaquely. Document the
   constraint in `.env.example` or validate against the configured endpoint.

7. **No rate limiting / spend guardrails**
   The README states "cost guardrails live in the orchestrator," but there is
   no per-scene generation cap or throttle in code. Add a max-attempts/active-
   jobs check before submitting to RunPod.

8. **ffmpeg concat hardening**
   `web/lib/assembler.ts:50-62`. Quote-escaping is correct, but add
   `-protocol_whitelist file,pipe` and keep `-safe 0` so an unexpected path
   character can't break the concat demuxer. Also surface more than the last
   4KB of stderr (`assembler.ts:20`) when assembly fails.

---

## P2 — Testing, CI & observability

9. **Add automated tests for the state machine.** The orchestrator
   (`startGeneration`, `syncJob`, `approveAsset`) is the riskiest logic and has
   zero coverage. Add Vitest unit tests with a mocked Supabase client + RunPod
   client covering: submit-failure, status transitions, double-generate races,
   and approval overwrite.

10. **Add a CI pipeline.** No `.github/workflows`. Add one that runs
    `tsc --noEmit`, `next lint`, and the test suite on PRs. (See the
    `session-start-hook` skill to wire this for web sessions too.)

11. **Concurrency race on rapid double-generate**
    `web/lib/orchestrator.ts:256-279`. Two fast "Generate" clicks can race; the
    later-approved take can be silently overwritten. Guard with a check for an
    in-flight job per scene before starting a new one.

12. **Structured logging.** Logging is stdout-only. Add minimal structured
    logs (job id, scene id, attempt, error_code) to make failed generations
    debuggable in production.

13. **Vercel timeout risk for assembly.** ffmpeg runs synchronously in the
    assemble API route; multi-clip concatenation can exceed Vercel's function
    limit. Consider moving assembly to a background job/queue or a dedicated
    worker.

---

## P3 — Schema & docs polish

14. **CHECK constraints on status enums** in `supabase/migrations/0001_init.sql`
    so an application bug can't write an invalid status.
15. **Validate RunPod JSONB output shape** before storing, rather than
    accepting arbitrary JSON into the `jobs` output column.
16. **Operator runbook gaps:** document how to debug a failed generation (link
    the worker error-code table), monitor per-project cost, and recover from a
    partial assembly failure.

---

## Suggested order of work

1. P0 items 1–3 (data integrity) — highest blast radius.
2. P1 items 4–6 (cheap env/URL hardening) — small diffs, real risk reduction.
3. P2 items 9–10 (tests + CI) — locks in everything above.
4. Remaining P1/P2/P3 as capacity allows.
