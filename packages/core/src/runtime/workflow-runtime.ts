import type {
  WorkflowDefinition,
  WorkflowDescriptor
} from "../types/workflow.js";

export class WorkflowRuntime {
  private readonly workflows = new Map<string, WorkflowDefinition<unknown, unknown>>();

  public register<Input, Output>(
    workflow: WorkflowDefinition<Input, Output>
  ): void {
    this.workflows.set(
      workflow.name,
      workflow as WorkflowDefinition<unknown, unknown>
    );
  }

  public list(): WorkflowDescriptor[] {
    return Array.from(this.workflows.values()).map((workflow) => ({
      name: workflow.name,
      description: workflow.description
    }));
  }

  public async run<Input, Output>(
    name: string,
    input: Input
  ): Promise<Output> {
    const workflow = this.workflows.get(name);

    if (!workflow) {
      throw new Error(`Unknown workflow: ${name}`);
    }

    return (await workflow.run(input)) as Output;
  }
}
