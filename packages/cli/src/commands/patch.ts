import type { Command } from "commander";

import { PatchProposalSchema, resolveExecutionContext } from "@agent-orchestrator/core";
import {
  applyPatchProposal,
  inspectPatch,
  readRepositoryFile,
  writeRepositoryFile
} from "@agent-orchestrator/tools";
import {
  formatPatchProposalWorkflowOutput,
  runPatchProposalWorkflow
} from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";
import { resolveWorkflowOutputOptions, writeJson } from "../output.js";

const parsePatchProposalFile = async (patchFile: string, rootDir: string) => {
  const contents = await readRepositoryFile(patchFile, rootDir, 240_000);

  try {
    return PatchProposalSchema.parse(JSON.parse(contents) as unknown);
  } catch {
    return PatchProposalSchema.parse({
      id: `patch-${Date.now()}`,
      title: `Imported patch from ${patchFile}`,
      summary: `Imported raw unified diff from ${patchFile}.`,
      rationale: ["Imported from patch file for manual review."],
      unifiedDiff: contents,
      files: [],
      risks: [],
      validationPlan: [],
      generatedAt: new Date().toISOString(),
      source: {
        workflow: "patch-file-import"
      }
    });
  }
};

export const registerPatchCommand = (program: Command, io: CliIo): void => {
  const patch = program.command("patch").description("Inspect, propose, and apply gated patch artifacts.");

  patch
    .command("inspect")
    .argument("<patchFile>", "Patch proposal file")
    .option("--scope <scope>", "Restrict inspection to a repository scope")
    .action(async (patchFile: string, options: { scope?: string }) => {
      const context = await resolveExecutionContext({
        cliOverrides: {
          dryRun: false
        }
      });
      const proposal = await parsePatchProposalFile(patchFile, context.rootDir);
      const inspection = await inspectPatch(context, proposal, {
        scope: options.scope
      });

      io.write(
        JSON.stringify(
          {
            proposal,
            inspection
          },
          null,
          2
        )
      );
    });

  patch
    .command("apply")
    .argument("<patchFile>", "Patch proposal file")
    .option("--dry-run", "Run git apply --check without modifying files", false)
    .option("--allow-write", "Allow patch application", false)
    .option("--allow-dirty-worktree", "Allow patch apply when the git worktree is dirty", false)
    .option("--confirm-apply", "Confirm patch application", false)
    .option("--scope <scope>", "Restrict patch application to a repository scope")
    .option("--typecheck", "Run typecheck after apply", false)
    .option("--lint", "Run lint after apply", false)
    .option("--test", "Run tests after apply", false)
    .action(
      async (
        patchFile: string,
        options: {
          allowWrite: boolean;
          allowDirtyWorktree: boolean;
          confirmApply: boolean;
          dryRun: boolean;
          lint: boolean;
          scope?: string;
          test: boolean;
          typecheck: boolean;
        }
      ) => {
        const context = await resolveExecutionContext({
          cliOverrides: {
            allowWrite: options.allowWrite,
            dryRun: false
          }
        });
        const proposal = await parsePatchProposalFile(patchFile, context.rootDir);
        const result = await applyPatchProposal(context, proposal, {
          dryRun: options.dryRun,
          allowWrite: options.allowWrite,
          allowDirtyWorktree: options.allowDirtyWorktree,
          confirmApply: options.confirmApply,
          scope: options.scope,
          runValidation: {
            typecheck: options.typecheck,
            lint: options.lint,
            test: options.test
          }
        });

        io.write(JSON.stringify(result, null, 2));
      }
    );

  patch
    .command("propose")
    .option("--goal <goal>", "Patch goal")
    .option("--scope <scope>", "Optional scope")
    .option("--error-log <text>", "Inline error log")
    .option("--error-log-file <path>", "Repository-local error log file")
    .option("--worker <workerId>", "Optional worker id")
    .option("--require-profile", "Require a persisted worker profile", false)
    .option("--output <path>", "Optional patch proposal output path")
    .option("--allow-write-output", "Allow writing the output file", false)
    .option("--summary", "Print a summary instead of the full workflow output", false)
    .option("--full", "Force the full workflow output", false)
    .option("--max-bytes <bytes>", "Limit preview fields in summary output", Number)
    .action(
      async (options: {
        allowWriteOutput: boolean;
        errorLog?: string;
        errorLogFile?: string;
        full: boolean;
        goal?: string;
        maxBytes?: number;
        output?: string;
        requireProfile: boolean;
        scope?: string;
        summary: boolean;
        worker?: string;
      }) => {
        const context = await resolveExecutionContext();
        const errorLog = options.errorLog ??
          (options.errorLogFile
            ? await readRepositoryFile(options.errorLogFile, context.rootDir, 20_000)
            : undefined);
        const result = await runPatchProposalWorkflow({
          context,
          goal: options.goal,
          scope: options.scope,
          errorLog,
          workerId: options.worker,
          requireProfile: options.requireProfile
        });
        const serialized = JSON.stringify(result, null, 2);

        if (options.output && options.allowWriteOutput) {
          await writeRepositoryFile(
            options.output,
            serialized,
            context,
            true
          );
        }

        writeJson(
          io,
          formatPatchProposalWorkflowOutput(result, resolveWorkflowOutputOptions(options))
        );
      }
    );
};
