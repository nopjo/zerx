import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { DeviceStatus } from "./types";

export function displayDeviceStatuses(statuses: DeviceStatus[]): void {
  Logger.title("[>] Device & Instance Status");

  if (statuses.length === 0) {
    Logger.warning("[-] No devices found");
    return;
  }

  let totalInstances = 0;

  for (const status of statuses) {
    const deviceName = status.deviceModel
      ? `${status.deviceId} (${status.deviceModel})`
      : status.deviceId;

    const responsiveStatus = status.isResponsive
      ? colors.green("[+] Responsive")
      : colors.red("[X] Unresponsive");

    Logger.info(
      `[-] ${deviceName}: ${status.instances.length} instance(s) - ${responsiveStatus}`
    );

    for (const instance of status.instances) {
      const appName =
        instance.packageName === "com.roblox.client"
          ? "client"
          : instance.packageName.replace("com.roblox.", "");
      const robloxStatus = instance.isRobloxRunning
        ? colors.green("[+] Running")
        : colors.red("[X] Stopped");
      const username = instance.username
        ? colors.blue(`@${instance.username}`)
        : colors.gray("No user");
      const gameInfo = instance.assignedGame
        ? instance.assignedGame.gameName ||
          instance.assignedGame.gameId ||
          "Private Server"
        : colors.gray("No game assigned");

      const presenceInfo =
        instance.isInGame !== undefined
          ? instance.isInGame
            ? colors.green("[+] In Game")
            : colors.yellow("[X] Not In Game")
          : "";

      Logger.normal(`└── ${colors.white(appName)}`, { indent: 1 });
      Logger.muted(`Roblox: ${robloxStatus}`, { indent: 2 });
      Logger.muted(`User: ${username}`, { indent: 2 });
      Logger.muted(`Game: ${colors.cyan(gameInfo)}`, { indent: 2 });
      if (presenceInfo) {
        Logger.muted(`Presence: ${presenceInfo}`, { indent: 2 });
      }
      Logger.space();
      totalInstances++;
    }
  }

  Logger.info(
    `Total instances across all devices: ${colors.bold(totalInstances.toString())}`
  );
}
