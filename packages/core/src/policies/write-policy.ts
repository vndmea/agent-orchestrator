export interface WritePolicyOptions {
  allowWrite: boolean;
  dryRun: boolean;
}

export interface WriteEvaluation {
  allowed: boolean;
  path: string;
  reason: string;
  mode: "execute" | "dry-run";
}

export class WritePolicy {
  public readonly allowWrite: boolean;

  public readonly dryRun: boolean;

  public constructor(options: Partial<WritePolicyOptions> = {}) {
    this.allowWrite = options.allowWrite ?? false;
    this.dryRun = options.dryRun ?? true;
  }

  public evaluate(path: string, explicitAllowWrite = false): WriteEvaluation {
    if (this.allowWrite || explicitAllowWrite) {
      return {
        allowed: true,
        path,
        reason: "Write is allowed by policy.",
        mode: "execute"
      };
    }

    return {
      allowed: true,
      path,
      reason: "Write blocked by default; returning dry-run result instead.",
      mode: "dry-run"
    };
  }
}
