import { loadConfig } from "@/utils/config";
import type { ConfigAnalysis } from "./types";

const LAUNCHER_CONFIG_KEY = "robloxLauncher";

export function analyzeConfig(): ConfigAnalysis {
  const config = loadConfig();
  const launcherConfig = config[LAUNCHER_CONFIG_KEY];

  if (!launcherConfig) {
    return {
      deviceCount: 0,
      templateCount: 0,
      hasDefaultGame: false,
      hasKeepAliveSettings: false,
      configExists: false,
    };
  }

  const deviceCount = launcherConfig.deviceAssignments?.length || 0;
  const templateCount = launcherConfig.gameTemplates?.length || 0;
  const hasDefaultGame = !!launcherConfig.defaultGame;
  const hasKeepAliveSettings = !!(
    launcherConfig.keepAliveInterval || launcherConfig.autoRebootInterval
  );

  return {
    deviceCount,
    templateCount,
    hasDefaultGame,
    hasKeepAliveSettings,
    configExists: true,
  };
}

export function getConfig() {
  return loadConfig();
}

export function getLauncherConfig() {
  const config = loadConfig();
  return config[LAUNCHER_CONFIG_KEY];
}

export { LAUNCHER_CONFIG_KEY };
