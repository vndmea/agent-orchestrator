export interface SafetyPolicyOptions {
  allowedCommands: string[];
  dryRun: boolean;
}

export interface CommandEvaluation {
  allowed: boolean;
  reason: string;
  command: string;
  mode: "execute" | "dry-run" | "blocked";
}

const DEFAULT_ALLOWED_COMMANDS = ["git", "node", "pnpm"];

export class SafetyPolicy {
  private readonly allowedCommands: Set<string>;

  public readonly dryRun: boolean;

  public constructor(options: Partial<SafetyPolicyOptions> = {}) {
    const commands = options.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS;
    this.allowedCommands = new Set(commands.map((command) => command.trim()));
    this.dryRun = options.dryRun ?? true;
  }

  public evaluateCommand(command: string): CommandEvaluation {
    const baseCommand = command.trim().split(/\s+/u)[0] ?? "";

    if (!baseCommand) {
      return {
        allowed: false,
        reason: "Command is empty.",
        command,
        mode: "blocked"
      };
    }

    if (!this.allowedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `Command "${baseCommand}" is not in the allowlist.`,
        command,
        mode: "blocked"
      };
    }

    if (this.dryRun) {
      return {
        allowed: true,
        reason: "Dry-run mode is active.",
        command,
        mode: "dry-run"
      };
    }

    return {
      allowed: true,
      reason: "Command is allowed.",
      command,
      mode: "execute"
    };
  }
}
