import { Logger } from "@/utils/logger";
import type { InstallResult, InstallSummary, AdbDevice } from "./types";

export function displayInstallResults(
  results: InstallResult[],
  devices: AdbDevice[]
): InstallSummary {
  Logger.title("[#] Installation Results:");

  const successfulInstalls = results.filter((result) => result.success);

  results.forEach((result, index) => {
    const device = devices[index];
    const deviceName = device?.model
      ? `${device.id} (${device.model})`
      : device?.id || result.deviceId;

    if (result.success) {
      Logger.success(`[+] ${deviceName} - Installation successful`, {
        indent: 1,
      });
    } else {
      Logger.error(`[X] ${deviceName} - Installation failed`, { indent: 1 });
      if (result.error) {
        Logger.muted(`Error: ${result.error}`, { indent: 2 });
      }
    }
  });

  return {
    total: results.length,
    successful: successfulInstalls.length,
    failed: results.length - successfulInstalls.length,
    results,
  };
}
