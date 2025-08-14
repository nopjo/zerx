import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "@/utils/logger";
import type { RobloxClone } from "./types";

const execAsync = promisify(exec);

export async function detectRobloxClones(
  deviceId: string
): Promise<RobloxClone[]> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "pm list packages | grep com.roblox"`
    );

    const packages = stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter((pkg) => pkg.startsWith("com.roblox") && pkg.length > 0);

    const clones: RobloxClone[] = packages.map((packageName, index) => ({
      packageName,
      deviceId,
      cloneIndex: index,
    }));

    return clones;
  } catch (error) {
    Logger.muted(`[!] Could not detect clones on ${deviceId}: ${error}`, {
      indent: 1,
    });
    return [];
  }
}

export async function getAllRobloxClones(
  devices: any[]
): Promise<Map<string, RobloxClone[]>> {
  const deviceCloneMap = new Map<string, RobloxClone[]>();

  const detectionSpinner = spinner();
  detectionSpinner.start(colors.gray("Detecting Roblox clones on devices..."));

  for (const device of devices) {
    const clones = await detectRobloxClones(device.id);
    deviceCloneMap.set(device.id, clones);
  }

  detectionSpinner.stop(colors.green("[+] Clone detection complete"));

  return deviceCloneMap;
}

export function printCloneDetectionResults(
  deviceCloneMap: Map<string, RobloxClone[]>,
  devices: any[]
): void {
  Logger.title("[-] Roblox Clone Detection Results:");

  let totalClones = 0;

  for (const device of devices) {
    const clones = deviceCloneMap.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    if (clones.length > 0) {
      Logger.success(
        `[-] ${deviceName}: ${clones.length} Roblox app(s) found`,
        { indent: 1 }
      );
      clones.forEach((clone) => {
        Logger.muted(`└── ${clone.packageName}`, { indent: 2 });
      });
      totalClones += clones.length;
    } else {
      Logger.warning(`[-] ${deviceName}: No Roblox apps found`, { indent: 1 });
    }
  }

  Logger.info(
    `Total Roblox instances across all devices: ${colors.bold(
      totalClones.toString()
    )}`,
    { spaceBefore: true }
  );
}
