# Codex Usage

Use `ao_start_task` as the default high-level coding task entrypoint for Codex and GPT clients.

Recommended call order:

1. Call `ao_start_task` with `goal`, optional `scope`, and deterministic validation flags.
2. Read `nextRecommendedActions` from the result instead of guessing the next step.
3. Review `aoStorageDir/runs/<taskId>/report.md` or call `ao_get_task_report` before any patch apply attempt.
4. Prefer `proposePatch=true` and `inspectPatch=true` first.
5. Use patch apply only after manual review. Keep the first apply in dry-run mode unless a human explicitly wants writes.

When to require a profile:

- Set `requireProfile=true` when routing higher-risk coding tasks to a specific worker.
- Leave `requireProfile` unset for exploratory or low-risk dry-run analysis when profile coverage is not mandatory.
- For `patch-generation`, treat a persisted profile plus benchmark-qualified capability update as the preferred path before delegating real patch proposal work.

When to propose but not apply:

- Default to patch proposal only when the user wants reviewable implementation options.
- Keep apply gated behind `allowWrite=true` and `confirmApply=true`.
- If validation already looks unstable, stop at proposal plus report review.

How to read task artifacts:

- `aoStorageDir/runs/<taskId>/report.md` is the fastest human-readable summary.
- `patch-proposal.json`, `patch-inspection.json`, and `patch-apply-result.json` contain the structured patch lifecycle.
- `validation-report.json` and `fix-result.json` explain deterministic failures and recovery guidance.

Worker evaluation layers:

- `ao worker interview --save` establishes onboarding trust and baseline routing limits.
- `ao worker benchmark --suite coding-v1 --save` records coding benchmark results under `aoStorageDir/worker-benchmarks/<sanitized-worker-id>/coding-v1.json`.
- `ao worker benchmark --suite coding-v1 --save --update-profile-capabilities` is the explicit step that can enable `patch-generation` on an existing persisted profile when the benchmark passes the required fixtures.
- Benchmark results alone do not bypass patch inspection, dry-run apply, `allowWrite`, or `confirmApply`.
