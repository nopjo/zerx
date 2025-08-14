import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { validateRobloxCookie } from "@/utils/roblox";
import { Logger } from "@/utils/logger";
import type { RobloxInstance, InstanceWithUser } from "./types";

const execAsync = promisify(exec);

export async function isAppRunning(
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

    const instances: RobloxInstance[] = [];

    for (const packageName of packages) {
      const isRunning = await isAppRunning(deviceId, packageName);
      instances.push({
        packageName,
        deviceId,
        isRunning,
      });
    }

    return instances;
  } catch (error) {
    Logger.muted(
      `[!] Could not detect Roblox instances on ${deviceId}: ${error}`,
      { indent: 1 }
    );

    const isRunning = await isAppRunning(deviceId, "com.roblox.client");
    return [{ packageName: "com.roblox.client", deviceId, isRunning }];
  }
}

export async function getUsernameFromInstance(
  deviceId: string,
  packageName: string,
  isRunning: boolean
): Promise<string | null> {
  if (!isRunning) {
    return null;
  }

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

export async function getAllRobloxInstancesWithUsers(
  devices: any[]
): Promise<InstanceWithUser[]> {
  const allInstances: InstanceWithUser[] = [];

  const detectionSpinner = spinner();
  detectionSpinner.start(
    colors.gray("Detecting Roblox instances and checking users...")
  );

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);

    for (const instance of instances) {
      Logger.muted(
        `[@] Checking ${instance.packageName} on ${device.id}... ${
          instance.isRunning
            ? colors.green("(RUNNING)")
            : colors.gray("(NOT RUNNING)")
        }`,
        { indent: 1 }
      );

      const username = await getUsernameFromInstance(
        device.id,
        instance.packageName,
        instance.isRunning
      );

      allInstances.push({
        packageName: instance.packageName,
        deviceId: device.id,
        deviceModel: device.model,
        username: username || undefined,
        isRunning: instance.isRunning,
      });
    }
  }

  detectionSpinner.stop(
    colors.green("[+] Instance and user detection complete")
  );
  return allInstances;
}
