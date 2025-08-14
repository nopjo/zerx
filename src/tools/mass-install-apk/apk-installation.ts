import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { InstallResult, AdbDevice } from "./types";

const execAsync = promisify(exec);

export async function installApkToDevice(
  deviceId: string,
  apkPath: string
): Promise<InstallResult> {
  try {
    const command = `adb -s ${deviceId} install "${apkPath}"`;
    const { stdout, stderr } = await execAsync(command);

    if (stdout.includes("Success") || stdout.includes("INSTALL_SUCCEEDED")) {
      return { deviceId, success: true };
    } else {
      return {
        deviceId,
        success: false,
        error: stderr || stdout || "Unknown installation error",
      };
    }
  } catch (error) {
    return {
      deviceId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function installApkToAllDevices(
  apkPath: string,
  devices: AdbDevice[]
): Promise<InstallResult[]> {
  Logger.success("[^] Starting installation...", { spaceBefore: true });
  Logger.muted(`APK: ${apkPath}`, { indent: 1 });
  Logger.muted(`Devices: ${devices.length}`, { indent: 1 });

  const installSpinner = spinner();
  installSpinner.start(colors.gray("Installing APK to devices..."));

  const installPromises = devices.map((device) =>
    installApkToDevice(device.id, apkPath)
  );

  const results = await Promise.all(installPromises);
  installSpinner.stop();

  return results;
}
