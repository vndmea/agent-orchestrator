import type {
  AgentResult,
  AgentTask,
  ExecutionContext,
  WorkerCapability
} from "@agent-orchestrator/core";
import { ModelRouter } from "@agent-orchestrator/models";

export interface WorkerExecutionInput {
  notes?: string[];
  scope?: string;
  task: AgentTask;
}

export abstract class WorkerAgent {
  protected readonly router: ModelRouter;

  public constructor(
    protected readonly context: ExecutionContext,
    public readonly capability: WorkerCapability
  ) {
    this.router = new ModelRouter(context.leaderModel, context.workerModel);
  }

  public abstract execute(input: WorkerExecutionInput): Promise<AgentResult>;

  protected async createResult(
    agentId: string,
    task: AgentTask,
    output: unknown,
    risks: string[],
    confidence: number,
    artifacts: AgentResult["artifacts"] = []
  ): Promise<AgentResult> {
    const routed = this.router.route("worker");

    await routed.provider.invoke(routed.config, {
      prompt: `Support task: ${task.goal}`,
      responseFormat: "json",
      mockResponse: output,
      metadata: {
        taskId: task.id,
        capability: this.capability.name
      }
    });

    return {
      taskId: task.id,
      agentId,
      role: "worker",
      status: risks.length > 0 ? "needs_review" : "success",
      output,
      confidence,
      risks,
      artifacts,
      metadata: {
        capability: this.capability.name
      }
    };
  }
}
