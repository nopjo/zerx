import { confirm } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import { getRobloxLauncherConfig } from "./config";
import { getDeviceStatuses } from "./device-manager";
import { launchRobloxGame } from "./game-launcher";

export async function launchAssignedGames(): Promise<void> {
  const statuses = await getDeviceStatuses();
  const instancesWithGames = statuses.flatMap((device) =>
    device.instances.filter(
      (instance) => instance.assignedGame && instance.username
    )
  );

  if (instancesWithGames.length === 0) {
    Logger.warning("[!] No instances have assigned games");
    return;
  }

  const shouldLaunch = await confirm({
    message: `Launch games on ${instancesWithGames.length} instance(s)?`,
  });
  if (!shouldLaunch) return;

  const launcherConfig = getRobloxLauncherConfig();

  Logger.success("[^] Launching games...", {
    spaceBefore: true,
    spaceAfter: true,
  });
  Logger.muted(
    `Using ${launcherConfig.launchDelayMs}ms delay between launches`,
    { indent: 1 }
  );

  for (const instance of instancesWithGames) {
    const deviceStatus = statuses.find((d) => d.deviceId === instance.deviceId);
    const deviceName = deviceStatus?.deviceModel
      ? `${instance.deviceId} (${deviceStatus.deviceModel})`
      : instance.deviceId;
    const appName =
      instance.packageName === "com.roblox.client"
        ? "client"
        : instance.packageName.replace("com.roblox.", "");

    Logger.info(`[-] ${deviceName} - ${appName} (@${instance.username})`);

    if (instance.assignedGame) {
      const success = await launchRobloxGame(
        instance.deviceId,
        instance.packageName,
        instance.assignedGame
      );
      Logger.normal(
        success
          ? colors.green(`   [+] Successfully launched`)
          : colors.red(`   [X] Launch failed`),
        { indent: 1 }
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, launcherConfig.launchDelayMs)
    );
  }

  Logger.success("Launch sequence complete!", { spaceBefore: true });
}
