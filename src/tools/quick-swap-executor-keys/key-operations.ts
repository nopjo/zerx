import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import { Logger } from "@/utils/logger";
import type {
  AdbDevice,
  ExecutorKeyInfo,
  DeviceKeyStatus,
  KeySwapResult,
} from "./types";

const execAsync = promisify(exec);

export async function checkKeyFileExists(
  deviceId: string,
  keyPath: string
): Promise<boolean> {
  try {
    const escapedPath = keyPath.replace(/'/g, "'\"'\"'");
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "test -f '${escapedPath}' && echo 'EXISTS' || echo 'NOT_FOUND'"`
    );
    return stdout.trim() === "EXISTS";
  } catch (error) {
    return false;
  }
}

export async function readKeyFileContent(
  deviceId: string,
  keyPath: string
): Promise<string | null> {
  try {
    const escapedPath = keyPath.replace(/'/g, "'\"'\"'");
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "cat '${escapedPath}'"`
    );
    return stdout.trim() || null;
  } catch (error) {
    Logger.warning(`Could not read key from ${deviceId}: ${error}`);
    return null;
  }
}

export async function getDevicesWithKey(
  devices: AdbDevice[],
  executor: ExecutorKeyInfo
): Promise<DeviceKeyStatus[]> {
  Logger.info(`Checking for ${executor.name} key files...`, {
    spaceBefore: true,
  });

  const deviceStatuses: DeviceKeyStatus[] = [];
  const checkSpinner = spinner();
  checkSpinner.start(colors.gray("Checking key files..."));

  for (const device of devices) {
    try {
      const hasKey = await checkKeyFileExists(device.id, executor.keyPath);

      if (hasKey) {
        const currentKeyContent = await readKeyFileContent(
          device.id,
          executor.keyPath
        );
        deviceStatuses.push({
          device,
          hasKey: true,
          currentKeyContent: currentKeyContent || undefined,
        });
        Logger.deviceFound(device.id, device.model || "Unknown");
      } else {
        deviceStatuses.push({
          device,
          hasKey: false,
        });
        Logger.deviceMissing(device.id, device.model || "Unknown");
      }
    } catch (error) {
      deviceStatuses.push({
        device,
        hasKey: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      Logger.deviceMissing(device.id, device.model || "Unknown");
    }
  }

  checkSpinner.stop();

  const devicesWithKey = deviceStatuses.filter((status) => status.hasKey);
  Logger.success(
    `Found ${executor.name} key on ${devicesWithKey.length} device(s)`,
    { spaceBefore: true }
  );

  return deviceStatuses;
}

export async function createKeyDirectory(
  deviceId: string,
  keyPath: string
): Promise<void> {
  try {
    const keyDir = path.posix.dirname(keyPath);
    const escapedDir = keyDir.replace(/'/g, "'\"'\"'");

    await execAsync(`adb -s ${deviceId} shell "mkdir -p '${escapedDir}'"`);
  } catch (error) {
    Logger.warning(`Failed to create directory on ${deviceId}: ${error}`);
  }
}

export async function writeKeyToDevice(
  deviceId: string,
  keyPath: string,
  keyContent: string,
  tempFilePath: string
): Promise<boolean> {
  try {
    await createKeyDirectory(deviceId, keyPath);

    await execAsync(`adb -s ${deviceId} push "${tempFilePath}" "${keyPath}"`);

    const verifiedContent = await readKeyFileContent(deviceId, keyPath);

    return verifiedContent === keyContent;
  } catch (error) {
    Logger.error(`Error writing key to ${deviceId}: ${error}`);
    return false;
  }
}

export async function replaceKeysOnDevices(
  deviceStatuses: DeviceKeyStatus[],
  executor: ExecutorKeyInfo,
  newKeyContent: string
): Promise<KeySwapResult> {
  const devicesWithKey = deviceStatuses.filter((status) => status.hasKey);

  Logger.success(
    `Replacing ${executor.name} keys on ${devicesWithKey.length} device(s)...`,
    { spaceBefore: true }
  );

  let success = 0;
  let failed = 0;
  const devicesProcessed: string[] = [];

  const tempFileName = `temp_key_${Date.now()}.txt`;
  const tempFilePath = path.resolve(tempFileName);

  try {
    writeFileSync(tempFilePath, newKeyContent);

    for (const deviceStatus of devicesWithKey) {
      const device = deviceStatus.device;
      const deviceSpinner = spinner();
      deviceSpinner.start(colors.gray(`Updating ${device.id}...`));

      try {
        const writeSuccess = await writeKeyToDevice(
          device.id,
          executor.keyPath,
          newKeyContent,
          tempFilePath
        );

        if (writeSuccess) {
          deviceSpinner.stop(colors.green(`${device.id} ✓`));
          success++;
          devicesProcessed.push(device.id);
        } else {
          throw new Error("Key verification failed");
        }
      } catch (error) {
        deviceSpinner.stop(colors.red(`${device.id} ✗`));
        Logger.error(`Error updating ${device.id}: ${error}`, { indent: 1 });
        failed++;
      }
    }
  } finally {
    try {
      unlinkSync(tempFilePath);
    } catch (error) {}
  }

  return {
    success,
    failed,
    executor: executor.name,
    devicesProcessed,
  };
}

export async function backupCurrentKeys(
  deviceStatuses: DeviceKeyStatus[],
  executor: ExecutorKeyInfo
): Promise<void> {
  Logger.info(`Creating backup of current ${executor.name} keys...`);

  const devicesWithKey = deviceStatuses.filter(
    (status) => status.hasKey && status.currentKeyContent
  );

  for (const deviceStatus of devicesWithKey) {
    if (deviceStatus.currentKeyContent) {
      const backupFileName = `output/backup_${executor.name}_${deviceStatus.device.id}_${Date.now()}.txt`;
      try {
        writeFileSync(backupFileName, deviceStatus.currentKeyContent);
        Logger.success(`Backup created: ${backupFileName}`);
      } catch (error) {
        Logger.warning(
          `Failed to create backup for ${deviceStatus.device.id}: ${error}`
        );
      }
    }
  }
}
