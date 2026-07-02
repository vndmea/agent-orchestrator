import { z } from "zod";

const ToolRequestLimitsSchema = z
  .object({
    maxBytes: z.number().int().positive().optional(),
    maxResults: z.number().int().positive().optional(),
    maxFiles: z.number().int().positive().optional()
  })
  .strict()
  .default({});

const WorkerToolRequestBaseSchema = z
  .object({
    id: z.string().min(1),
    reason: z.string().min(1),
    scope: z.string().min(1).optional(),
    limits: ToolRequestLimitsSchema,
    expectedUse: z.string().min(1)
  })
  .strict();

export const WorkerToolRequestActionSchema = z.enum([
  "search_files",
  "search_text",
  "read_file_snippet",
  "read_git_diff",
  "inspect_patch",
  "run_validation_command"
]);

export const SearchFilesToolRequestSchema = WorkerToolRequestBaseSchema.extend({
  action: z.literal("search_files"),
  glob: z.string().min(1)
}).strict();

export const SearchTextToolRequestSchema = WorkerToolRequestBaseSchema.extend({
  action: z.literal("search_text"),
  query: z.string().min(1),
  paths: z.array(z.string().min(1)).optional()
}).strict();

export const ReadFileSnippetToolRequestSchema = WorkerToolRequestBaseSchema.extend({
  action: z.literal("read_file_snippet"),
  path: z.string().min(1),
  selector: z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("line-range"),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive()
      })
      .strict()
      .refine((value) => value.endLine >= value.startLine, {
        message: "endLine must be greater than or equal to startLine"
      }),
    z
      .object({
        kind: z.literal("symbol-or-text"),
        query: z.string().min(1),
        contextLines: z.number().int().nonnegative().optional()
      })
      .strict()
  ])
}).strict();

export const ReadGitDiffToolRequestSchema = WorkerToolRequestBaseSchema.extend({
  action: z.literal("read_git_diff"),
  base: z.string().min(1).optional(),
  head: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).optional()
}).strict();

export const InspectPatchToolRequestSchema = WorkerToolRequestBaseSchema.extend({
  action: z.literal("inspect_patch"),
  patchProposalId: z.string().min(1).optional()
}).strict();

export const RunValidationCommandToolRequestSchema =
  WorkerToolRequestBaseSchema.extend({
    action: z.literal("run_validation_command"),
    commandId: z.string().min(1)
  }).strict();

export const WorkerToolRequestSchema = z.discriminatedUnion("action", [
  SearchFilesToolRequestSchema,
  SearchTextToolRequestSchema,
  ReadFileSnippetToolRequestSchema,
  ReadGitDiffToolRequestSchema,
  InspectPatchToolRequestSchema,
  RunValidationCommandToolRequestSchema
]);

export const WorkerToolPermissionModeSchema = z.enum([
  "auto-allow",
  "ask-user",
  "always-deny",
  "host-only"
]);

export const WorkerToolPermissionDecisionSchema = z
  .object({
    requestId: z.string().min(1),
    mode: WorkerToolPermissionModeSchema,
    allowed: z.boolean(),
    reason: z.string().min(1),
    normalizedScope: z.string().min(1).optional(),
    normalizedPaths: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high"]),
    requiresUserApproval: z.boolean()
  })
  .strict();

export const UserPermissionGrantStatusSchema = z.enum([
  "pending",
  "granted",
  "denied",
  "expired",
  "cancelled"
]);

export const UserPermissionGrantSchema = z
  .object({
    id: z.string().min(1),
    requestId: z.string().min(1),
    taskId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    action: WorkerToolRequestActionSchema,
    pathPrefix: z.string().min(1).optional(),
    grantScope: z.enum(["once", "task", "session"]),
    granted: z.boolean(),
    status: UserPermissionGrantStatusSchema,
    decidedAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    decidedBy: z
      .object({
        surface: z.string().min(1),
        clientSessionId: z.string().min(1).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const WorkerToolResultSchema = z
  .object({
    requestId: z.string().min(1),
    action: WorkerToolRequestActionSchema,
    ok: z.boolean(),
    summary: z.string(),
    evidence: z.array(
      z
        .object({
          path: z.string().min(1).optional(),
          lineStart: z.number().int().positive().optional(),
          lineEnd: z.number().int().positive().optional(),
          snippet: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional()
        })
        .strict()
    ),
    truncated: z.boolean(),
    warnings: z.array(z.string())
  })
  .strict();

export const WorkerToolPolicySchema = z
  .object({
    allowedRequests: z.array(WorkerToolRequestActionSchema),
    defaultPermissionMode: z.enum(["auto-allow", "ask-user"]),
    deniedRequests: z.array(WorkerToolRequestActionSchema).default([]),
    maxToolRounds: z.number().int().nonnegative()
  })
  .strict();

export type WorkerToolRequestAction = z.infer<
  typeof WorkerToolRequestActionSchema
>;
export type WorkerToolRequest = z.infer<typeof WorkerToolRequestSchema>;
export type WorkerToolPermissionMode = z.infer<
  typeof WorkerToolPermissionModeSchema
>;
export type WorkerToolPermissionDecision = z.infer<
  typeof WorkerToolPermissionDecisionSchema
>;
export type UserPermissionGrant = z.infer<typeof UserPermissionGrantSchema>;
export type WorkerToolResult = z.infer<typeof WorkerToolResultSchema>;
export type WorkerToolPolicy = z.infer<typeof WorkerToolPolicySchema>;
