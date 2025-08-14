import { exec } from "child_process";
import { promisify } from "util";
import { getConnectedDevices } from "@/utils/adb";
import { validateRobloxCookie } from "@/utils/roblox";
import { Logger } from "@/utils/logger";
import { getRobloxLauncherConfig, saveRobloxLauncherConfig } from "./config";
import { COOKIE_CACHE_DURATION_MS, DEFAULT_DEVICE_TIMEOUT } from "./constants";
import type {
  DeviceStatus,
  InstanceStatus,
  RobloxInstance,
  GameConfig,
} from "./types";

const execAsync = promisify(exec);

export async function isDeviceResponsive(
  deviceId: string,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutSeconds * 1000
    );

    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "echo responsive"`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    return stdout.trim() === "responsive";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      Logger.warning(
        `[!] Device ${deviceId} timeout after ${timeoutSeconds}s`,
        { indent: 1 }
      );
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.warning(`[!] Device ${deviceId} error: ${errorMessage}`, {
        indent: 1,
      });
    }
    return false;
  }
}

export async function rebootDevice(deviceId: string): Promise<boolean> {
  try {
    Logger.warning(`[~] Rebooting unresponsive device ${deviceId}...`);
    await execAsync(`adb -s ${deviceId} reboot`);

    Logger.muted(`[~] Waiting for device ${deviceId} to come back online...`, {
      indent: 1,
    });

    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const devices = await getConnectedDevices();
      const device = devices.find(
        (d) => d.id === deviceId && d.status === "device"
      );
      if (device) {
        Logger.success(`[+] Device ${deviceId} is back online`, { indent: 1 });
        return true;
      }
    }

    Logger.error(`[X] Device ${deviceId} failed to come back online`, {
      indent: 1,
    });
    return false;
  } catch (error) {
    Logger.error(`[X] Failed to reboot device ${deviceId}: ${error}`, {
      indent: 1,
    });
    return false;
  }
}

export async function detectRobloxInstances(
  deviceId: string
): Promise<RobloxInstance[]> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "pm list packages | grep com.roblox"`
    );

    const packages = stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter((pkg) => pkg.startsWith("com.roblox") && pkg.length > 0);

    return packages.map((packageName) => ({ packageName, deviceId }));
  } catch (error) {
    Logger.muted(
      `[!] Could not detect Roblox instances on ${deviceId}: ${error}`,
      { indent: 1 }
    );
    return [{ packageName: "com.roblox.client", deviceId }];
  }
}

export async function getAllRobloxInstances(
  devices: any[]
): Promise<Map<string, RobloxInstance[]>> {
  const deviceInstanceMap = new Map<string, RobloxInstance[]>();

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);
    deviceInstanceMap.set(device.id, instances);
  }

  return deviceInstanceMap;
}

export async function isRobloxRunning(
  deviceId: string,
  packageName: string
): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "ps | grep ${packageName}"`
    );
    return stdout.includes(packageName);
  } catch {
    return false;
  }
}

export async function getUsernameFromInstance(
  deviceId: string,
  packageName: string
): Promise<string | null> {
  try {
    const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;
    const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;
    const command = `adb -s ${deviceId} shell "su -c \\"sqlite3 ${cookiePath} \\\\\\"${sqlQuery}\\\\\\"\\"`;
    const { stdout } = await execAsync(command);
    const cookie = stdout
      .trim()
      .replace(/[\r\n\t]/g, "")
      .replace(/^["']|["']$/g, "");

    if (cookie.length > 0) {
      const validation = await validateRobloxCookie(cookie);
      return validation.isValid ? validation.userInfo?.userName || null : null;
    }
    return null;
  } catch {
    return null;
  }
}

function getGameForUsername(username: string): GameConfig | undefined {
  const launcherConfig = getRobloxLauncherConfig();
  const assignment = launcherConfig.usernameAssignments.find(
    (a) => a.username === username
  );
  return assignment ? assignment.gameConfig : launcherConfig.defaultGame;
}

export async function getDeviceStatuses(): Promise<DeviceStatus[]> {
  const devices = await getConnectedDevices();
  const readyDevices = devices.filter((device) => device.status === "device");
  const deviceInstanceMap = await getAllRobloxInstances(readyDevices);
  const launcherConfig = getRobloxLauncherConfig();
  const statuses: DeviceStatus[] = [];
  let configChanged = false;

  for (const device of readyDevices) {
    const isResponsive = await isDeviceResponsive(
      device.id,
      launcherConfig.deviceTimeoutSeconds
    );
    const instances = deviceInstanceMap.get(device.id) || [];
    const instanceStatuses: InstanceStatus[] = [];

    if (isResponsive) {
      for (const instance of instances) {
        let cacheEntry = launcherConfig.instanceCache.find(
          (entry) =>
            entry.deviceId === device.id &&
            entry.packageName === instance.packageName
        );

        let username = cacheEntry?.username;
        const now = Date.now();

        const shouldCheckCookie =
          !cacheEntry?.lastCookieCheck ||
          !username ||
          now - cacheEntry.lastCookieCheck > COOKIE_CACHE_DURATION_MS;

        if (shouldCheckCookie) {
          Logger.muted(
            `[@] Checking cookies for ${instance.packageName} on ${device.id}...`,
            {
              indent: 1,
            }
          );
          const instanceUsername = await getUsernameFromInstance(
            device.id,
            instance.packageName
          );

          if (instanceUsername) {
            username = instanceUsername;
            if (cacheEntry) {
              cacheEntry.username = username;
              cacheEntry.lastCookieCheck = now;
            } else {
              cacheEntry = {
                deviceId: device.id,
                packageName: instance.packageName,
                username: username,
                lastCookieCheck: now,
              };
              launcherConfig.instanceCache.push(cacheEntry);
            }
            configChanged = true;
          } else if (cacheEntry) {
            cacheEntry.lastCookieCheck = now;
            configChanged = true;
          }
        } else if (cacheEntry && cacheEntry.lastCookieCheck) {
          const cacheAgeMinutes = Math.floor(
            (now - cacheEntry.lastCookieCheck) / (60 * 1000)
          );
          Logger.muted(
            `[+] Using cached username for ${instance.packageName} on ${device.id} (${cacheAgeMinutes}m old)`,
            { indent: 1 }
          );
        }

        const assignedGame = username
          ? getGameForUsername(username)
          : undefined;

        const instanceStatus: InstanceStatus = {
          packageName: instance.packageName,
          deviceId: device.id,
          isRobloxRunning: await isRobloxRunning(
            device.id,
            instance.packageName
          ),
          username: username || undefined,
          assignedGame,
        };

        instanceStatuses.push(instanceStatus);
      }
    } else {
      for (const instance of instances) {
        const cacheEntry = launcherConfig.instanceCache.find(
          (entry) =>
            entry.deviceId === device.id &&
            entry.packageName === instance.packageName
        );

        const instanceStatus: InstanceStatus = {
          packageName: instance.packageName,
          deviceId: device.id,
          isRobloxRunning: false,
          username: cacheEntry?.username || undefined,
          assignedGame: cacheEntry?.username
            ? getGameForUsername(cacheEntry.username)
            : undefined,
        };

        instanceStatuses.push(instanceStatus);
      }
    }

    const deviceStatus: DeviceStatus = {
      deviceId: device.id,
      deviceModel: device.model,
      instances: instanceStatuses,
      isResponsive,
    };

    statuses.push(deviceStatus);
  }

  if (configChanged) {
    saveRobloxLauncherConfig(launcherConfig);
  }

  return statuses;
}
