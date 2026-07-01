import { z } from "zod";

export const CwModelConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  clientCommand: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional()
});

export const CwWorkerConfigSchema = z.object({
  workerId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  baseURL: z.string().url().optional(),
  clientCommand: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();

export const CwSafetyConfigSchema = z.object({
  dryRun: z.boolean().default(true),
  allowWrite: z.boolean().default(false),
  allowedCommands: z.array(z.string()).default(["git", "node", "pnpm"])
});

export const CwContextConfigSchema = z.object({
  strictFiles: z.boolean().default(false),
  ignoredPaths: z.array(z.string()).default([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".next"
  ])
});

export const CwStorageConfigSchema = z.object({
  engine: z.literal("sqlite").default("sqlite"),
  runs: z.object({
    maxPerKind: z.number().int().min(1).max(5).default(1)
  }).default({
    maxPerKind: 1
  }),
  audit: z.object({
    maxPerType: z.number().int().min(1).max(5).default(3)
  }).default({
    maxPerType: 3
  })
});

const ValidationScriptMappingSchema = z.object({
  build: z.array(z.string().min(1)).default([]),
  typecheck: z.array(z.string().min(1)).default([]),
  lint: z.array(z.string().min(1)).default([]),
  test: z.array(z.string().min(1)).default([])
});

export const CwValidationConfigSchema = z.object({
  autoDiscover: z.boolean().default(true),
  scripts: ValidationScriptMappingSchema.default({
    build: [],
    typecheck: [],
    lint: [],
    test: []
  })
});

export const CwConfigSchema = z.object({
  version: z.literal(2),
  workers: z.array(CwWorkerConfigSchema).default([]),
  safety: CwSafetyConfigSchema.default({
    dryRun: true,
    allowWrite: false,
    allowedCommands: ["git", "node", "pnpm"]
  }),
  context: CwContextConfigSchema.default({
    strictFiles: false,
    ignoredPaths: [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".turbo",
      ".next"
    ]
  }),
  storage: CwStorageConfigSchema.default({
    engine: "sqlite",
    runs: {
      maxPerKind: 1
    },
    audit: {
      maxPerType: 3
    }
  }),
  validation: CwValidationConfigSchema.default({
    autoDiscover: true,
    scripts: {
      build: [],
      typecheck: [],
      lint: [],
      test: []
    }
  })
});

export type CwModelConfig = z.infer<typeof CwModelConfigSchema>;
export type CwWorkerConfig = z.infer<typeof CwWorkerConfigSchema>;
export type CwConfig = z.infer<typeof CwConfigSchema>;
