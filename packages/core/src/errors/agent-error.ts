export class AgentError extends Error {
  public readonly code: string;

  public readonly details?: Record<string, unknown>;

  public constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
  }
}
