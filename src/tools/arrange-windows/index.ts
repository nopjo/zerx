import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getLDPlayerPath } from "@/utils/ld";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

export class ArrangeWindows extends BaseTool {
  constructor() {
    super({
      id: "arrange-windows",
      label: "Arrange Windows (Auto-arrange All LDPlayer Windows On Screen)",
      description: "Automatically arrange all emulator windows on screen",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title("[>] Arrange LDPlayer Windows");
    Logger.muted("Automatically arrange all emulator windows on screen", {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    const ldPath = await getLDPlayerPath();

    if (!ldPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "LDPlayer path not found or operation cancelled",
      };
    }

    const shouldProceed = await confirm({
      message: "Arrange all LDPlayer windows on screen?",
    });

    if (!shouldProceed) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled by user",
      };
    }

    const arrangeSpinner = spinner();
    arrangeSpinner.start(colors.gray("Arranging LDPlayer windows..."));

    try {
      await execAsync(`"${ldPath}" sortwnd`);
      arrangeSpinner.stop(colors.green("[+] Windows arranged successfully!"));

      return {
        success: true,
        message: "Windows arranged successfully!",
      };
    } catch (error) {
      arrangeSpinner.stop(colors.red("[X] Failed to arrange windows"));

      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to arrange windows",
      };
    }
  }
}

ToolRegistry.register(new ArrangeWindows());
