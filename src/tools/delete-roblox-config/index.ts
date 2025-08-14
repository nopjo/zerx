import { confirm, outro } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { Logger } from "@/utils/logger";
import { analyzeConfig, getConfig } from "./config-analysis";
import { displayConfigAnalysis } from "./config-display";
import { getDeleteOption, getConfirmationMessage } from "./deletion-selection";
import { executeConfigDeletion, saveConfigChanges } from "./config-deletion";
import type { ConfigAnalysis, DeleteOption, DeletionResult } from "./types";

export class DeleteConfigTool extends BaseTool {
  constructor() {
    super({
      id: "delete-roblox-config",
      label: "Delete Roblox Launcher Configuration (Reset All Settings)",
      description: "Remove saved device assignments, templates, and settings",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[X] ${this.label}`);
    Logger.muted(this.description, {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const analysis = this.analyzeConfiguration();
      if (!analysis.success) return analysis;

      if (!analysis.data!.configExists) {
        Logger.warning("[!] No Roblox launcher configuration found");
        return {
          success: true,
          message: "No configuration found to delete",
          data: { itemsDeleted: 0, description: "No configuration found" },
        };
      }

      const selection = await this.getDeleteSelection(analysis.data!);
      if (!selection.success) return selection;

      const confirmed = await this.confirmDeletion(
        selection.data!,
        analysis.data!
      );
      if (!confirmed.success) return confirmed;

      return this.executeDeletion(selection.data!, analysis.data!);
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

  private analyzeConfiguration(): ToolResult & { data?: ConfigAnalysis } {
    try {
      const analysis = analyzeConfig();

      if (analysis.configExists) {
        displayConfigAnalysis(analysis);
      }

      return {
        success: true,
        message: analysis.configExists
          ? "Configuration analyzed"
          : "No configuration found",
        data: analysis,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to analyze configuration: ${errorMessage}`,
      };
    }
  }

  private async getDeleteSelection(
    analysis: ConfigAnalysis
  ): Promise<ToolResult & { data?: DeleteOption }> {
    const deleteOption = await getDeleteOption();

    if (!deleteOption || deleteOption === "cancel") {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no deletion option selected",
      };
    }

    return {
      success: true,
      message: `Selected deletion option: ${deleteOption}`,
      data: deleteOption,
    };
  }

  private async confirmDeletion(
    option: DeleteOption,
    analysis: ConfigAnalysis
  ): Promise<ToolResult> {
    const confirmMessage = getConfirmationMessage(
      option,
      analysis.deviceCount,
      analysis.templateCount
    );

    const shouldDelete = await confirm({
      message: colors.red(confirmMessage),
    });

    if (!shouldDelete) {
      Logger.warning("[!] Deletion cancelled");
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Deletion cancelled by user",
      };
    }

    return {
      success: true,
      message: "Deletion confirmed",
    };
  }

  private executeDeletion(
    option: DeleteOption,
    analysis: ConfigAnalysis
  ): ToolResult {
    try {
      const config = getConfig();
      const result = executeConfigDeletion(config, option, analysis);

      if (result.itemsDeleted > 0) {
        saveConfigChanges(config);
        Logger.info("Configuration cleanup complete!", { spaceBefore: true });

        return {
          success: true,
          message: result.description,
          data: {
            option: result.option,
            itemsDeleted: result.itemsDeleted,
            description: result.description,
          },
        };
      } else {
        Logger.warning("[!] No changes were made");
        return {
          success: true,
          message: "No changes were made",
          data: {
            option: result.option,
            itemsDeleted: 0,
            description: "No changes made",
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Logger.error(`[X] Failed to delete configuration: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to delete configuration: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new DeleteConfigTool());
