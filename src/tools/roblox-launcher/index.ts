import { spinner, outro } from "@clack/prompts";
import colors from "picocolors";
import {
  BaseTool,
  type ToolResult,
  type ToolRunContext,
  ToolRegistry,
} from "@/types/tool";
import { Logger } from "@/utils/logger";
import { getDeviceStatuses } from "./device-manager";
import { displayDeviceStatuses } from "./ui-helpers";
import { assignGameToUsername } from "./assignment";
import { manageGameTemplates, setDefaultGame } from "./game-config";
import { configureAdvancedSettings } from "./settings";
import { keepAliveMode } from "./keep-alive";
import { launchAssignedGames } from "./launcher-actions";
import { select } from "@/utils/prompts";

export class RobloxLauncherTool extends BaseTool {
  constructor() {
    super({
      id: "roblox-launcher",
      label: "Roblox Launcher (Private Servers, Keep Alive & Auto-Reboot)",
      description:
        "Launch games automatically with username-based assignments, crash detection, and presence monitoring",
    });
  }

  protected override async beforeExecute(
    context?: ToolRunContext
  ): Promise<void> {
    const emulatorName =
      context?.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
    Logger.title(`[>] ${this.label}`);
    Logger.muted(`${this.description} (${emulatorName})`, { indent: 1 });
  }

  override async execute(context?: ToolRunContext): Promise<ToolResult> {
    if (!context?.emulatorType) {
      return {
        success: false,
        message: "Emulator type not specified",
      };
    }

    try {
      return await this.showMainMenu(context);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Unexpected error: ${errorMessage}`));
      return {
        success: false,
        message: `Unexpected error: ${errorMessage}`,
      };
    }
  }

  private async showMainMenu(context: ToolRunContext): Promise<ToolResult> {
    const loadingSpinner = spinner();
    loadingSpinner.start(
      colors.gray("Loading device and instance statuses...")
    );

    try {
      const statuses = await getDeviceStatuses();
      loadingSpinner.stop();
      displayDeviceStatuses(statuses);

      const action = await select({
        message: "What would you like to do?",
        options: [
          { value: "launch", label: "[^] Launch Assigned Games" },
          { value: "assign", label: "[#] Assign Game to Username" },
          { value: "templates", label: "[#] Manage Game Templates" },
          { value: "default", label: "[>] Set Default Game" },
          { value: "advanced", label: "[>] Advanced Settings" },
          { value: "keepalive", label: "[~] Keep Alive Mode" },
          { value: "refresh", label: "[~] Refresh Status" },
        ],
      });

      if (!action || typeof action === "symbol") {
        outro(colors.yellow("[!] Cancelled"));
        return {
          success: false,
          message: "Operation cancelled",
        };
      }

      return await this.handleAction(action as string, context);
    } catch (error) {
      loadingSpinner.stop();
      throw error;
    }
  }

  private async handleAction(
    action: string,
    context: ToolRunContext
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "launch":
          await launchAssignedGames();
          break;
        case "assign":
          await assignGameToUsername();
          break;
        case "templates":
          await manageGameTemplates();
          break;
        case "default":
          await setDefaultGame();
          break;
        case "advanced":
          await configureAdvancedSettings();
          break;
        case "keepalive":
          await keepAliveMode(context.emulatorType);
          break;
        case "refresh":
          return await this.showMainMenu(context);
        default:
          return {
            success: false,
            message: `Unknown action: ${action}`,
          };
      }

      outro(colors.cyan("[*] Operation complete"));
      return {
        success: true,
        message: `${action} completed successfully`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error during ${action}: ${errorMessage}`));
      return {
        success: false,
        message: `Error during ${action}: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new RobloxLauncherTool());
