import { z } from "zod";

export const QualificationStatusSchema = z.enum(["qualified", "not-qualified"]);

export const AvailabilityStatusSchema = z.enum(["ready", "unavailable"]);

export const WorkflowStatusSchema = z.enum([
  "created",
  "running",
  "completed",
  "needs-review",
  "failed"
]);

export const ExecutionGateStatusSchema = z.enum(["allowed", "denied", "dry-run"]);

export const PatchApplyModeSchema = z.enum(["execute", "dry-run", "denied"]);

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failure",
  "skipped",
  "denied"
]);

export type QualificationStatus = z.infer<typeof QualificationStatusSchema>;
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type ExecutionGateStatus = z.infer<typeof ExecutionGateStatusSchema>;
export type PatchApplyMode = z.infer<typeof PatchApplyModeSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
