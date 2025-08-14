import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { RobloxInstance } from "./types";

const execAsync = promisify(exec);

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

    const instances: RobloxInstance[] = packages.map((packageName) => ({
      packageName,
      deviceId,
    }));

    return instances;
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

  const detectionSpinner = spinner();
  detectionSpinner.start(
    colors.gray("Detecting Roblox instances on devices...")
  );

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);
    deviceInstanceMap.set(device.id, instances);
  }

  detectionSpinner.stop(colors.green("[+] Instance detection complete"));

  return deviceInstanceMap;
}

export function printInstanceDetectionResults(
  deviceInstanceMap: Map<string, RobloxInstance[]>,
  devices: any[]
): void {
  Logger.title("[-] Roblox Instance Detection Results:");

  let totalInstances = 0;

  for (const device of devices) {
    const instances = deviceInstanceMap.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    if (instances.length > 0) {
      Logger.success(
        `[-] ${deviceName}: ${instances.length} Roblox instance(s) found`,
        { indent: 1 }
      );
      instances.forEach((instance) => {
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");
        Logger.muted(`└── ${appName}`, { indent: 2 });
      });
      totalInstances += instances.length;
    } else {
      Logger.warning(`[-] ${deviceName}: No Roblox instances found`, {
        indent: 1,
      });
    }
  }

  Logger.info(
    `[#] Total Roblox instances across all devices: ${colors.bold(
      totalInstances.toString()
    )}`,
    { spaceBefore: true }
  );
}
