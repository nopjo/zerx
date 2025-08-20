import { text } from "@clack/prompts";
import { Logger } from "@/utils/logger";
import { getRobloxLauncherConfig, saveRobloxLauncherConfig } from "./config";

export async function configureAdvancedSettings(): Promise<void> {
  const launcherConfig = getRobloxLauncherConfig();

  Logger.title("[>] Advanced Settings");

  const deviceTimeoutText = await text({
    message: "Device timeout (seconds):",
    placeholder: launcherConfig.deviceTimeoutSeconds.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 5 || num > 60
        ? "Enter a number between 5 and 60 seconds"
        : undefined;
    },
  });

  if (!deviceTimeoutText || typeof deviceTimeoutText === "symbol") return;

  const presenceCheckText = await text({
    message: "Presence check interval (minutes):",
    placeholder: launcherConfig.presenceCheckInterval.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1 || num > 30
        ? "Enter a number between 1 and 30 minutes"
        : undefined;
    },
  });

  if (!presenceCheckText || typeof presenceCheckText === "symbol") return;

  const launchDelayText = await text({
    message: "Launch delay between games (milliseconds):",
    placeholder: launcherConfig.launchDelayMs.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1000 || num > 60000
        ? "Enter a number between 1000 and 60000 milliseconds (1-60 seconds)"
        : undefined;
    },
  });

  if (!launchDelayText || typeof launchDelayText === "symbol") return;

  launcherConfig.deviceTimeoutSeconds = parseInt(deviceTimeoutText);
  launcherConfig.presenceCheckInterval = parseInt(presenceCheckText);
  launcherConfig.launchDelayMs = parseInt(launchDelayText);
  saveRobloxLauncherConfig(launcherConfig);

  Logger.success("[+] Advanced settings saved!");
  Logger.muted(`Device timeout: ${launcherConfig.deviceTimeoutSeconds}s`, {
    indent: 1,
  });
  Logger.muted(`Presence check: ${launcherConfig.presenceCheckInterval}m`, {
    indent: 1,
  });
  Logger.muted(`Launch delay: ${launcherConfig.launchDelayMs}ms`, {
    indent: 1,
  });
}
