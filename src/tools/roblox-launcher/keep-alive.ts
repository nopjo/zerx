import { text, confirm } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import { rebootAllEmulatorInstances } from "@/utils/emu/abstraction";
import type { EmulatorType } from "@/types/tool";
import { getRobloxLauncherConfig, saveRobloxLauncherConfig } from "./config";
import { getDeviceStatuses, rebootDevice } from "./device-manager";
import { checkPresenceForInstances } from "./presence";
import { launchRobloxGame } from "./game-launcher";

export async function keepAliveMode(
  emulatorType: EmulatorType = "ldplayer"
): Promise<void> {
  const launcherConfig = getRobloxLauncherConfig();
  const emulatorName = emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";

  Logger.title(`[~] Keep Alive Mode Configuration (${emulatorName})`);
  Logger.muted(
    "Set up automatic monitoring with crash detection and presence checking",
    { indent: 1 }
  );

  const intervalText = await text({
    message: "Check interval (seconds):",
    placeholder: launcherConfig.keepAliveInterval.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 10 || num > 300
        ? "Enter a number between 10 and 300 seconds"
        : undefined;
    },
  });

  if (!intervalText || typeof intervalText === "symbol") return;

  const enableAutoReboot = await confirm({
    message: `Enable auto-reboot of ${emulatorName} instances every 3 hours? (Prevents memory issues)`,
  });

  let autoRebootHours = 0;
  if (enableAutoReboot) {
    const rebootIntervalText = await text({
      message: "Auto-reboot interval (hours):",
      placeholder: "3",
      validate: (value) => {
        const num = parseInt(value);
        return isNaN(num) || num < 1 || num > 24
          ? "Enter a number between 1 and 24 hours"
          : undefined;
      },
    });

    if (!rebootIntervalText || typeof rebootIntervalText === "symbol") return;
    autoRebootHours = parseInt(rebootIntervalText);
  }

  const enablePresenceCheck = await confirm({
    message:
      "Enable Roblox presence checking? (Detects if players are actually in-game)",
  });

  const interval = parseInt(intervalText) * 1000;
  launcherConfig.keepAliveInterval = interval / 1000;
  launcherConfig.autoRebootInterval = autoRebootHours;
  saveRobloxLauncherConfig(launcherConfig);

  Logger.success(`[~] Keep Alive Mode Started (${emulatorName})`, {
    spaceBefore: true,
  });
  Logger.muted(`Checking every ${interval / 1000} seconds...`, { indent: 1 });
  if (autoRebootHours > 0) {
    Logger.muted(
      `Auto-rebooting ${emulatorName} every ${autoRebootHours} hours`,
      {
        indent: 1,
      }
    );
  }
  if (enablePresenceCheck) {
    Logger.muted(
      `Presence checking every ${launcherConfig.presenceCheckInterval} minutes`,
      { indent: 1 }
    );
  }
  Logger.muted("Press Ctrl+C to stop", { indent: 1 });
  Logger.space();

  let lastRebootTime = Date.now();
  let lastPresenceCheck = Date.now();
  const rebootIntervalMs = autoRebootHours * 60 * 60 * 1000;
  const presenceIntervalMs = launcherConfig.presenceCheckInterval * 60 * 1000;

  try {
    while (true) {
      const now = Date.now();

      if (autoRebootHours > 0 && now - lastRebootTime >= rebootIntervalMs) {
        Logger.warning(
          `[~] ${autoRebootHours} hours passed - Starting auto-reboot...`
        );
        await rebootAllEmulatorInstances(emulatorType);
        lastRebootTime = now;

        Logger.info("[>] Re-launching assigned games after reboot...");
        await relaunchAssignedGames();
        Logger.success("[+] Post-reboot game launches complete!");
        Logger.space();
      }

      let statuses = await getDeviceStatuses();

      for (const deviceStatus of statuses) {
        if (!deviceStatus.isResponsive) {
          Logger.error(
            `[X] Device ${deviceStatus.deviceId} is unresponsive, attempting reboot...`
          );
          const rebootSuccess = await rebootDevice(deviceStatus.deviceId);
          if (rebootSuccess) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            const updatedStatuses = await getDeviceStatuses();
            const updatedDevice = updatedStatuses.find(
              (d) => d.deviceId === deviceStatus.deviceId
            );
            if (updatedDevice) {
              const index = statuses.findIndex(
                (d) => d.deviceId === deviceStatus.deviceId
              );
              if (index !== -1) {
                statuses[index] = updatedDevice;
              }
            }
          }
        }
      }

      const instancesWithGames = statuses.flatMap((device) =>
        device.instances.filter(
          (instance) =>
            instance.assignedGame && instance.username && device.isResponsive
        )
      );

      if (instancesWithGames.length === 0) {
        Logger.warning(
          "[!] No instances with assigned games or all devices unresponsive, waiting..."
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
        continue;
      }

      let updatedInstancesWithGames = instancesWithGames;
      if (
        enablePresenceCheck &&
        now - lastPresenceCheck >= presenceIntervalMs
      ) {
        Logger.info("[*] Running presence checks...");
        updatedInstancesWithGames =
          await checkPresenceForInstances(instancesWithGames);
        lastPresenceCheck = now;
      }

      const timestamp = new Date().toLocaleTimeString();
      let nextRebootInfo = "";
      if (autoRebootHours > 0) {
        const timeUntilReboot = rebootIntervalMs - (now - lastRebootTime);
        const hoursUntilReboot = Math.floor(timeUntilReboot / (60 * 60 * 1000));
        const minutesUntilReboot = Math.floor(
          (timeUntilReboot % (60 * 60 * 1000)) / (60 * 1000)
        );
        nextRebootInfo = colors.gray(
          ` (Next reboot: ${hoursUntilReboot}h ${minutesUntilReboot}m)`
        );
      }

      Logger.warning(
        `[~] ${timestamp} - Checking ${updatedInstancesWithGames.length} instances...${nextRebootInfo}`
      );

      for (const instance of updatedInstancesWithGames) {
        const deviceStatus = statuses.find(
          (d) => d.deviceId === instance.deviceId
        );
        const deviceName = deviceStatus?.deviceModel
          ? `${instance.deviceId} (${deviceStatus.deviceModel})`
          : instance.deviceId;
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");

        const shouldRelaunch =
          !instance.isRobloxRunning ||
          (enablePresenceCheck && instance.isInGame === false);

        if (shouldRelaunch && instance.assignedGame) {
          const reason = !instance.isRobloxRunning ? "stopped" : "not in game";

          Logger.error(
            `[X] ${deviceName} - ${appName} (@${instance.username}) ${reason}, relaunching...`,
            { indent: 1 }
          );
          const success = await launchRobloxGame(
            instance.deviceId,
            instance.packageName,
            instance.assignedGame
          );
          Logger.normal(
            success
              ? colors.green(
                  `   [+] ${deviceName} - ${appName} (@${instance.username}) relaunched`
                )
              : colors.red(
                  `   [X] ${deviceName} - ${appName} (@${instance.username}) relaunch failed`
                ),
            { indent: 1 }
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          const statusInfo =
            enablePresenceCheck && instance.isInGame !== undefined
              ? instance.isInGame
                ? " (in game)"
                : " (not in game)"
              : "";
          Logger.success(
            `[+] ${deviceName} - ${appName} (@${instance.username}) running${statusInfo}`,
            { indent: 1 }
          );
        }
      }

      Logger.muted(`Next check in ${interval / 1000} seconds...`, {
        indent: 1,
      });
      Logger.space();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("SIGINT")) {
      Logger.warning("[!] Keep alive mode stopped", { spaceBefore: true });
    } else {
      Logger.error(`[X] Keep alive error: ${error}`, { spaceBefore: true });
    }
  }
}

async function relaunchAssignedGames(): Promise<void> {
  const statuses = await getDeviceStatuses();
  const instancesWithGames = statuses.flatMap((device) =>
    device.instances.filter(
      (instance) => instance.assignedGame && instance.username
    )
  );

  for (const instance of instancesWithGames) {
    if (instance.assignedGame) {
      const deviceStatus = statuses.find(
        (d) => d.deviceId === instance.deviceId
      );
      const deviceName = deviceStatus?.deviceModel
        ? `${instance.deviceId} (${deviceStatus.deviceModel})`
        : instance.deviceId;
      const appName =
        instance.packageName === "com.roblox.client"
          ? "client"
          : instance.packageName.replace("com.roblox.", "");

      Logger.muted(
        `[>] Launching game on ${deviceName} - ${appName} (@${instance.username})...`,
        { indent: 1 }
      );
      await launchRobloxGame(
        instance.deviceId,
        instance.packageName,
        instance.assignedGame
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
