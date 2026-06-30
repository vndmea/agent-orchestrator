export interface SafetyPolicyOptions {
  allowedCommands: string[];
  dryRun: boolean;
}

export type CommandKind = "read-only" | "mutating";

export interface CommandEvaluation {
  allowed: boolean;
  reason: string;
  command: string;
  mode: "execute" | "dry-run" | "blocked";
  readOnly?: boolean;
  dryRunContext?: boolean;
}

const DEFAULT_ALLOWED_COMMANDS = ["git", "node", "pnpm"];
const DANGEROUS_COMMANDS = new Set([
  "rm",
  "curl",
  "wget",
  "ssh",
  "scp",
  "chmod",
  "chown",
  "sudo",
  "powershell",
  "cmd"
]);
const METACHARACTER_PATTERN = /&&|\|\||;|\||`|\$\(|>>|>|</u;
const SAFE_GIT_TOKEN = /^[A-Za-z0-9._~/:@+\-=\\]+$/u;

const areSafeGitTokens = (tokens: string[]): boolean =>
  tokens.every((token) => SAFE_GIT_TOKEN.test(token));

const isAllowedReadOnlyGitCommand = (parts: string[]): boolean => {
  if (parts[0] !== "git") {
    return false;
  }

  const subcommand = parts[1];
  const args = parts.slice(2);

  switch (subcommand) {
    case "diff":
      return args.every((arg) => arg === "--no-ext-diff" || SAFE_GIT_TOKEN.test(arg));
    case "status":
      return args.length === 0 || args.every((arg) => arg === "--short");
    case "ls-files":
      return areSafeGitTokens(args);
    case "rev-parse":
      return areSafeGitTokens(args);
    case "show":
      return args[0] === "--stat" && areSafeGitTokens(args.slice(1));
    case "log":
      return args[0] === "--oneline" && areSafeGitTokens(args.slice(1));
    case "apply":
      return args.length === 3 &&
        args[0] === "--check" &&
        args[1] === "--verbose" &&
        args[2] === "-";
    default:
      return false;
  }
};

export class SafetyPolicy {
  private readonly allowedCommands: Set<string>;

  public readonly dryRun: boolean;

  public constructor(options: Partial<SafetyPolicyOptions> = {}) {
    const commands = options.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS;
    this.allowedCommands = new Set(commands.map((command) => command.trim()));
    this.dryRun = options.dryRun ?? true;
  }

  public evaluateCommand(
    command: string,
    commandKind: CommandKind = "mutating"
  ): CommandEvaluation {
    const parts = command.trim().split(/\s+/u).filter(Boolean);
    const baseCommand = parts[0] ?? "";

    if (!baseCommand) {
      return {
        allowed: false,
        reason: "Command is empty.",
        command,
        mode: "blocked"
      };
    }

    if (METACHARACTER_PATTERN.test(command)) {
      return {
        allowed: false,
        reason: "Command contains blocked shell metacharacters or chaining.",
        command,
        mode: "blocked"
      };
    }

    if (DANGEROUS_COMMANDS.has(baseCommand.toLowerCase())) {
      return {
        allowed: false,
        reason: `Command "${baseCommand}" is blocked as dangerous.`,
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

    if (commandKind === "read-only" && !isAllowedReadOnlyGitCommand(parts)) {
      return {
        allowed: false,
        reason: `Command "${command}" is not in the read-only allowlist.`,
        command,
        mode: "blocked"
      };
    }

    if (commandKind === "read-only") {
      return {
        allowed: true,
        reason: this.dryRun
          ? "Read-only command is allowed to execute during dry-run."
          : "Read-only command is allowed.",
        command,
        mode: "execute",
        readOnly: true,
        dryRunContext: this.dryRun
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
