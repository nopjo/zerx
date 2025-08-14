import { TOOL_ORDER } from "@/constants";

export interface ToolConfig {
  id: string;
  label: string;
  description?: string;
}

export interface ToolResult {
  success: boolean;
  message?: string;
  data?: any;
}

export abstract class BaseTool {
  protected config: ToolConfig;

  constructor(config: ToolConfig) {
    this.config = config;
  }

  get id(): string {
    return this.config.id;
  }

  get label(): string {
    return this.config.label;
  }

  get description(): string {
    return this.config.description || "";
  }

  abstract execute(): Promise<ToolResult>;

  protected async beforeExecute(): Promise<void> {}

  protected async afterExecute(result: ToolResult): Promise<void> {}

  async run(): Promise<ToolResult> {
    try {
      await this.beforeExecute();
      const result = await this.execute();
      await this.afterExecute(result);
      return result;
    } catch (error) {
      const errorResult: ToolResult = {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
      await this.afterExecute(errorResult);
      return errorResult;
    }
  }
}

export class ToolRegistry {
  private static tools: Map<string, BaseTool> = new Map();

  static register(tool: BaseTool): void {
    this.tools.set(tool.id, tool);
  }

  static get(id: string): BaseTool | undefined {
    return this.tools.get(id);
  }

  static getAll(): BaseTool[] {
    return TOOL_ORDER.map((id) => this.tools.get(id)!).filter(Boolean);
  }
}
