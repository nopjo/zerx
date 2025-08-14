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

  launcherConfig.deviceTimeoutSeconds = parseInt(deviceTimeoutText);
  launcherConfig.presenceCheckInterval = parseInt(presenceCheckText);
  saveRobloxLauncherConfig(launcherConfig);

  Logger.success("[+] Advanced settings saved!");
}
