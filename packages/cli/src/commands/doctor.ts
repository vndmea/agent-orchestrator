import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Command } from "commander";

import {
  resolveExecutionContext,
  runDoctor,
  type DoctorCheck,
  type DoctorReport,
  writeAuditEvent
} from "@mcp-code-worker/core";
import { buildMcpToolCatalogView } from "@mcp-code-worker/mcp-server";
import {
  createLocalClientDoctorChecks,
  createWorkerConnectivityDoctorChecks,
  createWorkerProfileDoctorChecks
} from "@mcp-code-worker/models";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

const createHostMcpDoctorChecks = async (): Promise<DoctorCheck[]> => {
  const codexConfigPath = join(homedir(), ".codex", "config.toml");
  let contents: string | null = null;

  try {
    contents = await readFile(codexConfigPath, "utf8");
  } catch {
    contents = null;
  }

  const hasNamedServer =
    contents?.includes("mcp-code-worker") &&
    contents.includes("mcp") &&
    contents.includes("serve");
  const catalog = buildMcpToolCatalogView();

  return [
    {
      name: "host-mcp-config",
      status: hasNamedServer ? "pass" : "warning",
      message: hasNamedServer
        ? `Codex host config includes an mcp-code-worker server entry at ${codexConfigPath}.`
        : `Codex host config is missing an mcp-code-worker MCP server entry at ${codexConfigPath}. Add it before expecting host-side MCP discovery to work.`,
      metadata: {
        codexConfigPath,
        configured: Boolean(hasNamedServer)
      }
    },
    {
      name: "mcp-tool-catalog",
      status: catalog.groups.some((group) => group.tools.length > 0)
        ? "pass"
        : "fail",
      message: `cw currently exposes ${catalog.groups.reduce((count, group) => count + group.tools.length, 0)} MCP tool(s) through 'cw mcp serve'.`,
      metadata: {
        recommendedEntrypoints: catalog.recommendedEntrypoints.map((tool) => tool.name),
        toolCount: catalog.groups.reduce((count, group) => count + group.tools.length, 0)
      }
    }
  ];
};

const readMetadataString = (
  metadata: Record<string, unknown>,
  key: string,
  fallback: string
): string => {
  const value = metadata[key];

  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : fallback;
};

const formatDoctorReport = (report: DoctorReport): string[] => {
  const failedChecks = report.checks.filter((check) => check.status === "fail");
  const warningChecks = report.checks.filter((check) => check.status === "warning");
  const doctorStatus: string = report.status;
  const doctorSummary: string = report.summary;
  const activeRootDir: string = report.activeRootDir;
  const capabilityPairs: string[] = [];
  const runtimeBootstrap = report.checks.find(
    (check) => check.name === "runtime-bootstrap"
  );
  const rootCheck = report.checks.find((check) => check.name === "root-dir");
  const workerModel = report.checks.find((check) => check.name === "worker-model");
  const workerConnectivity = report.checks.find(
    (check) => check.name === "worker-connectivity"
  );

  for (const capability of report.capabilities) {
    capabilityPairs.push(`${capability.name}=${capability.status}`);
  }

  const capabilitySummary: string = capabilityPairs.join(", ");
  const lines: string[] = [];

  lines.push(`cw doctor: ${doctorStatus}`);
  lines.push(doctorSummary);
  lines.push(`workspace: ${activeRootDir}`);
  if (rootCheck?.metadata) {
    lines.push(
      `binding: rootSource=${readMetadataString(rootCheck.metadata, "rootSource", "unknown")} | caller=${readMetadataString(rootCheck.metadata, "callerWorkingDirectory", "unknown")}`
    );
  }
  if (runtimeBootstrap?.metadata) {
    lines.push(
      `paths: config=${readMetadataString(runtimeBootstrap.metadata, "configPath", "unknown")} | storage=${readMetadataString(runtimeBootstrap.metadata, "cwStorageDir", "unknown")} | home=${readMetadataString(runtimeBootstrap.metadata, "cwHomeDir", "unknown")}`
    );
    const env = runtimeBootstrap.metadata["env"];
    if (env && typeof env === "object") {
      const runtimeEnv = env as Record<string, unknown>;
      lines.push(
        `env: CW_WORKSPACE_DIR=${readMetadataString(runtimeEnv, "CW_WORKSPACE_DIR", "(default)")} | CW_STORAGE_DIR=${readMetadataString(runtimeEnv, "CW_STORAGE_DIR", "(default)")} | apiKeyEnv=${readMetadataString(runtimeEnv, "WORKER_MODEL_API_KEY", "(missing)")}`
      );
    }
  }
  if (workerModel?.metadata) {
    lines.push(
      `worker: provider=${readMetadataString(workerModel.metadata, "provider", "unknown")} | model=${readMetadataString(workerModel.metadata, "model", "unknown")} | baseURL=${readMetadataString(workerModel.metadata, "baseURL", "(default)")} | client=${readMetadataString(workerModel.metadata, "clientCommand", "(default)")}`
    );
  }
  if (workerConnectivity?.metadata) {
    lines.push(
      `probe: worker=${readMetadataString(workerConnectivity.metadata, "workerId", "(default-worker)")} | source=${readMetadataString(workerConnectivity.metadata, "source", "default")} | provider=${readMetadataString(workerConnectivity.metadata, "provider", "unknown")} | model=${readMetadataString(workerConnectivity.metadata, "model", "unknown")} | baseURL=${readMetadataString(workerConnectivity.metadata, "baseURL", "(default)")} | client=${readMetadataString(workerConnectivity.metadata, "clientCommand", "(default)")}`
    );
  }
  lines.push(`capabilities: ${capabilitySummary}`);

  if (failedChecks.length > 0) {
    lines.push(
      `blocking: ${failedChecks
        .slice(0, 3)
        .map((check) => `${check.name}: ${check.message}`)
        .join(" | ")}`
    );
  }

  if (warningChecks.length > 0) {
    lines.push(
      `warnings: ${warningChecks
        .slice(0, 3)
        .map((check) => `${check.name}: ${check.message}`)
        .join(" | ")}`
    );
  }

  if (report.recommendedActions.length > 0) {
    lines.push(`next: ${report.recommendedActions.slice(0, 3).join(" | ")}`);
  }

  return lines;
};

export const registerDoctorCommand = (program: Command, io: CliIo): void => {
  program
    .command("doctor")
    .description("Inspect resolved configuration and local workflow prerequisites.")
    .option(
      "--probe",
      "Run a real worker connectivity probe after the static prerequisite checks.",
      false
    )
    .action(async (options: { probe?: boolean }) => {
      const context = await resolveExecutionContext();
      const additionalChecks = [
        ...(await createWorkerProfileDoctorChecks(context)),
        ...(await createLocalClientDoctorChecks(context)),
        ...(await createHostMcpDoctorChecks()),
        ...(options.probe
          ? await createWorkerConnectivityDoctorChecks(context)
          : [])
      ];
      const report = await runDoctor(context, {
        additionalChecks
      });
      await writeAuditEvent(context, {
        actor: "cli",
        action: "doctor",
        mode: context.dryRun ? "dry-run" : "execute",
        inputSummary: options.probe ? "cw doctor --probe" : "cw doctor",
        outputSummary: `Doctor completed with ok=${String(report.ok)}.`,
        warnings: report.checks
          .filter((check) => check.status === "warning")
          .map((check) => check.message),
        errors: report.checks
          .filter((check) => check.status === "fail")
          .map((check) => check.message)
      });

      writeOutput(io, report, formatDoctorReport(report));
    });
};
