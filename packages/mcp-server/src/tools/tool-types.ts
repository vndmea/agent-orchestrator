import type { ZodObject, ZodRawShape } from "zod";

export interface AoToolDefinition<TArgs extends ZodRawShape, TResult> {
  description: string;
  execute: (
    args: ZodObject<TArgs>["_output"]
  ) => Promise<TResult> | TResult;
  inputSchema: ZodObject<TArgs>;
  name: string;
}
