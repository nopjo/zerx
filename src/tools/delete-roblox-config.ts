import { confirm, outro, select } from "@clack/prompts";
import colors from "picocolors";
import { loadConfig, saveConfig } from "@/utils/config";
import { Logger } from "@/utils/logger";

const LAUNCHER_CONFIG_KEY = "robloxLauncher";

export async function deleteRobloxConfig(): Promise<void> {
  Logger.title("[X] Delete Roblox Launcher Configuration");
  Logger.muted("Remove saved device assignments, templates, and settings", {
    indent: 1,
  });

  const config = loadConfig();
  const launcherConfig = config[LAUNCHER_CONFIG_KEY];

  if (!launcherConfig) {
    Logger.warning("[!] No Roblox launcher configuration found");
    return;
  }

  const deviceCount = launcherConfig.deviceAssignments?.length || 0;
  const templateCount = launcherConfig.gameTemplates?.length || 0;
  const hasDefaultGame = !!launcherConfig.defaultGame;
  const hasKeepAliveSettings = !!(
    launcherConfig.keepAliveInterval || launcherConfig.autoRebootInterval
  );

  Logger.info("[#] Current Configuration:");
  Logger.normal(`Device Assignments: ${deviceCount}`, { indent: 1 });
  Logger.normal(`Game Templates: ${templateCount}`, { indent: 1 });
  Logger.normal(`Default Game: ${hasDefaultGame ? "Yes" : "No"}`, {
    indent: 1,
  });
  Logger.normal(`Keep Alive Settings: ${hasKeepAliveSettings ? "Yes" : "No"}`, {
    indent: 1,
  });

  const deleteOption = await select({
    message: "What would you like to delete?",
    options: [
      { value: "all", label: "[X] Delete Everything (Complete Reset)" },
      { value: "assignments", label: "[-] Delete Device Assignments Only" },
      { value: "templates", label: "[#] Delete Game Templates Only" },
      { value: "default", label: "[>] Delete Default Game Only" },
      { value: "keepalive", label: "[~] Delete Keep Alive Settings Only" },
      { value: "cancel", label: "[!] Cancel" },
    ],
  });

  if (
    !deleteOption ||
    typeof deleteOption === "symbol" ||
    deleteOption === "cancel"
  ) {
    return;
  }

  let confirmMessage = "";
  switch (deleteOption) {
    case "all":
      confirmMessage =
        "Delete ALL Roblox launcher configuration? This cannot be undone!";
      break;
    case "assignments":
      confirmMessage = `Delete all ${deviceCount} device assignments?`;
      break;
    case "templates":
      confirmMessage = `Delete all ${templateCount} game templates?`;
      break;
    case "default":
      confirmMessage = "Delete the default game setting?";
      break;
    case "keepalive":
      confirmMessage = "Delete keep alive and auto-reboot settings?";
      break;
  }

  const shouldDelete = await confirm({
    message: colors.red(confirmMessage),
  });

  if (!shouldDelete) {
    Logger.warning("[!] Deletion cancelled");
    return;
  }

  switch (deleteOption) {
    case "all":
      delete config[LAUNCHER_CONFIG_KEY];
      Logger.success("[+] All Roblox launcher configuration deleted");
      break;

    case "assignments":
      if (launcherConfig.deviceAssignments) {
        launcherConfig.deviceAssignments = [];
        Logger.success(`[+] ${deviceCount} device assignments deleted`);
      }
      break;

    case "templates":
      if (launcherConfig.gameTemplates) {
        launcherConfig.gameTemplates = [];
        Logger.success(`[+] ${templateCount} game templates deleted`);
      }
      break;

    case "default":
      if (launcherConfig.defaultGame) {
        delete launcherConfig.defaultGame;
        Logger.success("[+] Default game setting deleted");
      }
      break;

    case "keepalive":
      if (
        launcherConfig.keepAliveInterval ||
        launcherConfig.autoRebootInterval
      ) {
        launcherConfig.keepAliveInterval = 30;
        launcherConfig.autoRebootInterval = 0;
        Logger.success("[+] Keep alive settings reset to defaults");
      }
      break;
  }

  if (deleteOption !== "all") {
    config[LAUNCHER_CONFIG_KEY] = launcherConfig;
  }

  saveConfig(config);

  Logger.info("Configuration cleanup complete!", { spaceBefore: true });
}
