import { loadConfig, saveConfig } from "@/utils/config";
import {
  LAUNCHER_CONFIG_KEY,
  DEFAULT_DEVICE_TIMEOUT,
  DEFAULT_PRESENCE_CHECK_INTERVAL,
  DEFAULT_LAUNCH_DELAY_MS,
} from "./constants";
import type { RobloxLauncherConfig } from "./types";

export function getRobloxLauncherConfig(): RobloxLauncherConfig {
  const config = loadConfig();
  const launcherConfig = (config as any)[LAUNCHER_CONFIG_KEY] as
    | RobloxLauncherConfig
    | undefined;

  return {
    usernameAssignments: launcherConfig?.usernameAssignments || [],
    instanceCache: launcherConfig?.instanceCache || [],
    keepAliveInterval: launcherConfig?.keepAliveInterval || 30,
    autoRebootInterval: launcherConfig?.autoRebootInterval || 0,
    presenceCheckInterval:
      launcherConfig?.presenceCheckInterval || DEFAULT_PRESENCE_CHECK_INTERVAL,
    deviceTimeoutSeconds:
      launcherConfig?.deviceTimeoutSeconds || DEFAULT_DEVICE_TIMEOUT,
    launchDelayMs: launcherConfig?.launchDelayMs || DEFAULT_LAUNCH_DELAY_MS,
    defaultGame: launcherConfig?.defaultGame || undefined,
    gameTemplates: launcherConfig?.gameTemplates || [],
  };
}

export function saveRobloxLauncherConfig(
  launcherConfig: RobloxLauncherConfig
): void {
  const config = loadConfig();
  config[LAUNCHER_CONFIG_KEY] = launcherConfig;
  saveConfig(config);
}
