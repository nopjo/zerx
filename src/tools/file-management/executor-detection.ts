import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { Logger } from "@/utils/logger";
import type { AdbDevice } from "@/utils/adb";

const execAsync = promisify(exec);

export async function checkExecutorExists(
  deviceId: string,
  executorPath: string
): Promise<boolean> {
  try {
    const methods = [
      `ls -d "${executorPath}" 2>/dev/null && echo 'EXISTS'`,
      `test -d "${executorPath}" && echo 'EXISTS'`,
      `cd "${executorPath}" 2>/dev/null && echo 'EXISTS'`,
    ];

    for (const method of methods) {
      try {
        const { stdout } = await execAsync(
          `adb -s ${deviceId} shell "${method}"`
        );

        if (stdout.trim() === "EXISTS") {
          Logger.success(`Found ${executorPath}`);
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    try {
      const parentPath = path.posix.dirname(executorPath);
      const folderName = path.posix.basename(executorPath);

      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ls '${parentPath}' 2>/dev/null"`
      );

      const folders = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

      const exists = folders.some((folder) => folder === folderName);
      if (exists) {
        Logger.success(`Found ${folderName} in parent directory listing`);
        return true;
      }
    } catch (error) {
      Logger.warning(`Parent directory check failed: ${error}`);
    }

    return false;
  } catch (error) {
    Logger.error(`Error checking executor existence: ${error}`);
    return false;
  }
}

export async function getDevicesWithExecutor(
  devices: AdbDevice[],
  executorPath: string
): Promise<AdbDevice[]> {
  const devicesWithExecutor: AdbDevice[] = [];

  for (const device of devices) {
    const hasExecutor = await checkExecutorExists(device.id, executorPath);
    if (hasExecutor) {
      devicesWithExecutor.push(device);
    }
  }

  return devicesWithExecutor;
}
