import {
  PatchInspectionSchema,
  type ExecutionContext,
  type PatchInspection,
  type PatchProposal,
  type RepositoryContextPack,
  type ValidationReport,
  resolveExecutionContext,
  writeAuditEvent
} from "@mcp-code-worker/core";
import {
  resolveWorkerProfile
} from "@mcp-code-worker/models";
import {
  buildRepositoryContextPack,
  inspectPatch
} from "@mcp-code-worker/tools";

import {
  buildFallbackPatchProposal,
  PatchGenerationWorker
} from "../workers/patch-generation-worker.js";
import { resolveWorkflowWorkerContext } from "./worker-context-resolution.js";

export interface PatchProposalWorkflowInput {
  context?: ExecutionContext;
  errorLog?: string;
  fixResult?: unknown;
  goal?: string;
  repositoryContext?: RepositoryContextPack;
  requireProfile?: boolean;
  reviewResult?: unknown;
  scope?: string;
  validationReport?: ValidationReport;
  workerId?: string;
}

export interface PatchProposalWorkflowOutput {
  inspection: PatchInspection;
  proposal: PatchProposal;
  warnings: string[];
}

export const runPatchProposalWorkflow = async (
  input: PatchProposalWorkflowInput
): Promise<PatchProposalWorkflowOutput> => {
  const context = input.context ?? await resolveExecutionContext();
  const repositoryContext =
    input.repositoryContext ??
    await buildRepositoryContextPack(context, {
      rootDir: context.rootDir,
      scope: input.scope,
      errorLog: input.errorLog
    });
  const effectiveScope = repositoryContext.scope ?? input.scope;
  const warnings: string[] = [];
  const resolvedWorker = await resolveWorkflowWorkerContext({
    activity: "patch proposal generation",
    context,
    workerId: input.workerId
  });
  const workerContext = resolvedWorker.context;
  const workerId = resolvedWorker.workerId;
  const workerProfileResolution = await resolveWorkerProfile({
    context: workerContext,
    modelConfig: workerContext.workerModel,
    workerId,
    requireProfile: input.requireProfile
  });
  const fallbackProposal = buildFallbackPatchProposal(
    {
      goal: input.goal,
      scope: effectiveScope
    },
    repositoryContext,
    workerId
  );
  const workerProfile = workerProfileResolution?.profile;
  const routedWorkerProfile =
    workerProfile?.routingPolicy.allowPatchGeneration === true
      ? workerProfile
      : null;

  if (workerProfile) {
    if (workerProfile.status !== "qualified") {
      const reason =
        `Worker ${workerProfile.workerId} is ${workerProfile.status} and is not qualified for patch-generation tasks.`;
      const inspection = PatchInspectionSchema.parse({
        ...(await inspectPatch(context, fallbackProposal, {
          scope: effectiveScope
        })),
        ok: false,
        blockedReasons: [
          reason,
          "Patch proposal is a fallback placeholder and must not be applied."
        ]
      });

      return {
        proposal: fallbackProposal,
        inspection,
        warnings: [reason]
      };
    }

    if (
      input.requireProfile &&
      workerProfile.routingPolicy.allowPatchGeneration !== true
    ) {
      const reason =
        `Worker ${workerProfile.workerId} is not allowed to generate patch proposals under its persisted routing policy.`;
      const inspection = PatchInspectionSchema.parse({
        ...(await inspectPatch(context, fallbackProposal, {
          scope: effectiveScope
        })),
        ok: false,
        blockedReasons: [
          reason,
          "Patch proposal is a fallback placeholder and must not be applied."
        ]
      });

      return {
        proposal: fallbackProposal,
        inspection,
        warnings: [reason]
      };
    }

    if (!workerProfile.supportedTaskTypes.includes("patch-generation")) {
      const reason =
        `Worker ${workerProfile.workerId} is not qualified for patch-generation tasks.`;
      const inspection = PatchInspectionSchema.parse({
        ...(await inspectPatch(context, fallbackProposal, {
          scope: effectiveScope
        })),
        ok: false,
        blockedReasons: [
          reason,
          "Patch proposal is a fallback placeholder and must not be applied."
        ]
      });

      return {
        proposal: fallbackProposal,
        inspection,
        warnings: [reason]
      };
    }
  }

  const patchWorker = new PatchGenerationWorker(workerContext);
  const generation = await patchWorker.generateProposal({
    errorLog: input.errorLog,
    fixResult: input.fixResult,
    goal: input.goal ?? "Propose a safe patch.",
    repositoryContext,
    reviewResult: input.reviewResult,
    scope: effectiveScope,
    validationReport: input.validationReport,
    workerId,
    workerProfile: routedWorkerProfile
  });
  const proposal = generation.proposal;
  let inspection = await inspectPatch(context, proposal, {
    scope: effectiveScope
  });

  if (!generation.structuredOutputOk) {
    warnings.push("Patch proposal is a fallback placeholder and must not be applied.");
    inspection = PatchInspectionSchema.parse({
      ...inspection,
      ok: false,
      blockedReasons: [
        "Patch proposal is a fallback placeholder and must not be applied.",
        ...inspection.blockedReasons,
        ...generation.errors
      ]
    });
  }

  await writeAuditEvent(context, {
    actor: "workflow",
    action: "propose-patch",
    mode: context.dryRun ? "dry-run" : "execute",
    workflow: "patch-proposal-workflow",
    inputSummary: input.goal ?? input.scope ?? "patch proposal",
    outputSummary: inspection.ok
      ? "Patch proposal generated."
      : "Patch proposal generated but inspection blocked it.",
    warnings,
    errors: inspection.blockedReasons,
    metadata: {
      patchId: proposal.id,
      scope: effectiveScope,
      workerId
    }
  });

  return {
    proposal,
    inspection,
    warnings
  };
};
