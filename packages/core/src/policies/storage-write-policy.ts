export type StorageWriteDomain =
  | "audit-write"
  | "benchmark-write"
  | "config-write"
  | "profile-write"
  | "secret-write"
  | "session-write";

export interface StorageWritePolicyOptions {
  allowWrite: boolean;
  dryRun: boolean;
}

export interface StorageWriteEvaluation {
  allowed: boolean;
  domain: StorageWriteDomain;
  mode: "blocked" | "dry-run" | "execute";
  reason: string;
}

const DOMAIN_REQUIRES_GENERAL_WRITE = new Set<StorageWriteDomain>([
  "benchmark-write",
  "config-write",
  "profile-write",
  "secret-write"
]);

export class StorageWritePolicy {
  public readonly allowWrite: boolean;

  public readonly dryRun: boolean;

  public constructor(options: Partial<StorageWritePolicyOptions> = {}) {
    this.allowWrite = options.allowWrite ?? false;
    this.dryRun = options.dryRun ?? true;
  }

  public evaluate(
    domain: StorageWriteDomain,
    explicitAllowWrite = false
  ): StorageWriteEvaluation {
    const requiresGeneralWrite = DOMAIN_REQUIRES_GENERAL_WRITE.has(domain);
    const isSessionOrAudit =
      domain === "session-write" || domain === "audit-write";

    if (requiresGeneralWrite && !explicitAllowWrite && !this.allowWrite) {
      return {
        allowed: false,
        domain,
        mode: "blocked",
        reason: `${domain} requires explicit managed-state write permission.`
      };
    }

    if (isSessionOrAudit && !explicitAllowWrite) {
      return {
        allowed: true,
        domain,
        mode: "dry-run",
        reason: `${domain} is dry-run until the command explicitly enables that storage domain.`
      };
    }

    if (this.dryRun) {
      return {
        allowed: true,
        domain,
        mode: "dry-run",
        reason: `${domain} is dry-run because the execution context is in dry-run mode.`
      };
    }

    return {
      allowed: true,
      domain,
      mode: "execute",
      reason: `${domain} is allowed to persist managed state.`
    };
  }
}
