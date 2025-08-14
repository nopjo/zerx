import { saveConfig } from "@/utils/config";
import { Logger } from "@/utils/logger";
import { LAUNCHER_CONFIG_KEY } from "./config-analysis";
import type { DeleteOption, DeletionResult, ConfigAnalysis } from "./types";

export function executeConfigDeletion(
  config: any,
  option: DeleteOption,
  analysis: ConfigAnalysis
): DeletionResult {
  const launcherConfig = config[LAUNCHER_CONFIG_KEY];

  switch (option) {
    case "all":
      delete config[LAUNCHER_CONFIG_KEY];
      Logger.success("[+] All Roblox launcher configuration deleted");
      return {
        option,
        itemsDeleted: 1,
        description: "All Roblox launcher configuration deleted",
      };

    case "assignments":
      if (launcherConfig?.deviceAssignments) {
        const deletedCount = launcherConfig.deviceAssignments.length;
        launcherConfig.deviceAssignments = [];
        Logger.success(`[+] ${deletedCount} device assignments deleted`);
        config[LAUNCHER_CONFIG_KEY] = launcherConfig;
        return {
          option,
          itemsDeleted: deletedCount,
          description: `${deletedCount} device assignments deleted`,
        };
      }
      break;

    case "templates":
      if (launcherConfig?.gameTemplates) {
        const deletedCount = launcherConfig.gameTemplates.length;
        launcherConfig.gameTemplates = [];
        Logger.success(`[+] ${deletedCount} game templates deleted`);
        config[LAUNCHER_CONFIG_KEY] = launcherConfig;
        return {
          option,
          itemsDeleted: deletedCount,
          description: `${deletedCount} game templates deleted`,
        };
      }
      break;

    case "default":
      if (launcherConfig?.defaultGame) {
        delete launcherConfig.defaultGame;
        Logger.success("[+] Default game setting deleted");
        config[LAUNCHER_CONFIG_KEY] = launcherConfig;
        return {
          option,
          itemsDeleted: 1,
          description: "Default game setting deleted",
        };
      }
      break;

    case "keepalive":
      if (
        launcherConfig?.keepAliveInterval ||
        launcherConfig?.autoRebootInterval
      ) {
        launcherConfig.keepAliveInterval = 30;
        launcherConfig.autoRebootInterval = 0;
        Logger.success("[+] Keep alive settings reset to defaults");
        config[LAUNCHER_CONFIG_KEY] = launcherConfig;
        return {
          option,
          itemsDeleted: 1,
          description: "Keep alive settings reset to defaults",
        };
      }
      break;
  }

  return {
    option,
    itemsDeleted: 0,
    description: "No changes made",
  };
}

export function saveConfigChanges(config: any): void {
  saveConfig(config);
}
