# Host-Worker Workflow

## Steps

1. The host frames the task and decides whether to use CW-managed workflows.
2. `CodexHostAdapter` builds a `WorkerTaskEnvelope` from the goal, selected files, repository context, and host rules.
3. A persisted `WorkerCapabilityProfile`, interview, or benchmark result contributes to a `WorkerTrustProfile`; missing evidence lowers trust rather than making the endpoint implicitly trusted.
4. `WorkerAgent` runs the selected contract through the shared task contract registry and model behavior profile.
5. `HostSemanticValidator` checks the result for missing evidence, out-of-scope file references, generic fallbacks, unsupported validation claims, and patch-boundary issues.
6. The workflow records a `WorkerTaskExecutionRecord` when managed storage writes are allowed, including task/result envelopes, trust profile, structured-output diagnostics, semantic status, and artifact refs.
7. Workflow returns a final structured result for host review.

Workers do not make final architecture decisions or write directly to the main working tree by default.

## Trust And Execution Metadata

Worker trust levels are `unknown`, `interviewed`, `benchmarked`, and `verified`. Trust affects recommended mode, warnings, and review posture; it does not bypass repository write gates or host acceptance.

Host-worker results expose `finalResult.metadata.workerExecutionRecordId` and `finalResult.metadata.workerTrustProfile`. In dry-run contexts the record id is still returned for traceability, but the record is not persisted unless the storage write policy allows execution-record writes.
