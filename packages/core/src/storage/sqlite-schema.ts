export const CW_SQLITE_SCHEMA_VERSION = 1;

export const CW_SQLITE_PRAGMAS: string[] = [
  "PRAGMA foreign_keys = ON",
  "PRAGMA journal_mode = DELETE",
  "PRAGMA temp_store = MEMORY"
];

export const CW_SQLITE_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS worker_secrets (
    worker_id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS worker_profiles (
    worker_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS worker_benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL,
    suite_name TEXT NOT NULL,
    benchmark_json TEXT NOT NULL,
    patch_generation_qualified INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_worker_benchmarks_worker_suite_time
    ON worker_benchmarks(worker_id, suite_name, updated_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS task_sessions (
    task_id TEXT PRIMARY KEY,
    retention_group_key TEXT NOT NULL,
    goal TEXT NOT NULL,
    scope TEXT,
    worker_id TEXT,
    requested_worker_id TEXT,
    require_profile INTEGER NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_task_sessions_retention_group_updated
    ON task_sessions(retention_group_key, updated_at DESC, task_id DESC)`,
  `CREATE TABLE IF NOT EXISTS task_session_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    warnings_json TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    artifact_name TEXT,
    FOREIGN KEY(task_id) REFERENCES task_sessions(task_id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_task_session_steps_task_step
    ON task_session_steps(task_id, step_id)`,
  `CREATE TABLE IF NOT EXISTS task_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    artifact_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES task_sessions(task_id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_task_artifacts_task_name
    ON task_artifacts(task_id, artifact_name)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    mode TEXT NOT NULL,
    workflow TEXT,
    tool TEXT,
    input_summary TEXT NOT NULL,
    output_summary TEXT,
    warnings_json TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_created
    ON audit_events(created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_type_created
    ON audit_events(event_type, created_at DESC, id DESC)`
];
