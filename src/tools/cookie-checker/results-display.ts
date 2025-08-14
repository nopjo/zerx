import { Logger } from "@/utils/logger";
import type { CookieResult } from "./types";

export function displayCookieResults(
  results: CookieResult[],
  readyDevices: any[]
): void {
  Logger.title("[*] Cookie Check Results by Device:");

  const resultsByDevice = new Map<string, CookieResult[]>();
  results.forEach((result) => {
    if (!resultsByDevice.has(result.deviceId)) {
      resultsByDevice.set(result.deviceId, []);
    }
    resultsByDevice.get(result.deviceId)!.push(result);
  });

  for (const device of readyDevices) {
    const deviceResults = resultsByDevice.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    if (deviceResults.length === 0) {
      continue;
    }

    Logger.info(`[-] ${deviceName}:`);

    deviceResults.forEach((result) => {
      const appName =
        result.packageName === "com.roblox.client"
          ? "client"
          : result.packageName.replace("com.roblox.", "");

      if (result.isValid && result.userInfo) {
        Logger.success(`[+] ${appName} - Valid cookie found`, { indent: 1 });
        Logger.muted(`Username: ${result.userInfo.userName}`, { indent: 2 });
        Logger.muted(`User ID: ${result.userInfo.userId}`, { indent: 2 });
      } else {
        Logger.error(`[X] ${appName} - ${result.error || "No valid cookie"}`, {
          indent: 1,
        });
      }
    });
    Logger.space();
  }
}
