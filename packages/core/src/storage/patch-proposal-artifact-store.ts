import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadCwConfig } from "../config/cw-config.js";
import type { ExecutionContext } from "../runtime/execution-context.js";
import type { PatchInspection, PatchProposal } from "../schemas/patch.schema.js";
import { getCwWorkspaceRunsDirFromStorageDir } from "./cw-paths.js";
import {
  bootstrapSqliteWorkspaceStore,
  openSqliteWorkspaceStore
} from "./sqlite.js";

export interface PatchProposalArtifactWriteResult {
  mode: "execute" | "dry-run";
  path: string;
  written: boolean;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const sanitizeArtifactName = (value: string): string => {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);

  return SAFE_NAME.test(sanitized) ? sanitized : "patch-proposal";
};

const buildPatchProposalArtifactName = (
  executionId: string,
  proposalId: string
): string =>
  `${sanitizeArtifactName(executionId)}-${sanitizeArtifactName(proposalId)}.json`;

const buildPatchProposalArtifactDir = (cwStorageDir: string): string =>
  join(getCwWorkspaceRunsDirFromStorageDir(cwStorageDir), "patch-proposals");

export const buildPatchProposalRecordSummary = (input: {
  inspection: PatchInspection;
  proposal: PatchProposal;
}): Record<string, unknown> => ({
  proposalId: input.proposal.id,
  title: input.proposal.title,
  summary: input.proposal.summary,
  rationale: input.proposal.rationale,
  files: input.proposal.files,
  risks: input.proposal.risks,
  validationPlan: input.proposal.validationPlan,
  generatedAt: input.proposal.generatedAt,
  source: input.proposal.source,
  diffStats: input.inspection.stats,
  diffBytes: Buffer.byteLength(input.proposal.unifiedDiff, "utf8"),
  inspection: {
    ok: input.inspection.ok,
    blockedReasons: input.inspection.blockedReasons,
    warnings: input.inspection.warnings,
    files: input.inspection.files,
    stats: input.inspection.stats
  }
});

const prunePatchProposalArtifacts = async (
  context: ExecutionContext,
  maxStored: number
): Promise<void> => {
  const db = await openSqliteWorkspaceStore(context.cwStorageDir);

  try {
    const staleRows = db.prepare(
      `SELECT id, path
       FROM artifact_records
       WHERE artifact_kind = ?
         AND id NOT IN (
           SELECT id
           FROM artifact_records
           WHERE artifact_kind = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`
    ).all("patch-proposal", "patch-proposal", maxStored) as Array<{
      id: string;
      path: string;
    }>;

    for (const row of staleRows) {
      await rm(row.path, { force: true });
      db.prepare("DELETE FROM artifact_records WHERE id = ?").run(row.id);
    }
  } finally {
    db.close();
  }
};

export const writePatchProposalArtifact = async (
  context: ExecutionContext,
  input: {
    executionId: string;
    inspection: PatchInspection;
    proposal: PatchProposal;
  }
): Promise<PatchProposalArtifactWriteResult> => {
  const artifactName = buildPatchProposalArtifactName(
    input.executionId,
    input.proposal.id
  );
  const artifactDir = buildPatchProposalArtifactDir(context.cwStorageDir);
  const artifactPath = resolve(artifactDir, artifactName);
  const evaluation = context.storageWritePolicy.evaluate(
    "execution-record-write",
    false
  );

  if (evaluation.mode !== "execute") {
    return {
      mode: "dry-run",
      path: artifactPath,
      written: false
    };
  }

  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    artifactPath,
    JSON.stringify(input.proposal, null, 2),
    "utf8"
  );

  await bootstrapSqliteWorkspaceStore(context.cwStorageDir);
  const db = await openSqliteWorkspaceStore(context.cwStorageDir);
  const now = new Date().toISOString();

  try {
    db.prepare(
      `UPDATE artifact_records
       SET artifact_kind = ?,
           storage = ?,
           path = ?,
           retention_class = ?,
           metadata_json = ?
       WHERE execution_id = ?
         AND artifact_name = ?`
    ).run(
      "patch-proposal",
      "filesystem",
      artifactPath,
      "rolling",
      JSON.stringify(buildPatchProposalRecordSummary(input)),
      input.executionId,
      input.proposal.id
    );

    const updated = db.prepare(
      `SELECT id FROM artifact_records
       WHERE execution_id = ?
         AND artifact_name = ?`
    ).get(input.executionId, input.proposal.id);

    if (!updated) {
      db.prepare(
        `INSERT INTO artifact_records(
           id,
           task_id,
           execution_id,
           artifact_name,
           artifact_kind,
           storage,
           path,
           retention_class,
           metadata_json,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `${input.executionId}:patch-proposal`,
        input.proposal.source.taskId ?? input.executionId,
        input.executionId,
        input.proposal.id,
        "patch-proposal",
        "filesystem",
        artifactPath,
        "rolling",
        JSON.stringify(buildPatchProposalRecordSummary(input)),
        now
      );
    }
  } finally {
    db.close();
  }

  const config = await loadCwConfig(context.rootDir);
  await prunePatchProposalArtifacts(
    context,
    config.config.storage.patchProposals.maxStored
  );

  return {
    mode: "execute",
    path: artifactPath,
    written: true
  };
};
