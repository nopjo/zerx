import { confirm, outro, select } from "@clack/prompts";
import colors from "picocolors";
import { loadConfig, saveConfig } from "@/utils/config";

const LAUNCHER_CONFIG_KEY = "robloxLauncher";

export async function deleteRobloxConfig(): Promise<void> {
  console.log();
  console.log(
    colors.cyan("[X] " + colors.bold("Delete Roblox Launcher Configuration"))
  );
  console.log(
    colors.gray("   Remove saved device assignments, templates, and settings")
  );
  console.log();

  const config = loadConfig();
  const launcherConfig = config[LAUNCHER_CONFIG_KEY];

  if (!launcherConfig) {
    console.log(colors.yellow("[!] No Roblox launcher configuration found"));
    return;
  }

  const deviceCount = launcherConfig.deviceAssignments?.length || 0;
  const templateCount = launcherConfig.gameTemplates?.length || 0;
  const hasDefaultGame = !!launcherConfig.defaultGame;
  const hasKeepAliveSettings = !!(
    launcherConfig.keepAliveInterval || launcherConfig.autoRebootInterval
  );

  console.log(colors.cyan("[#] Current Configuration:"));
  console.log(colors.white(`   Device Assignments: ${deviceCount}`));
  console.log(colors.white(`   Game Templates: ${templateCount}`));
  console.log(
    colors.white(`   Default Game: ${hasDefaultGame ? "Yes" : "No"}`)
  );
  console.log(
    colors.white(
      `   Keep Alive Settings: ${hasKeepAliveSettings ? "Yes" : "No"}`
    )
  );
  console.log();

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
    console.log(colors.yellow("[!] Deletion cancelled"));
    return;
  }

  switch (deleteOption) {
    case "all":
      delete config[LAUNCHER_CONFIG_KEY];
      console.log(
        colors.green("[+] All Roblox launcher configuration deleted")
      );
      break;

    case "assignments":
      if (launcherConfig.deviceAssignments) {
        launcherConfig.deviceAssignments = [];
        console.log(
          colors.green(`[+] ${deviceCount} device assignments deleted`)
        );
      }
      break;

    case "templates":
      if (launcherConfig.gameTemplates) {
        launcherConfig.gameTemplates = [];
        console.log(
          colors.green(`[+] ${templateCount} game templates deleted`)
        );
      }
      break;

    case "default":
      if (launcherConfig.defaultGame) {
        delete launcherConfig.defaultGame;
        console.log(colors.green("[+] Default game setting deleted"));
      }
      break;

    case "keepalive":
      if (
        launcherConfig.keepAliveInterval ||
        launcherConfig.autoRebootInterval
      ) {
        launcherConfig.keepAliveInterval = 30;
        launcherConfig.autoRebootInterval = 0;
        console.log(colors.green("[+] Keep alive settings reset to defaults"));
      }
      break;
  }

  if (deleteOption !== "all") {
    config[LAUNCHER_CONFIG_KEY] = launcherConfig;
  }

  saveConfig(config);

  console.log();
  console.log(colors.cyan("Configuration cleanup complete!"));
}
