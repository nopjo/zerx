import { outro, spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import {
  BaseTool,
  type ToolResult,
  type ToolRunContext,
  ToolRegistry,
} from "@/types/tool";
import { getEmulatorService } from "@/utils/emu/abstraction";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

export class ArrangeWindows extends BaseTool {
  constructor() {
    super({
      id: "arrange-windows",
      label: "Arrange Windows (Auto-arrange All Emulator Windows On Screen)",
      description: "Automatically arrange all emulator windows on screen",
    });
  }

  protected override async beforeExecute(
    context?: ToolRunContext
  ): Promise<void> {
    const emulatorName =
      context?.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
    Logger.title(`[>] Arrange ${emulatorName} Windows`);
    Logger.muted("Automatically arrange all emulator windows on screen", {
      indent: 1,
    });
  }

  override async execute(context?: ToolRunContext): Promise<ToolResult> {
    if (!context?.emulatorType) {
      return {
        success: false,
        message: "Emulator type not specified",
      };
    }

    const emulatorService = getEmulatorService(context.emulatorType);
    const emulatorName =
      context.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";

    const emulatorPath = await emulatorService.getPath();

    if (!emulatorPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: `${emulatorName} path not found or operation cancelled`,
      };
    }

    const arrangeSpinner = spinner();
    arrangeSpinner.start(colors.gray(`Arranging ${emulatorName} windows...`));

    try {
      let command: string;

      if (context.emulatorType === "ldplayer") {
        command = `"${emulatorPath}" sortwnd`;
      } else {
        command = `"${emulatorPath}" sort`;
      }

      await execAsync(command);
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
