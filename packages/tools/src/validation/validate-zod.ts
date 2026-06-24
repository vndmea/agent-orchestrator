import type { ZodType } from "zod";

export const validateWithZod = <T>(schema: ZodType<T>, value: unknown): T =>
  schema.parse(value);
