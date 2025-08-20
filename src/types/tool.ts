import { TOOL_ORDER } from "@/constants";

export type EmulatorType = "ldplayer" | "mumu";

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

export interface ToolRunContext {
  emulatorType?: EmulatorType;
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

  abstract execute(context?: ToolRunContext): Promise<ToolResult>;

  protected async beforeExecute(context?: ToolRunContext): Promise<void> {}

  protected async afterExecute(
    result: ToolResult,
    context?: ToolRunContext
  ): Promise<void> {}

  async run(context?: ToolRunContext): Promise<ToolResult> {
    try {
      await this.beforeExecute(context);
      const result = await this.execute(context);
      await this.afterExecute(result, context);
      return result;
    } catch (error) {
      const errorResult: ToolResult = {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
      await this.afterExecute(errorResult, context);
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
