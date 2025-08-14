import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { InstanceWithUser } from "./types";

export function printInstancesWithUsers(instances: InstanceWithUser[]): void {
  Logger.title("[-] Roblox Instances:");

  const deviceGroups = new Map<string, InstanceWithUser[]>();
  instances.forEach((instance) => {
    const deviceKey = `${instance.deviceId}${
      instance.deviceModel ? ` (${instance.deviceModel})` : ""
    }`;
    if (!deviceGroups.has(deviceKey)) {
      deviceGroups.set(deviceKey, []);
    }
    deviceGroups.get(deviceKey)!.push(instance);
  });

  for (const [deviceName, deviceInstances] of deviceGroups) {
    const runningCount = deviceInstances.filter((i) => i.isRunning).length;
    Logger.success(
      `[-] ${deviceName}: ${deviceInstances.length} instance(s) - ${runningCount} running`,
      { indent: 1 }
    );

    deviceInstances.forEach((instance) => {
      const appName =
        instance.packageName === "com.roblox.client"
          ? "client"
          : instance.packageName.replace("com.roblox.", "");

      const statusIcon = instance.isRunning ? "[+]" : "[-]";
      const userInfo = instance.username
        ? colors.blue(`@${instance.username}`)
        : colors.gray(instance.isRunning ? "Running (no user)" : "Not running");

      Logger.muted(`└── ${statusIcon} ${appName} - ${userInfo}`, { indent: 2 });
    });
  }

  const totalRunning = instances.filter((i) => i.isRunning).length;
  Logger.info(
    `Total instances: ${instances.length} (${totalRunning} running)`,
    { spaceBefore: true }
  );
}
